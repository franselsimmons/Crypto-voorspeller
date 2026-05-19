import { listTradeEvents, type TradeEvent } from "./store";

export type SearchParams = Record<string, string | string[] | undefined>;

export type DashboardFilters = {
  strategyVersion: string;
  symbol: string;
  side: string;
  eventType: string;
  reason: string;
  setupClass: string;
  grade: string;
  regime: string;
  flow: string;
  btcState: string;
  rsiZone: string;
  rsiEdge: string;
  obBias: string;
  obRelation: string;
  spreadBucket: string;
  depthBucket: string;
  outcome: string;
  from: string;
  to: string;

  minTrades: string;
  minWilson: string;
  minWinrate: string;

  winrateWeight: string;
  wilsonWeight: string;
  pnlWeight: string;
  avgRWeight: string;
  profitFactorWeight: string;
  nearTpWeight: string;
  nearTpBonus: string;
  directSlPenalty: string;
};

export type Overview = {
  entries: number;
  closed: number;
  open: number;
  winrate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  pnlPct: number;
  profitFactor: number | null;
  directSlPct: number;
  nearTpPct: number;
};

export type DashboardOptions = {
  strategies: string[];
  strategyVersions: string[];
  symbols: string[];
  sides: string[];
  eventTypes: string[];
  reasons: string[];
  setupClasses: string[];
  grades: string[];
  regimes: string[];
  flows: string[];
  btcStates: string[];
  rsiZones: string[];
  rsiEdges: string[];
  obBiases: string[];
  obRelations: string[];
  spreadBuckets: string[];
  depthBuckets: string[];
};

export type CohortRow = {
  score: number;
  cohortKey: string;
  label: string;

  trades: number;
  closed: number;
  sample: number;
  count: number;

  wins: number;
  losses: number;
  flats: number;

  winrate: number;
  wilson: number;

  totalR: number;
  avgR: number;
  pnlPct: number;
  avgPnlPct: number;
  profitFactor: number | null;

  directSlPct: number;
  nearTpPct: number;

  setupClass: string;
  side: string;
  entryReason: string;
  reason: string;
  grade: string;
  regime: string;
  flow: string;
  btcState: string;
  rsiZone: string;
  rsiEdge: string;
  obBias: string;
  obRelation: string;
  spreadBucket: string;
  depthBucket: string;

  symbols: string[];
};

export type BreakdownRow = {
  dimension: string;
  value: string;

  count: number;
  events: number;
  trades: number;
  closed: number;

  entries: number;
  exits: number;
  rejects: number;
  snapshots: number;
  holds: number;

  wins: number;
  losses: number;
  flats: number;

  winrate: number;
  wilson: number;

  totalR: number;
  avgR: number;
  pnlPct: number;
  avgPnlPct: number;
  profitFactor: number | null;

  directSlPct: number;
  nearTpPct: number;

  examples: string;
};

export type RecentTradeCell = string | number | boolean | null;

export type RecentTradeRow = {
  id: string;
  eventId: string;
  tradeId: string | null;

  ts: number;
  receivedAt: number | null;
  date: string;

  eventType: string;
  action: string;
  reason: string;

  symbol: string | null;
  side: string | null;

  setupClass: string | null;
  grade: string | null;

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

  score: number | null;
  confluence: number | null;
  sniperScore: number | null;

  rsi: number | null;
  rsiHTF: number | null;
  rsiZone: string | null;
  rsiEdge: string | null;

  obBias: string | null;
  obRelation: string | null;
  spreadPct: number | null;
  spreadBps: number | null;
  spreadBucket: string | null;
  depthMinUsd1p: number | null;
  depthBucket: string | null;

  flow: string | null;
  btcState: string | null;
  regime: string | null;

  mfeR: number | null;
  maeR: number | null;
  currentR: number | null;

  directToSL: boolean;
  nearTpSeen: boolean;
  reachedHalfR: boolean;
  reachedOneR: boolean;
  breakEvenActivated: boolean;
  breakEvenStop: boolean;

  strategyVersion: string | null;
  runId: string | null;

  [key: string]: RecentTradeCell;
};

export type DashboardData = {
  overview: Overview;
  options: DashboardOptions;
  cohorts: CohortRow[];
  breakdown: BreakdownRow[];
  recentTrades: RecentTradeRow[];
  rawEvents: TradeEvent[];
};

type AnyRecord = Record<string, unknown>;

export type ClosedTrade = {
  tradeId: string;
  entry: TradeEvent | null;
  exit: TradeEvent;
};

