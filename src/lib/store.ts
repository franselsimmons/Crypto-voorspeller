import type { NormalizedWebhookEvent } from "./normalize";

type AnyRecord = Record<string, unknown>;
type RedisValue = string | number;
type RedisCommand = RedisValue[];

export type TradeEvent = NormalizedWebhookEvent & Record<string, unknown>;

export type SaveTradeEventResult = {
  ok: boolean;
  stored: boolean;
  deduped: boolean;
  persistent: boolean;
  key: string;
  eventId: string;
  count?: number | null;
  bytes?: number | null;
  error?: string | null;
};

const TRADE_EVENTS_KEY =
  process.env.TRADE_EVENTS_KEY || "tradesystem:events:v1";

const TRADE_DEDUPE_KEY =
  process.env.TRADE_DEDUPE_KEY || "tradesystem:events:dedupe:v1";

const TRADE_EVENTS_MAX_ROWS = Math.max(
  1000,
  Number(process.env.TRADE_EVENTS_MAX_ROWS || 50000)
);

const TRADE_EVENTS_READ_ROWS = Math.max(
  100,
  Number(process.env.TRADE_EVENTS_READ_ROWS || 1500)
);

const TRADE_EVENTS_READ_CHUNK_ROWS = Math.max(
  1,
  Number(process.env.TRADE_EVENTS_READ_CHUNK_ROWS || 25)
);

const TRADE_DEDUPE_TTL_SECONDS = Math.max(
  3600,
  Number(process.env.TRADE_DEDUPE_TTL_SECONDS || 60 * 60 * 24 * 14)
);

const MAX_STORED_EVENT_BYTES = Math.max(
  4000,
  Number(process.env.TRADE_EVENT_MAX_BYTES || 24000)
);

const TOP_LEVEL_FIELD_MAX_BYTES = Math.max(
  512,
  Number(process.env.TRADE_EVENT_TOP_FIELD_MAX_BYTES || 4096)
);

const memoryKey = "__TRADESYSTEM_ANALYSIS_EVENTS__";

const memoryStore: TradeEvent[] =
  ((globalThis as unknown as Record<string, TradeEvent[]>)[memoryKey] ||= []);

const CORE_FIELDS = new Set([
  "eventId",
  "eventType",
  "action",
  "source",
  "strategyVersion",
  "runId",
  "tradeId",

  "symbol",
  "rawBitgetSymbol",
  "side",
  "status",
  "open",
  "reason",
  "entryReason",
  "exitReason",
  "rejectReason",
  "cohortKey",

  "setupClass",
  "grade",
  "gradePoints",
  "recommendedRisk",

  "ts",
  "createdAt",
  "receivedAt",
  "storedAt",

  "score",
  "moveScore",
  "confluence",
  "rawConfluence",
  "effectiveConfluence",
  "sniper",
  "sniperScore",
  "rawSniperScore",
  "fallbackSniperScore",

  "rsi",
  "rsiHTF",
  "rsiZone",
  "rsiEdge",

  "obBias",
  "obRelation",
  "spreadPct",
  "spreadBps",
  "spreadBucket",
  "depthMinUsd1p",
  "depthUsd1p",
  "depthBucket",

  "flow",
  "funding",
  "fundingBucket",
  "regime",
  "btcState",
  "tfStrength",
  "tfAlignment",
  "change1h",
  "change24",

  "entry",
  "price",
  "entryPrice",
  "sl",
  "slPrice",
  "initialSl",
  "tp",
  "tpPrice",
  "exit",
  "exitPrice",
  "executionPrice",
  "triggerPrice",

  "rr",
  "plannedRR",
  "baseRR",
  "finalRr",
  "finalRR",
  "effectiveRR",
  "requiredRR",
  "finalRequiredRR",
  "tpRewardMultiplier",

  "exitR",
  "pnlPct",
  "triggerR",
  "triggerPnlPct",

  "currentR",
  "mfeR",
  "maeR",
  "maxTpProgress",
  "maxSlProgress",

  "reachedHalfR",
  "reachedOneR",
  "nearTpSeen",
  "directToSL",
  "slAfterHalfR",
  "slAfterOneR",
  "slAfterNearTp",

  "breakEvenActivated",
  "breakEvenStop",
  "breakEvenSl",
  "slBeforeBreakEven",

  "ticksObserved",
  "favorableTicks",
  "adverseTicks",
  "neutralTicks",

  "stage",
  "scannerStage",
  "stageSource",

  "bullishMidTrendProbe",
  "bullishMidTrendProbeReason",
  "btcBullishBearException",
  "btcBullishBearExceptionReason",

  "analysisType",
  "payloadHash",
  "storedCompact",

  "payload",
  "rawJson",
  "payloadJson"
]);

