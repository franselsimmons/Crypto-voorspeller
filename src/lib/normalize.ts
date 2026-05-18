export type WebhookRecord = Record<string, unknown>;

export type NormalizedWebhookEvent = {
  [key: string]: unknown;

  eventId: string;
  eventType: string;
  action: string;
  source: string;
  strategyVersion: string;
  runId: string;
  tradeId: string | null;

  symbol: string | null;
  rawBitgetSymbol: string | null;
  side: string | null;

  status: string | null;
  open: boolean;

  reason: string;
  entryReason: string;
  exitReason: string | null;
  rejectReason: string | null;
  cohortKey: string | null;

  setupClass: string | null;
  grade: string | null;
  gradePoints: number;
  recommendedRisk: string | null;

  ts: number;
  createdAt: number;
  receivedAt: number;

  score: number;
  moveScore: number;

  confluence: number;
  rawConfluence: number;
  effectiveConfluence: number;

  sniper: string | null;
  sniperScore: number;
  rawSniperScore: number;
  fallbackSniperScore: number;

  rsi: number | null;
  rsiHTF: number | null;
  rsiZone: string | null;
  rsiEdge: string | null;

  obBias: string | null;
  obRelation: string | null;

  spreadPct: number | null;
  spreadBps: number | null;
  depthMinUsd1p: number | null;
  depthUsd1p: number | null;

  spreadBucket: string | null;
  depthBucket: string | null;

  entry: number | null;
  price: number | null;
  entryPrice: number | null;

  sl: number | null;
  slPrice: number | null;
  initialSl: number | null;

  tp: number | null;
  tpPrice: number | null;

  exit: number | null;
  exitPrice: number | null;
  executionPrice: number | null;
  triggerPrice: number | null;

  rr: number | null;
  plannedRR: number | null;
  baseRR: number | null;
  finalRr: number | null;
  finalRR: number | null;
  effectiveRR: number | null;
  tpRewardMultiplier: number;

  exitR: number | null;
  pnlPct: number | null;
  triggerR: number | null;
  triggerPnlPct: number | null;

  currentR: number | null;
  mfeR: number | null;
  maeR: number | null;
  maxTpProgress: number | null;
  maxSlProgress: number | null;

  reachedHalfR: boolean;
  reachedOneR: boolean;
  nearTpSeen: boolean;
  directToSL: boolean;
  slAfterHalfR: boolean;
  slAfterOneR: boolean;
  slAfterNearTp: boolean;

  breakEvenActivated: boolean;
  breakEvenStop: boolean;
  breakEvenSl: number | null;
  slBeforeBreakEven: number | null;

  ticksObserved: number;
  favorableTicks: number;
  adverseTicks: number;
  neutralTicks: number;

  flow: string | null;
  funding: number | null;
  regime: string | null;
  btcState: string | null;

  stage: string | null;
  scannerStage: string | null;
  stageSource: string | null;

  bullishMidTrendProbe: boolean;
  bullishMidTrendProbeReason: string | null;

  btcBullishBearException: boolean;
  btcBullishBearExceptionReason: string | null;

  filterDiagnostics: unknown;
  filterValues: unknown;
  filterChecks: unknown;
  liveFilterMetrics: unknown;
  specialFilterChecks: unknown;

  analysisType: string;
  payload: WebhookRecord;
  rawJson: string;
  payloadJson: string;
  payloadHash: string;
};

export type NormalizedEntry = NormalizedWebhookEvent;
export type NormalizedExit = NormalizedWebhookEvent;
export type NormalizedReject = NormalizedWebhookEvent;

function isRecord(value: unknown): value is WebhookRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function safeTrim(value: unknown, fallback = ""): string {
  return safeString(value, fallback).trim();
}

function safeUpper(value: unknown, fallback = ""): string {
  const text = safeTrim(value, fallback);
  return text ? text.toUpperCase() : fallback;
}

function safeLower(value: unknown, fallback = ""): string {
  const text = safeTrim(value, fallback);
  return text ? text.toLowerCase() : fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const cleaned =
    typeof value === "string"
      ? value.replace("%", "").replace(",", ".").trim()
      : value;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const cleaned =
    typeof value === "string"
      ? value.replace("%", "").replace(",", ".").trim()
      : value;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function safeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const text = safeTrim(value).toLowerCase();

  return ["true", "1", "yes", "y", "on"].includes(text);
}