type Metrics = {
  trades: number;
  closed: number;
  wins: number;
  losses: number;
  flats: number;
  winrate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  pnlPct: number;
  avgPnlPct: number;
  profitFactor: number | null;
  directSlPct: number;
  nearTpPct: number;
};

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

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

function tradeValue(trade: ClosedTrade, paths: string[], fallback: unknown = null): unknown {
  const fromEntry = trade.entry ? firstValue(trade.entry, paths, undefined) : undefined;

  if (fromEntry !== undefined && fromEntry !== null && fromEntry !== "") {
    return fromEntry;
  }

  const fromExit = firstValue(trade.exit, paths, undefined);

  if (fromExit !== undefined && fromExit !== null && fromExit !== "") {
    return fromExit;
  }

  return fallback;
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;

  const result = String(value).trim();
  return result || fallback;
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function upper(value: unknown, fallback = ""): string {
  return text(value, fallback).toUpperCase();
}

function lower(value: unknown, fallback = ""): string {
  return text(value, fallback).toLowerCase();
}

function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const cleaned = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function percentInputToRatio(value: unknown, fallback = 0): number {
  const n = num(value, fallback);

  if (!Number.isFinite(n) || n <= 0) return 0;

  return n > 1 ? n / 100 : n;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const cleaned = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  const v = lower(value);
  return ["true", "1", "yes", "y"].includes(v);
}

function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(value => text(value))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function parseDateMs(value: string): number | null {
  if (!value) return null;

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function eventTime(event: TradeEvent): number {
  const value = firstValue(event, [
    "ts",
    "createdAt",
    "receivedAt",
    "storedAt",
    "payload.ts",
    "payload.createdAt",
    "payload.receivedAt"
  ]);

  const n = nullableNum(value);

  if (n !== null && n > 1_000_000_000_000) return n;
  if (n !== null && n > 1_000_000_000) return n * 1000;

  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEventType(event: TradeEvent): string {
  const raw = upper(
    firstValue(event, [
      "eventType",
      "type",
      "action",
      "payload.eventType",
      "payload.type",
      "payload.action"
    ]),
    "UNKNOWN"
  );

  if (raw.includes("ENTRY")) return "ENTRY";
  if (raw.includes("EXIT")) return "EXIT";
  if (raw.includes("REJECT")) return "REJECT";
  if (raw.includes("WAIT")) return "REJECT";
  if (raw.includes("SKIP")) return "REJECT";
  if (raw.includes("SNAPSHOT")) return "SNAPSHOT";
  if (raw.includes("HOLD")) return "HOLD";

  return raw;
}

function getTradeId(event: TradeEvent): string | null {
  const value = firstValue(event, [
    "tradeId",
    "id",
    "signalId",
    "payload.tradeId",
    "payload.id",
    "payload.signalId"
  ]);

  const id = text(value);
  return id || null;
}

function isEntry(event: TradeEvent): boolean {
  return normalizeEventType(event) === "ENTRY";
}

function isExit(event: TradeEvent): boolean {
  return normalizeEventType(event) === "EXIT";
}

export function parseDashboardFilters(params: SearchParams = {}): DashboardFilters {
  return {
    strategyVersion: one(params.strategyVersion || params.strategy || params.version),
    symbol: upper(one(params.symbol)),
    side: lower(one(params.side)),
    eventType: upper(one(params.eventType || params.type)),
    reason: upper(one(params.reason)),
    setupClass: upper(one(params.setupClass || params.setup)),
    grade: upper(one(params.grade)),
    regime: upper(one(params.regime)),
    flow: upper(one(params.flow)),
    btcState: upper(one(params.btcState)),
    rsiZone: upper(one(params.rsiZone)),
    rsiEdge: upper(one(params.rsiEdge)),
    obBias: upper(one(params.obBias)),
    obRelation: upper(one(params.obRelation)),
    spreadBucket: upper(one(params.spreadBucket)),
    depthBucket: upper(one(params.depthBucket)),
    outcome: upper(one(params.outcome)),
    from: one(params.from),
    to: one(params.to),

    minTrades: one(params.minTrades) || "1",
    minWilson: one(params.minWilson) || "0",
    minWinrate: one(params.minWinrate) || "0",

    winrateWeight: one(params.winrateWeight) || "1",
    wilsonWeight: one(params.wilsonWeight) || "1",
    pnlWeight: one(params.pnlWeight) || "1",
    avgRWeight: one(params.avgRWeight) || "1",
    profitFactorWeight: one(params.profitFactorWeight) || "0.5",
    nearTpWeight: one(params.nearTpWeight) || one(params.nearTpBonus) || "0.25",
    nearTpBonus: one(params.nearTpBonus) || one(params.nearTpWeight) || "0.25",
    directSlPenalty: one(params.directSlPenalty) || "0.5"
  };
}

function buildEntryIndex(events: TradeEvent[]): Map<string, TradeEvent> {
  const entries = events
    .filter(isEntry)
    .sort((a, b) => eventTime(a) - eventTime(b));

  const map = new Map<string, TradeEvent>();

  for (const entry of entries) {
    const tradeId = getTradeId(entry);
    if (!tradeId) continue;

    map.set(tradeId, entry);
  }

  return map;
}

function buildClosedTrades(events: TradeEvent[]): ClosedTrade[] {
  const entryIndex = buildEntryIndex(events);

  return events
    .filter(isExit)
    .map(exit => {
      const tradeId = getTradeId(exit) || text(exit.eventId);
      const entry = tradeId ? entryIndex.get(tradeId) || null : null;

      return {
        tradeId,
        entry,
        exit
      };
    });
}

function symbolOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "symbol",
      "payload.symbol"
    ]),
    "UNKNOWN"
  );
}