const HEAVY_FIELDS = [
  "filterDiagnostics",
  "filterValues",
  "filterChecks",
  "liveFilterMetrics",
  "specialFilterChecks",
  "diagnostics",
  "debug",
  "debugInfo",
  "raw",
  "rawPayload",
  "rawBody",
  "fullPayload",
  "analytics",
  "analysis",
  "request",
  "response",
  "orderbook",
  "orderBook",
  "book",
  "bids",
  "asks",
  "candles",
  "klines",
  "history",
  "snapshots",
  "actions",
  "rows",
  "data",
  "events",
  "items"
];

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function asUpper(value: unknown, fallback = ""): string {
  return asString(value, fallback).toUpperCase();
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  if (value === null || value === undefined || value === "") return fallback;

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  const text = asString(value).toLowerCase();
  return ["true", "1", "yes", "y"].includes(text);
}

function safeJson(value: unknown, fallback = "{}"): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(
    typeof value === "string" ? value : safeJson(value),
    "utf8"
  );
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

function hashString(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return `h_${(hash >>> 0).toString(16)}`;
}

function safeRedisKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 300);
}

function getRedisRestUrl(): string {
  const candidates = [
    process.env.KV_REST_API_URL,
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.REDIS_REST_URL,
    process.env.KV_URL,
    process.env.REDIS_URL
  ];

  for (const candidate of candidates) {
    const value = asString(candidate);

    if (value.startsWith("https://") || value.startsWith("http://")) {
      return value.replace(/\/+$/, "");
    }
  }

  return "";
}

function getRedisToken(): string {
  return (
    asString(process.env.KV_REST_API_TOKEN) ||
    asString(process.env.UPSTASH_REDIS_REST_TOKEN) ||
    asString(process.env.REDIS_REST_TOKEN)
  );
}

function hasRedis(): boolean {
  return Boolean(getRedisRestUrl() && getRedisToken());
}

async function redisCommand<T = unknown>(command: RedisCommand): Promise<T> {
  const url = getRedisRestUrl();
  const token = getRedisToken();

  if (!url || !token) {
    throw new Error("REDIS_ENV_MISSING");
  }

  const commandBytes = byteLength(command);

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
    console.error(
      "REDIS_COMMAND_FAILED:",
      JSON.stringify({
        status: res.status,
        command: command[0],
        commandBytes,
        error: json?.error || text.slice(0, 700)
      })
    );

    throw new Error(
      json?.error ||
        text.slice(0, 700) ||
        `REDIS_ERROR_${res.status}`
    );
  }

  return json?.result as T;
}

