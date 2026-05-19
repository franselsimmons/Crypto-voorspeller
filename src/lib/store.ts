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

const TRADE_EVENTS_INDEX_KEY =
  process.env.TRADE_EVENTS_INDEX_KEY || "tradesystem:events:index:v2";

const TRADE_EVENT_ITEM_PREFIX =
  process.env.TRADE_EVENT_ITEM_PREFIX || "tradesystem:event:v2";

const TRADE_DEDUPE_KEY_PREFIX =
  process.env.TRADE_DEDUPE_KEY_PREFIX || "tradesystem:events:dedupe:v2";

const OLD_TRADE_EVENTS_LIST_KEY =
  process.env.TRADE_EVENTS_KEY || "tradesystem:events:v1";

const OLD_TRADE_DEDUPE_KEY =
  process.env.TRADE_DEDUPE_KEY || "tradesystem:events:dedupe:v1";

const TRADE_EVENTS_MAX_ROWS = Math.max(
  1000,
  Number(process.env.TRADE_EVENTS_MAX_ROWS || 50000)
);

const TRADE_EVENTS_READ_ROWS = Math.max(
  100,
  Number(process.env.TRADE_EVENTS_READ_ROWS || 2500)
);

const TRADE_EVENTS_READ_CHUNK_ROWS = Math.max(
  1,
  Number(process.env.TRADE_EVENTS_READ_CHUNK_ROWS || 50)
);

const TRADE_DEDUPE_TTL_SECONDS = Math.max(
  3600,
  Number(process.env.TRADE_DEDUPE_TTL_SECONDS || 60 * 60 * 24 * 14)
);

const TRADE_EVENT_TTL_SECONDS = Math.max(
  3600,
  Number(process.env.TRADE_EVENT_TTL_SECONDS || 60 * 60 * 24 * 30)
);

const MAX_STORED_EVENT_BYTES = Math.min(
  12000,
  Math.max(3000, Number(process.env.TRADE_EVENT_MAX_BYTES || 8000))
);

const TOP_LEVEL_FIELD_MAX_BYTES = Math.max(
  512,
  Number(process.env.TRADE_EVENT_TOP_FIELD_MAX_BYTES || 2048)
);

const memoryKey = "__TRADESYSTEM_ANALYSIS_EVENTS__";

const memoryStore: TradeEvent[] =
  ((globalThis as unknown as Record<string, TradeEvent[]>)[memoryKey] ||= []);

const STORED_EVENT_TYPES = new Set(["ENTRY", "EXIT", "REJECT"]);

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

