import type { NormalizedWebhookEvent } from "./normalize";

type AnyRecord = Record<string, unknown>;
type RedisCommand = Array<string | number>;

export type TradeEvent = NormalizedWebhookEvent & AnyRecord;

export type SaveTradeEventResult = {
  ok: boolean;
  stored: boolean;
  deduped: boolean;
  persistent: boolean;
  key: string;
  eventId: string;
  count?: number | null;
  storedCount?: number;
  dedupedCount?: number;
  failedCount?: number;
  batch?: boolean;
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

const TRADE_EVENTS_READ_LIMIT = Math.max(
  100,
  Number(process.env.TRADE_EVENTS_READ_LIMIT || 5000)
);

const TRADE_EVENTS_READ_PAGE_SIZE = Math.max(
  10,
  Number(process.env.TRADE_EVENTS_READ_PAGE_SIZE || 100)
);

const memoryKey = "__TRADESYSTEM_ANALYSIS_EVENTS__";

const memoryStore: TradeEvent[] =
  ((globalThis as unknown as Record<string, TradeEvent[]>)[memoryKey] ||= []);

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function asString(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;

  if (typeof value === "string") {
    const text = value.trim();
    return text || fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return fallback;
}

function asUpper(value: unknown, fallback = "UNKNOWN"): string {
  return asString(value, fallback).toUpperCase();
}

function asLower(value: unknown, fallback = ""): string {
  return asString(value, fallback).toLowerCase();
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);

  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  const text = asString(value).toLowerCase();

  return ["true", "1", "yes", "y"].includes(text);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
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

  return (hash >>> 0).toString(16);
}

function normalizeBaseSymbol(raw: unknown): string | null {
  const symbol = asUpper(raw, "")
    .replace(/_UMCBL$/, "")
    .replace(/_DMCBL$/, "")
    .replace(/_CMCBL$/, "")
    .replace(/-UMCBL$/, "")
    .replace(/-DMCBL$/, "")
    .replace(/-CMCBL$/, "")
    .replace(/USDT$/, "")
    .replace(/USDC$/, "");

  return symbol || null;
}

function normalizeSide(raw: unknown): string | null {
  const side = asLower(raw, "");

  if (["long", "buy", "bull", "bullish"].includes(side)) return "bull";
  if (["short", "sell", "bear", "bearish"].includes(side)) return "bear";

  return side || null;
}

function normalizeEventType(raw: unknown): string {
  const value = asUpper(raw, "SNAPSHOT");

  if (value === "ENTRY") return "ENTRY";
  if (value === "EXIT") return "EXIT";
  if (value === "WAIT") return "REJECT";
  if (value === "REJECT") return "REJECT";
  if (value === "HOLD") return "SNAPSHOT";
  if (value === "SNAPSHOT") return "SNAPSHOT";
  if (value === "BATCH") return "BATCH";

  if (value.includes("ENTRY")) return "ENTRY";
  if (value.includes("EXIT")) return "EXIT";
  if (value.includes("WAIT")) return "REJECT";
  if (value.includes("REJECT")) return "REJECT";
  if (value.includes("SNAPSHOT")) return "SNAPSHOT";
  if (value.includes("BATCH")) return "BATCH";

  return value || "SNAPSHOT";
}

function eventTypeFromEvent(event: AnyRecord): string {
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

function getReason(event: AnyRecord, eventType: string): string {
  const rejectReason = firstValue(event, [
    "rejectReason",
    "payload.rejectReason"
  ]);

  const exitReason = firstValue(event, [
    "exitReason",
    "payload.exitReason"
  ]);

  const entryReason = firstValue(event, [
    "entryReason",
    "entryType",
    "payload.entryReason",
    "payload.entryType",
    "payload.setup.entryReason"
  ]);

  if (eventType === "REJECT") {
    return asUpper(rejectReason || firstValue(event, ["reason", "payload.reason"]), "UNKNOWN");
  }

  if (eventType === "EXIT") {
    return asUpper(exitReason || firstValue(event, ["reason", "payload.reason"]), "UNKNOWN");
  }

  if (eventType === "ENTRY") {
    return asUpper(entryReason || firstValue(event, ["reason", "payload.reason"]), "UNKNOWN");
  }

  return asUpper(
    firstValue(event, [
      "reason",
      "payload.reason",
      "entryReason",
      "payload.entryReason",
      "exitReason",
      "payload.exitReason",
      "rejectReason",
      "payload.rejectReason"
    ]),
    "UNKNOWN"
  );
}

function scoreBucket(value: unknown, label: string): string {
  const n = asNumber(value);

  if (n === null) return `${label}_NA`;
  if (n >= 95) return `${label}_95_100`;
  if (n >= 90) return `${label}_90_95`;
  if (n >= 85) return `${label}_85_90`;
  if (n >= 80) return `${label}_80_85`;
  if (n >= 70) return `${label}_70_80`;
  if (n >= 60) return `${label}_60_70`;
  if (n >= 55) return `${label}_55_60`;

  return `${label}_LT_55`;
}

function rrBucket(value: unknown): string {
  const n = asNumber(value);

  if (n === null) return "RR_NA";
  if (n >= 2) return "RR_GTE_2";
  if (n >= 1.75) return "RR_1P75_2P00";
  if (n >= 1.5) return "RR_1P50_1P75";
  if (n >= 1.25) return "RR_1P25_1P50";
  if (n >= 1) return "RR_1P00_1P25";

  return "RR_LT_1";
}

function spreadBucketFromEvent(event: AnyRecord): string {
  const explicit = asUpper(
    firstValue(event, [
      "spreadBucket",
      "payload.spreadBucket",
      "payload.ob.spreadBucket",
      "ob.spreadBucket"
    ]),
    ""
  );

  if (explicit) return explicit;

  const spreadBps = asNumber(
    firstValue(event, [
      "spreadBps",
      "payload.spreadBps",
      "payload.ob.spreadBps",
      "ob.spreadBps"
    ])
  );

  const spreadPct = asNumber(
    firstValue(event, [
      "spreadPct",
      "payload.spreadPct",
      "payload.ob.spreadPct",
      "ob.spreadPct"
    ])
  );

  const bps = spreadBps ?? (spreadPct !== null ? spreadPct * 10000 : null);

  if (bps === null) return "SPREAD_NA";
  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 16) return "SPREAD_12_16BPS";
  if (bps < 22) return "SPREAD_16_22BPS";
  if (bps < 25) return "SPREAD_22_25BPS";

  return "SPREAD_GTE_25BPS";
}

function depthBucketFromEvent(event: AnyRecord): string {
  const explicit = asUpper(
    firstValue(event, [
      "depthBucket",
      "payload.depthBucket",
      "payload.ob.depthBucket",
      "ob.depthBucket"
    ]),
    ""
  );

  if (explicit) return explicit;

  const depth = asNumber(
    firstValue(event, [
      "depthMinUsd1p",
      "depthUsd1p",
      "payload.depthMinUsd1p",
      "payload.depthUsd1p",
      "payload.ob.depthMinUsd1p",
      "ob.depthMinUsd1p"
    ])
  );

  if (depth === null) return "DEPTH_NA";
  if (depth < 10_000) return "DEPTH_LT_10K";
  if (depth < 50_000) return "DEPTH_10K_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function buildCohortKey(event: TradeEvent): string {
  return [
    `SETUP=${asString(event.setupClass, "UNKNOWN")}`,
    `SIDE=${asString(event.side, "unknown")}`,
    `REASON=${asString(event.reason, "UNKNOWN")}`,
    `RSI=${asString(event.rsiZone, "UNKNOWN")}`,
    `EDGE=${asString(event.rsiEdge, "UNKNOWN")}`,
    `FLOW=${asString(event.flow, "UNKNOWN")}`,
    `BTC=${asString(event.btcState, "UNKNOWN")}`,
    `OB=${asString(event.obRelation || event.obBias, "UNKNOWN")}`,
    scoreBucket(event.confluence, "CONF"),
    scoreBucket(event.sniperScore, "SNIPER"),
    rrBucket(event.finalRr ?? event.plannedRR ?? event.rr),
    asString(event.spreadBucket, "SPREAD_NA"),
    asString(event.depthBucket, "DEPTH_NA")
  ].join("|");
}

function buildEventId(
  event: AnyRecord,
  eventType: string,
  symbol: string | null,
  side: string | null
): string {
  const existing = asString(
    firstValue(event, [
      "eventId",
      "payload.eventId",
      "id",
      "payload.id"
    ]),
    ""
  );

  if (existing) return existing.slice(0, 300);

  const tradeId = asString(
    firstValue(event, [
      "tradeId",
      "payload.tradeId",
      "signalId",
      "payload.signalId"
    ]),
    ""
  );

  const ts =
    asNumber(
      firstValue(event, [
        "ts",
        "createdAt",
        "timestamp",
        "payload.ts",
        "payload.createdAt",
        "payload.timestamp"
      ])
    ) ?? Date.now();

  const reason = getReason(event, eventType);

  const base = [
    "ts",
    asString(firstValue(event, ["strategyVersion", "payload.strategyVersion"]), "UNKNOWN"),
    asString(firstValue(event, ["runId", "payload.runId"]), "UNKNOWN"),
    eventType,
    symbol || "UNKNOWN",
    side || "unknown",
    reason,
    tradeId,
    String(ts)
  ]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_-]+/gi, "_");

  const hash = hashString(safeJson(event)).slice(0, 12);

  return `${base}_${hash}`.slice(0, 300);
}