function compactPayload(event: TradeEvent): AnyRecord {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    action: event.action,
    source: event.source,
    strategyVersion: event.strategyVersion,
    runId: event.runId,
    tradeId: event.tradeId,

    symbol: event.symbol,
    rawBitgetSymbol: firstValue(event, ["rawBitgetSymbol"], null),
    side: event.side,
    status: firstValue(event, ["status"], null),
    open: firstValue(event, ["open"], null),

    reason: event.reason,
    entryReason: firstValue(event, ["entryReason"], null),
    exitReason: firstValue(event, ["exitReason"], null),
    rejectReason: firstValue(event, ["rejectReason"], null),
    cohortKey: event.cohortKey,

    setupClass: event.setupClass,
    grade: event.grade,
    gradePoints: firstValue(event, ["gradePoints"], null),
    recommendedRisk: firstValue(event, ["recommendedRisk"], null),

    entry: event.entry,
    price: firstValue(event, ["price"], event.entry),
    entryPrice: firstValue(event, ["entryPrice"], event.entry),
    sl: event.sl,
    slPrice: firstValue(event, ["slPrice"], event.sl),
    initialSl: event.initialSl,
    tp: event.tp,
    tpPrice: firstValue(event, ["tpPrice"], event.tp),
    exit: event.exit,
    exitPrice: firstValue(event, ["exitPrice"], event.exit),
    executionPrice: firstValue(event, ["executionPrice"], null),
    triggerPrice: firstValue(event, ["triggerPrice"], null),

    rr: event.rr,
    plannedRR: event.plannedRR,
    baseRR: event.baseRR,
    finalRr: event.finalRr,
    effectiveRR: firstValue(event, ["effectiveRR"], null),
    requiredRR: firstValue(event, ["requiredRR"], null),
    finalRequiredRR: firstValue(event, ["finalRequiredRR"], null),
    tpRewardMultiplier: firstValue(event, ["tpRewardMultiplier"], null),

    exitR: event.exitR,
    pnlPct: event.pnlPct,
    triggerR: firstValue(event, ["triggerR"], null),
    triggerPnlPct: firstValue(event, ["triggerPnlPct"], null),

    score: event.score,
    moveScore: firstValue(event, ["moveScore"], event.score),
    confluence: event.confluence,
    rawConfluence: firstValue(event, ["rawConfluence"], null),
    effectiveConfluence: firstValue(event, ["effectiveConfluence"], event.confluence),
    sniper: firstValue(event, ["sniper"], null),
    sniperScore: event.sniperScore,
    rawSniperScore: firstValue(event, ["rawSniperScore"], null),
    fallbackSniperScore: firstValue(event, ["fallbackSniperScore"], null),

    rsi: event.rsi,
    rsiHTF: event.rsiHTF,
    rsiZone: event.rsiZone,
    rsiEdge: firstValue(event, ["rsiEdge"], null),

    obBias: event.obBias,
    obRelation: firstValue(event, ["obRelation"], null),
    spreadPct: event.spreadPct,
    spreadBps: firstValue(event, ["spreadBps"], null),
    spreadBucket: firstValue(event, ["spreadBucket"], null),
    depthMinUsd1p: event.depthMinUsd1p,
    depthUsd1p: firstValue(event, ["depthUsd1p"], event.depthMinUsd1p),
    depthBucket: firstValue(event, ["depthBucket"], null),

    flow: firstValue(event, ["flow"], null),
    funding: firstValue(event, ["funding"], null),
    fundingBucket: firstValue(event, ["fundingBucket"], null),
    regime: firstValue(event, ["regime"], null),
    btcState: firstValue(event, ["btcState"], null),
    tfStrength: firstValue(event, ["tfStrength"], null),
    tfAlignment: firstValue(event, ["tfAlignment"], null),
    change1h: firstValue(event, ["change1h"], null),
    change24: firstValue(event, ["change24"], null),

    currentR: event.currentR,
    mfeR: event.mfeR,
    maeR: event.maeR,
    maxTpProgress: firstValue(event, ["maxTpProgress"], null),
    maxSlProgress: firstValue(event, ["maxSlProgress"], null),

    reachedHalfR: event.reachedHalfR,
    reachedOneR: event.reachedOneR,
    nearTpSeen: event.nearTpSeen,
    directToSL: event.directToSL,
    slAfterHalfR: firstValue(event, ["slAfterHalfR"], null),
    slAfterOneR: firstValue(event, ["slAfterOneR"], null),
    slAfterNearTp: firstValue(event, ["slAfterNearTp"], null),

    breakEvenActivated: event.breakEvenActivated,
    breakEvenStop: event.breakEvenStop,
    breakEvenSl: firstValue(event, ["breakEvenSl"], null),
    slBeforeBreakEven: firstValue(event, ["slBeforeBreakEven"], null),

    ticksObserved: firstValue(event, ["ticksObserved"], null),
    favorableTicks: firstValue(event, ["favorableTicks"], null),
    adverseTicks: firstValue(event, ["adverseTicks"], null),
    neutralTicks: firstValue(event, ["neutralTicks"], null),

    stage: firstValue(event, ["stage"], null),
    scannerStage: firstValue(event, ["scannerStage"], null),
    stageSource: firstValue(event, ["stageSource"], null),

    ts: event.ts,
    createdAt: firstValue(event, ["createdAt"], event.ts),
    receivedAt: event.receivedAt
  };
}

