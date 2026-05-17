import { sha256 } from "./security";
import { toBool, toNumber, toText, toUpperText } from "./format";

type AnyRecord = Record<string, any>;

export type NormalizedType = "ENTRY" | "EXIT" | "REJECT" | "SNAPSHOT";

export type NormalizedWebhookEvent = {
  eventId: string;
  eventType: NormalizedType;
  source: string;
  strategyVersion: string | null;
  runId: string | null;
  tradeId: string | null;
  symbol: string | null;
  side: string | null;
  cohortKey: string | null;
  payload: AnyRecord;
  payloadHash: string;
  entry?: NormalizedEntry;
  exit?: NormalizedExit;
  reject?: NormalizedReject;
};

export type NormalizedEntry = {
  tradeId: string;
  symbol: string;
  side: string;
  cohortKey: string | null;

  setupClass: string | null;
  entryReason: string | null;
  grade: string | null;
  gradePoints: number | null;

  entryPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;

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
};

export type NormalizedExit = {
  tradeId: string | null;
  symbol: string;
  side: string;

  exitReason: string | null;
  exitR: number | null;
  pnlPct: number | null;
  triggerR: number | null;
  triggerPnlPct: number | null;
  holdMinutes: number | null;

  entryPrice: number | null;
  exitPrice: number | null;
  triggerPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;

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
};