function compactPayload(event: AnyRecord): AnyRecord {
  return {
    eventType: event.eventType,
    action: event.action,
    source: event.source,
    strategyVersion: event.strategyVersion,
    runId: event.runId,
    tradeId: event.tradeId,

    symbol: event.symbol,
    side: event.side,
    reason: event.reason,
    entryReason: event.entryReason,
    exitReason: event.exitReason,
    rejectReason: event.rejectReason,

    setupClass: event.setupClass,
    grade: event.grade,
    gradePoints: event.gradePoints,

    entry: event.entry,
    sl: event.sl,
    initialSl: event.initialSl,
    tp: event.tp,
    exit: event.exit,

    rr: event.rr,
    plannedRR: event.plannedRR,
    baseRR: event.baseRR,
    finalRr: event.finalRr,
    exitR: event.exitR,
    pnlPct: event.pnlPct,

    score: event.score,
    confluence: event.confluence,
    rawConfluence: event.rawConfluence,
    effectiveConfluence: event.effectiveConfluence,
    sniperScore: event.sniperScore,
    rawSniperScore: event.rawSniperScore,
    fallbackSniperScore: event.fallbackSniperScore,

    rsi: event.rsi,
    rsiHTF: event.rsiHTF,
    rsiZone: event.rsiZone,
    rsiEdge: event.rsiEdge,

    btcState: event.btcState,
    regime: event.regime,
    flow: event.flow,

    obBias: event.obBias,
    obRelation: event.obRelation,
    spreadPct: event.spreadPct,
    spreadBps: event.spreadBps,
    spreadBucket: event.spreadBucket,
    depthMinUsd1p: event.depthMinUsd1p,
    depthBucket: event.depthBucket,

    directToSL: event.directToSL,
    nearTpSeen: event.nearTpSeen,
    reachedHalfR: event.reachedHalfR,
    reachedOneR: event.reachedOneR,
    breakEvenActivated: event.breakEvenActivated,
    breakEvenStop: event.breakEvenStop,

    mfeR: event.mfeR,
    maeR: event.maeR,
    currentR: event.currentR,
    maxTpProgress: event.maxTpProgress,
    maxSlProgress: event.maxSlProgress,

    ts: event.ts,
    receivedAt: event.receivedAt
  };
}