function sideOf(trade: ClosedTrade): string {
  const raw = upper(
    tradeValue(trade, [
      "side",
      "payload.side"
    ]),
    "UNKNOWN"
  );

  if (["BULL", "LONG", "BUY", "BULLISH"].includes(raw)) return "LONG";
  if (["BEAR", "SHORT", "SELL", "BEARISH"].includes(raw)) return "SHORT";

  return raw;
}

function setupClassOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "setupClass",
      "payload.setupClass",
      "payload.setup.setupClass"
    ]),
    "UNKNOWN"
  );
}

function gradeOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "grade",
      "payload.grade",
      "payload.setup.grade"
    ]),
    "UNKNOWN"
  );
}

function entryReasonOf(trade: ClosedTrade): string {
  return upper(
    trade.entry
      ? firstValue(trade.entry, [
          "entryReason",
          "payload.entryReason",
          "payload.setup.entryReason",
          "reason",
          "payload.reason"
        ])
      : firstValue(trade.exit, [
          "entryReason",
          "payload.entryReason",
          "payload.setup.entryReason"
        ]),
    "UNKNOWN"
  );
}

function exitReasonOf(trade: ClosedTrade): string {
  return upper(
    firstValue(trade.exit, [
      "exitReason",
      "payload.exitReason",
      "reason",
      "payload.reason"
    ]),
    "UNKNOWN"
  );
}

function rsiZoneOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "rsiZone",
      "payload.rsiZone",
      "payload.rsi.rsiZone"
    ]),
    "UNKNOWN"
  );
}

function rsiEdgeOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "rsiEdge",
      "payload.rsiEdge",
      "payload.rsi.rsiEdge"
    ]),
    "UNKNOWN"
  );
}

function flowOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "flow",
      "payload.flow",
      "payload.market.flow"
    ]),
    "UNKNOWN"
  );
}

function btcStateOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "btcState",
      "payload.btcState",
      "payload.market.btcState"
    ]),
    "UNKNOWN"
  );
}

function regimeOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "regime",
      "payload.regime",
      "payload.market.regime"
    ]),
    "UNKNOWN"
  );
}

function obBiasOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "obBias",
      "payload.obBias",
      "payload.ob.bias",
      "payload.orderbook.bias"
    ]),
    "UNKNOWN"
  );
}

function obRelationOf(trade: ClosedTrade): string {
  return upper(
    tradeValue(trade, [
      "obRelation",
      "payload.obRelation",
      "payload.ob.relation",
      "payload.orderbook.relation"
    ]),
    obBiasOf(trade)
  );
}

function spreadBucketOf(trade: ClosedTrade): string {
  const explicit = upper(
    tradeValue(trade, [
      "spreadBucket",
      "payload.spreadBucket",
      "payload.ob.spreadBucket"
    ]),
    ""
  );

  if (explicit) return explicit;

  const spreadBps = nullableNum(
    tradeValue(trade, [
      "spreadBps",
      "payload.spreadBps",
      "payload.ob.spreadBps"
    ])
  );

  const spreadPct = nullableNum(
    tradeValue(trade, [
      "spreadPct",
      "payload.spreadPct",
      "payload.ob.spreadPct"
    ])
  );

  const bps = spreadBps ?? (spreadPct !== null ? spreadPct * 10000 : null);

  if (bps === null) return "SPREAD_NA";
  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 25) return "SPREAD_12_25BPS";

  return "SPREAD_GTE_25BPS";
}

