export type TradeEvent = Record<string, any>;

type AnyRecord = Record<string, unknown>;
type RedisCommand = unknown[];

const MAX_STORED_ACTIONS = Number(process.env.MAX_STORED_ACTIONS || 5000);

export const LATEST_KEYS = [
  "tradesystem:analysis:latest",
  "analysis:latest",
  "ts:latest"
];

export const ACTION_KEYS = [
  "tradesystem:analysis:actions",
  "analysis:actions",
  "ts:actions"
];

const MEMORY_KEY = "__TRADESYSTEM_TRADE_EVENTS__";

function getMemoryStore(): TradeEvent[] {
  const globalStore = globalThis as typeof globalThis & {
    [MEMORY_KEY]?: TradeEvent[];
  };

  if (!Array.isArray(globalStore[MEMORY_KEY])) {
    globalStore[MEMORY_KEY] = [];
  }

  return globalStore[MEMORY_KEY]!;
}

export function getRedisUrl(): string {
  return (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  );
}

export function getRedisToken(): string {
  return (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  );
}

export function hasRedis(): boolean {
  return Boolean(getRedisUrl() && getRedisToken());
}

export async function redisCommand<T = any>(command: RedisCommand): Promise<T> {
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

  const textBody = await res.text();

  let json: any = null;

  try {
    json = JSON.parse(textBody);
  } catch {
    json = null;
  }

  if (!res.ok || json?.error) {
    throw new Error(json?.error || textBody || `redis_error_${res.status}`);
  }

  return json?.result as T;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;

  const result = String(value).trim();
  return result || fallback;
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

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  function walk(input: unknown): unknown {
    if (input === null || typeof input !== "object") return input;

    if (seen.has(input as object)) {
      return "[Circular]";
    }

    seen.add(input as object);

    if (Array.isArray(input)) {
      return input.map(walk);
    }

    const record = input as AnyRecord;
    const output: AnyRecord = {};

    for (const key of Object.keys(record).sort()) {
      output[key] = walk(record[key]);
    }

    return output;
  }

  try {
    return JSON.stringify(walk(value));
  } catch {
    return String(value);
  }
}

