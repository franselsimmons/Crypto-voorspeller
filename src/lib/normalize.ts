// src/lib/normalize.ts

export type WebhookRecord = Record<string, unknown>;

export type NormalizedWebhookEvent = {
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

  entry: number | null;
  price: number | null;
  sl: number | null;
  initialSl: number | null;
  tp: number | null;
  exit: number | null;
  executionPrice: number | null;
  triggerPrice: number | null;

  rr: number | null;
  plannedRR: number | null;
  baseRR: number | null;
  finalRr: number | null;
  effectiveRR: number | null;
  tpRewardMultiplier: number | null;

  exitR: number | null;
  pnlPct: number | null;
  triggerR: number | null;
  triggerPnlPct: number | null;

  currentR: number | null;
  mfeR: number | null;
  maeR: number | null;
  maxTpProgress: number | null;
  maxSlProgress: number | null;

  directToSL: boolean;
  nearTpSeen: boolean;
  reachedHalfR: boolean;
  reachedOneR: boolean;
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

export type NormalizedEntry = NormalizedWebhookEvent & {
  eventType: "ENTRY";
};

export type NormalizedExit = NormalizedWebhookEvent & {
  eventType: "EXIT";
};

export type NormalizedReject = NormalizedWebhookEvent & {
  eventType: "REJECT";
};

export type NormalizedSnapshot = NormalizedWebhookEvent & {
  eventType: "SNAPSHOT";
};

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
  return safeTrim(value, fallback).toUpperCase();
}

function safeLower(value: unknown, fallback = ""): string {
  return safeTrim(value, fallback).toLowerCase();
}

function safeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function safeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  const text = safeTrim(value).toLowerCase();

  return ["true", "1", "yes", "y"].includes(text);
}