function compactTradeEvent(raw: unknown, parent: AnyRecord = {}): TradeEvent {
  const event = isRecord(raw) ? raw : {};
  const payload = isRecord(event.payload) ? event.payload : {};

  const merged: AnyRecord = {
    ...parent,
    ...payload,
    ...event
  };

  const eventType = eventTypeFromEvent(merged);
  const action = normalizeEventType(firstValue(merged, ["action", "payload.action"], eventType));

  const symbol = normalizeBaseSymbol(
    firstValue(merged, [
      "symbol",
      "payload.symbol",
      "rawBitgetSymbol",
      "payload.rawBitgetSymbol",
      "contractSymbol",
      "payload.contractSymbol"
    ])
  );

  const side = normalizeSide(
    firstValue(merged, [
      "side",
      "payload.side"
    ])
  );

  const reason = getReason(merged, eventType);

  const tradeId =
    asString(
      firstValue(merged, [
        "tradeId",
        "payload.tradeId",
        "signalId",
        "payload.signalId"
      ]),
      ""
    ) || null;

  const eventId = buildEventId(merged, eventType, symbol, side);

  const setupClass = asUpper(
    firstValue(merged, [
      "setupClass",
      "payload.setupClass",
      "payload.setup.setupClass"
    ]),
    "UNKNOWN"
  );

  const grade =
    asUpper(
      firstValue(merged, [
        "grade",
        "payload.grade",
        "payload.setup.grade"
      ]),
      ""
    ) || null;

  const entryReason = asUpper(
    firstValue(merged, [
      "entryReason",
      "entryType",
      "payload.entryReason",
      "payload.entryType",
      "payload.setup.entryReason"
    ]),
    "UNKNOWN"
  );

  const exitReason = asUpper(
    firstValue(merged, [
      "exitReason",
      "payload.exitReason"
    ]),
    "UNKNOWN"
  );

  const rejectReason = asUpper(
    firstValue(merged, [
      "rejectReason",
      "payload.rejectReason"
    ]),
    "UNKNOWN"
  );

  const score =
    asNumber(firstValue(merged, ["score", "moveScore", "payload.score", "payload.scores.score"])) ?? 0;

  const confluence =
    asNumber(firstValue(merged, ["confluence", "effectiveConfluence", "payload.confluence", "payload.scores.confluence"])) ?? 0;

  const rawConfluence =
    asNumber(firstValue(merged, ["rawConfluence", "payload.rawConfluence", "payload.scores.rawConfluence"])) ?? 0;

  const sniperScore =
    asNumber(firstValue(merged, ["sniperScore", "payload.sniperScore", "payload.scores.sniperScore"])) ?? 0;

  const rawSniperScore =
    asNumber(firstValue(merged, ["rawSniperScore", "payload.rawSniperScore", "payload.scores.rawSniperScore"])) ?? 0;

  const fallbackSniperScore =
    asNumber(firstValue(merged, ["fallbackSniperScore", "payload.fallbackSniperScore", "payload.scores.fallbackSniperScore"])) ?? 0;

  const rsiZone =
    asUpper(firstValue(merged, ["rsiZone", "payload.rsiZone", "payload.rsi.rsiZone"]), "") || null;

  const rsiEdge =
    asUpper(firstValue(merged, ["rsiEdge", "rsiEntryEdge", "payload.rsiEdge", "payload.rsi.rsiEdge"]), "UNKNOWN");

  const btcState =
    asUpper(firstValue(merged, ["btcState", "payload.btcState", "payload.market.btcState"]), "UNKNOWN");

  const regime =
    asUpper(firstValue(merged, ["regime", "payload.regime", "payload.market.regime"]), "UNKNOWN");

  const flow =
    asUpper(firstValue(merged, ["flow", "payload.flow", "payload.market.flow"]), "UNKNOWN");

  const obBias =
    asUpper(firstValue(merged, ["obBias", "payload.obBias", "payload.ob.bias", "ob.bias"]), "UNKNOWN");

  const obRelation =
    asUpper(firstValue(merged, ["obRelation", "payload.obRelation", "payload.ob.relation", "ob.relation"]), "UNKNOWN");

  const spreadPct =
    asNumber(firstValue(merged, ["spreadPct", "payload.spreadPct", "payload.ob.spreadPct", "ob.spreadPct"]));

  const spreadBps =
    asNumber(firstValue(merged, ["spreadBps", "payload.spreadBps", "payload.ob.spreadBps", "ob.spreadBps"])) ??
    (spreadPct !== null ? spreadPct * 10000 : 0);

  const spreadBucket = spreadBucketFromEvent(merged);
  const depthBucket = depthBucketFromEvent(merged);

  const entry =
    asNumber(firstValue(merged, ["entry", "entryPrice", "price.entry", "payload.entry", "payload.price.entry", "payload.price"])) ??
    asNumber(firstValue(merged, ["price", "payload.price"])) ??
    null;

  const sl =
    asNumber(firstValue(merged, ["sl", "slPrice", "price.sl", "payload.sl", "payload.price.sl"])) ?? null;

  const initialSl =
    asNumber(firstValue(merged, ["initialSl", "payload.initialSl"])) ?? sl;

  const tp =
    asNumber(firstValue(merged, ["tp", "tpPrice", "price.tp", "payload.tp", "payload.price.tp"])) ?? null;

  const exit =
    asNumber(firstValue(merged, ["exit", "executionPrice", "payload.exit", "payload.executionPrice"])) ?? null;

  const rr =
    asNumber(firstValue(merged, ["rr", "plannedRR", "finalRr", "payload.rr", "payload.plannedRR", "payload.finalRr"])) ?? null;

  const plannedRR =
    asNumber(firstValue(merged, ["plannedRR", "rr", "finalRr", "payload.plannedRR", "payload.rr", "payload.finalRr"])) ?? null;

  const baseRR =
    asNumber(firstValue(merged, ["baseRR", "payload.baseRR", "payload.rr.baseRR"])) ?? null;

  const finalRr =
    asNumber(firstValue(merged, ["finalRr", "finalRR", "effectiveRR", "payload.finalRr", "payload.finalRR", "payload.effectiveRR"])) ?? null;

  const ts =
    asNumber(firstValue(merged, ["ts", "createdAt", "timestamp", "payload.ts", "payload.createdAt", "payload.timestamp"])) ??
    Date.now();

  const receivedAt =
    asNumber(firstValue(merged, ["receivedAt", "payload.receivedAt"])) ?? Date.now();

    const compact = {
    eventId,
    eventType,
    action,
    source: asUpper(firstValue(merged, ["source", "payload.source"], "TRADESYSTEM"), "TRADESYSTEM"),
    strategyVersion: asString(firstValue(merged, ["strategyVersion", "payload.strategyVersion"], parent.strategyVersion), "UNKNOWN"),
    runId: asString(firstValue(merged, ["runId", "payload.runId"], parent.runId), "UNKNOWN"),
    tradeId: tradeId || eventId,

    symbol,
    side,
    reason,
    cohortKey: null,

    setupClass,
    grade,

    ts,
    receivedAt,

    score,
    confluence,
    sniperScore,

    rsi: asNumber(firstValue(merged, ["rsi", "payload.rsi", "payload.rsi.rsi"])),
    rsiHTF: asNumber(firstValue(merged, ["rsiHTF", "payload.rsiHTF", "payload.rsi.rsiHTF"])),
    rsiZone,

    obBias,
    spreadPct,
    depthMinUsd1p: asNumber(
      firstValue(merged, [
        "depthMinUsd1p",
        "depthUsd1p",
        "payload.depthMinUsd1p",
        "payload.depthUsd1p",
        "payload.ob.depthMinUsd1p"
      ])
    ),

    entry,
    sl,
    initialSl,
    tp,
    exit,

    rr,
    plannedRR,
    baseRR,
    finalRr,
    exitR: asNumber(firstValue(merged, ["exitR", "payload.exitR", "outcome.exitR"])),
    pnlPct: asNumber(firstValue(merged, ["pnlPct", "pnl", "payload.pnlPct", "payload.pnl", "outcome.pnlPct"])),

    mfeR: asNumber(firstValue(merged, ["mfeR", "payload.mfeR"])),
    maeR: asNumber(firstValue(merged, ["maeR", "payload.maeR"])),
    currentR: asNumber(firstValue(merged, ["currentR", "payload.currentR"])),

    directToSL: asBoolean(firstValue(merged, ["directToSL", "payload.directToSL"])),
    nearTpSeen: asBoolean(firstValue(merged, ["nearTpSeen", "payload.nearTpSeen"])),
    reachedHalfR: asBoolean(firstValue(merged, ["reachedHalfR", "payload.reachedHalfR"])),
    reachedOneR: asBoolean(firstValue(merged, ["reachedOneR", "payload.reachedOneR"])),
    breakEvenActivated: asBoolean(firstValue(merged, ["breakEvenActivated", "payload.breakEvenActivated"])),
    breakEvenStop: asBoolean(firstValue(merged, ["breakEvenStop", "payload.breakEvenStop"])),

    payload: {},
    rawJson: "{}",
    payloadJson: "{}",

    entryReason,
    exitReason,
    rejectReason,

    gradePoints:
      asNumber(firstValue(merged, ["gradePoints", "payload.gradePoints", "payload.setup.gradePoints"])) ?? 0,

    recommendedRisk:
      asString(firstValue(merged, ["recommendedRisk", "payload.recommendedRisk"]), "N/A"),

    rawConfluence,
    effectiveConfluence:
      asNumber(firstValue(merged, ["effectiveConfluence", "payload.effectiveConfluence"])) ?? confluence,

    rawSniperScore,
    fallbackSniperScore,

    rsiEdge,

    btcState,
    regime,
    flow,

    obRelation,
    spreadBps,
    spreadBucket,
    depthBucket,

    triggerR: asNumber(firstValue(merged, ["triggerR", "payload.triggerR"])) ?? 0,
    triggerPnlPct: asNumber(firstValue(merged, ["triggerPnlPct", "payload.triggerPnlPct"])) ?? 0,
    maxTpProgress: asNumber(firstValue(merged, ["maxTpProgress", "payload.maxTpProgress"])) ?? 0,
    maxSlProgress: asNumber(firstValue(merged, ["maxSlProgress", "payload.maxSlProgress"])) ?? 0,

    ticksObserved: asNumber(firstValue(merged, ["ticksObserved", "payload.ticksObserved"])) ?? 0,
    favorableTicks: asNumber(firstValue(merged, ["favorableTicks", "payload.favorableTicks"])) ?? 0,
    adverseTicks: asNumber(firstValue(merged, ["adverseTicks", "payload.adverseTicks"])) ?? 0,
    neutralTicks: asNumber(firstValue(merged, ["neutralTicks", "payload.neutralTicks"])) ?? 0,

    tpRewardMultiplier:
      asNumber(firstValue(merged, ["tpRewardMultiplier", "payload.tpRewardMultiplier", "payload.rr.tpRewardMultiplier"])) ?? 1,

    open: asBoolean(firstValue(merged, ["open", "payload.open"])) || eventType === "SNAPSHOT",

    status: asUpper(firstValue(merged, ["status", "payload.status"], eventType), eventType),

    payloadHash: hashString(safeJson(merged))
  };

  compact.cohortKey =
    asString(firstValue(merged, ["cohortKey", "payload.cohortKey"]), "") ||
    buildCohortKey(compact);

  const minimalPayload = compactPayload(compact);
  const minimalJson = safeJson(minimalPayload);

  compact.payload = minimalPayload;
  compact.rawJson = minimalJson;
  compact.payloadJson = minimalJson;

    return compact as unknown as TradeEvent;
}