function buildCohortKey(event: TradeEvent): string {
  return [
    `SETUP=${asUpper(firstValue(event, ["setupClass"]), "UNKNOWN")}`,
    `SIDE=${asString(firstValue(event, ["side"]), "unknown")}`,
    `REASON=${asUpper(firstValue(event, ["entryReason", "reason"]), "UNKNOWN")}`,
    `RSI=${asUpper(firstValue(event, ["rsiZone"]), "UNKNOWN")}`,
    `EDGE=${asUpper(firstValue(event, ["rsiEdge"]), "UNKNOWN")}`,
    `FLOW=${asUpper(firstValue(event, ["flow"]), "UNKNOWN")}`,
    `BTC=${asUpper(firstValue(event, ["btcState"]), "UNKNOWN")}`,
    `OB=${asUpper(firstValue(event, ["obRelation", "obBias"]), "UNKNOWN")}`
  ].join("|");
}

function compactTradeEvent(input: NormalizedWebhookEvent): TradeEvent {
  const event = input as TradeEvent;

  const payloadSeed =
    asString(event.rawJson) ||
    asString(event.payloadJson) ||
    safeJson(event.payload);

  const payloadHash =
    asString(firstValue(event, ["payloadHash"])) ||
    hashString(`${event.eventId}|${payloadSeed}`);

  const compact: TradeEvent = {
    ...event,

    cohortKey:
      asString(firstValue(event, ["cohortKey"])) ||
      buildCohortKey(event),

    payload: compactPayload(event),
    rawJson: "{}",
    payloadJson: "{}",

    payloadHash,
    storedCompact: true
  };

  const record = compact as AnyRecord;

  for (const key of HEAVY_FIELDS) {
    if (key in record) {
      delete record[key];
    }
  }

  record.payload = compactPayload(compact);
  record.rawJson = "{}";
  record.payloadJson = "{}";

  let json = safeJson(record);
  if (byteLength(json) <= MAX_STORED_EVENT_BYTES) {
    return record as TradeEvent;
  }

  for (const [key, value] of Object.entries(record)) {
    if (CORE_FIELDS.has(key)) continue;

    const size = byteLength(value);

    if (size > TOP_LEVEL_FIELD_MAX_BYTES) {
      delete record[key];
    }
  }

  json = safeJson(record);
  if (byteLength(json) <= MAX_STORED_EVENT_BYTES) {
    return record as TradeEvent;
  }

  const minimal: AnyRecord = {};

  for (const key of CORE_FIELDS) {
    if (key in record) {
      minimal[key] = record[key];
    }
  }

  minimal.payload = compactPayload(record as TradeEvent);
  minimal.rawJson = "{}";
  minimal.payloadJson = "{}";
  minimal.payloadHash = payloadHash;
  minimal.storedCompact = true;

  return minimal as TradeEvent;
}

