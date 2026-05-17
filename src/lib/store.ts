import { sql } from "./db";
import type { NormalizedWebhookEvent } from "./normalize";

type AnyRecord = Record<string, any>;

export type TradeEvent = {
  eventId: string;
  eventType: "ENTRY" | "EXIT";
  tradeId: string | null;

  symbol: string;
  side: string;
  cohortKey: string;

  createdAt: string;

  entryPrice: number | null;
  exitPrice: number | null;
  triggerPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;

  exitReason: string | null;
  exitR: number | null;
  pnlPct: number | null;
  triggerR: number | null;
  triggerPnlPct: number | null;
  holdMinutes: number | null;

  mfeR: number | null;
  maeR: number | null;
  currentR: number | null;
  maxTpProgress: number | null;
  maxSlProgress: number | null;

  directToSL: boolean | null;
  reachedHalfR: boolean | null;
  reachedOneR: boolean | null;
  nearTpSeen: boolean | null;
  slAfterHalfR: boolean | null;
  slAfterOneR: boolean | null;
  slAfterNearTp: boolean | null;

  breakEvenActivated: boolean | null;
  breakEvenStop: boolean | null;

  setupClass: string | null;
  entryReason: string | null;
  grade: string | null;
  gradePoints: number | null;

  baseRR: number | null;
  finalRR: number | null;
  requiredRR: number | null;
  finalRequiredRR: number | null;
  tpRewardMultiplier: number | null;

  scannerScore: number | null;
  confluence: number | null;
  rawConfluence: number | null;
  sniperScore: number | null;
  rawSniperScore: number | null;
  fallbackSniperScore: number | null;

  rsi: number | null;
  rsiHTF: number | null;
  rsiZone: string | null;
  rsiEdge: string | null;
  continuationOk: boolean | null;

  btcState: string | null;
  regime: string | null;
  flow: string | null;
  tfStrength: number | null;
  tfAlignment: string | null;

  obBias: string | null;
  obRelation: string | null;
  spreadPct: number | null;
  spreadBps: number | null;
  spreadBucket: string | null;
  depthUsd1p: number | null;
  depthBucket: string | null;
  spoof: boolean | null;

  funding: number | null;
  fundingBucket: string | null;

  pullbackConfirmed: boolean | null;
  sweepConfirmed: boolean | null;
  retestConfirmed: boolean | null;
  distanceFromLocalHighPct: number | null;

  qualityGateReason: string | null;
  finalDepthReason: string | null;
  confirmationRequired: boolean | null;
  confirmationSeen: boolean | null;

  raw: AnyRecord;
};

export type SaveTradeEventResult = {
  ok: boolean;
  saved: boolean;
  deduped: boolean;
  eventId: string;
  eventType: string;
};

type DbTradeEventRow = {
  event_id?: string | null;
  event_type?: string | null;
  trade_id?: string | null;
  symbol?: string | null;
  side?: string | null;
  cohort_key?: string | null;
  payload_hash?: string | null;
  raw_payload?: unknown;
  created_at?: string | Date | null;
  received_at?: string | Date | null;
};

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonb(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function toText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function toUpperText(value: unknown, fallback = ""): string {
  const text = toText(value, fallback);
  return text ? text.toUpperCase() : fallback;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace("%", "")
    .replace("R", "")
    .replace("$", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toBool(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "boolean") return value;

  const text = String(value).trim().toLowerCase();

  if (["true", "yes", "y", "1", "ja"].includes(text)) return true;
  if (["false", "no", "n", "0", "nee"].includes(text)) return false;

  return null;
}

function get(obj: unknown, paths: string[], fallback: unknown = null): unknown {
  if (!isRecord(obj)) return fallback;

  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (!isRecord(current) || !(part in current)) {
        current = undefined;
        break;
      }

      current = current[part];
    }

    if (current !== undefined && current !== null && current !== "") {
      return current;
    }
  }

  return fallback;
}