function parseJsonObject(value: unknown): WebhookRecord {
  if (!value) return {};

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as WebhookRecord;
  }

  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as WebhookRecord;
  } catch {
    return {};
  }
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const obj = value as WebhookRecord;
  const keys = Object.keys(obj).sort();

  return `{${keys
    .map(key => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildPayloadHash(payload: WebhookRecord): string {
  return hashString(stableStringify(payload));
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

  if (!symbol || symbol === "UNKNOWN") return symbol || null;

  return symbol;
}

function normalizeSide(raw: unknown): string | null {
  const side = safeLower(raw);

  if (side === "bull" || side === "long" || side === "buy" || side === "bullish") {
    return "bull";
  }

  if (side === "bear" || side === "short" || side === "sell" || side === "bearish") {
    return "bear";
  }

  return side || null;
}

function normalizeEventType(raw: unknown, actionRaw: unknown): string {
  const eventType = safeUpper(raw);
  const action = safeUpper(actionRaw);

  const value = eventType || action || "SNAPSHOT";

  if (value === "WAIT") return "REJECT";
  if (value === "SKIP") return "REJECT";
  if (value === "ENTRY") return "ENTRY";
  if (value === "EXIT") return "EXIT";
  if (value === "REJECT") return "REJECT";
  if (value === "HOLD") return "SNAPSHOT";
  if (value === "SNAPSHOT") return "SNAPSHOT";
  if (value === "BATCH") return "BATCH";

  return value;
}

function getReason(body: WebhookRecord, eventType: string): string {
  const rejectReason = safeTrim(body.rejectReason);
  const exitReason = safeTrim(body.exitReason);
  const entryReason = safeTrim(body.entryReason);

  if (eventType === "REJECT") {
    return safeUpper(rejectReason || body.reason || "UNKNOWN", "UNKNOWN");
  }

  if (eventType === "EXIT") {
    return safeUpper(exitReason || body.reason || "UNKNOWN", "UNKNOWN");
  }

  if (eventType === "ENTRY") {
    return safeUpper(entryReason || body.entryType || body.reason || "UNKNOWN", "UNKNOWN");
  }

  return safeUpper(
    body.reason ||
      rejectReason ||
      exitReason ||
      entryReason ||
      body.entryType ||
      "UNKNOWN",
    "UNKNOWN"
  );
}

function buildFallbackEventId(body: WebhookRecord): string {
  const now = Date.now();
  const symbol = normalizeBaseSymbol(body.symbol) || "UNKNOWN";
  const side = normalizeSide(body.side) || "unknown";
  const eventType = normalizeEventType(body.eventType, body.action);
  const reason = getReason(body, eventType);

  return [
    "ts",
    safeTrim(body.strategyVersion, "UNKNOWN"),
    safeTrim(body.runId, "UNKNOWN"),
    eventType,
    symbol,
    side,
    reason,
    safeTrim(body.tradeId || ""),
    safeTrim(body.ts || body.createdAt || ""),
    now
  ]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 260);
}

function buildCohortKey(event: NormalizedWebhookEvent): string {
  return [
    `STRAT=${event.strategyVersion || "UNKNOWN"}`,
    `TYPE=${event.eventType || "UNKNOWN"}`,
    `SETUP=${event.setupClass || "UNKNOWN"}`,
    `SIDE=${event.side || "unknown"}`,
    `REASON=${event.entryReason || event.reason || "UNKNOWN"}`,
    `RSI=${event.rsiZone || "UNKNOWN"}`,
    `EDGE=${event.rsiEdge || "UNKNOWN"}`,
    `FLOW=${event.flow || "UNKNOWN"}`,
    `BTC=${event.btcState || "UNKNOWN"}`,
    `OB=${event.obRelation || event.obBias || "UNKNOWN"}`
  ].join("|");
}

export function normalizeWebhookBody(rawBody: string | WebhookRecord): NormalizedWebhookEvent {
  const parsed = parseJsonObject(rawBody);
  const payloadJsonObj = parseJsonObject(parsed.payloadJson);
  const rawJsonObj = parseJsonObject(parsed.rawJson);

  const merged: WebhookRecord = {
    ...payloadJsonObj,
    ...rawJsonObj,
    ...parsed
  };

  const eventType = normalizeEventType(merged.eventType, merged.action);
  const action = eventType;
  const reason = getReason(merged, eventType);

  const source = safeUpper(merged.source || "TRADE_SYSTEM", "TRADE_SYSTEM");
  const strategyVersion = safeTrim(merged.strategyVersion || "UNKNOWN", "UNKNOWN");
  const runId = safeTrim(merged.runId || "UNKNOWN", "UNKNOWN");

  const symbol = normalizeBaseSymbol(merged.symbol);
  const rawBitgetSymbol = safeTrim(
    merged.rawBitgetSymbol || merged.contractSymbol || (symbol ? `${symbol}USDT` : "")
  ) || null;

  const side = normalizeSide(merged.side);
  const eventId = safeTrim(merged.eventId) || buildFallbackEventId(merged);
  const tradeId = safeTrim(merged.tradeId) || eventId;

  const setupClass = safeUpper(merged.setupClass || "UNKNOWN", "UNKNOWN");
  const grade = safeUpper(merged.grade || "", "") || null;

  const ts = safeNumber(merged.ts || merged.createdAt || Date.now(), Date.now());
  const createdAt = safeNumber(merged.createdAt || merged.ts || Date.now(), Date.now());
  const receivedAt = Date.now();

  const entry = nullableNumber(merged.entry ?? merged.price);
  const sl = nullableNumber(merged.sl ?? merged.initialSl);
  const initialSl = nullableNumber(merged.initialSl ?? merged.sl);

  const entryReason = safeUpper(
    merged.entryReason || merged.entryType || merged.reason || "UNKNOWN",
    "UNKNOWN"
  );

  const exitReason =
    eventType === "EXIT"
      ? safeUpper(merged.exitReason || merged.reason || "UNKNOWN", "UNKNOWN")
      : safeTrim(merged.exitReason) || null;

  const rejectReason =
    eventType === "REJECT"
      ? safeUpper(merged.rejectReason || merged.reason || "UNKNOWN", "UNKNOWN")
      : safeTrim(merged.rejectReason) || null;

  const isOpenSnapshot =
    eventType === "SNAPSHOT" ||
    safeBoolean(merged.open) ||
    safeUpper(merged.status) === "OPEN";

  const rawJson = safeString(parsed.rawJson || JSON.stringify(merged));
  const payloadJson = safeString(parsed.payloadJson || JSON.stringify(merged));
  const payloadHash = buildPayloadHash(merged);

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

    status: isOpenSnapshot ? "OPEN" : eventType,
    open: isOpenSnapshot,

    reason,
    entryReason,
    exitReason,
    rejectReason,
    cohortKey: null,

    setupClass,
    grade,
    gradePoints: safeNumber(merged.gradePoints, 0),
    recommendedRisk: safeTrim(merged.recommendedRisk) || null,

    ts,
    createdAt,
    receivedAt,

    entry,
    price: nullableNumber(merged.price ?? merged.entry),
    sl,
    initialSl,
    tp: nullableNumber(merged.tp),
    exit: nullableNumber(merged.exit ?? merged.executionPrice),
    executionPrice: nullableNumber(merged.executionPrice),
    triggerPrice: nullableNumber(merged.triggerPrice),

    rr: nullableNumber(merged.rr ?? merged.plannedRR ?? merged.finalRr),
    plannedRR: nullableNumber(merged.plannedRR ?? merged.rr ?? merged.finalRr),
    baseRR: nullableNumber(merged.baseRR),
    finalRr: nullableNumber(merged.finalRr ?? merged.effectiveRR ?? merged.plannedRR ?? merged.rr),
    effectiveRR: nullableNumber(merged.effectiveRR ?? merged.finalRr ?? merged.rr),
    tpRewardMultiplier: nullableNumber(merged.tpRewardMultiplier),

    exitR: nullableNumber(merged.exitR),
    pnlPct: nullableNumber(merged.pnlPct),
    triggerR: nullableNumber(merged.triggerR),
    triggerPnlPct: nullableNumber(merged.triggerPnlPct),

    currentR: nullableNumber(merged.currentR),
    mfeR: nullableNumber(merged.mfeR),
    maeR: nullableNumber(merged.maeR),
    maxTpProgress: nullableNumber(merged.maxTpProgress),
    maxSlProgress: nullableNumber(merged.maxSlProgress),

    directToSL: safeBoolean(merged.directToSL),
    nearTpSeen: safeBoolean(merged.nearTpSeen),
    reachedHalfR: safeBoolean(merged.reachedHalfR),
    reachedOneR: safeBoolean(merged.reachedOneR),
    slAfterHalfR: safeBoolean(merged.slAfterHalfR),
    slAfterOneR: safeBoolean(merged.slAfterOneR),
    slAfterNearTp: safeBoolean(merged.slAfterNearTp),

    breakEvenActivated: safeBoolean(merged.breakEvenActivated),
    breakEvenStop: safeBoolean(merged.breakEvenStop),
    breakEvenSl: nullableNumber(merged.breakEvenSl),
    slBeforeBreakEven: nullableNumber(merged.slBeforeBreakEven),

    ticksObserved: safeNumber(merged.ticksObserved, 0),
    favorableTicks: safeNumber(merged.favorableTicks, 0),
    adverseTicks: safeNumber(merged.adverseTicks, 0),
    neutralTicks: safeNumber(merged.neutralTicks, 0),

    score: safeNumber(merged.score ?? merged.moveScore, 0),
    moveScore: safeNumber(merged.moveScore ?? merged.score, 0),

    confluence: safeNumber(merged.confluence ?? merged.effectiveConfluence, 0),
    rawConfluence: safeNumber(merged.rawConfluence, 0),
    effectiveConfluence: safeNumber(merged.effectiveConfluence ?? merged.confluence, 0),

    sniper: safeTrim(merged.sniper) || null,
    sniperScore: safeNumber(merged.sniperScore, 0),
    rawSniperScore: safeNumber(merged.rawSniperScore, 0),
    fallbackSniperScore: safeNumber(merged.fallbackSniperScore, 0),

    rsi: nullableNumber(merged.rsi),
    rsiHTF: nullableNumber(merged.rsiHTF),
    rsiZone: safeUpper(merged.rsiZone || "", "") || null,
    rsiEdge: safeUpper(merged.rsiEdge || merged.rsiEntryEdge || "", "") || null,

    obBias: safeUpper(merged.obBias || "", "") || null,
    obRelation: safeUpper(merged.obRelation || "", "") || null,
    spreadPct: nullableNumber(merged.spreadPct),
    spreadBps: nullableNumber(merged.spreadBps),
    depthMinUsd1p: nullableNumber(merged.depthMinUsd1p),
    depthUsd1p: nullableNumber(merged.depthUsd1p ?? merged.depthMinUsd1p),

    flow: safeUpper(merged.flow || "", "") || null,
    funding: nullableNumber(merged.funding),
    regime: safeUpper(merged.regime || "", "") || null,
    btcState: safeUpper(merged.btcState || "", "") || null,

    stage: safeLower(merged.stage || "") || null,
    scannerStage: safeLower(merged.scannerStage || merged.stage || "") || null,
    stageSource: safeTrim(merged.stageSource) || null,

    bullishMidTrendProbe: safeBoolean(merged.bullishMidTrendProbe),
    bullishMidTrendProbeReason: safeTrim(merged.bullishMidTrendProbeReason) || null,

    btcBullishBearException: safeBoolean(merged.btcBullishBearException),
    btcBullishBearExceptionReason: safeTrim(merged.btcBullishBearExceptionReason) || null,

    filterDiagnostics: merged.filterDiagnostics ?? null,
    filterValues: merged.filterValues ?? null,
    filterChecks: merged.filterChecks ?? null,
    liveFilterMetrics: merged.liveFilterMetrics ?? null,
    specialFilterChecks: merged.specialFilterChecks ?? null,

    analysisType: safeUpper(merged.analysisType || "TRADESYSTEM", "TRADESYSTEM"),
    payload: merged,
    rawJson,
    payloadJson,
    payloadHash
  };

  normalized.cohortKey = buildCohortKey(normalized);

  return normalized;
}