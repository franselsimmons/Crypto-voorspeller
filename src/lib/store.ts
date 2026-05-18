import type { NormalizedWebhookEvent } from "./normalize";

export type TradeEvent = NormalizedWebhookEvent & Record<string, unknown>;

type RedisCommand = Array<string | number>;

export type SaveTradeEventResult = {
  ok: boolean;
  stored: boolean;
  deduped: boolean;
  persistent: boolean;
  key: string;
  eventId: string;
  count?: number | null;
};

const TRADE_EVENTS_KEY =
  process.env.TRADE_EVENTS_KEY || "tradesystem:events:v1";

const TRADE_DEDUPE_KEY =
  process.env.TRADE_DEDUPE_KEY || "tradesystem:events:dedupe:v1";

const TRADE_EVENTS_MAX_ROWS = Math.max(
  1000,
  Number(process.env.TRADE_EVENTS_MAX_ROWS || 50000)
);

const memoryKey = "__TRADESYSTEM_ANALYSIS_EVENTS__";

const memoryStore: TradeEvent[] =
  ((globalThis as unknown as Record<string, TradeEvent[]>)[memoryKey] ||= []);

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

async function redisCommand<T = unknown>(command: RedisCommand): Promise<T> {
  const url = getRedisUrl();
  const token = getRedisToken();

  if (!url || !token) {
    throw new Error("REDIS_ENV_MISSING");
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

  let json: { result?: T; error?: string } | null = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok || json?.error) {
    throw new Error(json?.error || text.slice(0, 500) || `REDIS_ERROR_${res.status}`);
  }

  return json?.result as T;
}

function parseStoredEvent(value: unknown): TradeEvent | null {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as TradeEvent;
  }

  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as TradeEvent;
  } catch {
    return null;
  }
}

function sortEventsAsc(events: TradeEvent[]): TradeEvent[] {
  return [...events].sort((a, b) => {
    const tsDiff = Number(a.ts || 0) - Number(b.ts || 0);
    if (tsDiff !== 0) return tsDiff;

    return String(a.eventId || "").localeCompare(String(b.eventId || ""));
  });
}

function saveMemoryEvent(event: TradeEvent): SaveTradeEventResult {
  const exists = memoryStore.some(row => row.eventId === event.eventId);

  if (exists) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: false,
      key: "memory",
      eventId: event.eventId,
      count: memoryStore.length
    };
  }

  memoryStore.push(event);

  if (memoryStore.length > TRADE_EVENTS_MAX_ROWS) {
    memoryStore.splice(0, memoryStore.length - TRADE_EVENTS_MAX_ROWS);
  }

  return {
    ok: true,
    stored: true,
    deduped: false,
    persistent: false,
    key: "memory",
    eventId: event.eventId,
    count: memoryStore.length
  };
}

export async function saveTradeEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  if (!event?.eventId) {
    throw new Error("TRADE_EVENT_EVENT_ID_MISSING");
  }

  const storedEvent: TradeEvent = {
    ...event,
    storedAt: Date.now()
  } as TradeEvent;

  if (!hasRedis()) {
    console.warn("TRADE_EVENT_STORE_USING_MEMORY_FALLBACK:", {
      reason: "Redis env missing",
      eventId: event.eventId
    });

    return saveMemoryEvent(storedEvent);
  }

  const existing = await redisCommand<string | null>([
    "HGET",
    TRADE_DEDUPE_KEY,
    event.eventId
  ]);

  if (existing) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: true,
      key: TRADE_EVENTS_KEY,
      eventId: event.eventId,
      count: null
    };
  }

  await redisCommand([
    "HSET",
    TRADE_DEDUPE_KEY,
    event.eventId,
    String(Date.now())
  ]);

  const countRaw = await redisCommand<number | string>([
    "RPUSH",
    TRADE_EVENTS_KEY,
    JSON.stringify(storedEvent)
  ]);

  await redisCommand([
    "LTRIM",
    TRADE_EVENTS_KEY,
    -TRADE_EVENTS_MAX_ROWS,
    -1
  ]);

  return {
    ok: true,
    stored: true,
    deduped: false,
    persistent: true,
    key: TRADE_EVENTS_KEY,
    eventId: event.eventId,
    count: Number(countRaw || 0)
  };
}

export async function listTradeEvents(): Promise<TradeEvent[]> {
  if (!hasRedis()) {
    return sortEventsAsc(memoryStore);
  }

  const rows = await redisCommand<string[]>([
    "LRANGE",
    TRADE_EVENTS_KEY,
    0,
    -1
  ]);

  return sortEventsAsc(
    (Array.isArray(rows) ? rows : [])
      .map(parseStoredEvent)
      .filter(Boolean) as TradeEvent[]
  );
}

export async function getTradeEventCount(): Promise<number> {
  if (!hasRedis()) return memoryStore.length;

  const count = await redisCommand<number | string>([
    "LLEN",
    TRADE_EVENTS_KEY
  ]);

  return Number(count || 0);
}

export async function clearTradeEventsForDebugOnly(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  if (!hasRedis()) {
    memoryStore.length = 0;

    return {
      ok: true,
      persistent: false
    };
  }

  await redisCommand(["DEL", TRADE_EVENTS_KEY]);
  await redisCommand(["DEL", TRADE_DEDUPE_KEY]);

  return {
    ok: true,
    persistent: true
  };
}

export async function getTradeEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function clearTradeEvents(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  return clearTradeEventsForDebugOnly();
}

export function isPersistentTradeStoreConfigured(): boolean {
  return hasRedis();
}

export function getTradeStoreInfo(): {
  persistent: boolean;
  key: string;
  dedupeKey: string;
  maxRows: number;
} {
  return {
    persistent: hasRedis(),
    key: hasRedis() ? TRADE_EVENTS_KEY : "memory",
    dedupeKey: TRADE_DEDUPE_KEY,
    maxRows: TRADE_EVENTS_MAX_ROWS
  };
}