function parseStoredEvent(value: unknown): TradeEvent | null {
  if (!value) return null;

  if (isRecord(value)) {
    return compactTradeEvent(value);
  }

  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);

    if (!isRecord(parsed)) return null;

    return compactTradeEvent(parsed);
  } catch {
    return null;
  }
}

function getBatchRows(event: unknown): unknown[] {
  if (!isRecord(event)) return [];

  const payload = isRecord(event.payload) ? event.payload : {};

  const candidates = [
    event.rows,
    event.actions,
    event.data,
    payload.rows,
    payload.actions,
    payload.data
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }
  }

  return [];
}

function normalizeRedisRestUrl(raw: string): string {
  const value = String(raw || "").trim();

  if (!value) return "";

  if (value.startsWith("https://") || value.startsWith("http://")) {
    return value.replace(/\/+$/, "");
  }

  if (value.startsWith("redis://") || value.startsWith("rediss://")) {
    try {
      const url = new URL(value);
      return `https://${url.hostname}`;
    } catch {
      return "";
    }
  }

  if (value.includes(".upstash.io")) {
    return `https://${value.replace(/^https?:\/\//, "").split("/")[0]}`;
  }

  return value;
}

function getRedisUrl(): string {
  return normalizeRedisRestUrl(
    process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.REDIS_REST_URL ||
      process.env.UPSTASH_REST_URL ||
      process.env.KV_URL ||
      process.env.REDIS_URL ||
      ""
  );
}

