export type TradeEvent = Record<string, any> & {
  eventId: string;
  eventType: string;
  action: string;
  tradeId: string | null;
  receivedAt: number;
  ts: number;
  storedAt: number;
};

type AnyRecord = Record<string, any>;

const MAX_STORED_ACTIONS = Number(process.env.MAX_STORED_ACTIONS || 5000);

const PRIMARY_LIST_KEY =
  process.env.TRADE_EVENTS_REDIS_LIST_KEY || "tradesystem:analysis:events";

const TRADE_EVENT_LIST_KEYS = Array.from(
  new Set([
    PRIMARY_LIST_KEY,
    "tradesystem:analysis:events",
    "tradesystem:analysis:actions:list",
    "tradesystem:analysis:actions",
    "analysis:actions:list",
    "analysis:actions",
    "ts:actions:list",
    "ts:actions"
  ])
);

const JSON_ACTION_KEYS = [
  "tradesystem:analysis:actions",
  "analysis:actions",
  "ts:actions"
];

const LATEST_KEYS = [
  "tradesystem:analysis:latest",
  "analysis:latest",
  "ts:latest"
];

const CLEAR_KEYS = Array.from(
  new Set([
    ...TRADE_EVENT_LIST_KEYS,
    ...JSON_ACTION_KEYS,
    ...LATEST_KEYS
  ])
);

const globalForStore = globalThis as typeof globalThis & {
  __tradeEventsMemory?: TradeEvent[];
};