function parseStoredEvent(value: unknown): TradeEvent | null {
  if (!value) return null;

  if (isRecord(value)) {
    return value as TradeEvent;
  }

  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);

    if (!isRecord(parsed)) return null;

    return parsed as TradeEvent;
  } catch {
    return null;
  }
}

function isUsableStoredEvent(event: TradeEvent | null): event is TradeEvent {
  if (!event) return false;
  if (!asString(event.eventId)) return false;

  const eventType = asUpper(event.eventType || event.action || event.type);

  if (eventType === "BATCH") return false;
  if (eventType === "UNKNOWN") return false;

  return ["ENTRY", "EXIT", "REJECT", "SNAPSHOT", "HOLD"].includes(eventType);
}

function sortEventsAsc(events: TradeEvent[]): TradeEvent[] {
  return [...events].sort((a, b) => {
    const tsDiff = Number(a.ts || 0) - Number(b.ts || 0);
    if (tsDiff !== 0) return tsDiff;

    return asString(a.eventId).localeCompare(asString(b.eventId));
  });
}

function saveMemoryEvent(event: NormalizedWebhookEvent): SaveTradeEventResult {
  const compact = compactTradeEvent(event);
  const exists = memoryStore.some(row => row.eventId === compact.eventId);

  if (exists) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: false,
      key: "memory",
      eventId: compact.eventId,
      count: memoryStore.length,
      bytes: byteLength(compact),
      error: null
    };
  }

  memoryStore.push(compact);

  if (memoryStore.length > TRADE_EVENTS_MAX_ROWS) {
    memoryStore.splice(0, memoryStore.length - TRADE_EVENTS_MAX_ROWS);
  }

  return {
    ok: true,
    stored: true,
    deduped: false,
    persistent: false,
    key: "memory",
    eventId: compact.eventId,
    count: memoryStore.length,
    bytes: byteLength(compact),
    error: null
  };
}

export async function saveTradeEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  if (!event?.eventId) {
    throw new Error("TRADE_EVENT_EVENT_ID_MISSING");
  }

  const eventType = asUpper(event.eventType || event.action);

  if (eventType === "BATCH") {
    return {
      ok: true,
      stored: false,
      deduped: false,
      persistent: hasRedis(),
      key: hasRedis() ? TRADE_EVENTS_KEY : "memory",
      eventId: event.eventId,
      count: null,
      bytes: 0,
      error: "BATCH_EVENT_SKIPPED"
    };
  }

  const compact = compactTradeEvent(event);
  const storedEvent = {
    ...compact,
    storedAt: Date.now()
  };

  const storedJson = safeJson(storedEvent);
  const bytes = byteLength(storedJson);

  if (bytes > MAX_STORED_EVENT_BYTES * 1.25) {
    console.warn(
      "TRADE_EVENT_STILL_LARGE_AFTER_COMPACT:",
      JSON.stringify({
        eventId: event.eventId,
        eventType,
        bytes,
        maxBytes: MAX_STORED_EVENT_BYTES
      })
    );
  }

  if (!hasRedis()) {
    console.warn(
      "TRADE_EVENT_STORE_USING_MEMORY_FALLBACK:",
      JSON.stringify({
        reason: "REDIS_ENV_MISSING_OR_NOT_REST_URL",
        eventId: event.eventId,
        hasUrl: Boolean(getRedisRestUrl()),
        hasToken: Boolean(getRedisToken())
      })
    );

    return saveMemoryEvent(event);
  }

  const dedupeKey = `${TRADE_DEDUPE_KEY}:${safeRedisKeyPart(event.eventId)}`;

  const dedupeResult = await redisCommand<string | null>([
    "SET",
    dedupeKey,
    "1",
    "EX",
    TRADE_DEDUPE_TTL_SECONDS,
    "NX"
  ]);

  if (dedupeResult !== "OK") {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: true,
      key: TRADE_EVENTS_KEY,
      eventId: event.eventId,
      count: null,
      bytes,
      error: null
    };
  }

  const count = await redisCommand<number>([
    "RPUSH",
    TRADE_EVENTS_KEY,
    storedJson
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
    count: Number(count || 0),
    bytes,
    error: null
  };
}