function parseJsonObject(value: unknown): WebhookRecord {
  if (!value) return {};

  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);

    if (!isRecord(parsed)) {
      return {};
    }

    return parsed;
  } catch {
    return {};
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

function pick(obj: unknown, paths: string[], fallback: unknown = null): unknown {
  for (const path of paths) {
    const value = readPath(obj, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function normalizeBaseSymbol(raw: unknown): string | null {
  const symbol = safeUpper(raw)
    .replace(/_UMCBL$/, "")
    .replace(/_DMCBL$/, "")
    .replace(/_CMCBL$/, "")
    .replace(/-UMCBL$/, "")
    .replace(/-DMCBL$/, "")
    .replace(/-CMCBL$/, "")
    .replace(/USDT$/, "")
    .replace(/USDC$/, "");

  if (!symbol) return null;
  if (symbol === "UNKNOWN") return "UNKNOWN";

  return symbol;
}

function normalizeSide(raw: unknown): string | null {
  const side = safeLower(raw);

  if (!side) return null;

  if (["bull", "long", "buy", "bullish"].includes(side)) return "bull";
  if (["bear", "short", "sell", "bearish"].includes(side)) return "bear";

  return side;
}

function normalizeEventType(raw: unknown, actionRaw: unknown): string {
  const eventType = safeUpper(raw);
  const action = safeUpper(actionRaw);
  const value = eventType || action || "SNAPSHOT";

  if (value === "WAIT") return "REJECT";
  if (value === "SKIP") return "REJECT";
  if (value === "HOLD") return "SNAPSHOT";

  if (value === "ENTRY") return "ENTRY";
  if (value === "EXIT") return "EXIT";
  if (value === "REJECT") return "REJECT";
  if (value === "SNAPSHOT") return "SNAPSHOT";
  if (value === "BATCH") return "BATCH";

  return value || "SNAPSHOT";
}

function getReason(body: WebhookRecord, eventType: string): string {
  const rejectReason = safeTrim(
    pick(body, ["rejectReason", "payload.rejectReason"])
  );

  const exitReason = safeTrim(
    pick(body, ["exitReason", "payload.exitReason"])
  );

  const entryReason = safeTrim(
    pick(body, ["entryReason", "entryType", "payload.entryReason", "payload.entryType"])
  );

  if (eventType === "REJECT") {
    return safeUpper(rejectReason || pick(body, ["reason", "payload.reason"]) || "UNKNOWN", "UNKNOWN");
  }

  if (eventType === "EXIT") {
    return safeUpper(exitReason || pick(body, ["reason", "payload.reason"]) || "UNKNOWN", "UNKNOWN");
  }

  if (eventType === "ENTRY") {
    return safeUpper(entryReason || pick(body, ["reason", "payload.reason"]) || "UNKNOWN", "UNKNOWN");
  }

  return safeUpper(
    pick(body, ["reason", "payload.reason"]) ||
      rejectReason ||
      exitReason ||
      entryReason ||
      "UNKNOWN",
    "UNKNOWN"
  );
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

    const record = input as WebhookRecord;
    const output: WebhookRecord = {};

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

function buildFallbackEventId(body: WebhookRecord): string {
  const symbol = normalizeBaseSymbol(pick(body, ["symbol", "payload.symbol"])) || "UNKNOWN";
  const side = normalizeSide(pick(body, ["side", "payload.side"])) || "unknown";
  const eventType = normalizeEventType(
    pick(body, ["eventType", "type", "payload.eventType", "payload.type"]),
    pick(body, ["action", "payload.action"])
  );

  const reason = getReason(body, eventType);
  const strategyVersion = safeTrim(pick(body, ["strategyVersion", "payload.strategyVersion"]), "UNKNOWN");
  const runId = safeTrim(pick(body, ["runId", "payload.runId"]), "UNKNOWN");
  const tradeId = safeTrim(pick(body, ["tradeId", "id", "signalId", "payload.tradeId", "payload.id"]));
  const ts = safeTrim(pick(body, ["ts", "createdAt", "timestamp", "payload.ts", "payload.createdAt"]), String(Date.now()));

  return [
    "ts",
    strategyVersion,
    runId,
    eventType,
    symbol,
    side,
    reason,
    tradeId,
    ts
  ]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 260);
}

function scoreBucket(value: unknown, label: string): string {
  const n = nullableNumber(value);

  if (n === null) return `${label}_NA`;
  if (n >= 95) return `${label}_95_100`;
  if (n >= 90) return `${label}_90_95`;
  if (n >= 85) return `${label}_85_90`;
  if (n >= 80) return `${label}_80_85`;
  if (n >= 70) return `${label}_70_80`;
  if (n >= 60) return `${label}_60_70`;

  return `${label}_LT_60`;
}

function rrBucket(value: unknown): string {
  const n = nullableNumber(value);

  if (n === null) return "RR_NA";
  if (n >= 2) return "RR_GTE_2";
  if (n >= 1.75) return "RR_1P75_2P00";
  if (n >= 1.5) return "RR_1P50_1P75";
  if (n >= 1.25) return "RR_1P25_1P50";
  if (n >= 1) return "RR_1P00_1P25";

  return "RR_LT_1";
}

function spreadBucket(spreadPct: number | null, spreadBps: number | null): string | null {
  const bps = spreadBps ?? (spreadPct !== null ? spreadPct * 10000 : null);

  if (bps === null) return null;
  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 25) return "SPREAD_12_25BPS";

  return "SPREAD_GTE_25BPS";
}

function depthBucket(depth: number | null): string | null {
  if (depth === null) return null;
  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function buildCohortKey(event: NormalizedWebhookEvent): string {
  return [
    `SETUP=${event.setupClass || "UNKNOWN"}`,
    `SIDE=${event.side || "unknown"}`,
    `REASON=${event.entryReason || event.reason || "UNKNOWN"}`,
    `RSI=${event.rsiZone || "UNKNOWN"}`,
    `EDGE=${event.rsiEdge || "UNKNOWN"}`,
    `FLOW=${event.flow || "UNKNOWN"}`,
    `BTC=${event.btcState || "UNKNOWN"}`,
    `OB=${event.obRelation || event.obBias || "UNKNOWN"}`,
    scoreBucket(event.confluence, "CONF"),
    scoreBucket(event.sniperScore, "SNIPER"),
    rrBucket(event.finalRr ?? event.plannedRR ?? event.rr),
    event.spreadBucket || "SPREAD_NA",
    event.depthBucket || "DEPTH_NA"
  ].join("|");
}

export function normalizeWebhookBody(rawBody: string | WebhookRecord): NormalizedWebhookEvent {
  const parsed = parseJsonObject(rawBody);
  const payloadObj = parseJsonObject(parsed.payload);
  const payloadJsonObj = parseJsonObject(parsed.payloadJson);
  const rawJsonObj = parseJsonObject(parsed.rawJson);

  const merged: WebhookRecord = {
    ...payloadObj,
    ...payloadJsonObj,
    ...rawJsonObj,
    ...parsed
  };

  const eventType = normalizeEventType(
    pick(merged, ["eventType", "type", "payload.eventType", "payload.type"]),
    pick(merged, ["action", "payload.action"])
  );

  const action = eventType;
  const reason = getReason(merged, eventType);

  const eventId =
    safeTrim(pick(merged, ["eventId", "payload.eventId"])) ||
    buildFallbackEventId(merged);

  const source = safeUpper(
    pick(merged, ["source", "payload.source"]),
    "TRADESYSTEM"
  );

  const strategyVersion = safeTrim(
    pick(merged, ["strategyVersion", "payload.strategyVersion"]),
    "UNKNOWN"
  );

  const runId = safeTrim(
    pick(merged, ["runId", "payload.runId"]),
    "UNKNOWN"
  );

  const symbol = normalizeBaseSymbol(
    pick(merged, ["symbol", "payload.symbol", "rawBitgetSymbol", "contractSymbol"])
  );

  const rawBitgetSymbol =
    safeTrim(pick(merged, ["rawBitgetSymbol", "contractSymbol", "payload.rawBitgetSymbol"])) ||
    (symbol ? `${symbol}USDT` : null);

  const side = normalizeSide(pick(merged, ["side", "payload.side"]));

  const tradeId =
    safeTrim(pick(merged, ["tradeId", "id", "signalId", "payload.tradeId", "payload.id"])) ||
    eventId;

  const setupClass = safeUpper(
    pick(merged, ["setupClass", "payload.setupClass"]),
    "UNKNOWN"
  );

  const grade = safeUpper(
    pick(merged, ["grade", "payload.grade"]),
    ""
  );

  const entryReason = safeUpper(
    pick(merged, ["entryReason", "entryType", "payload.entryReason", "payload.entryType"]) ||
      reason,
    "UNKNOWN"
  );

  const exitReason =
    eventType === "EXIT"
      ? safeUpper(pick(merged, ["exitReason", "payload.exitReason"]) || reason, "UNKNOWN")
      : safeTrim(pick(merged, ["exitReason", "payload.exitReason"])) || null;

  const rejectReason =
    eventType === "REJECT"
      ? safeUpper(pick(merged, ["rejectReason", "payload.rejectReason"]) || reason, "UNKNOWN")
      : safeTrim(pick(merged, ["rejectReason", "payload.rejectReason"])) || null;

  const ts = safeNumber(
    pick(merged, ["ts", "createdAt", "timestamp", "payload.ts", "payload.createdAt"]),
    Date.now()
  );

  const createdAt = safeNumber(
    pick(merged, ["createdAt", "timestamp", "payload.createdAt", "payload.timestamp"]),
    ts
  );

  const entry = nullableNumber(
    pick(merged, ["entry", "entryPrice", "price", "payload.entry", "payload.entryPrice", "payload.price"])
  );

  const price = nullableNumber(
    pick(merged, ["price", "entry", "entryPrice", "payload.price", "payload.entry", "payload.entryPrice"])
  );

  const sl = nullableNumber(
    pick(merged, ["sl", "slPrice", "initialSl", "payload.sl", "payload.slPrice", "payload.initialSl"])
  );

  const initialSl = nullableNumber(
    pick(merged, ["initialSl", "sl", "slPrice", "payload.initialSl", "payload.sl", "payload.slPrice"])
  );

  const tp = nullableNumber(
    pick(merged, ["tp", "tpPrice", "payload.tp", "payload.tpPrice"])
  );

  const exit = nullableNumber(
    pick(merged, ["exit", "exitPrice", "executionPrice", "payload.exit", "payload.exitPrice", "payload.executionPrice"])
  );

  const executionPrice = nullableNumber(
    pick(merged, ["executionPrice", "exit", "exitPrice", "payload.executionPrice", "payload.exit", "payload.exitPrice"])
  );

  const finalRr = nullableNumber(
    pick(merged, ["finalRr", "finalRR", "effectiveRR", "plannedRR", "rr", "payload.finalRr", "payload.finalRR"])
  );

  const spreadPct = nullableNumber(
    pick(merged, ["spreadPct", "payload.spreadPct", "ob.spreadPct", "orderbook.spreadPct"])
  );

  const spreadBps = nullableNumber(
    pick(merged, ["spreadBps", "payload.spreadBps", "ob.spreadBps", "orderbook.spreadBps"])
  );

  const depthMinUsd1p = nullableNumber(
    pick(merged, ["depthMinUsd1p", "depthUsd1p", "payload.depthMinUsd1p", "payload.depthUsd1p", "ob.depthMinUsd1p"])
  );

  const depthUsd1p = nullableNumber(
    pick(merged, ["depthUsd1p", "depthMinUsd1p", "payload.depthUsd1p", "payload.depthMinUsd1p"])
  );

  const explicitSpreadBucket = safeUpper(
    pick(merged, ["spreadBucket", "payload.spreadBucket", "ob.spreadBucket"]),
    ""
  );

  const explicitDepthBucket = safeUpper(
    pick(merged, ["depthBucket", "payload.depthBucket", "ob.depthBucket"]),
    ""
  );

  const status = safeUpper(
    pick(merged, ["status", "payload.status"]),
    eventType
  );

  const isOpen =
    eventType === "SNAPSHOT" ||
    safeBoolean(pick(merged, ["open", "payload.open"])) ||
    status === "OPEN";

  const rawJson = typeof rawBody === "string" ? rawBody : stableStringify(rawBody);
  const payloadJson = safeString(parsed.payloadJson || stableStringify(merged));
  const payloadHash = safeTrim(pick(merged, ["payloadHash", "payload.payloadHash"])) || hashString(stableStringify(merged));

  const normalized: NormalizedWebhookEvent = {
    eventId,
    eventType,
    action,
    source,
    strategyVersion,
    runId,
    tradeId,

    symbol,
    rawBitgetSymbol,
    side,

    status: isOpen ? "OPEN" : status,
    open: isOpen,

    reason,
    entryReason,
    exitReason,
    rejectReason,
    cohortKey: null,

    setupClass,
    grade: grade || null,
    gradePoints: safeNumber(pick(merged, ["gradePoints", "payload.gradePoints"]), 0),
    recommendedRisk: safeTrim(pick(merged, ["recommendedRisk", "payload.recommendedRisk"])) || null,

    ts,
    createdAt,
    receivedAt: Date.now(),

    score: safeNumber(pick(merged, ["score", "moveScore", "payload.score", "payload.moveScore"]), 0),
    moveScore: safeNumber(pick(merged, ["moveScore", "score", "payload.moveScore", "payload.score"]), 0),

    confluence: safeNumber(pick(merged, ["confluence", "effectiveConfluence", "payload.confluence"]), 0),
    rawConfluence: safeNumber(pick(merged, ["rawConfluence", "confluence", "payload.rawConfluence"]), 0),
    effectiveConfluence: safeNumber(pick(merged, ["effectiveConfluence", "confluence", "payload.effectiveConfluence"]), 0),

    sniper: safeTrim(pick(merged, ["sniper", "payload.sniper"])) || null,
    sniperScore: safeNumber(pick(merged, ["sniperScore", "payload.sniperScore"]), 0),
    rawSniperScore: safeNumber(pick(merged, ["rawSniperScore", "sniperScore", "payload.rawSniperScore"]), 0),
    fallbackSniperScore: safeNumber(pick(merged, ["fallbackSniperScore", "sniperScore", "payload.fallbackSniperScore"]), 0),

    rsi: nullableNumber(pick(merged, ["rsi", "payload.rsi"])),
    rsiHTF: nullableNumber(pick(merged, ["rsiHTF", "payload.rsiHTF"])),
    rsiZone: safeUpper(pick(merged, ["rsiZone", "payload.rsiZone", "rsi.rsiZone"]), "") || null,
    rsiEdge: safeUpper(pick(merged, ["rsiEdge", "rsiEntryEdge", "payload.rsiEdge", "payload.rsiEntryEdge"]), "") || null,

    obBias: safeUpper(pick(merged, ["obBias", "payload.obBias", "ob.bias", "orderbook.bias"]), "") || null,
    obRelation: safeUpper(pick(merged, ["obRelation", "payload.obRelation", "ob.relation", "orderbook.relation"]), "") || null,

    spreadPct,
    spreadBps,
    depthMinUsd1p,
    depthUsd1p,

    spreadBucket: explicitSpreadBucket || spreadBucket(spreadPct, spreadBps),
    depthBucket: explicitDepthBucket || depthBucket(depthMinUsd1p),

    entry,
    price,
    entryPrice: entry,

    sl,
    slPrice: sl,
    initialSl,

    tp,
    tpPrice: tp,

    exit,
    exitPrice: exit,
    executionPrice,
    triggerPrice: nullableNumber(pick(merged, ["triggerPrice", "payload.triggerPrice"])),

    rr: nullableNumber(pick(merged, ["rr", "plannedRR", "finalRr", "payload.rr"])),
    plannedRR: nullableNumber(pick(merged, ["plannedRR", "rr", "finalRr", "payload.plannedRR"])),
    baseRR: nullableNumber(pick(merged, ["baseRR", "payload.baseRR"])),
    finalRr,
    finalRR: finalRr,
    effectiveRR: nullableNumber(pick(merged, ["effectiveRR", "finalRr", "plannedRR", "payload.effectiveRR"])),
    tpRewardMultiplier: safeNumber(pick(merged, ["tpRewardMultiplier", "payload.tpRewardMultiplier"]), 1),

    exitR: nullableNumber(pick(merged, ["exitR", "payload.exitR", "outcome.exitR"])),
    pnlPct: nullableNumber(pick(merged, ["pnlPct", "pnl", "payload.pnlPct", "payload.pnl", "outcome.pnlPct"])),
    triggerR: nullableNumber(pick(merged, ["triggerR", "payload.triggerR"])),
    triggerPnlPct: nullableNumber(pick(merged, ["triggerPnlPct", "payload.triggerPnlPct"])),

    currentR: nullableNumber(pick(merged, ["currentR", "payload.currentR"])),
    mfeR: nullableNumber(pick(merged, ["mfeR", "payload.mfeR"])),
    maeR: nullableNumber(pick(merged, ["maeR", "payload.maeR"])),
    maxTpProgress: nullableNumber(pick(merged, ["maxTpProgress", "payload.maxTpProgress"])),
    maxSlProgress: nullableNumber(pick(merged, ["maxSlProgress", "payload.maxSlProgress"])),

    reachedHalfR: safeBoolean(pick(merged, ["reachedHalfR", "payload.reachedHalfR"])),
    reachedOneR: safeBoolean(pick(merged, ["reachedOneR", "payload.reachedOneR"])),
    nearTpSeen: safeBoolean(pick(merged, ["nearTpSeen", "payload.nearTpSeen"])),
    directToSL: safeBoolean(pick(merged, ["directToSL", "payload.directToSL"])),
    slAfterHalfR: safeBoolean(pick(merged, ["slAfterHalfR", "payload.slAfterHalfR"])),
    slAfterOneR: safeBoolean(pick(merged, ["slAfterOneR", "payload.slAfterOneR"])),
    slAfterNearTp: safeBoolean(pick(merged, ["slAfterNearTp", "payload.slAfterNearTp"])),

    breakEvenActivated: safeBoolean(pick(merged, ["breakEvenActivated", "payload.breakEvenActivated"])),
    breakEvenStop: safeBoolean(pick(merged, ["breakEvenStop", "payload.breakEvenStop"])),
    breakEvenSl: nullableNumber(pick(merged, ["breakEvenSl", "payload.breakEvenSl"])),
    slBeforeBreakEven: nullableNumber(pick(merged, ["slBeforeBreakEven", "payload.slBeforeBreakEven"])),

    ticksObserved: safeNumber(pick(merged, ["ticksObserved", "payload.ticksObserved"]), 0),
    favorableTicks: safeNumber(pick(merged, ["favorableTicks", "payload.favorableTicks"]), 0),
    adverseTicks: safeNumber(pick(merged, ["adverseTicks", "payload.adverseTicks"]), 0),
    neutralTicks: safeNumber(pick(merged, ["neutralTicks", "payload.neutralTicks"]), 0),

    flow: safeUpper(pick(merged, ["flow", "payload.flow", "market.flow"]), "") || null,
    funding: nullableNumber(pick(merged, ["funding", "payload.funding"])),
    regime: safeUpper(pick(merged, ["regime", "payload.regime", "market.regime"]), "") || null,
    btcState: safeUpper(pick(merged, ["btcState", "payload.btcState", "market.btcState"]), "") || null,

    stage: safeLower(pick(merged, ["stage", "payload.stage"]), "") || null,
    scannerStage: safeLower(pick(merged, ["scannerStage", "stage", "payload.scannerStage", "payload.stage"]), "") || null,
    stageSource: safeTrim(pick(merged, ["stageSource", "payload.stageSource"])) || null,

    bullishMidTrendProbe: safeBoolean(pick(merged, ["bullishMidTrendProbe", "payload.bullishMidTrendProbe"])),
    bullishMidTrendProbeReason: safeTrim(pick(merged, ["bullishMidTrendProbeReason", "payload.bullishMidTrendProbeReason"])) || null,

    btcBullishBearException: safeBoolean(pick(merged, ["btcBullishBearException", "payload.btcBullishBearException"])),
    btcBullishBearExceptionReason: safeTrim(pick(merged, ["btcBullishBearExceptionReason", "payload.btcBullishBearExceptionReason"])) || null,

    filterDiagnostics: pick(merged, ["filterDiagnostics", "payload.filterDiagnostics"], null),
    filterValues: pick(merged, ["filterValues", "payload.filterValues"], null),
    filterChecks: pick(merged, ["filterChecks", "payload.filterChecks"], null),
    liveFilterMetrics: pick(merged, ["liveFilterMetrics", "payload.liveFilterMetrics"], null),
    specialFilterChecks: pick(merged, ["specialFilterChecks", "payload.specialFilterChecks"], null),

    analysisType: safeUpper(pick(merged, ["analysisType", "payload.analysisType"]), "TRADESYSTEM"),

    payload: merged,
    rawJson,
    payloadJson,
    payloadHash
  };

  normalized.cohortKey =
    safeTrim(pick(merged, ["cohortKey", "payload.cohortKey"])) ||
    buildCohortKey(normalized);

  return normalized;
}

export {
  normalizeBaseSymbol,
  normalizeEventType,
  normalizeSide,
  safeBoolean,
  safeNumber,
  nullableNumber
};