function hashString(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function eventIdentity(event: TradeEvent): string {
  const eventId = text(firstValue(event, ["eventId", "payload.eventId"]));

  if (eventId) return `eventId:${eventId}`;

  const payloadHash = text(
    firstValue(event, ["payloadHash", "payload.payloadHash"])
  );

  if (payloadHash) return `payloadHash:${payloadHash}`;

  const tradeId = text(
    firstValue(event, [
      "tradeId",
      "id",
      "signalId",
      "payload.tradeId",
      "payload.id",
      "payload.signalId"
    ])
  );

  const eventType = text(
    firstValue(event, [
      "eventType",
      "type",
      "action",
      "payload.eventType",
      "payload.type",
      "payload.action"
    ])
  );

  const symbol = text(firstValue(event, ["symbol", "payload.symbol"]));

  const ts = text(
    firstValue(event, [
      "ts",
      "createdAt",
      "receivedAt",
      "storedAt",
      "payload.ts",
      "payload.createdAt"
    ])
  );

  const reason = text(
    firstValue(event, [
      "reason",
      "entryReason",
      "exitReason",
      "rejectReason",
      "payload.reason"
    ])
  );

  if (tradeId || eventType || symbol || ts || reason) {
    return `soft:${tradeId}|${eventType}|${symbol}|${ts}|${reason}`;
  }

  return `hash:${hashString(stableStringify(event))}`;
}

function extractEvents(value: unknown): TradeEvent[] {
  const parsed = safeJsonParse(value);

  if (Array.isArray(parsed)) {
    return parsed.flatMap(item => extractEvents(item));
  }

  if (!isRecord(parsed)) {
    return [];
  }

  if (Array.isArray(parsed.actions)) {
    return parsed.actions.flatMap(item => extractEvents(item));
  }

  if (Array.isArray(parsed.data)) {
    return parsed.data.flatMap(item => extractEvents(item));
  }

  if (isRecord(parsed.payload) && Array.isArray(parsed.payload.actions)) {
    return parsed.payload.actions.flatMap(item => extractEvents(item));
  }

  const hasEventShape =
    parsed.eventId ||
    parsed.eventType ||
    parsed.type ||
    parsed.action ||
    parsed.tradeId ||
    parsed.signalId ||
    parsed.symbol ||
    parsed.payload;

  if (!hasEventShape) {
    return [];
  }

  return [parsed as TradeEvent];
}

function normalizeStoredEvent(event: TradeEvent): TradeEvent {
  const now = Date.now();

  const eventId = text(firstValue(event, ["eventId", "payload.eventId"]));
  const payloadHash = text(
    firstValue(event, ["payloadHash", "payload.payloadHash"])
  );

  const normalized: TradeEvent = {
    ...event
  };

  if (!normalized.eventId) {
    normalized.eventId = (
      eventId ||
      eventIdentity(event).replace(/[^a-z0-9:_|-]+/gi, "_")
    ).slice(0, 260);
  }

  if (!normalized.payloadHash) {
    normalized.payloadHash = payloadHash || hashString(stableStringify(event));
  }

  if (!normalized.receivedAt) {
    normalized.receivedAt = now;
  }

  if (!normalized.storedAt) {
    normalized.storedAt = now;
  }

  return normalized;
}

function dedupeEvents(events: TradeEvent[]): TradeEvent[] {
  const map = new Map<string, TradeEvent>();

  for (const event of events) {
    map.set(eventIdentity(event), event);
  }

  return Array.from(map.values());
}

function sortEventsAsc(events: TradeEvent[]): TradeEvent[] {
  return [...events].sort((a, b) => {
    const aTs = Number(
      firstValue(
        a,
        ["ts", "createdAt", "receivedAt", "storedAt", "payload.ts", "payload.createdAt"],
        0
      )
    );

    const bTs = Number(
      firstValue(
        b,
        ["ts", "createdAt", "receivedAt", "storedAt", "payload.ts", "payload.createdAt"],
        0
      )
    );

    return aTs - bTs;
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

async function readRedisListKey(key: string): Promise<TradeEvent[]> {
  const raw = await redisCommand<unknown[]>([
    "LRANGE",
    key,
    -MAX_STORED_ACTIONS,
    -1
  ]).catch(() => []);

  if (!Array.isArray(raw)) return [];

  return raw
    .flatMap(item => extractEvents(item))
    .map(normalizeStoredEvent);
}

export async function readRedisJsonKey(key: string): Promise<TradeEvent[]> {
  const raw = await redisCommand<unknown>(["GET", key]).catch(() => null);
  return extractEvents(raw).map(normalizeStoredEvent);
}

export async function listTradeEvents(limit = MAX_STORED_ACTIONS): Promise<TradeEvent[]> {
  if (!hasRedis()) {
    return sortEventsAsc(getMemoryStore()).slice(-limit);
  }

  const listEvents = await readRedisListKey(ACTION_KEYS[0]);

  if (listEvents.length > 0) {
    return sortEventsAsc(dedupeEvents(listEvents)).slice(-limit);
  }

  const fallbackGroups = await Promise.all([
    ...ACTION_KEYS.map(key => readRedisJsonKey(key)),
    ...LATEST_KEYS.map(key => readRedisJsonKey(key))
  ]);

  return sortEventsAsc(dedupeEvents(fallbackGroups.flat())).slice(-limit);
}

export async function getTradeEvents(limit = MAX_STORED_ACTIONS): Promise<TradeEvent[]> {
  return listTradeEvents(limit);
}

export async function getTradeEventCount(): Promise<number> {
  if (!hasRedis()) {
    return getMemoryStore().length;
  }

  const listCount = await redisCommand<number>(["LLEN", ACTION_KEYS[0]]).catch(() => 0);

  if (Number(listCount || 0) > 0) {
    return Number(listCount || 0);
  }

  for (const key of ACTION_KEYS) {
    const events = await readRedisJsonKey(key);

    if (events.length) {
      return events.length;
    }
  }

  for (const key of LATEST_KEYS) {
    const events = await readRedisJsonKey(key);

    if (events.length) {
      return events.length;
    }
  }

  return 0;
}

export async function appendTradeEvents(input: TradeEvent[] | TradeEvent): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  stored: number;
  total: number;
}> {
  const events = extractEvents(input).map(normalizeStoredEvent);

  if (!events.length) {
    return {
      ok: true,
      redis: hasRedis(),
      persistent: hasRedis(),
      stored: 0,
      total: await getTradeEventCount()
    };
  }

  if (!hasRedis()) {
    const store = getMemoryStore();

    store.push(...events);

    const trimmed = dedupeEvents(store).slice(-MAX_STORED_ACTIONS);

    store.length = 0;
    store.push(...trimmed);

    return {
      ok: true,
      redis: false,
      persistent: false,
      stored: events.length,
      total: store.length
    };
  }

  for (const group of chunk(events, 50)) {
    await redisCommand([
      "RPUSH",
      ACTION_KEYS[0],
      ...group.map(event => JSON.stringify(event))
    ]);
  }

  await redisCommand([
    "LTRIM",
    ACTION_KEYS[0],
    -MAX_STORED_ACTIONS,
    -1
  ]);

  const latestPayload = {
    ok: true,
    storage: "redis-list",
    persistent: true,
    receivedAt: Date.now(),
    count: events.length,
    actionsPreviewCount: Math.min(events.length, 25),
    actions: events.slice(-25)
  };

  await Promise.allSettled(
    LATEST_KEYS.map(key =>
      redisCommand(["SET", key, JSON.stringify(latestPayload)])
    )
  );

  return {
    ok: true,
    redis: true,
    persistent: true,
    stored: events.length,
    total: await getTradeEventCount()
  };
}

export async function appendTradeEvent(event: TradeEvent): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  stored: number;
  total: number;
}> {
  return appendTradeEvents([event]);
}

export async function clearTradeEvents(): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  deleted: number;
  keys: string[];
}> {
  const keys = Array.from(new Set([...ACTION_KEYS, ...LATEST_KEYS]));

  if (!hasRedis()) {
    const store = getMemoryStore();
    const deleted = store.length;

    store.length = 0;

    return {
      ok: true,
      redis: false,
      persistent: false,
      deleted,
      keys: []
    };
  }

  const deleted = await redisCommand<number>(["DEL", ...keys]).catch(() => 0);

  return {
    ok: true,
    redis: true,
    persistent: true,
    deleted: Number(deleted || 0),
    keys
  };
}

export async function resetTradeEvents(): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  deleted: number;
  keys: string[];
}> {
  return clearTradeEvents();
}

export async function replaceTradeEvents(input: TradeEvent[] | TradeEvent): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  stored: number;
  total: number;
}> {
  await clearTradeEvents();
  return appendTradeEvents(input);
}

export async function getRedisStatus(): Promise<{
  redis: boolean;
  persistent: boolean;
  count: number;
  storage: string;
  maxStoredActions: number;
}> {
  const redis = hasRedis();

  return {
    redis,
    persistent: redis,
    count: await getTradeEventCount(),
    storage: redis ? "redis-list" : "memory",
    maxStoredActions: MAX_STORED_ACTIONS
  };
}

export const addTradeEvent = appendTradeEvent;
export const addTradeEvents = appendTradeEvents;
export const saveTradeEvents = appendTradeEvents;
export const storeTradeEvents = appendTradeEvents;
export const setTradeEvents = replaceTradeEvents;