function depthBucketOf(trade: ClosedTrade): string {
  const explicit = upper(
    tradeValue(trade, [
      "depthBucket",
      "payload.depthBucket",
      "payload.ob.depthBucket"
    ]),
    ""
  );

  if (explicit) return explicit;

  const depth = nullableNum(
    tradeValue(trade, [
      "depthMinUsd1p",
      "depthUsd1p",
      "payload.depthMinUsd1p",
      "payload.depthUsd1p",
      "payload.ob.depthMinUsd1p"
    ])
  );

  if (depth === null) return "DEPTH_NA";
  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function scoreBucket(value: unknown, label: string): string {
  const n = nullableNum(value);

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
  const n = nullableNum(value);

  if (n === null) return "RR_NA";
  if (n >= 2) return "RR_GTE_2";
  if (n >= 1.75) return "RR_1P75_2P00";
  if (n >= 1.5) return "RR_1P50_1P75";
  if (n >= 1.25) return "RR_1P25_1P50";
  if (n >= 1) return "RR_1P00_1P25";

  return "RR_LT_1";
}

function confluenceBucketOf(trade: ClosedTrade): string {
  return scoreBucket(
    tradeValue(trade, [
      "confluence",
      "effectiveConfluence",
      "payload.confluence",
      "payload.scores.confluence"
    ]),
    "CONF"
  );
}

function sniperBucketOf(trade: ClosedTrade): string {
  return scoreBucket(
    tradeValue(trade, [
      "sniperScore",
      "fallbackSniperScore",
      "payload.sniperScore",
      "payload.scores.sniperScore"
    ]),
    "SNIPER"
  );
}

function rrBucketOf(trade: ClosedTrade): string {
  return rrBucket(
    tradeValue(trade, [
      "finalRr",
      "finalRR",
      "plannedRR",
      "rr",
      "payload.finalRr",
      "payload.finalRR",
      "payload.plannedRR",
      "payload.rr.finalRr"
    ])
  );
}

function exitROf(trade: ClosedTrade): number | null {
  return nullableNum(
    firstValue(trade.exit, [
      "exitR",
      "payload.exitR",
      "outcome.exitR"
    ])
  );
}

function pnlPctOf(trade: ClosedTrade): number | null {
  return nullableNum(
    firstValue(trade.exit, [
      "pnlPct",
      "pnl",
      "payload.pnlPct",
      "payload.pnl",
      "outcome.pnlPct"
    ])
  );
}

function directSlOf(trade: ClosedTrade): boolean {
  return bool(
    firstValue(trade.exit, [
      "directToSL",
      "payload.directToSL"
    ])
  );
}

function nearTpOf(trade: ClosedTrade): boolean {
  return bool(
    firstValue(trade.exit, [
      "nearTpSeen",
      "payload.nearTpSeen"
    ])
  );
}

function outcomeOf(trade: ClosedTrade): string {
  const reason = exitReasonOf(trade);
  const r = exitROf(trade);

  if (reason.includes("TP")) return "TP";
  if (reason.includes("SL") || reason.includes("STOP")) return "SL";
  if (r !== null && r > 0) return "WIN";
  if (r !== null && r < 0) return "LOSS";

  return "FLAT";
}

function wilsonLowerBound(wins: number, total: number, z = 1.96): number {
  if (!total) return 0;

  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  return Math.max(0, (center - margin) / denom);
}

function profitFactor(values: number[]): number | null {
  const grossWin = values
    .filter(value => value > 0)
    .reduce((sum, value) => sum + value, 0);

  const grossLoss = Math.abs(
    values
      .filter(value => value < 0)
      .reduce((sum, value) => sum + value, 0)
  );

  if (!grossWin && !grossLoss) return null;
  if (!grossLoss) return 999;

  return grossWin / grossLoss;
}

function summarizeTrades(trades: ClosedTrade[]): Metrics {
  const valuesR = trades
    .map(exitROf)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const pnlValues = trades
    .map(pnlPctOf)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const wins = trades.filter(trade => {
    const r = exitROf(trade);
    if (r !== null) return r > 0;

    const pnl = pnlPctOf(trade);
    return pnl !== null && pnl > 0;
  }).length;

  const losses = trades.filter(trade => {
    const r = exitROf(trade);
    if (r !== null) return r < 0;

    const pnl = pnlPctOf(trade);
    return pnl !== null && pnl < 0;
  }).length;

  const flats = Math.max(0, trades.length - wins - losses);
  const completed = wins + losses;

  const totalR = valuesR.reduce((sum, value) => sum + value, 0);
  const pnlPct = pnlValues.reduce((sum, value) => sum + value, 0);

  const directSlCount = trades.filter(directSlOf).length;
  const nearTpCount = trades.filter(nearTpOf).length;

  return {
    trades: trades.length,
    closed: trades.length,

    wins,
    losses,
    flats,

    winrate: completed ? wins / completed : 0,
    wilson: wilsonLowerBound(wins, completed),

    totalR: round(totalR, 3),
    avgR: valuesR.length ? round(totalR / valuesR.length, 3) : 0,

    pnlPct: round(pnlPct, 3),
    avgPnlPct: pnlValues.length ? round(pnlPct / pnlValues.length, 3) : 0,

    profitFactor: (() => {
      const pf = profitFactor(valuesR);
      return pf === null ? null : round(pf, 3);
    })(),

    directSlPct: trades.length ? directSlCount / trades.length : 0,
    nearTpPct: trades.length ? nearTpCount / trades.length : 0
  };
}

function optimizerScore(metrics: Metrics, filters: DashboardFilters): number {
  const winrateWeight = num(filters.winrateWeight, 1);
  const wilsonWeight = num(filters.wilsonWeight, 1);
  const pnlWeight = num(filters.pnlWeight, 1);
  const avgRWeight = num(filters.avgRWeight, 1);
  const profitFactorWeight = num(filters.profitFactorWeight, 0.5);
  const nearTpWeight = num(filters.nearTpWeight || filters.nearTpBonus, 0.25);
  const directSlPenalty = num(filters.directSlPenalty, 0.5);

  const pf = metrics.profitFactor ?? 0;

  const score =
    metrics.winrate * 100 * winrateWeight +
    metrics.wilson * 100 * wilsonWeight +
    clamp(metrics.avgR, -2, 3) * 25 * avgRWeight +
    clamp(metrics.totalR, -10, 20) * 4 * pnlWeight +
    clamp(pf, 0, 5) * 8 * profitFactorWeight +
    metrics.nearTpPct * 100 * nearTpWeight -
    metrics.directSlPct * 100 * directSlPenalty;

  return round(score, 2);
}

function cohortKeyOf(trade: ClosedTrade): string {
  return [
    `SETUP=${setupClassOf(trade)}`,
    `SIDE=${sideOf(trade)}`,
    `ENTRY=${entryReasonOf(trade)}`,
    `GRADE=${gradeOf(trade)}`,
    `RSI=${rsiZoneOf(trade)}`,
    `EDGE=${rsiEdgeOf(trade)}`,
    `FLOW=${flowOf(trade)}`,
    `BTC=${btcStateOf(trade)}`,
    `REGIME=${regimeOf(trade)}`,
    `OB=${obRelationOf(trade)}`,
    confluenceBucketOf(trade),
    sniperBucketOf(trade),
    rrBucketOf(trade),
    spreadBucketOf(trade),
    depthBucketOf(trade)
  ].join("|");
}

function tradePassesFilters(trade: ClosedTrade, filters: DashboardFilters): boolean {
  if (filters.strategyVersion) {
    const version = text(
      tradeValue(trade, [
        "strategyVersion",
        "payload.strategyVersion"
      ])
    );

    if (version !== filters.strategyVersion) return false;
  }

  if (filters.symbol && symbolOf(trade) !== filters.symbol) return false;
  if (filters.side && lower(sideOf(trade)) !== filters.side) return false;
  if (filters.reason && exitReasonOf(trade) !== filters.reason) return false;
  if (filters.setupClass && setupClassOf(trade) !== filters.setupClass) return false;
  if (filters.grade && gradeOf(trade) !== filters.grade) return false;
  if (filters.regime && regimeOf(trade) !== filters.regime) return false;
  if (filters.flow && flowOf(trade) !== filters.flow) return false;
  if (filters.btcState && btcStateOf(trade) !== filters.btcState) return false;
  if (filters.rsiZone && rsiZoneOf(trade) !== filters.rsiZone) return false;
  if (filters.rsiEdge && rsiEdgeOf(trade) !== filters.rsiEdge) return false;
  if (filters.obBias && obBiasOf(trade) !== filters.obBias) return false;
  if (filters.obRelation && obRelationOf(trade) !== filters.obRelation) return false;
  if (filters.spreadBucket && spreadBucketOf(trade) !== filters.spreadBucket) return false;
  if (filters.depthBucket && depthBucketOf(trade) !== filters.depthBucket) return false;

  if (filters.outcome) {
    const outcome = outcomeOf(trade);

    if (filters.outcome === "WIN" && !["WIN", "TP"].includes(outcome)) return false;
    if (filters.outcome === "LOSS" && !["LOSS", "SL"].includes(outcome)) return false;

    if (
      filters.outcome !== "WIN" &&
      filters.outcome !== "LOSS" &&
      outcome !== filters.outcome
    ) {
      return false;
    }
  }

  const fromMs = parseDateMs(filters.from);
  const toMs = parseDateMs(filters.to);
  const exitTs = eventTime(trade.exit);

  if (fromMs !== null && exitTs < fromMs) return false;
  if (toMs !== null && exitTs > toMs) return false;

  return true;
}

function rawEventPassesFilters(event: TradeEvent, filters: DashboardFilters): boolean {
  if (filters.eventType && normalizeEventType(event) !== filters.eventType) return false;

  if (filters.symbol && upper(firstValue(event, ["symbol", "payload.symbol"])) !== filters.symbol) {
    return false;
  }

  if (filters.side && lower(firstValue(event, ["side", "payload.side"])) !== filters.side) {
    return false;
  }

  const fromMs = parseDateMs(filters.from);
  const toMs = parseDateMs(filters.to);
  const ts = eventTime(event);

  if (fromMs !== null && ts < fromMs) return false;
  if (toMs !== null && ts > toMs) return false;

  return true;
}

function buildOverview(events: TradeEvent[], closedTrades: ClosedTrade[]): Overview {
  const entries = events.filter(isEntry);

  const openByTradeId = new Map<string, TradeEvent>();

  for (const entry of entries) {
    const tradeId = getTradeId(entry);
    if (!tradeId) continue;

    openByTradeId.set(tradeId, entry);
  }

  for (const trade of closedTrades) {
    if (!trade.tradeId) continue;
    openByTradeId.delete(trade.tradeId);
  }

  const metrics = summarizeTrades(closedTrades);

  return {
    entries: entries.length,
    closed: metrics.closed,
    open: openByTradeId.size,

    winrate: metrics.winrate,
    wilson: metrics.wilson,

    totalR: metrics.totalR,
    avgR: metrics.avgR,

    pnlPct: metrics.pnlPct,
    profitFactor: metrics.profitFactor,

    directSlPct: metrics.directSlPct,
    nearTpPct: metrics.nearTpPct
  };
}

function buildOptions(events: TradeEvent[]): DashboardOptions {
  const closedTrades = buildClosedTrades(events);

  return {
    strategies: uniqueSorted(events.map(event => text(firstValue(event, ["strategyVersion"])))),
    strategyVersions: uniqueSorted(events.map(event => text(firstValue(event, ["strategyVersion"])))),

    symbols: uniqueSorted(events.map(event => upper(firstValue(event, ["symbol", "payload.symbol"])))),
    sides: uniqueSorted(closedTrades.map(sideOf)),
    eventTypes: uniqueSorted(events.map(normalizeEventType)),
    reasons: uniqueSorted(closedTrades.map(exitReasonOf)),
    setupClasses: uniqueSorted(closedTrades.map(setupClassOf)),
    grades: uniqueSorted(closedTrades.map(gradeOf)),
    regimes: uniqueSorted(closedTrades.map(regimeOf)),
    flows: uniqueSorted(closedTrades.map(flowOf)),
    btcStates: uniqueSorted(closedTrades.map(btcStateOf)),
    rsiZones: uniqueSorted(closedTrades.map(rsiZoneOf)),
    rsiEdges: uniqueSorted(closedTrades.map(rsiEdgeOf)),
    obBiases: uniqueSorted(closedTrades.map(obBiasOf)),
    obRelations: uniqueSorted(closedTrades.map(obRelationOf)),
    spreadBuckets: uniqueSorted(closedTrades.map(spreadBucketOf)),
    depthBuckets: uniqueSorted(closedTrades.map(depthBucketOf))
  };
}

function buildCohorts(trades: ClosedTrade[], filters: DashboardFilters): CohortRow[] {
  const minTrades = Math.max(1, num(filters.minTrades, 1));
  const minWilson = percentInputToRatio(filters.minWilson, 0);
  const minWinrate = percentInputToRatio(filters.minWinrate, 0);

  const map = new Map<string, ClosedTrade[]>();

  for (const trade of trades) {
    const key = cohortKeyOf(trade);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)!.push(trade);
  }

  return Array.from(map.entries())
    .map(([cohortKey, rows]) => {
      const metrics = summarizeTrades(rows);
      const first = rows[0];

      const symbols = uniqueSorted(
        rows
          .map(symbolOf)
          .filter(symbol => symbol !== "UNKNOWN")
      );

      return {
        score: optimizerScore(metrics, filters),
        cohortKey,
        label: cohortKey,

        sample: rows.length,
        count: rows.length,

        ...metrics,

        setupClass: setupClassOf(first),
        side: sideOf(first),
        entryReason: entryReasonOf(first),
        reason: entryReasonOf(first),
        grade: gradeOf(first),
        regime: regimeOf(first),
        flow: flowOf(first),
        btcState: btcStateOf(first),
        rsiZone: rsiZoneOf(first),
        rsiEdge: rsiEdgeOf(first),
        obBias: obBiasOf(first),
        obRelation: obRelationOf(first),
        spreadBucket: spreadBucketOf(first),
        depthBucket: depthBucketOf(first),

        symbols
      };
    })
    .filter(row => {
      if (row.trades < minTrades) return false;
      if (minWilson > 0 && row.wilson < minWilson) return false;
      if (minWinrate > 0 && row.winrate < minWinrate) return false;

      return true;
    })
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      const wilsonDiff = b.wilson - a.wilson;
      if (wilsonDiff !== 0) return wilsonDiff;

      return b.trades - a.trades;
    })
    .slice(0, 100);
}

