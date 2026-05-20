export type TradeEvent = Record<string, any>;

const MAX_STORED_ACTIONS = 5000;

const LATEST_KEYS = [
  "tradesystem:analysis:latest",
  "analysis:latest",
  "ts:latest"
];

const ACTION_KEYS = [
  "tradesystem:analysis:actions",
  "analysis:actions",
  "ts:actions"
];

type ClearTradeEventsResult = {
  ok: boolean;
  redis: boolean;
  deleted: number;
  keys: string[];
};

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

export function hasRedis(): boolean {
  return Boolean(getRedisUrl() && getRedisToken());
}

async function redisCommand<T = any>(command: unknown[]): Promise<T> {
  const url = getRedisUrl();
  const token = getRedisToken();

  if (!url || !token) {
    throw new Error("redis_env_missing");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
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

  return json?.result as T;
}

function isRecord(value: unknown): value is TradeEvent {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(value: unknown): unknown {
  if (!value) return null;
  if (isRecord(value) || Array.isArray(value)) return value;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readPath(obj: unknown, path: string): unknown {
  if (!isRecord(obj)) return undefined;

  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }

  return current;
}

function firstValue(obj: unknown, paths: string[], fallback: unknown = null): unknown {
  for (const path of paths) {
    const value = readPath(obj, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function mergePayloads(record: TradeEvent): TradeEvent {
  const payload = safeJsonParse(record.payload);
  const payloadJson = safeJsonParse(record.payloadJson);
  const rawJson = safeJsonParse(record.rawJson);

  return {
    ...(isRecord(payload) ? payload : {}),
    ...(isRecord(payloadJson) ? payloadJson : {}),
    ...(isRecord(rawJson) ? rawJson : {}),
    ...record
  };
}

function extractTradeEvents(input: unknown, depth = 0): TradeEvent[] {
  if (depth > 5) return [];

  const parsed = safeJsonParse(input) ?? input;

  if (Array.isArray(parsed)) {
    return parsed.flatMap(item => extractTradeEvents(item, depth + 1));
  }

  if (!isRecord(parsed)) return [];

  const nested = firstValue(parsed, [
    "actions",
    "data",
    "events",
    "items",
    "result",
    "payload.actions",
    "payload.data",
    "payload.events",
    "payload.items"
  ]);

  if (Array.isArray(nested)) {
    return nested.flatMap(item => extractTradeEvents(item, depth + 1));
  }

  return [mergePayloads(parsed)];
}

function eventDedupeKey(event: TradeEvent): string {
  const eventId =
    event.eventId ||
    event.payload?.eventId ||
    event.payloadHash ||
    event.tradeId ||
    event.id ||
    event.signalId;

  if (eventId) return String(eventId);

  return [
    event.strategyVersion || event.payload?.strategyVersion || "v",
    event.runId || event.payload?.runId || "run",
    event.eventType || event.type || event.action || event.payload?.eventType || "type",
    event.symbol || event.payload?.symbol || "symbol",
    event.side || event.payload?.side || "side",
    event.ts || event.createdAt || event.receivedAt || event.payload?.ts || "ts"
  ].join("|");
}

function dedupeEvents(events: TradeEvent[]): TradeEvent[] {
  const seen = new Set<string>();
  const result: TradeEvent[] = [];

  for (const event of events) {
    const key = eventDedupeKey(event);

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(event);
  }

  return result;
}

async function readRedisList(key: string): Promise<TradeEvent[]> {
  const raw = await redisCommand<unknown[]>(["LRANGE", key, 0, -1]).catch(() => []);

  if (!Array.isArray(raw)) return [];

  return raw.flatMap(item => extractTradeEvents(item));
}

async function readRedisJsonKey(key: string): Promise<TradeEvent[]> {
  const raw = await redisCommand<unknown>(["GET", key]).catch(() => null);

  if (!raw) return [];

  return extractTradeEvents(raw);
}

export async function listTradeEvents(limit = MAX_STORED_ACTIONS): Promise<TradeEvent[]> {
  if (!hasRedis()) return [];

  for (const key of ACTION_KEYS) {
    const events = await readRedisList(key);

    if (events.length) {
      return dedupeEvents(events).slice(-limit);
    }
  }

  for (const key of ACTION_KEYS) {
    const events = await readRedisJsonKey(key);

    if (events.length) {
      return dedupeEvents(events).slice(-limit);
    }
  }

  for (const key of LATEST_KEYS) {
    const events = await readRedisJsonKey(key);

    if (events.length) {
      return dedupeEvents(events).slice(-limit);
    }
  }

  return [];
}

export async function appendTradeEvents(input: TradeEvent | TradeEvent[]): Promise<{
  ok: boolean;
  redis: boolean;
  received: number;
  storedTotal: number;
}> {
  const events = Array.isArray(input) ? input : [input];

  if (!events.length) {
    return {
      ok: true,
      redis: hasRedis(),
      received: 0,
      storedTotal: 0
    };
  }

  if (!hasRedis()) {
    return {
      ok: false,
      redis: false,
      received: events.length,
      storedTotal: 0
    };
  }

  const now = Date.now();

  const normalized = events.map(event => ({
    ...event,
    storedAt: event.storedAt || now,
    receivedAt: event.receivedAt || now
  }));

  const payloads = normalized.map(event => JSON.stringify(event));

  await redisCommand(["RPUSH", ACTION_KEYS[0], ...payloads]);
  await redisCommand(["LTRIM", ACTION_KEYS[0], -MAX_STORED_ACTIONS, -1]);

  const latestPayload = {
    ok: true,
    storage: "redis-list",
    receivedAt: now,
    count: normalized.length,
    actions: normalized
  };

  await Promise.all([
    ...LATEST_KEYS.map(key =>
      redisCommand(["SET", key, JSON.stringify(latestPayload)]).catch(() => null)
    ),
    ...ACTION_KEYS.slice(1).map(key =>
      redisCommand(["SET", key, JSON.stringify(normalized)]).catch(() => null)
    )
  ]);

  const storedTotal = await redisCommand<number>(["LLEN", ACTION_KEYS[0]]).catch(() => 0);

  return {
    ok: true,
    redis: true,
    received: normalized.length,
    storedTotal: Number(storedTotal || 0)
  };
}

export async function clearTradeEvents(): Promise<ClearTradeEventsResult> {
  const keys = Array.from(new Set([...ACTION_KEYS, ...LATEST_KEYS]));

  if (!hasRedis()) {
    return {
      ok: true,
      redis: false,
      deleted: 0,
      keys
    };
  }

  const deleted = await redisCommand<number>(["DEL", ...keys]).catch(() => 0);

  return {
    ok: true,
    redis: true,
    deleted: Number(deleted || 0),
    keys
  };
}

export async function getLatestTradeEvents(): Promise<TradeEvent[]> {
  if (!hasRedis()) return [];

  for (const key of LATEST_KEYS) {
    const events = await readRedisJsonKey(key);

    if (events.length) {
      return dedupeEvents(events);
    }
  }

  return [];
}

// Backwards-compatible aliases.
export const addTradeEvents = appendTradeEvents;
export const saveTradeEvents = appendTradeEvents;
export const storeTradeEvents = appendTradeEvents;
export const getTradeEvents = listTradeEvents;
export const resetTradeEvents = clearTradeEvents;