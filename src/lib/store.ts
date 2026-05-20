export type TradeEvent = Record<string, any>;

const MAX_READ_EVENTS = Number(process.env.MAX_READ_TRADE_EVENTS || 5000);

const ACTION_LIST_KEYS = [
  "tradesystem:analysis:actions:list",
  "analysis:actions:list",
  "ts:actions:list"
];

const ACTION_KEYS = [
  "tradesystem:analysis:actions",
  "analysis:actions",
  "ts:actions"
];

const LATEST_KEYS = [
  "tradesystem:analysis:latest",
  "analysis:latest",
  "ts:latest"
];

function getRedisUrl(): string {
  return (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  );
}

function getRedisToken(): string {
  return (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  );
}

function hasRedis(): boolean {
  return Boolean(getRedisUrl() && getRedisToken());
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(value: unknown): any {
  if (!value) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function redisCommand(command: unknown[], timeoutMs = 10_000): Promise<any> {
  const url = getRedisUrl();
  const token = getRedisToken();

  if (!url || !token) {
    throw new Error("redis_env_missing");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command),
      signal: controller.signal,
      cache: "no-store"
    });

    const text = await res.text();

    let json: any = null;

    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok || json?.error) {
      throw new Error(json?.error || text || `redis_error_${res.status}`);
    }

    return json?.result;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("redis_fetch_aborted");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function eventTime(event: TradeEvent): number {
  const raw =
    event.ts ??
    event.createdAt ??
    event.receivedAt ??
    event.storedAt ??
    event.payload?.ts ??
    event.payload?.createdAt ??
    event.payload?.receivedAt;

  const n = Number(raw);

  if (Number.isFinite(n) && n > 1_000_000_000_000) return n;
  if (Number.isFinite(n) && n > 1_000_000_000) return n * 1000;

  const parsed = Date.parse(String(raw || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventDedupeKey(event: TradeEvent): string {
  return String(
    event.eventId ||
      event.payloadHash ||
      `${event.tradeId || event.id || event.signalId || "no_trade"}:${event.eventType || event.type || event.action || "no_type"}:${eventTime(event)}:${event.reason || ""}`
  );
}

function normalizeParsedEvent(value: unknown): TradeEvent | null {
  const parsed = safeJsonParse(value);

  if (!isRecord(parsed)) return null;

  return parsed;
}

function extractEventsFromLegacyValue(value: unknown): TradeEvent[] {
  const parsed = safeJsonParse(value);

  if (Array.isArray(parsed)) {
    return parsed
      .map(normalizeParsedEvent)
      .filter((event): event is TradeEvent => Boolean(event));
  }

  if (Array.isArray(parsed?.actions)) {
    return parsed.actions
      .map(normalizeParsedEvent)
      .filter((event: TradeEvent | null): event is TradeEvent => Boolean(event));
  }

  if (Array.isArray(parsed?.events)) {
    return parsed.events
      .map(normalizeParsedEvent)
      .filter((event: TradeEvent | null): event is TradeEvent => Boolean(event));
  }

  if (isRecord(parsed) && (parsed.eventType || parsed.action || parsed.tradeId || parsed.symbol)) {
    return [parsed];
  }

  return [];
}

async function readListKey(key: string): Promise<TradeEvent[]> {
  const result = await redisCommand(["LRANGE", key, 0, -1]).catch(() => null);

  if (!Array.isArray(result)) return [];

  return result
    .map(normalizeParsedEvent)
    .filter((event): event is TradeEvent => Boolean(event));
}

async function readLegacyKey(key: string): Promise<TradeEvent[]> {
  const result = await redisCommand(["GET", key]).catch(() => null);
  return extractEventsFromLegacyValue(result);
}

async function readLatestKey(key: string): Promise<TradeEvent[]> {
  const result = await redisCommand(["GET", key]).catch(() => null);
  const parsed = safeJsonParse(result);

  if (Array.isArray(parsed?.actions)) {
    return parsed.actions
      .map(normalizeParsedEvent)
      .filter((event: TradeEvent | null): event is TradeEvent => Boolean(event));
  }

  return [];
}

async function readFirstNonEmpty(
  keys: string[],
  reader: (key: string) => Promise<TradeEvent[]>
): Promise<TradeEvent[]> {
  for (const key of keys) {
    const events = await reader(key);

    if (events.length > 0) {
      return events;
    }
  }

  return [];
}

function dedupeEvents(events: TradeEvent[]): TradeEvent[] {
  const map = new Map<string, TradeEvent>();

  for (const event of events) {
    const key = eventDedupeKey(event);

    if (!key) continue;

    map.set(key, event);
  }

  return Array.from(map.values());
}

export async function listTradeEvents(): Promise<TradeEvent[]> {
  if (!hasRedis()) return [];

  const [listEvents, legacyEvents, latestEvents] = await Promise.all([
    readFirstNonEmpty(ACTION_LIST_KEYS, readListKey),
    readFirstNonEmpty(ACTION_KEYS, readLegacyKey),
    readFirstNonEmpty(LATEST_KEYS, readLatestKey)
  ]);

  const merged = dedupeEvents([
    ...legacyEvents,
    ...latestEvents,
    ...listEvents
  ]);

  return merged
    .sort((a, b) => eventTime(a) - eventTime(b))
    .slice(-MAX_READ_EVENTS);
}

export async function getLatestTradeAnalysis(): Promise<any | null> {
  if (!hasRedis()) return null;

  for (const key of LATEST_KEYS) {
    const result = await redisCommand(["GET", key]).catch(() => null);
    const parsed = safeJsonParse(result);

    if (parsed) return parsed;
  }

  return null;
}