function safeJson(value: unknown, fallback = "{}"): string {
  try {
    const text = JSON.stringify(value);
    return typeof text === "string" ? text : fallback;
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

function buildEventItemKey(eventId: string): string {
  return `${TRADE_EVENT_ITEM_PREFIX}:${safeRedisKeyPart(eventId)}`;
}

function buildDedupeKey(eventId: string): string {
  return `${TRADE_DEDUPE_KEY_PREFIX}:${safeRedisKeyPart(eventId)}`;
}

function normalizeEventType(value: unknown): string {
  const raw = asUpper(value, "UNKNOWN");

  if (raw.includes("ENTRY")) return "ENTRY";
  if (raw.includes("EXIT")) return "EXIT";
  if (raw.includes("REJECT")) return "REJECT";
  if (raw.includes("WAIT")) return "REJECT";
  if (raw.includes("SKIP")) return "REJECT";
  if (raw.includes("SNAPSHOT")) return "SNAPSHOT";
  if (raw.includes("HOLD")) return "HOLD";
  if (raw.includes("BATCH")) return "BATCH";

  return raw;
}

function eventTypeOf(event: unknown): string {
  return normalizeEventType(
    firstValue(event, [
      "eventType",
      "type",
      "action",
      "payload.eventType",
      "payload.type",
      "payload.action"
    ])
  );
}

function eventIdOf(event: unknown): string {
  return asString(
    firstValue(event, [
      "eventId",
      "payload.eventId",
      "id",
      "payload.id",
      "signalId",
      "payload.signalId"
    ])
  );
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

  const normalizedCommand = command.map(value => String(value));
  const commandBytes = byteLength(normalizedCommand);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(normalizedCommand),
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
        command: normalizedCommand[0],
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

async function redisCommandBestEffort<T = unknown>(
  command: RedisCommand,
  label: string
): Promise<T | null> {
  try {
    return await redisCommand<T>(command);
  } catch (error) {
    console.warn(
      `${label}:`,
      JSON.stringify({
        command: String(command[0] || "UNKNOWN"),
        reason: error instanceof Error ? error.message : String(error)
      })
    );

    return null;
  }
}

async function trimTradeEventIndexBestEffort(): Promise<void> {
  if (!hasRedis()) return;

  await redisCommandBestEffort(
    [
      "LTRIM",
      TRADE_EVENTS_INDEX_KEY,
      String(-TRADE_EVENTS_MAX_ROWS),
      "-1"
    ],
    "TRADE_EVENTS_INDEX_TRIM_SKIPPED"
  );
}

function compactPayload(event: TradeEvent): AnyRecord {
  return {
    eventId: firstValue(event, ["eventId"], null),
    eventType: eventTypeOf(event),
    action: firstValue(event, ["action"], eventTypeOf(event)),
    source: firstValue(event, ["source"], null),
    strategyVersion: firstValue(event, ["strategyVersion"], null),
    runId: firstValue(event, ["runId"], null),
    tradeId: firstValue(event, ["tradeId", "payload.tradeId"], null),

    symbol: firstValue(event, ["symbol", "payload.symbol"], null),
    rawBitgetSymbol: firstValue(event, ["rawBitgetSymbol", "payload.rawBitgetSymbol"], null),
    side: firstValue(event, ["side", "payload.side"], null),
    status: firstValue(event, ["status", "payload.status"], null),
    open: firstValue(event, ["open", "payload.open"], null),

    reason: firstValue(event, ["reason", "payload.reason"], null),
    entryReason: firstValue(event, ["entryReason", "payload.entryReason", "payload.setup.entryReason"], null),
    exitReason: firstValue(event, ["exitReason", "payload.exitReason"], null),
    rejectReason: firstValue(event, ["rejectReason", "payload.rejectReason"], null),
    cohortKey: firstValue(event, ["cohortKey", "payload.cohortKey"], null),

    setupClass: firstValue(event, ["setupClass", "payload.setupClass", "payload.setup.setupClass"], null),
    grade: firstValue(event, ["grade", "payload.grade", "payload.setup.grade"], null),
    gradePoints: firstValue(event, ["gradePoints", "payload.gradePoints", "payload.setup.gradePoints"], null),
    recommendedRisk: firstValue(event, ["recommendedRisk", "payload.recommendedRisk"], null),

    entry: firstValue(event, ["entry", "price", "entryPrice", "payload.entry", "payload.price"], null),
    price: firstValue(event, ["price", "entry", "entryPrice", "payload.price", "payload.entry"], null),
    entryPrice: firstValue(event, ["entryPrice", "entry", "price", "payload.entryPrice", "payload.entry"], null),
    sl: firstValue(event, ["sl", "slPrice", "payload.sl"], null),
    slPrice: firstValue(event, ["slPrice", "sl", "payload.slPrice", "payload.sl"], null),
    initialSl: firstValue(event, ["initialSl", "payload.initialSl"], null),
    tp: firstValue(event, ["tp", "tpPrice", "payload.tp"], null),
    tpPrice: firstValue(event, ["tpPrice", "tp", "payload.tpPrice", "payload.tp"], null),
    exit: firstValue(event, ["exit", "exitPrice", "executionPrice", "payload.exit"], null),
    exitPrice: firstValue(event, ["exitPrice", "exit", "executionPrice", "payload.exitPrice"], null),
    executionPrice: firstValue(event, ["executionPrice", "payload.executionPrice"], null),
    triggerPrice: firstValue(event, ["triggerPrice", "payload.triggerPrice"], null),

    rr: firstValue(event, ["rr", "payload.rr"], null),
    plannedRR: firstValue(event, ["plannedRR", "payload.plannedRR"], null),
    baseRR: firstValue(event, ["baseRR", "payload.baseRR", "payload.rr.baseRR"], null),
    finalRr: firstValue(event, ["finalRr", "finalRR", "payload.finalRr", "payload.finalRR", "payload.rr.finalRr"], null),
    finalRR: firstValue(event, ["finalRR", "finalRr", "payload.finalRR", "payload.finalRr"], null),
    effectiveRR: firstValue(event, ["effectiveRR", "payload.effectiveRR"], null),
    requiredRR: firstValue(event, ["requiredRR", "payload.requiredRR", "payload.rr.requiredRR"], null),
    finalRequiredRR: firstValue(event, ["finalRequiredRR", "payload.finalRequiredRR"], null),
    tpRewardMultiplier: firstValue(event, ["tpRewardMultiplier", "payload.tpRewardMultiplier"], null),

    exitR: firstValue(event, ["exitR", "payload.exitR", "outcome.exitR"], null),
    pnlPct: firstValue(event, ["pnlPct", "pnl", "payload.pnlPct", "payload.pnl", "outcome.pnlPct"], null),
    triggerR: firstValue(event, ["triggerR", "payload.triggerR"], null),
    triggerPnlPct: firstValue(event, ["triggerPnlPct", "payload.triggerPnlPct"], null),

    score: firstValue(event, ["score", "payload.score", "payload.scores.score"], null),
    moveScore: firstValue(event, ["moveScore", "payload.moveScore"], null),
    confluence: firstValue(event, ["confluence", "payload.confluence", "payload.scores.confluence"], null),
    rawConfluence: firstValue(event, ["rawConfluence", "payload.rawConfluence", "payload.scores.rawConfluence"], null),
    effectiveConfluence: firstValue(event, ["effectiveConfluence", "payload.effectiveConfluence"], null),
    sniper: firstValue(event, ["sniper", "payload.sniper"], null),
    sniperScore: firstValue(event, ["sniperScore", "payload.sniperScore", "payload.scores.sniperScore"], null),
    rawSniperScore: firstValue(event, ["rawSniperScore", "payload.rawSniperScore"], null),
    fallbackSniperScore: firstValue(event, ["fallbackSniperScore", "payload.fallbackSniperScore"], null),

    rsi: firstValue(event, ["rsi", "payload.rsi"], null),
    rsiHTF: firstValue(event, ["rsiHTF", "payload.rsiHTF"], null),
    rsiZone: firstValue(event, ["rsiZone", "payload.rsiZone", "payload.rsi.rsiZone"], null),
    rsiEdge: firstValue(event, ["rsiEdge", "payload.rsiEdge", "payload.rsi.rsiEdge"], null),

    obBias: firstValue(event, ["obBias", "payload.obBias", "payload.ob.bias", "payload.orderbook.bias"], null),
    obRelation: firstValue(event, ["obRelation", "payload.obRelation", "payload.ob.relation", "payload.orderbook.relation"], null),
    spreadPct: firstValue(event, ["spreadPct", "payload.spreadPct", "payload.ob.spreadPct"], null),
    spreadBps: firstValue(event, ["spreadBps", "payload.spreadBps", "payload.ob.spreadBps"], null),
    spreadBucket: firstValue(event, ["spreadBucket", "payload.spreadBucket", "payload.ob.spreadBucket"], null),
    depthMinUsd1p: firstValue(event, ["depthMinUsd1p", "payload.depthMinUsd1p", "payload.ob.depthMinUsd1p"], null),
    depthUsd1p: firstValue(event, ["depthUsd1p", "payload.depthUsd1p"], null),
    depthBucket: firstValue(event, ["depthBucket", "payload.depthBucket", "payload.ob.depthBucket"], null),

    flow: firstValue(event, ["flow", "payload.flow", "payload.market.flow"], null),
    funding: firstValue(event, ["funding", "payload.funding", "payload.market.funding"], null),
    fundingBucket: firstValue(event, ["fundingBucket", "payload.fundingBucket"], null),
    regime: firstValue(event, ["regime", "payload.regime", "payload.market.regime"], null),
    btcState: firstValue(event, ["btcState", "payload.btcState", "payload.market.btcState"], null),
    tfStrength: firstValue(event, ["tfStrength", "payload.tfStrength", "payload.market.tfStrength"], null),
    tfAlignment: firstValue(event, ["tfAlignment", "payload.tfAlignment", "payload.market.tfAlignment"], null),
    change1h: firstValue(event, ["change1h", "payload.change1h", "payload.market.change1h"], null),
    change24: firstValue(event, ["change24", "payload.change24", "payload.market.change24"], null),

    currentR: firstValue(event, ["currentR", "payload.currentR"], null),
    mfeR: firstValue(event, ["mfeR", "payload.mfeR"], null),
    maeR: firstValue(event, ["maeR", "payload.maeR"], null),
    maxTpProgress: firstValue(event, ["maxTpProgress", "payload.maxTpProgress"], null),
    maxSlProgress: firstValue(event, ["maxSlProgress", "payload.maxSlProgress"], null),

    reachedHalfR: firstValue(event, ["reachedHalfR", "payload.reachedHalfR"], null),
    reachedOneR: firstValue(event, ["reachedOneR", "payload.reachedOneR"], null),
    nearTpSeen: firstValue(event, ["nearTpSeen", "payload.nearTpSeen"], null),
    directToSL: firstValue(event, ["directToSL", "payload.directToSL"], null),
    slAfterHalfR: firstValue(event, ["slAfterHalfR", "payload.slAfterHalfR"], null),
    slAfterOneR: firstValue(event, ["slAfterOneR", "payload.slAfterOneR"], null),
    slAfterNearTp: firstValue(event, ["slAfterNearTp", "payload.slAfterNearTp"], null),

    breakEvenActivated: firstValue(event, ["breakEvenActivated", "payload.breakEvenActivated"], null),
    breakEvenStop: firstValue(event, ["breakEvenStop", "payload.breakEvenStop"], null),
    breakEvenSl: firstValue(event, ["breakEvenSl", "payload.breakEvenSl"], null),
    slBeforeBreakEven: firstValue(event, ["slBeforeBreakEven", "payload.slBeforeBreakEven"], null),

    ticksObserved: firstValue(event, ["ticksObserved", "payload.ticksObserved"], null),
    favorableTicks: firstValue(event, ["favorableTicks", "payload.favorableTicks"], null),
    adverseTicks: firstValue(event, ["adverseTicks", "payload.adverseTicks"], null),
    neutralTicks: firstValue(event, ["neutralTicks", "payload.neutralTicks"], null),

    stage: firstValue(event, ["stage", "payload.stage"], null),
    scannerStage: firstValue(event, ["scannerStage", "payload.scannerStage"], null),
    stageSource: firstValue(event, ["stageSource", "payload.stageSource"], null),

    ts: firstValue(event, ["ts", "payload.ts"], Date.now()),
    createdAt: firstValue(event, ["createdAt", "payload.createdAt", "ts"], Date.now()),
    receivedAt: firstValue(event, ["receivedAt", "payload.receivedAt"], Date.now())
  };
}

function buildCohortKey(event: TradeEvent): string {
  return [
    `SETUP=${asUpper(firstValue(event, ["setupClass", "payload.setupClass"]), "UNKNOWN")}`,
    `SIDE=${asString(firstValue(event, ["side", "payload.side"]), "unknown")}`,
    `REASON=${asUpper(firstValue(event, ["entryReason", "reason", "payload.entryReason", "payload.reason"]), "UNKNOWN")}`,
    `RSI=${asUpper(firstValue(event, ["rsiZone", "payload.rsiZone"]), "UNKNOWN")}`,
    `EDGE=${asUpper(firstValue(event, ["rsiEdge", "payload.rsiEdge"]), "UNKNOWN")}`,
    `FLOW=${asUpper(firstValue(event, ["flow", "payload.flow"]), "UNKNOWN")}`,
    `BTC=${asUpper(firstValue(event, ["btcState", "payload.btcState"]), "UNKNOWN")}`,
    `OB=${asUpper(firstValue(event, ["obRelation", "obBias", "payload.obRelation", "payload.obBias"]), "UNKNOWN")}`
  ].join("|");
}

function compactTradeEvent(input: NormalizedWebhookEvent): TradeEvent {
  const event = input as TradeEvent;
  const eventId = eventIdOf(event);
  const eventType = eventTypeOf(event);

  const payloadSeed =
    asString(firstValue(event, ["rawJson"])) ||
    asString(firstValue(event, ["payloadJson"])) ||
    safeJson(firstValue(event, ["payload"], {}));

  const payloadHash =
    asString(firstValue(event, ["payloadHash"])) ||
    hashString(`${eventId}|${payloadSeed}`);

  const record: AnyRecord = {
    ...compactPayload(event),

    eventId,
    eventType,
    action: asUpper(firstValue(event, ["action"], eventType), eventType),

    cohortKey:
      asString(firstValue(event, ["cohortKey", "payload.cohortKey"])) ||
      buildCohortKey(event),

    rawJson: "{}",
    payloadJson: "{}",

    payloadHash,
    storedCompact: true
  };

  for (const key of HEAVY_FIELDS) {
    if (key in record) {
      delete record[key];
    }
  }

  record.payload = compactPayload(record as TradeEvent);
  record.rawJson = "{}";
  record.payloadJson = "{}";

  let json = safeJson(record);

  if (byteLength(json) <= MAX_STORED_EVENT_BYTES) {
    return record as TradeEvent;
  }

  for (const [key, value] of Object.entries(record)) {
    if (CORE_FIELDS.has(key)) continue;

    if (byteLength(value) > TOP_LEVEL_FIELD_MAX_BYTES) {
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

  minimal.eventId = eventId;
  minimal.eventType = eventType;
  minimal.action = eventType;
  minimal.cohortKey = asString(record.cohortKey) || buildCohortKey(record as TradeEvent);
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
  if (!eventIdOf(event)) return false;

  return STORED_EVENT_TYPES.has(eventTypeOf(event));
}

function sortEventsAsc(events: TradeEvent[]): TradeEvent[] {
  return [...events].sort((a, b) => {
    const ta = asNumber(firstValue(a, ["ts", "createdAt", "receivedAt", "storedAt"]), 0) || 0;
    const tb = asNumber(firstValue(b, ["ts", "createdAt", "receivedAt", "storedAt"]), 0) || 0;

    const tsDiff = ta - tb;
    if (tsDiff !== 0) return tsDiff;

    return eventIdOf(a).localeCompare(eventIdOf(b));
  });
}

function saveMemoryEvent(event: NormalizedWebhookEvent): SaveTradeEventResult {
  const compact = compactTradeEvent(event);
  const eventId = eventIdOf(compact);
  const exists = memoryStore.some(row => eventIdOf(row) === eventId);

  if (exists) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: false,
      key: "memory",
      eventId,
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
    eventId,
    count: memoryStore.length,
    bytes: byteLength(compact),
    error: null
  };
}

export async function saveTradeEvent(
  event: NormalizedWebhookEvent
): Promise<SaveTradeEventResult> {
  const eventId = eventIdOf(event);

  if (!eventId) {
    throw new Error("TRADE_EVENT_EVENT_ID_MISSING");
  }

  const eventType = eventTypeOf(event);

  if (!STORED_EVENT_TYPES.has(eventType)) {
    return {
      ok: true,
      stored: false,
      deduped: false,
      persistent: hasRedis(),
      key: hasRedis() ? TRADE_EVENTS_INDEX_KEY : "memory",
      eventId,
      count: null,
      bytes: 0,
      error: `EVENT_TYPE_SKIPPED_${eventType}`
    };
  }

  const compact = compactTradeEvent(event);
  const storedEvent = {
    ...compact,
    eventId,
    eventType,
    action: eventType,
    storedAt: Date.now()
  };

  const storedJson = safeJson(storedEvent);
  const bytes = byteLength(storedJson);

  if (!hasRedis()) {
    console.warn(
      "TRADE_EVENT_STORE_USING_MEMORY_FALLBACK:",
      JSON.stringify({
        reason: "REDIS_ENV_MISSING_OR_NOT_REST_URL",
        eventId,
        hasUrl: Boolean(getRedisRestUrl()),
        hasToken: Boolean(getRedisToken())
      })
    );

    return saveMemoryEvent(event);
  }

  const eventKey = buildEventItemKey(eventId);
  const dedupeKey = buildDedupeKey(eventId);

  const dedupeResult = await redisCommand<string | null>([
    "SET",
    dedupeKey,
    "1",
    "EX",
    String(TRADE_DEDUPE_TTL_SECONDS),
    "NX"
  ]);

  if (dedupeResult !== "OK") {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: true,
      key: TRADE_EVENTS_INDEX_KEY,
      eventId,
      count: null,
      bytes,
      error: null
    };
  }

  try {
    await redisCommand([
      "SET",
      eventKey,
      storedJson,
      "EX",
      String(TRADE_EVENT_TTL_SECONDS)
    ]);

    const count = await redisCommand<number>([
      "RPUSH",
      TRADE_EVENTS_INDEX_KEY,
      eventId
    ]);

    await trimTradeEventIndexBestEffort();

    return {
      ok: true,
      stored: true,
      deduped: false,
      persistent: true,
      key: TRADE_EVENTS_INDEX_KEY,
      eventId,
      count: Number(count || 0),
      bytes,
      error: null
    };
  } catch (error) {
    await redisCommandBestEffort(["DEL", dedupeKey], "TRADE_EVENT_DEDUPE_ROLLBACK_SKIPPED");
    await redisCommandBestEffort(["DEL", eventKey], "TRADE_EVENT_ITEM_ROLLBACK_SKIPPED");

    throw error;
  }
}

async function listRedisTradeEvents(): Promise<TradeEvent[]> {
  const total = await redisCommand<number>(["LLEN", TRADE_EVENTS_INDEX_KEY]);
  const length = Number(total || 0);

  if (!length) return [];

  const readRows = Math.min(TRADE_EVENTS_READ_ROWS, length);
  const start = Math.max(0, length - readRows);
  const events: TradeEvent[] = [];
  const seen = new Set<string>();

  let cursor = start;
  let chunkSize = TRADE_EVENTS_READ_CHUNK_ROWS;

  while (cursor < length) {
    const end = Math.min(length - 1, cursor + chunkSize - 1);

    try {
      const eventIds = await redisCommand<string[]>([
        "LRANGE",
        TRADE_EVENTS_INDEX_KEY,
        String(cursor),
        String(end)
      ]);

      const ids = (Array.isArray(eventIds) ? eventIds : [])
        .map(id => asString(id))
        .filter(Boolean)
        .filter(id => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });

      if (ids.length) {
        const itemKeys = ids.map(buildEventItemKey);

        const rows = await redisCommand<Array<string | null>>([
          "MGET",
          ...itemKeys
        ]);

        for (const row of Array.isArray(rows) ? rows : []) {
          const parsed = parseStoredEvent(row);

          if (isUsableStoredEvent(parsed)) {
            events.push(parsed);
          }
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

      throw error;
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
      "TRADE_EVENTS_LIST_REDIS_FAILED_NO_MEMORY_FALLBACK:",
      JSON.stringify({
        key: TRADE_EVENTS_INDEX_KEY,
        reason: error instanceof Error ? error.message : String(error)
      })
    );

    return [];
  }
}

export async function getTradeEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function getTradeEventCount(): Promise<number> {
  if (!hasRedis()) return memoryStore.filter(isUsableStoredEvent).length;

  try {
    const count = await redisCommand<number>(["LLEN", TRADE_EVENTS_INDEX_KEY]);
    return Number(count || 0);
  } catch (error) {
    console.error(
      "TRADE_EVENT_COUNT_REDIS_FAILED_NO_MEMORY_FALLBACK:",
      JSON.stringify({
        key: TRADE_EVENTS_INDEX_KEY,
        reason: error instanceof Error ? error.message : String(error)
      })
    );

    return 0;
  }
}

async function scanDeleteKeys(pattern: string): Promise<number> {
  if (!hasRedis()) return 0;

  let cursor = "0";
  let deleted = 0;

  do {
    const result = await redisCommand<[string, string[]]>([
      "SCAN",
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      "1000"
    ]);

    cursor = asString(result?.[0], "0");

    const keys = Array.isArray(result?.[1])
      ? result[1].map(key => asString(key)).filter(Boolean)
      : [];

    for (let i = 0; i < keys.length; i += 250) {
      const chunk = keys.slice(i, i + 250);

      if (!chunk.length) continue;

      const removed = await redisCommand<number>(["DEL", ...chunk]);
      deleted += Number(removed || 0);
    }
  } while (cursor !== "0");

  return deleted;
}

async function scanDeleteKeysBestEffort(pattern: string, label: string): Promise<number> {
  try {
    return await scanDeleteKeys(pattern);
  } catch (error) {
    console.warn(
      label,
      JSON.stringify({
        pattern,
        reason: error instanceof Error ? error.message : String(error)
      })
    );

    return 0;
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

  await redisCommandBestEffort(
    ["DEL", TRADE_EVENTS_INDEX_KEY],
    "TRADE_EVENTS_CLEAR_INDEX_SKIPPED"
  );

  await redisCommandBestEffort(
    ["DEL", OLD_TRADE_EVENTS_LIST_KEY],
    "TRADE_EVENTS_CLEAR_OLD_LIST_SKIPPED"
  );

  await redisCommandBestEffort(
    ["DEL", OLD_TRADE_DEDUPE_KEY],
    "TRADE_EVENTS_CLEAR_OLD_HASH_DEDUPE_SKIPPED"
  );

  await scanDeleteKeysBestEffort(
    `${TRADE_EVENT_ITEM_PREFIX}:*`,
    "TRADE_EVENTS_CLEAR_ITEMS_SKIPPED"
  );

  await scanDeleteKeysBestEffort(
    `${TRADE_DEDUPE_KEY_PREFIX}:*`,
    "TRADE_EVENTS_CLEAR_DEDUPE_SKIPPED"
  );

  await scanDeleteKeysBestEffort(
    `${OLD_TRADE_DEDUPE_KEY}:*`,
    "TRADE_EVENTS_CLEAR_OLD_DEDUPE_KEYS_SKIPPED"
  );

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