function memoryEvents(): TradeEvent[] {
  if (!globalForStore.__tradeEventsMemory) {
    globalForStore.__tradeEventsMemory = [];
  }

  return globalForStore.__tradeEventsMemory;
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

async function redisCommand(command: unknown[]): Promise<any> {
  const url = getRedisUrl();
  const token = getRedisToken();

  if (!url || !token) {
    throw new Error("redis_env_missing");
  }

  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
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

  return json?.result;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(value: unknown): any {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "boolean") return value ? "true" : "false";

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function text(value: unknown, fallback = ""): string {
  const result = safeString(value, fallback).trim();
  return result || fallback;
}

function upper(value: unknown, fallback = ""): string {
  const result = text(value, fallback).toUpperCase();
  return result || fallback;
}

function lower(value: unknown, fallback = ""): string {
  const result = text(value, fallback).toLowerCase();
  return result || fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const cleaned =
    typeof value === "string"
      ? value.replace("%", "").replace(",", ".").trim()
      : value;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
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

function parseJsonObject(value: unknown): AnyRecord {
  const parsed = safeJsonParse(value);

  if (isRecord(parsed)) return parsed;

  return {};
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  function walk(input: unknown): unknown {
    if (input === null || typeof input !== "object") return input;

    if (seen.has(input as object)) return "[Circular]";
    seen.add(input as object);

    if (Array.isArray(input)) return input.map(walk);

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
    return safeString(value);
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

function normalizeBaseSymbol(raw: unknown): string | null {
  const symbol = upper(raw)
    .replace(/_UMCBL$/, "")
    .replace(/_DMCBL$/, "")
    .replace(/_CMCBL$/, "")
    .replace(/-UMCBL$/, "")
    .replace(/-DMCBL$/, "")
    .replace(/-CMCBL$/, "")
    .replace(/USDT$/, "")
    .replace(/USDC$/, "")
    .replace(/USD$/, "");

  return symbol || null;
}

function normalizeEventTypeValue(raw: unknown, actionRaw: unknown = ""): string {
  const rawType = upper(raw);
  const action = upper(actionRaw);
  const value = rawType || action || "SNAPSHOT";

  if (value.includes("ENTRY")) return "ENTRY";
  if (value.includes("ENTER")) return "ENTRY";
  if (value.includes("OPEN_TRADE")) return "ENTRY";
  if (value === "OPEN") return "ENTRY";

  if (value.includes("EXIT")) return "EXIT";
  if (value.includes("CLOSE")) return "EXIT";
  if (value.includes("CLOSED")) return "EXIT";

  if (value.includes("REJECT")) return "REJECT";
  if (value.includes("WAIT")) return "REJECT";
  if (value.includes("SKIP")) return "REJECT";
  if (value.includes("FILTER_FAIL")) return "REJECT";

  if (value.includes("SNAPSHOT")) return "SNAPSHOT";
  if (value.includes("HOLD")) return "HOLD";

  return value || "SNAPSHOT";
}

function normalizeMs(value: unknown, fallback = Date.now()): number {
  const n = nullableNum(value);

  if (n !== null) {
    if (n > 1_000_000_000_000) return n;
    if (n > 1_000_000_000) return n * 1000;
    if (n > 0) return n;
  }

  const parsed = Date.parse(text(value));

  return Number.isFinite(parsed) ? parsed : fallback;
}

function looksLikeEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return Boolean(
    value.eventId ||
      value.eventType ||
      value.action ||
      value.tradeId ||
      value.signalId ||
      value.symbol ||
      value.rawBitgetSymbol ||
      value.contractSymbol ||
      value.filterSnapshot ||
      value.exitR !== undefined ||
      value.pnlPct !== undefined
  );
}

function extractEventsFromValue(value: unknown): unknown[] {
  const parsed = safeJsonParse(value);

  if (Array.isArray(parsed)) {
    return parsed.flatMap(item => extractEventsFromValue(item));
  }

  if (!isRecord(parsed)) return [];

  if (Array.isArray(parsed.actions)) return parsed.actions;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.events)) return parsed.events;
  if (Array.isArray(parsed.payload?.actions)) return parsed.payload.actions;
  if (Array.isArray(parsed.payload?.data)) return parsed.payload.data;
  if (Array.isArray(parsed.payload?.events)) return parsed.payload.events;

  if (looksLikeEvent(parsed)) return [parsed];

  return [];
}

function fallbackEventId(body: AnyRecord, eventType: string): string {
  const symbol =
    normalizeBaseSymbol(
      firstValue(body, [
        "symbol",
        "payload.symbol",
        "rawBitgetSymbol",
        "contractSymbol",
        "payload.rawBitgetSymbol",
        "payload.contractSymbol"
      ])
    ) || "UNKNOWN";

  const side = lower(firstValue(body, ["side", "payload.side"]), "unknown");

  const tradeId = text(
    firstValue(body, [
      "tradeId",
      "id",
      "signalId",
      "payload.tradeId",
      "payload.id",
      "payload.signalId"
    ])
  );

  const runId = text(firstValue(body, ["runId", "payload.runId"]), "run_unknown");

  const ts = text(
    firstValue(body, [
      "ts",
      "createdAt",
      "timestamp",
      "receivedAt",
      "payload.ts",
      "payload.createdAt",
      "payload.timestamp"
    ]),
    String(Date.now())
  );

  const hash = hashString(stableStringify(body));

  return [
    "ts",
    runId,
    eventType,
    symbol,
    side,
    tradeId || hash,
    ts
  ]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 260);
}

function normalizeStoredEvent(raw: unknown, index = 0): TradeEvent | null {
  const parsed = safeJsonParse(raw);

  if (!isRecord(parsed)) return null;

  const payloadObj = parseJsonObject(parsed.payload);
  const payloadJsonObj = parseJsonObject(parsed.payloadJson);
  const rawJsonObj = parseJsonObject(parsed.rawJson);

  const merged: AnyRecord = {
    ...payloadObj,
    ...payloadJsonObj,
    ...rawJsonObj,
    ...parsed
  };

  if (isRecord(parsed.payload)) {
    merged.payload = parsed.payload;
  } else if (Object.keys(payloadObj).length > 0) {
    merged.payload = payloadObj;
  }

  const eventType = normalizeEventTypeValue(
    firstValue(merged, ["eventType", "type", "payload.eventType", "payload.type"]),
    firstValue(merged, ["action", "payload.action"])
  );

  const eventId =
    text(firstValue(merged, ["eventId", "payload.eventId"])) ||
    fallbackEventId(merged, eventType);

  const symbol = normalizeBaseSymbol(
    firstValue(merged, [
      "symbol",
      "payload.symbol",
      "rawBitgetSymbol",
      "contractSymbol",
      "payload.rawBitgetSymbol",
      "payload.contractSymbol"
    ])
  );

  const tradeId =
    text(
      firstValue(merged, [
        "tradeId",
        "id",
        "signalId",
        "payload.tradeId",
        "payload.id",
        "payload.signalId"
      ])
    ) || null;

  const receivedAt = normalizeMs(
    firstValue(merged, ["receivedAt", "payload.receivedAt"]),
    Date.now()
  );

  const ts = normalizeMs(
    firstValue(merged, [
      "ts",
      "createdAt",
      "timestamp",
      "payload.ts",
      "payload.createdAt",
      "payload.timestamp"
    ]),
    receivedAt
  );

  const storedAt = normalizeMs(
    firstValue(merged, ["storedAt", "payload.storedAt"]),
    receivedAt
  );

  return {
    ...merged,
    eventId,
    eventType,
    action: text(firstValue(merged, ["action", "payload.action"]), eventType),
    tradeId,
    symbol: symbol || text(firstValue(merged, ["symbol", "payload.symbol"])) || null,
    receivedAt,
    ts,
    storedAt,
    _storeIndex: index
  };
}

function eventSortTime(event: TradeEvent): number {
  return normalizeMs(
    firstValue(event, [
      "ts",
      "createdAt",
      "timestamp",
      "receivedAt",
      "storedAt",
      "payload.ts",
      "payload.createdAt"
    ]),
    0
  );
}

function dedupeEvents(events: TradeEvent[]): TradeEvent[] {
  const map = new Map<string, TradeEvent>();

  for (const event of events) {
    const key =
      text(event.eventId) ||
      text(event.payloadHash) ||
      hashString(stableStringify(event));

    const existing = map.get(key);

    if (!existing) {
      map.set(key, event);
      continue;
    }

    if (eventSortTime(event) >= eventSortTime(existing)) {
      map.set(key, event);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => eventSortTime(a) - eventSortTime(b))
    .slice(-MAX_STORED_ACTIONS);
}

async function readEventsFromListKey(key: string): Promise<TradeEvent[]> {
  const rows = await redisCommand(["LRANGE", key, 0, -1]).catch(() => []);

  if (!Array.isArray(rows)) return [];

  return rows
    .flatMap((row, index) => extractEventsFromValue(row).map(item => ({ item, index })))
    .map(({ item, index }) => normalizeStoredEvent(item, index))
    .filter((event): event is TradeEvent => Boolean(event));
}

async function readEventsFromJsonKey(key: string): Promise<TradeEvent[]> {
  const raw = await redisCommand(["GET", key]).catch(() => null);

  if (!raw) return [];

  return extractEventsFromValue(raw)
    .map((item, index) => normalizeStoredEvent(item, index))
    .filter((event): event is TradeEvent => Boolean(event));
}

export async function listTradeEvents(): Promise<TradeEvent[]> {
  if (!hasRedis()) {
    return dedupeEvents(memoryEvents());
  }

  const [listResults, jsonResults] = await Promise.all([
    Promise.all(TRADE_EVENT_LIST_KEYS.map(readEventsFromListKey)),
    Promise.all(JSON_ACTION_KEYS.map(readEventsFromJsonKey))
  ]);

  return dedupeEvents([...listResults.flat(), ...jsonResults.flat()]);
}

export async function getTradeEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function getTradeEventCount(): Promise<number> {
  const events = await listTradeEvents();
  return events.length;
}

export async function appendTradeEvents(events: unknown[]): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  added: number;
  total: number;
  key: string;
}> {
  const normalized = events
    .map((event, index) => normalizeStoredEvent(event, index))
    .filter((event): event is TradeEvent => Boolean(event));

  if (!normalized.length) {
    return {
      ok: true,
      redis: hasRedis(),
      persistent: hasRedis(),
      added: 0,
      total: await getTradeEventCount(),
      key: PRIMARY_LIST_KEY
    };
  }

  if (!hasRedis()) {
    const memory = memoryEvents();
    memory.push(...normalized);
    globalForStore.__tradeEventsMemory = dedupeEvents(memory);

    return {
      ok: true,
      redis: false,
      persistent: false,
      added: normalized.length,
      total: globalForStore.__tradeEventsMemory.length,
      key: "memory"
    };
  }

  const serialized = normalized.map(event => JSON.stringify(event));

  await redisCommand(["RPUSH", PRIMARY_LIST_KEY, ...serialized]);
  await redisCommand(["LTRIM", PRIMARY_LIST_KEY, -MAX_STORED_ACTIONS, -1]);

  const latestPayload = {
    ok: true,
    storage: "redis-list",
    key: PRIMARY_LIST_KEY,
    count: normalized.length,
    actions: normalized,
    receivedAt: Date.now()
  };

  await Promise.all(
    LATEST_KEYS.map(key =>
      redisCommand(["SET", key, JSON.stringify(latestPayload)]).catch(() => null)
    )
  );

  const total = await getTradeEventCount();

  return {
    ok: true,
    redis: true,
    persistent: true,
    added: normalized.length,
    total,
    key: PRIMARY_LIST_KEY
  };
}

export async function appendTradeEvent(event: unknown): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  added: number;
  total: number;
  key: string;
}> {
  return appendTradeEvents([event]);
}

export async function replaceTradeEvents(events: unknown[]): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  added: number;
  total: number;
  key: string;
}> {
  await clearTradeEvents();
  return appendTradeEvents(events);
}

export async function clearTradeEvents(): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  deleted: number;
  keys: string[];
}> {
  if (!hasRedis()) {
    const deleted = memoryEvents().length;
    globalForStore.__tradeEventsMemory = [];

    return {
      ok: true,
      redis: false,
      persistent: false,
      deleted,
      keys: ["memory"]
    };
  }

  const deleted = await redisCommand(["DEL", ...CLEAR_KEYS]).catch(() => 0);

  return {
    ok: true,
    redis: true,
    persistent: true,
    deleted: Number(deleted || 0),
    keys: CLEAR_KEYS
  };
}

export async function clearTradeEventsForDebugOnly(): Promise<{
  ok: boolean;
  redis: boolean;
  persistent: boolean;
  deleted: number;
  keys: string[];
}> {
  return clearTradeEvents();
}

export const addTradeEvent = appendTradeEvent;
export const addTradeEvents = appendTradeEvents;
export const saveTradeEvents = appendTradeEvents;
export const storeTradeEvents = appendTradeEvents;
export const setTradeEvents = replaceTradeEvents;