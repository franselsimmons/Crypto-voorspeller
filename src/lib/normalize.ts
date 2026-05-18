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
  side: string | null;
  reason: string;
  cohortKey: string | null;

  setupClass: string | null;
  grade: string | null;

  ts: number;
  receivedAt: number;

  score: number;
  confluence: number;
  sniperScore: number;

  rsi: number | null;
  rsiHTF: number | null;
  rsiZone: string | null;

  obBias: string | null;
  spreadPct: number | null;
  depthMinUsd1p: number | null;

  entry: number | null;
  sl: number | null;
  initialSl: number | null;
  tp: number | null;
  exit: number | null;

  rr: number | null;
  plannedRR: number | null;
  baseRR: number | null;
  finalRr: number | null;
  exitR: number | null;
  pnlPct: number | null;

  mfeR: number | null;
  maeR: number | null;
  currentR: number | null;

  directToSL: boolean;
  nearTpSeen: boolean;
  reachedHalfR: boolean;
  reachedOneR: boolean;
  breakEvenActivated: boolean;
  breakEvenStop: boolean;

  payload: WebhookRecord;
  rawJson: string;
  payloadJson: string;

  payloadHash: string;
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

  if (side === "bull" || side === "bear") return side;
  if (side === "long" || side === "buy" || side === "bullish") return "bull";
  if (side === "short" || side === "sell" || side === "bearish") return "bear";

  return side || null;
}

function normalizeEventType(raw: unknown, actionRaw: unknown): string {
  const eventType = safeUpper(raw);
  const action = safeUpper(actionRaw);

  const value = eventType || action || "SNAPSHOT";

  if (value === "WAIT") return "REJECT";
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

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as WebhookRecord;
  const keys = Object.keys(record).sort();

  return `{${keys
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashString(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildPayloadHash(payload: WebhookRecord): string {
  return hashString(stableStringify(payload));
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
    now
  ]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 260);
}

function buildCohortKey(event: {
  strategyVersion: string;
  eventType: string;
  setupClass: string | null;
  side: string | null;
  rsiZone: string | null;
  obBias: string | null;
  reason: string;
}): string {
  return [
    `STRAT=${event.strategyVersion || "UNKNOWN"}`,
    `TYPE=${event.eventType || "UNKNOWN"}`,
    `SETUP=${event.setupClass || "UNKNOWN"}`,
    `SIDE=${event.side || "unknown"}`,
    `RSI=${event.rsiZone || "UNKNOWN"}`,
    `OB=${event.obBias || "UNKNOWN"}`,
    `REASON=${event.reason || "UNKNOWN"}`
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
  const action = safeUpper(merged.action || eventType, eventType);
  const reason = getReason(merged, eventType);

  const eventId = safeTrim(merged.eventId) || buildFallbackEventId(merged);
  const source = safeUpper(merged.source || "TRADE_SYSTEM", "TRADE_SYSTEM");
  const strategyVersion = safeTrim(merged.strategyVersion || "UNKNOWN", "UNKNOWN");
  const runId = safeTrim(merged.runId || "UNKNOWN", "UNKNOWN");

  const symbol = normalizeBaseSymbol(merged.symbol);
  const side = normalizeSide(merged.side);
  const tradeId = safeTrim(merged.tradeId) || eventId;

  const setupClass = safeUpper(merged.setupClass || "UNKNOWN", "UNKNOWN");
  const grade = safeUpper(merged.grade || "", "");

  const ts = safeNumber(merged.ts || merged.createdAt || Date.now(), Date.now());
  const receivedAt = Date.now();

  const rawJson = safeString(parsed.rawJson || JSON.stringify(merged));
  const payloadJson = safeString(parsed.payloadJson || JSON.stringify(merged));
  const payloadHash = safeTrim(merged.payloadHash) || buildPayloadHash(merged);

  const normalized: NormalizedWebhookEvent = {
    eventId,
    eventType,
    action,
    source,
    strategyVersion,
    runId,
    tradeId,

    symbol,
    side,
    reason,
    cohortKey: null,

    setupClass,
    grade: grade || null,

    ts,
    receivedAt,

    score: safeNumber(merged.score ?? merged.moveScore, 0),
    confluence: safeNumber(merged.confluence ?? merged.effectiveConfluence, 0),
    sniperScore: safeNumber(merged.sniperScore, 0),

    rsi: nullableNumber(merged.rsi),
    rsiHTF: nullableNumber(merged.rsiHTF),
    rsiZone: safeUpper(merged.rsiZone || "", "") || null,

    obBias: safeUpper(merged.obBias || "", "") || null,
    spreadPct: nullableNumber(merged.spreadPct),
    depthMinUsd1p: nullableNumber(merged.depthMinUsd1p),

    entry: nullableNumber(merged.entry ?? merged.price),
    sl: nullableNumber(merged.sl),
    initialSl: nullableNumber(merged.initialSl),
    tp: nullableNumber(merged.tp),
    exit: nullableNumber(merged.exit ?? merged.executionPrice),

    rr: nullableNumber(merged.rr),
    plannedRR: nullableNumber(merged.plannedRR),
    baseRR: nullableNumber(merged.baseRR),
    finalRr: nullableNumber(merged.finalRr ?? merged.effectiveRR),
    exitR: nullableNumber(merged.exitR),
    pnlPct: nullableNumber(merged.pnlPct),

    mfeR: nullableNumber(merged.mfeR),
    maeR: nullableNumber(merged.maeR),
    currentR: nullableNumber(merged.currentR),

    directToSL: safeBoolean(merged.directToSL),
    nearTpSeen: safeBoolean(merged.nearTpSeen),
    reachedHalfR: safeBoolean(merged.reachedHalfR),
    reachedOneR: safeBoolean(merged.reachedOneR),
    breakEvenActivated: safeBoolean(merged.breakEvenActivated),
    breakEvenStop: safeBoolean(merged.breakEvenStop),

    payload: merged,
    rawJson,
    payloadJson,
    payloadHash
  };

  normalized.cohortKey = buildCohortKey(normalized);

  return normalized;
}