export type NormalizedReject = {
  symbol: string;
  side: string | null;
  rejectReason: string | null;
  action: string | null;
  cohortKey: string | null;

  scannerScore: number | null;
  confluence: number | null;
  sniperScore: number | null;
  baseRR: number | null;
  finalRR: number | null;

  rsi: number | null;
  rsiZone: string | null;
  rsiEdge: string | null;

  btcState: string | null;
  regime: string | null;
  flow: string | null;

  obBias: string | null;
  obRelation: string | null;
  spreadBps: number | null;
  depthUsd1p: number | null;
  depthBucket: string | null;

  wouldEntry: number | null;
  wouldTp: number | null;
  wouldSl: number | null;
  shadowEligible: boolean;
};

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function get(obj: AnyRecord, paths: string[], fallback: any = null): any {
  for (const path of paths) {
    const parts = path.split(".");
    let current: any = obj;

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

function normalizeEventType(value: unknown, payload: AnyRecord): NormalizedType {
  const text = toUpperText(value || payload.eventType || payload.type || payload.action || payload.reason, "");

  if (text.includes("EXIT") || text.includes("TP") || text.includes("SL") || text.includes("STOP")) return "EXIT";
  if (text.includes("REJECT") || text.includes("WAIT") || text.includes("SKIP")) return "REJECT";
  if (text.includes("SNAPSHOT")) return "SNAPSHOT";

  return "ENTRY";
}

function normalizeSide(value: unknown): string | null {
  const side = String(value || "").trim().toLowerCase();

  if (!side) return null;
  if (["bear", "short", "sell", "bearish"].includes(side)) return "SHORT";
  if (["bull", "long", "buy", "bullish"].includes(side)) return "LONG";

  return side.toUpperCase();
}

function sideToken(side: string | null): string {
  if (side === "SHORT") return "bear";
  if (side === "LONG") return "bull";
  return "unknown";
}

function bucket(value: number | null, ranges: Array<[number, number, string]>, fallback = "NA"): string {
  if (value === null) return fallback;

  for (const [min, max, label] of ranges) {
    if (value >= min && value < max) return label;
  }

  return fallback;
}

function scoreBucket(value: number | null, label: string): string {
  if (value === null) return `${label}_NA`;

  if (value >= 95) return `${label}_95_100`;
  if (value >= 90) return `${label}_90_95`;
  if (value >= 85) return `${label}_85_90`;
  if (value >= 80) return `${label}_80_85`;
  if (value >= 70) return `${label}_70_80`;

  return `${label}_LT_70`;
}

function rrBucket(value: number | null): string {
  if (value === null) return "RR_NA";
  if (value >= 2) return "RR_GTE_2";
  if (value >= 1.5) return "RR_1P50_2P00";
  if (value >= 1.25) return "RR_1P25_1P50";
  if (value >= 1) return "RR_1P00_1P25";
  return "RR_LT_1";
}

function spreadBucket(spreadBps: number | null): string {
  return bucket(
    spreadBps,
    [
      [0, 2, "SPREAD_LT_2BPS"],
      [2, 5, "SPREAD_2_5BPS"],
      [5, 8, "SPREAD_5_8BPS"],
      [8, 12, "SPREAD_8_12BPS"],
      [12, 25, "SPREAD_12_25BPS"],
      [25, 999999, "SPREAD_GTE_25BPS"]
    ],
    "SPREAD_NA"
  );
}

function depthBucket(depth: number | null): string {
  return bucket(
    depth,
    [
      [0, 50000, "DEPTH_LT_50K"],
      [50000, 100000, "DEPTH_50K_100K"],
      [100000, 200000, "DEPTH_100K_200K"],
      [200000, 500000, "DEPTH_200K_500K"],
      [500000, 1000000, "DEPTH_500K_1M"],
      [1000000, 999999999999, "DEPTH_GTE_1M"]
    ],
    "DEPTH_NA"
  );
}

function buildCohortKeyFromEntry(entry: Partial<NormalizedEntry>): string {
  const parts = [
    `SETUP=${entry.setupClass || "NA"}`,
    `SIDE=${sideToken(entry.side || null)}`,
    `REASON=${entry.entryReason || "NA"}`,
    `RSI=${entry.rsiZone || "NA"}`,
    `EDGE=${entry.rsiEdge || "NA"}`,
    `FLOW=${entry.flow || "NA"}`,
    `BTC=${entry.btcState || "NA"}`,
    `OB=${entry.obRelation || "NA"}`,
    scoreBucket(entry.confluence ?? null, "CONF"),
    scoreBucket(entry.sniperScore ?? null, "SNIPER"),
    rrBucket(entry.finalRR ?? null),
    entry.spreadBucket || spreadBucket(entry.spreadBps ?? null),
    entry.depthBucket || depthBucket(entry.depthUsd1p ?? null)
  ];

  return parts.join("|");
}

function stableTradeId(payload: AnyRecord, symbol: string, side: string, entryPrice: number | null): string {
  const raw = [
    get(payload, ["tradeId", "id", "signalId"]),
    symbol,
    side,
    entryPrice,
    get(payload, ["createdAt", "timestamp", "ts", "time"]),
    get(payload, ["cohortKey", "analytics.cohortKey"])
  ]
    .filter(v => v !== null && v !== undefined && v !== "")
    .join("|");

  return sha256(raw).slice(0, 32);
}

function normalizeEntry(payload: AnyRecord, fallbackTradeId: string | null): NormalizedEntry | null {
  const symbol = toUpperText(get(payload, ["symbol", "ticker", "pair"]), "");
  const side = normalizeSide(get(payload, ["side", "direction"]));

  if (!symbol || !side) return null;

  const spreadPct = toNumber(get(payload, ["spreadPct", "ob.spreadPct", "orderbook.spreadPct"]));
  const spreadBps =
    toNumber(get(payload, ["spreadBps", "ob.spreadBps", "orderbook.spreadBps"])) ??
    (spreadPct !== null ? spreadPct * 10000 : null);

  const depthUsd1p = toNumber(get(payload, ["depthMinUsd1p", "depthUsd1p", "ob.depthMinUsd1p", "orderbook.depthMinUsd1p"]));

  const setupClass = toUpperText(get(payload, ["setupClass", "setup.setupClass", "class", "liveGrade"]), null as any);
  const entryReason = toUpperText(get(payload, ["entryReason", "setup.entryReason", "reason"]), null as any);
  const grade = toUpperText(get(payload, ["grade", "setup.grade", "liveGrade"]), null as any);

  const entry: NormalizedEntry = {
    tradeId: toText(get(payload, ["tradeId", "id", "signalId"], fallbackTradeId), ""),
    symbol,
    side,
    cohortKey: toText(get(payload, ["cohortKey", "analytics.cohortKey"]), "") || null,

    setupClass,
    entryReason,
    grade,
    gradePoints: toNumber(get(payload, ["gradePoints", "setup.gradePoints", "points"])),

    entryPrice: toNumber(get(payload, ["entry", "price.entry", "liveMetrics.entry", "entryPrice"])),
    tpPrice: toNumber(get(payload, ["tp", "price.tp", "liveMetrics.tp", "tpPrice"])),
    slPrice: toNumber(get(payload, ["sl", "price.sl", "liveMetrics.sl", "slPrice"])),

    baseRR: toNumber(get(payload, ["baseRR", "rr.baseRR"])),
    finalRR: toNumber(get(payload, ["finalRr", "finalRR", "plannedRR", "rr.finalRr", "rr.finalRR"])),
    requiredRR: toNumber(get(payload, ["requiredRR", "rr.requiredRR"])),
    finalRequiredRR: toNumber(get(payload, ["finalRequiredRR", "rr.finalRequiredRR"])),
    tpRewardMultiplier: toNumber(get(payload, ["tpRewardMultiplier", "rr.tpRewardMultiplier"])),

    scannerScore: toNumber(get(payload, ["score", "scannerScore", "scores.score"])),
    confluence: toNumber(get(payload, ["confluence", "scores.confluence"])),
    rawConfluence: toNumber(get(payload, ["rawConfluence", "scores.rawConfluence"])),
    sniperScore: toNumber(get(payload, ["sniperScore", "scores.sniperScore"])),
    rawSniperScore: toNumber(get(payload, ["rawSniperScore", "scores.rawSniperScore"])),
    fallbackSniperScore: toNumber(get(payload, ["fallbackSniperScore", "scores.fallbackSniperScore"])),

    rsi: toNumber(get(payload, ["rsi", "rsi.rsi"])),
    rsiHTF: toNumber(get(payload, ["rsiHTF", "rsi.rsiHTF"])),
    rsiZone: toUpperText(get(payload, ["rsiZone", "rsi.rsiZone"]), null as any),
    rsiEdge: toUpperText(get(payload, ["rsiEdge", "rsi.rsiEdge"]), null as any),
    continuationOk: toBool(get(payload, ["continuationOk", "rsi.continuationOk"])),

    btcState: toUpperText(get(payload, ["btcState", "market.btcState"]), null as any),
    regime: toUpperText(get(payload, ["regime", "market.regime"]), null as any),
    flow: toUpperText(get(payload, ["flow", "market.flow"]), null as any),
    tfStrength: toNumber(get(payload, ["tfStrength", "market.tfStrength"])),
    tfAlignment: toUpperText(get(payload, ["tfAlignment", "market.tfAlignment"]), null as any),

    obBias: toUpperText(get(payload, ["obBias", "ob.bias", "orderbook.bias"]), null as any),
    obRelation: toUpperText(get(payload, ["obRelation", "ob.relation", "orderbook.relation"]), null as any),
    spreadPct,
    spreadBps,
    spreadBucket: toUpperText(get(payload, ["spreadBucket", "ob.spreadBucket", "orderbook.spreadBucket"]), null as any),
    depthUsd1p,
    depthBucket: toUpperText(get(payload, ["depthBucket", "ob.depthBucket", "orderbook.depthBucket"]), null as any),
    spoof: toBool(get(payload, ["spoof", "ob.spoof", "orderbook.spoof"])),

    funding: toNumber(get(payload, ["funding", "market.funding"])),
    fundingBucket: toUpperText(get(payload, ["fundingBucket", "market.fundingBucket"]), null as any),

    pullbackConfirmed: toBool(get(payload, ["pullbackConfirmed", "structure.pullbackConfirmed"])),
    sweepConfirmed: toBool(get(payload, ["sweepConfirmed", "structure.sweepConfirmed"])),
    retestConfirmed: toBool(get(payload, ["retestConfirmed", "structure.retestConfirmed"])),
    distanceFromLocalHighPct: toNumber(get(payload, ["distanceFromLocalHighPct", "structure.distanceFromLocalHighPct"])),

    qualityGateReason: toUpperText(get(payload, ["qualityGateReason", "gates.qualityGateReason"]), null as any),
    finalDepthReason: toUpperText(get(payload, ["finalDepthReason", "gates.finalDepthReason"]), null as any),
    confirmationRequired: toBool(get(payload, ["confirmationRequired", "gates.confirmationRequired"])),
    confirmationSeen: toBool(get(payload, ["confirmationSeen", "gates.confirmationSeen"]))
  };

  if (!entry.tradeId) {
    entry.tradeId = stableTradeId(payload, symbol, side, entry.entryPrice);
  }

  if (!entry.spreadBucket) entry.spreadBucket = spreadBucket(entry.spreadBps);
  if (!entry.depthBucket) entry.depthBucket = depthBucket(entry.depthUsd1p);
  if (!entry.cohortKey) entry.cohortKey = buildCohortKeyFromEntry(entry);

  return entry;
}

function normalizeExit(payload: AnyRecord): NormalizedExit | null {
  const symbol = toUpperText(get(payload, ["symbol", "ticker", "pair"]), "");
  const side = normalizeSide(get(payload, ["side", "direction"]));

  if (!symbol || !side) return null;

  return {
    tradeId: toText(get(payload, ["tradeId", "id", "signalId"]), "") || null,
    symbol,
    side,

    exitReason: toUpperText(get(payload, ["exitReason", "reason", "outcome.exitReason"]), null as any),
    exitR: toNumber(get(payload, ["exitR", "outcome.exitR"])),
    pnlPct: toNumber(get(payload, ["pnlPct", "pnl", "outcome.pnlPct"])),
    triggerR: toNumber(get(payload, ["triggerR", "outcome.triggerR"])),
    triggerPnlPct: toNumber(get(payload, ["triggerPnlPct", "outcome.triggerPnlPct"])),
    holdMinutes: toNumber(get(payload, ["holdMinutes", "outcome.holdMinutes"])),

    entryPrice: toNumber(get(payload, ["entry", "entryPrice", "price.entry", "prices.entry"])),
    exitPrice: toNumber(get(payload, ["exit", "exitPrice", "price.exit", "prices.exit"])),
    triggerPrice: toNumber(get(payload, ["trigger", "triggerPrice", "price.trigger", "prices.trigger"])),
    tpPrice: toNumber(get(payload, ["tp", "tpPrice", "price.tp", "prices.tp"])),
    slPrice: toNumber(get(payload, ["sl", "slPrice", "price.sl", "prices.sl"])),

    mfeR: toNumber(get(payload, ["mfeR", "path.mfeR"])),
    maeR: toNumber(get(payload, ["maeR", "path.maeR"])),
    currentR: toNumber(get(payload, ["currentR", "path.currentR"])),
    maxTpProgress: toNumber(get(payload, ["maxTpProgress", "path.maxTpProgress"])),
    maxSlProgress: toNumber(get(payload, ["maxSlProgress", "path.maxSlProgress"])),

    directToSL: toBool(get(payload, ["directToSL", "path.directToSL"])),
    reachedHalfR: toBool(get(payload, ["reachedHalfR", "path.reachedHalfR"])),
    reachedOneR: toBool(get(payload, ["reachedOneR", "path.reachedOneR"])),
    nearTpSeen: toBool(get(payload, ["nearTpSeen", "path.nearTpSeen"])),
    slAfterHalfR: toBool(get(payload, ["slAfterHalfR", "path.slAfterHalfR"])),
    slAfterOneR: toBool(get(payload, ["slAfterOneR", "path.slAfterOneR"])),
    slAfterNearTp: toBool(get(payload, ["slAfterNearTp", "path.slAfterNearTp"])),

    breakEvenActivated: toBool(get(payload, ["breakEvenActivated", "be.breakEvenActivated"])),
    breakEvenStop: toBool(get(payload, ["breakEvenStop", "be.breakEvenStop"]))
  };
}

function normalizeReject(payload: AnyRecord): NormalizedReject | null {
  const symbol = toUpperText(get(payload, ["symbol", "ticker", "pair"]), "");
  if (!symbol) return null;

  const side = normalizeSide(get(payload, ["side", "direction"]));
  const spreadPct = toNumber(get(payload, ["spreadPct", "ob.spreadPct", "orderbook.spreadPct"]));

  return {
    symbol,
    side,
    rejectReason: toUpperText(get(payload, ["rejectReason", "reason", "waitReason"]), null as any),
    action: toUpperText(get(payload, ["action", "type", "eventType"]), null as any),
    cohortKey: toText(get(payload, ["cohortKey", "analytics.cohortKey"]), "") || null,

    scannerScore: toNumber(get(payload, ["score", "scannerScore", "scores.score"])),
    confluence: toNumber(get(payload, ["confluence", "scores.confluence"])),
    sniperScore: toNumber(get(payload, ["sniperScore", "scores.sniperScore"])),
    baseRR: toNumber(get(payload, ["baseRR", "rr.baseRR"])),
    finalRR: toNumber(get(payload, ["finalRr", "finalRR", "plannedRR", "rr.finalRr"])),

    rsi: toNumber(get(payload, ["rsi", "rsi.rsi"])),
    rsiZone: toUpperText(get(payload, ["rsiZone", "rsi.rsiZone"]), null as any),
    rsiEdge: toUpperText(get(payload, ["rsiEdge", "rsi.rsiEdge"]), null as any),

    btcState: toUpperText(get(payload, ["btcState", "market.btcState"]), null as any),
    regime: toUpperText(get(payload, ["regime", "market.regime"]), null as any),
    flow: toUpperText(get(payload, ["flow", "market.flow"]), null as any),

    obBias: toUpperText(get(payload, ["obBias", "ob.bias", "orderbook.bias"]), null as any),
    obRelation: toUpperText(get(payload, ["obRelation", "ob.relation", "orderbook.relation"]), null as any),
    spreadBps: toNumber(get(payload, ["spreadBps", "ob.spreadBps", "orderbook.spreadBps"])) ?? (spreadPct !== null ? spreadPct * 10000 : null),
    depthUsd1p: toNumber(get(payload, ["depthMinUsd1p", "depthUsd1p", "ob.depthMinUsd1p", "orderbook.depthMinUsd1p"])),
    depthBucket: toUpperText(get(payload, ["depthBucket", "ob.depthBucket", "orderbook.depthBucket"]), null as any),

    wouldEntry: toNumber(get(payload, ["entry", "wouldEntry", "price.entry"])),
    wouldTp: toNumber(get(payload, ["tp", "wouldTp", "price.tp"])),
    wouldSl: toNumber(get(payload, ["sl", "wouldSl", "price.sl"])),

    shadowEligible: Boolean(get(payload, ["entry", "wouldEntry", "price.entry"], null))
  };
}

export function normalizeWebhookBody(rawBody: string): NormalizedWebhookEvent {
  const parsed = JSON.parse(rawBody);

  if (!isRecord(parsed)) {
    throw new Error("INVALID_JSON_OBJECT");
  }

  const payload = isRecord(parsed.payload) ? parsed.payload : parsed;
  const eventType = normalizeEventType(parsed.eventType || parsed.type || parsed.action, payload);

  const source = toUpperText(parsed.source || payload.source || "TRADE_SYSTEM", "TRADE_SYSTEM");
  const strategyVersion = toText(parsed.strategyVersion || payload.strategyVersion || payload.version, "") || null;
  const runId = toText(parsed.runId || payload.runId, "") || null;

  const payloadHash = sha256(JSON.stringify(payload));
  const eventId =
    toText(parsed.eventId || payload.eventId || payload.uuid, "") ||
    sha256(`${eventType}.${source}.${payloadHash}`);

  const fallbackTradeId = toText(parsed.tradeId || payload.tradeId || payload.id, "") || null;

  const entry = eventType === "ENTRY" ? normalizeEntry(payload, fallbackTradeId) : undefined;
  const exit = eventType === "EXIT" ? normalizeExit(payload) : undefined;
  const reject = eventType === "REJECT" ? normalizeReject(payload) : undefined;

  const symbol = entry?.symbol || exit?.symbol || reject?.symbol || toUpperText(payload.symbol, "") || null;
  const side = entry?.side || exit?.side || reject?.side || normalizeSide(payload.side);
  const tradeId = entry?.tradeId || exit?.tradeId || fallbackTradeId;
  const cohortKey = entry?.cohortKey || reject?.cohortKey || toText(payload.cohortKey, "") || null;

  return {
    eventId,
    eventType,
    source,
    strategyVersion,
    runId,
    tradeId,
    symbol,
    side,
    cohortKey,
    payload,
    payloadHash,
    entry,
    exit,
    reject
  };
}