function buildBreakdown(trades: ClosedTrade[]): BreakdownRow[] {
  const dimensions: Array<[string, (trade: ClosedTrade) => string]> = [
    ["side", sideOf],
    ["setupClass", setupClassOf],
    ["entryReason", entryReasonOf],
    ["grade", gradeOf],
    ["regime", regimeOf],
    ["flow", flowOf],
    ["btcState", btcStateOf],
    ["rsiZone", rsiZoneOf],
    ["rsiEdge", rsiEdgeOf],
    ["obBias", obBiasOf],
    ["obRelation", obRelationOf],
    ["spreadBucket", spreadBucketOf],
    ["depthBucket", depthBucketOf],
    ["outcome", outcomeOf]
  ];

  const rows: BreakdownRow[] = [];

  for (const [dimension, getter] of dimensions) {
    const map = new Map<string, ClosedTrade[]>();

    for (const trade of trades) {
      const value = getter(trade) || "UNKNOWN";

      if (!map.has(value)) {
        map.set(value, []);
      }

      map.get(value)!.push(trade);
    }

    for (const [value, group] of map.entries()) {
      const metrics = summarizeTrades(group);

      rows.push({
        dimension,
        value,

        count: group.length,
        events: group.length,
        trades: metrics.trades,
        closed: metrics.closed,

        entries: group.length,
        exits: group.length,
        rejects: 0,
        snapshots: 0,
        holds: 0,

        wins: metrics.wins,
        losses: metrics.losses,
        flats: metrics.flats,

        winrate: metrics.winrate,
        wilson: metrics.wilson,

        totalR: metrics.totalR,
        avgR: metrics.avgR,
        pnlPct: metrics.pnlPct,
        avgPnlPct: metrics.avgPnlPct,
        profitFactor: metrics.profitFactor,

        directSlPct: metrics.directSlPct,
        nearTpPct: metrics.nearTpPct,

        examples: group
          .slice(-8)
          .map(trade => `${symbolOf(trade)}_${sideOf(trade)}_${outcomeOf(trade)}`)
          .join(", ")
      });
    }
  }

  return rows
    .sort((a, b) => {
      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      return b.trades - a.trades;
    })
    .slice(0, 150);
}