function normalizeSide(value: unknown): string {
  const text = String(value || "").trim().toLowerCase();

  if (["bear", "short", "sell", "bearish"].includes(text)) return "SHORT";
  if (["bull", "long", "buy", "bullish"].includes(text)) return "LONG";

  return text ? text.toUpperCase() : "UNKNOWN";
}

function normalizeEventType(value: unknown): "ENTRY" | "EXIT" | "REJECT" | "SNAPSHOT" {
  const text = toUpperText(value, "");

  if (text.includes("EXIT") || text.includes("TP") || text.includes("SL") || text.includes("STOP")) return "EXIT";
  if (text.includes("REJECT") || text.includes("WAIT") || text.includes("SKIP")) return "REJECT";
  if (text.includes("SNAPSHOT")) return "SNAPSHOT";

  return "ENTRY";
}

function parseRawPayload(value: unknown): AnyRecord {
  if (isRecord(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function dateToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  return new Date().toISOString();
}

function fallbackCohort(raw: AnyRecord, side: string): string {
  const payload = isRecord(raw.payload) ? raw.payload : raw;

  const setupClass = toUpperText(get(payload, ["setupClass", "setup.setupClass", "class", "liveGrade"]), "NA");
  const reason = toUpperText(get(payload, ["entryReason", "setup.entryReason", "reason"]), "NA");
  const rsiZone = toUpperText(get(payload, ["rsiZone", "rsi.rsiZone"]), "NA");
  const rsiEdge = toUpperText(get(payload, ["rsiEdge", "rsi.rsiEdge"]), "NA");
  const flow = toUpperText(get(payload, ["flow", "market.flow"]), "NA");
  const btc = toUpperText(get(payload, ["btcState", "market.btcState"]), "NA");
  const ob = toUpperText(get(payload, ["obRelation", "ob.relation", "orderbook.relation"]), "NA");

  return [
    `SETUP=${setupClass}`,
    `SIDE=${side === "SHORT" ? "bear" : side === "LONG" ? "bull" : "unknown"}`,
    `REASON=${reason}`,
    `RSI=${rsiZone}`,
    `EDGE=${rsiEdge}`,
    `FLOW=${flow}`,
    `BTC=${btc}`,
    `OB=${ob}`
  ].join("|");
}

function flattenNormalizedEvent(event: NormalizedWebhookEvent): {
  eventId: string;
  eventType: string;
  tradeId: string | null;
  symbol: string | null;
  side: string | null;
  cohortKey: string | null;
  payloadHash: string;
  rawPayload: AnyRecord;
} {
  const entry = event.entry;
  const exit = event.exit;
  const reject = event.reject;

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    tradeId: event.tradeId || entry?.tradeId || exit?.tradeId || null,
    symbol: event.symbol || entry?.symbol || exit?.symbol || reject?.symbol || null,
    side: event.side || entry?.side || exit?.side || reject?.side || null,
    cohortKey: event.cohortKey || entry?.cohortKey || reject?.cohortKey || null,
    payloadHash: event.payloadHash,
    rawPayload: event as unknown as AnyRecord
  };
}

function flattenLooseEvent(event: AnyRecord): {
  eventId: string;
  eventType: string;
  tradeId: string | null;
  symbol: string | null;
  side: string | null;
  cohortKey: string | null;
  payloadHash: string;
  rawPayload: AnyRecord;
} {
  const eventType = normalizeEventType(event.eventType || event.type || event.action || event.reason);
  const side = normalizeSide(event.side || event.direction);

  return {
    eventId: toText(event.eventId || event.id || event.signalId || event.tradeId || `${Date.now()}-${Math.random()}`),
    eventType,
    tradeId: toText(event.tradeId || event.id || event.signalId, "") || null,
    symbol: toUpperText(event.symbol || event.ticker || event.pair, "") || null,
    side,
    cohortKey: toText(event.cohortKey || get(event, ["analytics.cohortKey"]), "") || null,
    payloadHash: toText(event.payloadHash || event.hash, "") || `${Date.now()}-${Math.random()}`,
    rawPayload: event
  };
}

function isNormalizedWebhookEvent(event: unknown): event is NormalizedWebhookEvent {
  return (
    isRecord(event) &&
    typeof event.eventId === "string" &&
    typeof event.eventType === "string" &&
    typeof event.payloadHash === "string" &&
    "payload" in event
  );
}

export async function saveTradeEvent(event: NormalizedWebhookEvent | TradeEvent | AnyRecord): Promise<SaveTradeEventResult> {
  const normalized = isNormalizedWebhookEvent(event)
    ? flattenNormalizedEvent(event)
    : flattenLooseEvent(event as AnyRecord);

  const eventId = normalized.eventId;
  const eventType = normalized.eventType;
  const side = normalized.side ? normalizeSide(normalized.side) : null;

  const payloadForDb = {
    ...normalized.rawPayload,
    eventId,
    eventType,
    tradeId: normalized.tradeId,
    symbol: normalized.symbol,
    side,
    cohortKey: normalized.cohortKey,
    payloadHash: normalized.payloadHash
  };

  try {
    const rows = (await sql`
      insert into trade_events (
        event_id,
        event_type,
        trade_id,
        symbol,
        side,
        cohort_key,
        payload_hash,
        raw_payload
      )
      values (
        ${eventId},
        ${eventType},
        ${normalized.tradeId},
        ${normalized.symbol},
        ${side},
        ${normalized.cohortKey},
        ${normalized.payloadHash},
        ${jsonb(payloadForDb)}::jsonb
      )
      on conflict (event_id) do nothing
      returning event_id
    `) as AnyRecord[];

    const saved = Array.isArray(rows) && rows.length > 0;

    return {
      ok: true,
      saved,
      deduped: !saved,
      eventId,
      eventType
    };
  } catch (error) {
    console.error("STORE_SAVE_TRADE_EVENT_ERROR:", error);

    throw error;
  }
}

function rowToTradeEvent(row: DbTradeEventRow): TradeEvent | null {
  const raw = parseRawPayload(row.raw_payload);

  const eventType = normalizeEventType(row.event_type || raw.eventType || raw.type);
  if (eventType !== "ENTRY" && eventType !== "EXIT") return null;

  const entry = isRecord(raw.entry) ? raw.entry : {};
  const exit = isRecord(raw.exit) ? raw.exit : {};
  const payload = isRecord(raw.payload) ? raw.payload : raw;

  const isEntry = eventType === "ENTRY";
  const source = isEntry ? entry : exit;

  const symbol =
    toUpperText(row.symbol, "") ||
    toUpperText(get(source, ["symbol"]), "") ||
    toUpperText(get(payload, ["symbol", "ticker", "pair"]), "");

  if (!symbol) return null;

  const side = normalizeSide(row.side || get(source, ["side"]) || get(payload, ["side", "direction"]));

  const tradeId =
    toText(row.trade_id, "") ||
    toText(get(source, ["tradeId"]), "") ||
    toText(get(payload, ["tradeId", "id", "signalId"]), "") ||
    null;

  const cohortKey =
    toText(row.cohort_key, "") ||
    toText(get(source, ["cohortKey"]), "") ||
    toText(get(payload, ["cohortKey", "analytics.cohortKey"]), "") ||
    fallbackCohort(raw, side);

  const entryPrice = toNumber(
    get(source, ["entryPrice", "entry"]) ??
      get(payload, ["entryPrice", "entry", "price.entry", "liveMetrics.entry", "prices.entry"])
  );

  const tpPrice = toNumber(
    get(source, ["tpPrice", "tp"]) ??
      get(payload, ["tpPrice", "tp", "price.tp", "liveMetrics.tp", "prices.tp"])
  );

  const slPrice = toNumber(
    get(source, ["slPrice", "sl"]) ??
      get(payload, ["slPrice", "sl", "price.sl", "liveMetrics.sl", "prices.sl"])
  );

  return {
    eventId: toText(row.event_id || raw.eventId, ""),
    eventType,
    tradeId,

    symbol,
    side,
    cohortKey,

    createdAt: dateToIso(row.created_at || row.received_at || raw.createdAt || raw.receivedAt),

    entryPrice,
    exitPrice: toNumber(get(exit, ["exitPrice", "exit"]) ?? get(payload, ["exitPrice", "exit", "price.exit", "prices.exit"])),
    triggerPrice: toNumber(get(exit, ["triggerPrice", "trigger"]) ?? get(payload, ["triggerPrice", "trigger", "price.trigger", "prices.trigger"])),
    tpPrice,
    slPrice,

    exitReason: toUpperText(get(exit, ["exitReason"]) ?? get(payload, ["exitReason", "reason", "outcome.exitReason"]), "") || null,
    exitR: toNumber(get(exit, ["exitR"]) ?? get(payload, ["exitR", "outcome.exitR"])),
    pnlPct: toNumber(get(exit, ["pnlPct"]) ?? get(payload, ["pnlPct", "pnl", "outcome.pnlPct"])),
    triggerR: toNumber(get(exit, ["triggerR"]) ?? get(payload, ["triggerR", "outcome.triggerR"])),
    triggerPnlPct: toNumber(get(exit, ["triggerPnlPct"]) ?? get(payload, ["triggerPnlPct", "outcome.triggerPnlPct"])),
    holdMinutes: toNumber(get(exit, ["holdMinutes"]) ?? get(payload, ["holdMinutes", "outcome.holdMinutes"])),

    mfeR: toNumber(get(exit, ["mfeR"]) ?? get(payload, ["mfeR", "path.mfeR"])),
    maeR: toNumber(get(exit, ["maeR"]) ?? get(payload, ["maeR", "path.maeR"])),
    currentR: toNumber(get(exit, ["currentR"]) ?? get(payload, ["currentR", "path.currentR"])),
    maxTpProgress: toNumber(get(exit, ["maxTpProgress"]) ?? get(payload, ["maxTpProgress", "path.maxTpProgress"])),
    maxSlProgress: toNumber(get(exit, ["maxSlProgress"]) ?? get(payload, ["maxSlProgress", "path.maxSlProgress"])),

    directToSL: toBool(get(exit, ["directToSL"]) ?? get(payload, ["directToSL", "path.directToSL"])),
    reachedHalfR: toBool(get(exit, ["reachedHalfR"]) ?? get(payload, ["reachedHalfR", "path.reachedHalfR"])),
    reachedOneR: toBool(get(exit, ["reachedOneR"]) ?? get(payload, ["reachedOneR", "path.reachedOneR"])),
    nearTpSeen: toBool(get(exit, ["nearTpSeen"]) ?? get(payload, ["nearTpSeen", "path.nearTpSeen"])),
    slAfterHalfR: toBool(get(exit, ["slAfterHalfR"]) ?? get(payload, ["slAfterHalfR", "path.slAfterHalfR"])),
    slAfterOneR: toBool(get(exit, ["slAfterOneR"]) ?? get(payload, ["slAfterOneR", "path.slAfterOneR"])),
    slAfterNearTp: toBool(get(exit, ["slAfterNearTp"]) ?? get(payload, ["slAfterNearTp", "path.slAfterNearTp"])),

    breakEvenActivated: toBool(get(exit, ["breakEvenActivated"]) ?? get(payload, ["breakEvenActivated", "be.breakEvenActivated"])),
    breakEvenStop: toBool(get(exit, ["breakEvenStop"]) ?? get(payload, ["breakEvenStop", "be.breakEvenStop"])),

    setupClass: toUpperText(get(entry, ["setupClass"]) ?? get(payload, ["setupClass", "setup.setupClass", "class", "liveGrade"]), "") || null,
    entryReason: toUpperText(get(entry, ["entryReason"]) ?? get(payload, ["entryReason", "setup.entryReason", "reason"]), "") || null,
    grade: toUpperText(get(entry, ["grade"]) ?? get(payload, ["grade", "setup.grade", "liveGrade"]), "") || null,
    gradePoints: toNumber(get(entry, ["gradePoints"]) ?? get(payload, ["gradePoints", "setup.gradePoints", "points"])),

    baseRR: toNumber(get(entry, ["baseRR"]) ?? get(payload, ["baseRR", "rr.baseRR"])),
    finalRR: toNumber(get(entry, ["finalRR", "finalRr"]) ?? get(payload, ["finalRR", "finalRr", "plannedRR", "rr.finalRR", "rr.finalRr"])),
    requiredRR: toNumber(get(entry, ["requiredRR"]) ?? get(payload, ["requiredRR", "rr.requiredRR"])),
    finalRequiredRR: toNumber(get(entry, ["finalRequiredRR"]) ?? get(payload, ["finalRequiredRR", "rr.finalRequiredRR"])),
    tpRewardMultiplier: toNumber(get(entry, ["tpRewardMultiplier"]) ?? get(payload, ["tpRewardMultiplier", "rr.tpRewardMultiplier"])),

    scannerScore: toNumber(get(entry, ["scannerScore"]) ?? get(payload, ["scannerScore", "score", "scores.score"])),
    confluence: toNumber(get(entry, ["confluence"]) ?? get(payload, ["confluence", "scores.confluence"])),
    rawConfluence: toNumber(get(entry, ["rawConfluence"]) ?? get(payload, ["rawConfluence", "scores.rawConfluence"])),
    sniperScore: toNumber(get(entry, ["sniperScore"]) ?? get(payload, ["sniperScore", "scores.sniperScore"])),
    rawSniperScore: toNumber(get(entry, ["rawSniperScore"]) ?? get(payload, ["rawSniperScore", "scores.rawSniperScore"])),
    fallbackSniperScore: toNumber(get(entry, ["fallbackSniperScore"]) ?? get(payload, ["fallbackSniperScore", "scores.fallbackSniperScore"])),

    rsi: toNumber(get(entry, ["rsi"]) ?? get(payload, ["rsi", "rsi.rsi"])),
    rsiHTF: toNumber(get(entry, ["rsiHTF"]) ?? get(payload, ["rsiHTF", "rsi.rsiHTF"])),
    rsiZone: toUpperText(get(entry, ["rsiZone"]) ?? get(payload, ["rsiZone", "rsi.rsiZone"]), "") || null,
    rsiEdge: toUpperText(get(entry, ["rsiEdge"]) ?? get(payload, ["rsiEdge", "rsi.rsiEdge"]), "") || null,
    continuationOk: toBool(get(entry, ["continuationOk"]) ?? get(payload, ["continuationOk", "rsi.continuationOk"])),

    btcState: toUpperText(get(entry, ["btcState"]) ?? get(payload, ["btcState", "market.btcState"]), "") || null,
    regime: toUpperText(get(entry, ["regime"]) ?? get(payload, ["regime", "market.regime"]), "") || null,
    flow: toUpperText(get(entry, ["flow"]) ?? get(payload, ["flow", "market.flow"]), "") || null,
    tfStrength: toNumber(get(entry, ["tfStrength"]) ?? get(payload, ["tfStrength", "market.tfStrength"])),
    tfAlignment: toUpperText(get(entry, ["tfAlignment"]) ?? get(payload, ["tfAlignment", "market.tfAlignment"]), "") || null,

    obBias: toUpperText(get(entry, ["obBias"]) ?? get(payload, ["obBias", "ob.bias", "orderbook.bias"]), "") || null,
    obRelation: toUpperText(get(entry, ["obRelation"]) ?? get(payload, ["obRelation", "ob.relation", "orderbook.relation"]), "") || null,
    spreadPct: toNumber(get(entry, ["spreadPct"]) ?? get(payload, ["spreadPct", "ob.spreadPct", "orderbook.spreadPct"])),
    spreadBps: toNumber(get(entry, ["spreadBps"]) ?? get(payload, ["spreadBps", "ob.spreadBps", "orderbook.spreadBps"])),
    spreadBucket: toUpperText(get(entry, ["spreadBucket"]) ?? get(payload, ["spreadBucket", "ob.spreadBucket", "orderbook.spreadBucket"]), "") || null,
    depthUsd1p: toNumber(get(entry, ["depthUsd1p"]) ?? get(payload, ["depthUsd1p", "depthMinUsd1p", "ob.depthMinUsd1p", "orderbook.depthMinUsd1p"])),
    depthBucket: toUpperText(get(entry, ["depthBucket"]) ?? get(payload, ["depthBucket", "ob.depthBucket", "orderbook.depthBucket"]), "") || null,
    spoof: toBool(get(entry, ["spoof"]) ?? get(payload, ["spoof", "ob.spoof", "orderbook.spoof"])),

    funding: toNumber(get(entry, ["funding"]) ?? get(payload, ["funding", "market.funding"])),
    fundingBucket: toUpperText(get(entry, ["fundingBucket"]) ?? get(payload, ["fundingBucket", "market.fundingBucket"]), "") || null,

    pullbackConfirmed: toBool(get(entry, ["pullbackConfirmed"]) ?? get(payload, ["pullbackConfirmed", "structure.pullbackConfirmed"])),
    sweepConfirmed: toBool(get(entry, ["sweepConfirmed"]) ?? get(payload, ["sweepConfirmed", "structure.sweepConfirmed"])),
    retestConfirmed: toBool(get(entry, ["retestConfirmed"]) ?? get(payload, ["retestConfirmed", "structure.retestConfirmed"])),
    distanceFromLocalHighPct: toNumber(get(entry, ["distanceFromLocalHighPct"]) ?? get(payload, ["distanceFromLocalHighPct", "structure.distanceFromLocalHighPct"])),

    qualityGateReason: toUpperText(get(entry, ["qualityGateReason"]) ?? get(payload, ["qualityGateReason", "gates.qualityGateReason"]), "") || null,
    finalDepthReason: toUpperText(get(entry, ["finalDepthReason"]) ?? get(payload, ["finalDepthReason", "gates.finalDepthReason"]), "") || null,
    confirmationRequired: toBool(get(entry, ["confirmationRequired"]) ?? get(payload, ["confirmationRequired", "gates.confirmationRequired"])),
    confirmationSeen: toBool(get(entry, ["confirmationSeen"]) ?? get(payload, ["confirmationSeen", "gates.confirmationSeen"])),

    raw
  };
}

function enrichExitsWithEntryContext(events: TradeEvent[]): TradeEvent[] {
  const entriesByTradeId = new Map<string, TradeEvent>();

  for (const event of events) {
    if (event.eventType !== "ENTRY") continue;
    if (!event.tradeId) continue;

    entriesByTradeId.set(event.tradeId, event);
  }

  return events.map(event => {
    if (event.eventType !== "EXIT") return event;
    if (!event.tradeId) return event;

    const entry = entriesByTradeId.get(event.tradeId);
    if (!entry) return event;

    return {
      ...event,
      cohortKey: event.cohortKey || entry.cohortKey,

      setupClass: event.setupClass || entry.setupClass,
      entryReason: event.entryReason || entry.entryReason,
      grade: event.grade || entry.grade,
      gradePoints: event.gradePoints ?? entry.gradePoints,

      baseRR: event.baseRR ?? entry.baseRR,
      finalRR: event.finalRR ?? entry.finalRR,
      requiredRR: event.requiredRR ?? entry.requiredRR,
      finalRequiredRR: event.finalRequiredRR ?? entry.finalRequiredRR,
      tpRewardMultiplier: event.tpRewardMultiplier ?? entry.tpRewardMultiplier,

      scannerScore: event.scannerScore ?? entry.scannerScore,
      confluence: event.confluence ?? entry.confluence,
      rawConfluence: event.rawConfluence ?? entry.rawConfluence,
      sniperScore: event.sniperScore ?? entry.sniperScore,
      rawSniperScore: event.rawSniperScore ?? entry.rawSniperScore,
      fallbackSniperScore: event.fallbackSniperScore ?? entry.fallbackSniperScore,

      rsi: event.rsi ?? entry.rsi,
      rsiHTF: event.rsiHTF ?? entry.rsiHTF,
      rsiZone: event.rsiZone || entry.rsiZone,
      rsiEdge: event.rsiEdge || entry.rsiEdge,
      continuationOk: event.continuationOk ?? entry.continuationOk,

      btcState: event.btcState || entry.btcState,
      regime: event.regime || entry.regime,
      flow: event.flow || entry.flow,
      tfStrength: event.tfStrength ?? entry.tfStrength,
      tfAlignment: event.tfAlignment || entry.tfAlignment,

      obBias: event.obBias || entry.obBias,
      obRelation: event.obRelation || entry.obRelation,
      spreadPct: event.spreadPct ?? entry.spreadPct,
      spreadBps: event.spreadBps ?? entry.spreadBps,
      spreadBucket: event.spreadBucket || entry.spreadBucket,
      depthUsd1p: event.depthUsd1p ?? entry.depthUsd1p,
      depthBucket: event.depthBucket || entry.depthBucket,
      spoof: event.spoof ?? entry.spoof,

      funding: event.funding ?? entry.funding,
      fundingBucket: event.fundingBucket || entry.fundingBucket,

      pullbackConfirmed: event.pullbackConfirmed ?? entry.pullbackConfirmed,
      sweepConfirmed: event.sweepConfirmed ?? entry.sweepConfirmed,
      retestConfirmed: event.retestConfirmed ?? entry.retestConfirmed,
      distanceFromLocalHighPct: event.distanceFromLocalHighPct ?? entry.distanceFromLocalHighPct,

      qualityGateReason: event.qualityGateReason || entry.qualityGateReason,
      finalDepthReason: event.finalDepthReason || entry.finalDepthReason,
      confirmationRequired: event.confirmationRequired ?? entry.confirmationRequired,
      confirmationSeen: event.confirmationSeen ?? entry.confirmationSeen
    };
  });
}

export async function getTradeEvents(limit = 5000): Promise<TradeEvent[]> {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5000, 50000));

  try {
    const rows = (await sql`
      select
        event_id,
        event_type,
        trade_id,
        symbol,
        side,
        cohort_key,
        payload_hash,
        raw_payload,
        created_at
      from trade_events
      where event_type in ('ENTRY', 'EXIT')
      order by created_at desc
      limit ${safeLimit}
    `) as DbTradeEventRow[];

    const events = rows
      .map(rowToTradeEvent)
      .filter((event): event is TradeEvent => event !== null);

    return enrichExitsWithEntryContext(events);
  } catch (error) {
    console.error("STORE_GET_TRADE_EVENTS_ERROR:", error);
    return [];
  }
}

export async function getRecentTradeEvents(limit = 250): Promise<TradeEvent[]> {
  return getTradeEvents(limit);
}

export async function clearTradeEvents(): Promise<{ ok: boolean; deleted: number | null }> {
  try {
    const rows = (await sql`
      delete from trade_events
      returning event_id
    `) as AnyRecord[];

    return {
      ok: true,
      deleted: Array.isArray(rows) ? rows.length : null
    };
  } catch (error) {
    console.error("STORE_CLEAR_TRADE_EVENTS_ERROR:", error);

    return {
      ok: false,
      deleted: null
    };
  }
}

export const insertTradeEvent = saveTradeEvent;
export const listTradeEvents = getTradeEvents;