function getRedisToken(): string {
  return (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN ||
    process.env.KV_TOKEN ||
    ""
  );
}

function hasRedis(): boolean {
  return Boolean(getRedisUrl() && getRedisToken());
}

function isMaxRequestError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error || "");

  return (
    text.includes("max request size exceeded") ||
    text.includes("ERR max request size exceeded") ||
    text.includes("10485760")
  );
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

function sortEventsAsc(events: TradeEvent[]): TradeEvent[] {
  return [...events].sort((a, b) => {
    const tsDiff = Number(a.ts || 0) - Number(b.ts || 0);
    if (tsDiff !== 0) return tsDiff;

    return String(a.eventId || "").localeCompare(String(b.eventId || ""));
  });
}

function saveMemoryEvent(event: TradeEvent): SaveTradeEventResult {
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
      count: memoryStore.length
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
    count: memoryStore.length
  };
}

async function saveSingleTradeEvent(event: TradeEvent): Promise<SaveTradeEventResult> {
  const compact = compactTradeEvent(event);

  if (!compact.eventId) {
    throw new Error("TRADE_EVENT_EVENT_ID_MISSING");
  }

  if (!hasRedis()) {
    console.warn("TRADE_EVENT_STORE_USING_MEMORY_FALLBACK:", {
      reason: "Redis env missing",
      eventId: compact.eventId
    });

    return saveMemoryEvent(compact);
  }

  const existing = await redisCommand<string | null>([
    "HGET",
    TRADE_DEDUPE_KEY,
    compact.eventId
  ]);

  if (existing) {
    return {
      ok: true,
      stored: false,
      deduped: true,
      persistent: true,
      key: TRADE_EVENTS_KEY,
      eventId: compact.eventId,
      count: null
    };
  }

  const storedEvent = {
    ...compact,
    storedAt: Date.now()
  };

  await redisCommand([
    "HSET",
    TRADE_DEDUPE_KEY,
    compact.eventId,
    String(Date.now())
  ]);

  const count = await redisCommand<number>([
    "RPUSH",
    TRADE_EVENTS_KEY,
    safeJson(storedEvent)
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
    eventId: compact.eventId,
    count
  };
}

export async function saveTradeEvent(
  event: NormalizedWebhookEvent | TradeEvent
): Promise<SaveTradeEventResult> {
  const rawEvent = event as TradeEvent;
  const rows = getBatchRows(rawEvent);

  if (rows.length > 0) {
    let storedCount = 0;
    let dedupedCount = 0;
    let failedCount = 0;
    let lastEventId = "BATCH";

    const parentMeta: AnyRecord = {
      runId: rawEvent.runId,
      strategyVersion: rawEvent.strategyVersion,
      btcState: rawEvent.btcState,
      regime: rawEvent.regime,
      source: rawEvent.source
    };

    for (const row of rows) {
      try {
        const result = await saveSingleTradeEvent(compactTradeEvent(row, parentMeta));
        lastEventId = result.eventId;

        if (result.stored) storedCount += 1;
        if (result.deduped) dedupedCount += 1;
      } catch (error) {
        failedCount += 1;

        console.warn("TRADE_EVENT_BATCH_ROW_SAVE_FAILED:", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      ok: failedCount === 0,
      stored: storedCount > 0,
      deduped: storedCount === 0 && dedupedCount > 0,
      persistent: hasRedis(),
      key: hasRedis() ? TRADE_EVENTS_KEY : "memory",
      eventId: lastEventId,
      count: storedCount + dedupedCount,
      storedCount,
      dedupedCount,
      failedCount,
      batch: true,
      error: failedCount > 0 ? "SOME_BATCH_ROWS_FAILED" : null
    };
  }

  return saveSingleTradeEvent(rawEvent);
}

async function listRedisEvents(): Promise<TradeEvent[]> {
  const count = await redisCommand<number>([
    "LLEN",
    TRADE_EVENTS_KEY
  ]);

  const total = Number(count || 0);
  if (!total) return [];

  const start = Math.max(0, total - TRADE_EVENTS_READ_LIMIT);
  const end = total - 1;

  const events: TradeEvent[] = [];
  let index = start;
  let pageSize = TRADE_EVENTS_READ_PAGE_SIZE;

  while (index <= end) {
    const pageEnd = Math.min(end, index + pageSize - 1);

    try {
      const rows = await redisCommand<string[]>([
        "LRANGE",
        TRADE_EVENTS_KEY,
        index,
        pageEnd
      ]);

      for (const row of Array.isArray(rows) ? rows : []) {
        const parsed = parseStoredEvent(row);
        if (parsed) events.push(parsed);
      }

      index = pageEnd + 1;
      continue;
    } catch (error) {
      if (!isMaxRequestError(error)) {
        throw error;
      }

      if (pageSize > 1) {
        pageSize = Math.max(1, Math.floor(pageSize / 2));
        continue;
      }

      console.warn("TRADE_EVENT_ROW_SKIPPED_MAX_SIZE:", {
        index,
        error: error instanceof Error ? error.message : String(error)
      });

      index += 1;
    }
  }

  return sortEventsAsc(events);
}

export async function listTradeEvents(): Promise<TradeEvent[]> {
  if (!hasRedis()) {
    return sortEventsAsc(memoryStore);
  }

  try {
    return await listRedisEvents();
  } catch (error) {
    console.warn("TRADE_EVENT_LIST_FAILED_USING_MEMORY_FALLBACK:", {
      error: error instanceof Error ? error.message : String(error)
    });

    return sortEventsAsc(memoryStore);
  }
}

export async function getTradeEvents(): Promise<TradeEvent[]> {
  return listTradeEvents();
}

export async function getTradeEventCount(): Promise<number> {
  if (!hasRedis()) return memoryStore.length;

  try {
    const count = await redisCommand<number>([
      "LLEN",
      TRADE_EVENTS_KEY
    ]);

    return Number(count || 0);
  } catch (error) {
    console.warn("TRADE_EVENT_COUNT_FAILED:", {
      error: error instanceof Error ? error.message : String(error)
    });

    return memoryStore.length;
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
  await redisCommand(["DEL", TRADE_DEDUPE_KEY]);

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