function buildRecentTrades(events: TradeEvent[]): RecentTradeRow[] {
  return [...events]
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, 150)
    .map(event => {
      const ts = eventTime(event);

      return {
        id: text(event.eventId),
        eventId: text(event.eventId),
        tradeId: nullableText(firstValue(event, ["tradeId", "payload.tradeId"])),

        ts,
        receivedAt: nullableNum(firstValue(event, ["receivedAt"])),
        date: new Date(ts || Date.now()).toISOString(),

        eventType: normalizeEventType(event),
        action: text(firstValue(event, ["action"])),
        reason: text(firstValue(event, ["reason", "payload.reason"])),

        symbol: nullableText(firstValue(event, ["symbol", "payload.symbol"])),
        side: nullableText(firstValue(event, ["side", "payload.side"])),

        setupClass: nullableText(firstValue(event, ["setupClass", "payload.setupClass"])),
        grade: nullableText(firstValue(event, ["grade", "payload.grade"])),

        entry: nullableNum(firstValue(event, ["entry", "price", "payload.entry", "payload.price"])),
        sl: nullableNum(firstValue(event, ["sl", "payload.sl"])),
        initialSl: nullableNum(firstValue(event, ["initialSl", "payload.initialSl"])),
        tp: nullableNum(firstValue(event, ["tp", "payload.tp"])),
        exit: nullableNum(firstValue(event, ["exit", "executionPrice", "payload.exit", "payload.executionPrice"])),

        rr: nullableNum(firstValue(event, ["rr", "payload.rr"])),
        plannedRR: nullableNum(firstValue(event, ["plannedRR", "payload.plannedRR"])),
        baseRR: nullableNum(firstValue(event, ["baseRR", "payload.baseRR"])),
        finalRr: nullableNum(firstValue(event, ["finalRr", "finalRR", "payload.finalRr", "payload.finalRR"])),
        exitR: nullableNum(firstValue(event, ["exitR", "payload.exitR"])),
        pnlPct: nullableNum(firstValue(event, ["pnlPct", "payload.pnlPct"])),

        score: nullableNum(firstValue(event, ["score", "payload.score"])),
        confluence: nullableNum(firstValue(event, ["confluence", "payload.confluence"])),
        sniperScore: nullableNum(firstValue(event, ["sniperScore", "payload.sniperScore"])),

        rsi: nullableNum(firstValue(event, ["rsi", "payload.rsi"])),
        rsiHTF: nullableNum(firstValue(event, ["rsiHTF", "payload.rsiHTF"])),
        rsiZone: nullableText(firstValue(event, ["rsiZone", "payload.rsiZone"])),
        rsiEdge: nullableText(firstValue(event, ["rsiEdge", "payload.rsiEdge"])),

        obBias: nullableText(firstValue(event, ["obBias", "payload.obBias"])),
        obRelation: nullableText(firstValue(event, ["obRelation", "payload.obRelation"])),

        spreadPct: nullableNum(firstValue(event, ["spreadPct", "payload.spreadPct"])),
        spreadBps: nullableNum(firstValue(event, ["spreadBps", "payload.spreadBps"])),
        spreadBucket: nullableText(firstValue(event, ["spreadBucket", "payload.spreadBucket"])),

        depthMinUsd1p: nullableNum(firstValue(event, ["depthMinUsd1p", "payload.depthMinUsd1p"])),
        depthBucket: nullableText(firstValue(event, ["depthBucket", "payload.depthBucket"])),

        flow: nullableText(firstValue(event, ["flow", "payload.flow"])),
        btcState: nullableText(firstValue(event, ["btcState", "payload.btcState"])),
        regime: nullableText(firstValue(event, ["regime", "payload.regime"])),

        mfeR: nullableNum(firstValue(event, ["mfeR", "payload.mfeR"])),
        maeR: nullableNum(firstValue(event, ["maeR", "payload.maeR"])),
        currentR: nullableNum(firstValue(event, ["currentR", "payload.currentR"])),

        directToSL: bool(firstValue(event, ["directToSL", "payload.directToSL"])),
        nearTpSeen: bool(firstValue(event, ["nearTpSeen", "payload.nearTpSeen"])),
        reachedHalfR: bool(firstValue(event, ["reachedHalfR", "payload.reachedHalfR"])),
        reachedOneR: bool(firstValue(event, ["reachedOneR", "payload.reachedOneR"])),
        breakEvenActivated: bool(firstValue(event, ["breakEvenActivated", "payload.breakEvenActivated"])),
        breakEvenStop: bool(firstValue(event, ["breakEvenStop", "payload.breakEvenStop"])),

        strategyVersion: nullableText(firstValue(event, ["strategyVersion"])),
        runId: nullableText(firstValue(event, ["runId"]))
      };
    });
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const allEvents = await listTradeEvents();

  const filteredRawEvents = allEvents.filter(event =>
    rawEventPassesFilters(event, filters)
  );

  const allClosedTrades = buildClosedTrades(allEvents);

  const filteredClosedTrades = allClosedTrades.filter(trade =>
    tradePassesFilters(trade, filters)
  );

  return {
    overview: buildOverview(allEvents, filteredClosedTrades),
    options: buildOptions(allEvents),
    cohorts: buildCohorts(filteredClosedTrades, filters),
    breakdown: buildBreakdown(filteredClosedTrades),
    recentTrades: buildRecentTrades(filteredRawEvents),
    rawEvents: filteredRawEvents
  };
}

export {
  buildClosedTrades,
  summarizeTrades,
  wilsonLowerBound
};