async function listRedisTradeEvents(): Promise<TradeEvent[]> {
  const total = await redisCommand<number>(["LLEN", TRADE_EVENTS_KEY]);
  const length = Number(total || 0);

  if (!length) return [];

  const start = Math.max(0, length - TRADE_EVENTS_READ_ROWS);
  const events: TradeEvent[] = [];

  let cursor = start;
  let chunkSize = TRADE_EVENTS_READ_CHUNK_ROWS;

  while (cursor < length) {
    const end = Math.min(length - 1, cursor + chunkSize - 1);

    try {
      const rows = await redisCommand<string[]>([
        "LRANGE",
        TRADE_EVENTS_KEY,
        cursor,
        end
      ]);

      for (const row of Array.isArray(rows) ? rows : []) {
        const parsed = parseStoredEvent(row);

        if (isUsableStoredEvent(parsed)) {
          events.push(parsed);
        }
      }

      cursor = end + 1;
      chunkSize = TRADE_EVENTS_READ_CHUNK_ROWS;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isSizeError =
        message.includes("max request size") ||
        message.includes("max_request_size") ||
        message.includes("ERR max request size");

      if (isSizeError && chunkSize > 1) {
        chunkSize = Math.max(1, Math.floor(chunkSize / 2));

        console.warn(
          "TRADE_EVENTS_READ_CHUNK_REDUCED:",
          JSON.stringify({
            cursor,
            chunkSize,
            reason: message.slice(0, 300)
          })
        );

        continue;
      }

      console.error(
        "TRADE_EVENTS_READ_CHUNK_FAILED:",
        JSON.stringify({
          cursor,
          end,
          chunkSize,
          reason: message.slice(0, 500)
        })
      );

      cursor = end + 1;
      chunkSize = TRADE_EVENTS_READ_CHUNK_ROWS;
    }
  }

  return sortEventsAsc(events);
}

export async function listTradeEvents(): Promise<TradeEvent[]> {
  if (!hasRedis()) {
    return sortEventsAsc(memoryStore.filter(isUsableStoredEvent));
  }

  try {
    return await listRedisTradeEvents();
  } catch (error) {
    console.error(
      "TRADE_EVENTS_LIST_REDIS_FAILED:",
      JSON.stringify({
        reason: error instanceof Error ? error.message : String(error)
      })
    );

    return sortEventsAsc(memoryStore.filter(isUsableStoredEvent));
  }
}

export async function getTradeEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function getTradeEventCount(): Promise<number> {
  if (!hasRedis()) return memoryStore.filter(isUsableStoredEvent).length;

  try {
    const count = await redisCommand<number>(["LLEN", TRADE_EVENTS_KEY]);
    return Number(count || 0);
  } catch (error) {
    console.error(
      "TRADE_EVENT_COUNT_REDIS_FAILED:",
      JSON.stringify({
        reason: error instanceof Error ? error.message : String(error)
      })
    );

    return memoryStore.filter(isUsableStoredEvent).length;
  }
}

export async function clearTradeEventsForDebugOnly(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  memoryStore.length = 0;

  if (!hasRedis()) {
    return {
      ok: true,
      persistent: false
    };
  }

  await redisCommand(["DEL", TRADE_EVENTS_KEY]);

  const oldHashDedupe = TRADE_DEDUPE_KEY;
  await redisCommand(["DEL", oldHashDedupe]);

  return {
    ok: true,
    persistent: true
  };
}

export async function clearTradeEvents(): Promise<{
  ok: boolean;
  persistent: boolean;
}> {
  return clearTradeEventsForDebugOnly();
}

export {
  compactTradeEvent,
  hasRedis
};