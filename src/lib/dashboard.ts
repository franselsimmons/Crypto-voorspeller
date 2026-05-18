import { listTradeEvents } from "./store";
import type { NormalizedWebhookEvent } from "./normalize";

export type SearchParams = Record<string, string | string[] | undefined>;

type AnyRecord = Record<string, unknown>;

type AnyEvent = NormalizedWebhookEvent & AnyRecord;

type ClosedTrade = {
  exit: AnyEvent;
  entry?: AnyEvent;
};

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

  minTrades: number;
  winrateWeight: number;
  pnlWeight: number;
  avgRWeight: number;
  wilsonWeight: number;
  profitFactorWeight: number;
  nearTpWeight: number;
  directSlPenalty: number;
  minWilson: number;
  minWinrate: number;
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

export type MetricFields = {
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
  profitFactor: number | null;
  directSlPct: number;
  nearTpPct: number;
};

export type CohortRow = MetricFields & {
  cohortKey: string;
  label: string;
  score: number;
  sample: number;
  count: number;

  setupClass: string;
  side: string;
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

  avgScore: number;
  avgConfluence: number;
  avgSniper: number;

  symbols: string[];
  examples: string;
};

export type BreakdownRow = MetricFields & {
  dimension: string;
  value: string;
  count: number;
  pct: number;

  entries: number;
  exits: number;
  rejects: number;
  snapshots: number;
  holds: number;

  examples: string;
};

export type RecentTradeRow = {
  id: string;
  eventId: string;
  tradeId: string | null;

  ts: number;
  receivedAt: number;
  date: string;

  eventType: string;
  action: string;
  reason: string;
  outcome: string;

  symbol: string | null;
  side: string | null;

  setupClass: string | null;
  grade: string | null;
  regime: string;
  flow: string;
  btcState: string;
  rsiZone: string | null;
  rsiEdge: string;
  obBias: string | null;
  obRelation: string;
  spreadBucket: string;
  depthBucket: string;

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

  score: number;
  confluence: number;
  sniperScore: number;

  rsi: number | null;
  rsiHTF: number | null;

  spreadPct: number | null;
  depthMinUsd1p: number | null;

  mfeR: number | null;
  maeR: number | null;
  currentR: number | null;

  directToSL: boolean;
  nearTpSeen: boolean;
  reachedHalfR: boolean;
  reachedOneR: boolean;
  breakEvenActivated: boolean;
  breakEvenStop: boolean;

  strategyVersion: string;
  runId: string;
};

export type DashboardData = {
  overview: Overview;
  options: DashboardOptions;
  cohorts: CohortRow[];
  breakdown: BreakdownRow[];
  recentTrades: RecentTradeRow[];
  rawEvents: NormalizedWebhookEvent[];
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

function getValue(obj: unknown, paths: string[], fallback: unknown = null): unknown {
  for (const path of paths) {
    const value = readPath(obj, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function getTradeValue(trade: ClosedTrade, paths: string[], fallback: unknown = null): unknown {
  const fromExit = getValue(trade.exit, paths, undefined);

  if (fromExit !== undefined && fromExit !== null && fromExit !== "") {
    return fromExit;
  }

  const fromEntry = getValue(trade.entry, paths, undefined);

  if (fromEntry !== undefined && fromEntry !== null && fromEntry !== "") {
    return fromEntry;
  }

  return fallback;
}

function text(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;

  const output = String(value).trim();
  return output || fallback;
}

function upper(value: unknown, fallback = ""): string {
  return text(value, fallback).toUpperCase();
}

function lower(value: unknown, fallback = ""): string {
  return text(value, fallback).toLowerCase();
}

function numberValue(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const cleaned = String(value)
    .replace("%", "")
    .replace(",", ".")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const n = numberValue(value, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function uniqueSorted(values: unknown[]): string[] {
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

function paramNumber(
  params: SearchParams,
  keys: string[],
  fallback: number
): number {
  for (const key of keys) {
    const raw = one(params[key]);

    if (raw !== "") {
      return numberValue(raw, fallback);
    }
  }

  return fallback;
}

export function parseDashboardFilters(params: SearchParams = {}): DashboardFilters {
  return {
    strategyVersion: one(params.strategyVersion || params.strategy || params.version),
    symbol: one(params.symbol),
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

    minTrades: paramNumber(params, ["minTrades"], 1),
    winrateWeight: paramNumber(params, ["winrateWeight"], 1),
    pnlWeight: paramNumber(params, ["pnlWeight"], 1),
    avgRWeight: paramNumber(params, ["avgRWeight"], 1),
    wilsonWeight: paramNumber(params, ["wilsonWeight"], 1),
    profitFactorWeight: paramNumber(params, ["profitFactorWeight"], 0.25),
    nearTpWeight: paramNumber(params, ["nearTpWeight"], 0.25),
    directSlPenalty: paramNumber(params, ["directSlPenalty"], 0.5),
    minWilson: paramNumber(params, ["minWilson"], 0),
    minWinrate: paramNumber(params, ["minWinrate"], 0)
  };
}

function eventType(event: AnyEvent): string {
  const raw = upper(
    getValue(event, [
      "eventType",
      "action",
      "type",
      "payload.eventType",
      "payload.action",
      "payload.type"
    ]),
    "UNKNOWN"
  );

  if (raw.includes("ENTRY")) return "ENTRY";
  if (raw.includes("EXIT")) return "EXIT";
  if (raw.includes("REJECT")) return "REJECT";
  if (raw.includes("WAIT")) return "REJECT";
  if (raw.includes("SNAPSHOT")) return "SNAPSHOT";
  if (raw.includes("HOLD")) return "SNAPSHOT";

  return raw;
}

function eventText(event: AnyEvent, paths: string[], fallback = "UNKNOWN"): string {
  return upper(getValue(event, paths), fallback);
}

function eventOutcome(event: AnyEvent): string {
  if (eventType(event) !== "EXIT") return "";

  const exitR = nullableNumber(getValue(event, ["exitR", "payload.exitR"]));
  const pnlPct = nullableNumber(getValue(event, ["pnlPct", "payload.pnlPct"]));

  if (exitR !== null) {
    if (exitR > 0) return "WIN";
    if (exitR < 0) return "LOSS";
    return "FLAT";
  }

  if (pnlPct !== null) {
    if (pnlPct > 0) return "WIN";
    if (pnlPct < 0) return "LOSS";
    return "FLAT";
  }

  return "FLAT";
}

function eventFlow(event: AnyEvent): string {
  return eventText(event, ["flow", "payload.flow"], "UNKNOWN");
}

function eventRegime(event: AnyEvent): string {
  return eventText(event, ["regime", "payload.regime"], "UNKNOWN");
}

function eventBtcState(event: AnyEvent): string {
  return eventText(event, ["btcState", "payload.btcState"], "UNKNOWN");
}

function eventRsiEdge(event: AnyEvent): string {
  return eventText(event, ["rsiEdge", "rsiEntryEdge", "payload.rsiEdge", "payload.rsiEntryEdge"], "UNKNOWN");
}

function eventObRelation(event: AnyEvent): string {
  return eventText(event, ["obRelation", "payload.obRelation", "orderbook.relation", "ob.relation"], "UNKNOWN");
}

function spreadBucketFromValue(spreadPct: unknown, spreadBps: unknown): string {
  const explicitBps = nullableNumber(spreadBps);
  const pct = nullableNumber(spreadPct);
  const bps = explicitBps ?? (pct !== null ? pct * 10000 : null);

  if (bps === null) return "SPREAD_NA";
  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 25) return "SPREAD_12_25BPS";

  return "SPREAD_GTE_25BPS";
}

function depthBucketFromValue(depthValue: unknown): string {
  const depth = nullableNumber(depthValue);

  if (depth === null) return "DEPTH_NA";
  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function eventSpreadBucket(event: AnyEvent): string {
  const explicit = eventText(event, ["spreadBucket", "payload.spreadBucket"], "");

  if (explicit) return explicit;

  return spreadBucketFromValue(
    getValue(event, ["spreadPct", "payload.spreadPct"]),
    getValue(event, ["spreadBps", "payload.spreadBps"])
  );
}

function eventDepthBucket(event: AnyEvent): string {
  const explicit = eventText(event, ["depthBucket", "payload.depthBucket"], "");

  if (explicit) return explicit;

  return depthBucketFromValue(
    getValue(event, ["depthMinUsd1p", "depthUsd1p", "payload.depthMinUsd1p", "payload.depthUsd1p"])
  );
}

function eventPassesFilters(event: AnyEvent, filters: DashboardFilters): boolean {
  if (filters.strategyVersion && event.strategyVersion !== filters.strategyVersion) return false;
  if (filters.symbol && upper(event.symbol) !== upper(filters.symbol)) return false;
  if (filters.side && lower(event.side) !== filters.side) return false;
  if (filters.eventType && eventType(event) !== filters.eventType) return false;
  if (filters.reason && upper(event.reason) !== filters.reason) return false;
  if (filters.setupClass && upper(event.setupClass) !== filters.setupClass) return false;
  if (filters.grade && upper(event.grade) !== filters.grade) return false;
  if (filters.regime && eventRegime(event) !== filters.regime) return false;
  if (filters.flow && eventFlow(event) !== filters.flow) return false;
  if (filters.btcState && eventBtcState(event) !== filters.btcState) return false;
  if (filters.rsiZone && upper(event.rsiZone) !== filters.rsiZone) return false;
  if (filters.rsiEdge && eventRsiEdge(event) !== filters.rsiEdge) return false;
  if (filters.obBias && upper(event.obBias) !== filters.obBias) return false;
  if (filters.obRelation && eventObRelation(event) !== filters.obRelation) return false;
  if (filters.spreadBucket && eventSpreadBucket(event) !== filters.spreadBucket) return false;
  if (filters.depthBucket && eventDepthBucket(event) !== filters.depthBucket) return false;
  if (filters.outcome && eventOutcome(event) !== filters.outcome) return false;

  const fromMs = parseDateMs(filters.from);
  const toMs = parseDateMs(filters.to);

  if (fromMs !== null && Number(event.ts || 0) < fromMs) return false;
  if (toMs !== null && Number(event.ts || 0) > toMs) return false;

  return true;
}

function wilsonLowerBound(wins: number, total: number): number {
  if (!total) return 0;

  const z = 1.96;
  const p = wins / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

  return Math.max(0, (center - margin) / denom);
}

function profitFactorFromRValues(values: number[]): number | null {
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

  return round(grossWin / grossLoss, 3);
}

function buildEntryIndex(events: AnyEvent[]): Map<string, AnyEvent> {
  const map = new Map<string, AnyEvent>();

  for (const event of events) {
    if (eventType(event) !== "ENTRY") continue;
    if (!event.tradeId) continue;

    map.set(event.tradeId, event);
  }

  return map;
}

function buildClosedTrades(events: AnyEvent[]): ClosedTrade[] {
  const entryIndex = buildEntryIndex(events);

  return events
    .filter(event => eventType(event) === "EXIT")
    .map(exit => ({
      exit,
      entry: exit.tradeId ? entryIndex.get(exit.tradeId) : undefined
    }));
}

function tradeExitR(trade: ClosedTrade): number | null {
  return nullableNumber(getTradeValue(trade, ["exitR", "payload.exitR"]));
}

function tradePnlPct(trade: ClosedTrade): number | null {
  return nullableNumber(getTradeValue(trade, ["pnlPct", "payload.pnlPct"]));
}

function tradeOutcome(trade: ClosedTrade): string {
  const exitR = tradeExitR(trade);
  const pnlPct = tradePnlPct(trade);

  if (exitR !== null) {
    if (exitR > 0) return "WIN";
    if (exitR < 0) return "LOSS";
    return "FLAT";
  }

  if (pnlPct !== null) {
    if (pnlPct > 0) return "WIN";
    if (pnlPct < 0) return "LOSS";
    return "FLAT";
  }

  return "FLAT";
}

function tradeText(trade: ClosedTrade, paths: string[], fallback = "UNKNOWN"): string {
  return upper(getTradeValue(trade, paths), fallback);
}

function tradeSetupClass(trade: ClosedTrade): string {
  return tradeText(trade, ["setupClass", "payload.setupClass"], "UNKNOWN");
}

function tradeSide(trade: ClosedTrade): string {
  const side = tradeText(trade, ["side", "payload.side"], "UNKNOWN");

  if (["BULL", "LONG", "BUY", "BULLISH"].includes(side)) return "LONG";
  if (["BEAR", "SHORT", "SELL", "BEARISH"].includes(side)) return "SHORT";

  return side;
}

function tradeReason(trade: ClosedTrade): string {
  return tradeText(trade, ["entryReason", "reason", "payload.entryReason", "payload.reason"], "UNKNOWN");
}

function tradeGrade(trade: ClosedTrade): string {
  return tradeText(trade, ["grade", "payload.grade"], "UNKNOWN");
}

function tradeRegime(trade: ClosedTrade): string {
  return tradeText(trade, ["regime", "payload.regime"], "UNKNOWN");
}

function tradeFlow(trade: ClosedTrade): string {
  return tradeText(trade, ["flow", "payload.flow"], "UNKNOWN");
}

function tradeBtcState(trade: ClosedTrade): string {
  return tradeText(trade, ["btcState", "payload.btcState"], "UNKNOWN");
}

function tradeRsiZone(trade: ClosedTrade): string {
  return tradeText(trade, ["rsiZone", "payload.rsiZone"], "UNKNOWN");
}

function tradeRsiEdge(trade: ClosedTrade): string {
  return tradeText(trade, ["rsiEdge", "rsiEntryEdge", "payload.rsiEdge", "payload.rsiEntryEdge"], "UNKNOWN");
}

function tradeObBias(trade: ClosedTrade): string {
  return tradeText(trade, ["obBias", "payload.obBias"], "UNKNOWN");
}

function tradeObRelation(trade: ClosedTrade): string {
  return tradeText(trade, ["obRelation", "payload.obRelation", "orderbook.relation", "ob.relation"], "UNKNOWN");
}

function tradeSpreadBucket(trade: ClosedTrade): string {
  const explicit = tradeText(trade, ["spreadBucket", "payload.spreadBucket"], "");

  if (explicit) return explicit;

  return spreadBucketFromValue(
    getTradeValue(trade, ["spreadPct", "payload.spreadPct"]),
    getTradeValue(trade, ["spreadBps", "payload.spreadBps"])
  );
}

function tradeDepthBucket(trade: ClosedTrade): string {
  const explicit = tradeText(trade, ["depthBucket", "payload.depthBucket"], "");

  if (explicit) return explicit;

  return depthBucketFromValue(
    getTradeValue(trade, ["depthMinUsd1p", "depthUsd1p", "payload.depthMinUsd1p", "payload.depthUsd1p"])
  );
}

function tradeSymbol(trade: ClosedTrade): string {
  return tradeText(trade, ["symbol", "payload.symbol"], "UNKNOWN");
}

function buildMetrics(trades: ClosedTrade[]): MetricFields {
  const wins = trades.filter(trade => tradeOutcome(trade) === "WIN").length;
  const losses = trades.filter(trade => tradeOutcome(trade) === "LOSS").length;
  const flats = Math.max(0, trades.length - wins - losses);
  const completed = wins + losses;

  const rValues = trades
    .map(tradeExitR)
    .filter((value): value is number => Number.isFinite(value));

  const pnlValues = trades
    .map(tradePnlPct)
    .filter((value): value is number => Number.isFinite(value));

  const totalR = rValues.reduce((sum, value) => sum + value, 0);
  const pnlPct = pnlValues.reduce((sum, value) => sum + value, 0);

  const directSlCount = trades.filter(trade => Boolean(getTradeValue(trade, ["directToSL", "payload.directToSL"]))).length;
  const nearTpCount = trades.filter(trade => Boolean(getTradeValue(trade, ["nearTpSeen", "payload.nearTpSeen"]))).length;

  return {
    trades: trades.length,
    closed: trades.length,
    wins,
    losses,
    flats,
    winrate: completed ? wins / completed : 0,
    wilson: wilsonLowerBound(wins, completed),
    totalR: round(totalR, 3),
    avgR: rValues.length ? round(totalR / rValues.length, 3) : 0,
    pnlPct: round(pnlPct, 3),
    profitFactor: profitFactorFromRValues(rValues),
    directSlPct: trades.length ? directSlCount / trades.length : 0,
    nearTpPct: trades.length ? nearTpCount / trades.length : 0
  };
}

function optimizerScore(metrics: MetricFields, filters: DashboardFilters): number {
  const pf = metrics.profitFactor === null ? 0 : Math.min(metrics.profitFactor, 5);

  const score =
    metrics.winrate * 100 * filters.winrateWeight +
    metrics.wilson * 100 * filters.wilsonWeight +
    metrics.pnlPct * filters.pnlWeight +
    metrics.avgR * 100 * filters.avgRWeight +
    pf * 20 * filters.profitFactorWeight +
    metrics.nearTpPct * 100 * filters.nearTpWeight -
    metrics.directSlPct * 100 * filters.directSlPenalty;

  return round(score, 2);
}

function buildOverview(events: AnyEvent[]): Overview {
  const entries = events.filter(event => eventType(event) === "ENTRY");
  const closedTrades = buildClosedTrades(events);
  const metrics = buildMetrics(closedTrades);

  const openByTradeId = new Map<string, AnyEvent>();

  for (const entry of entries) {
    if (!entry.tradeId) continue;
    openByTradeId.set(entry.tradeId, entry);
  }

  for (const trade of closedTrades) {
    if (!trade.exit.tradeId) continue;
    openByTradeId.delete(trade.exit.tradeId);
  }

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

function buildOptions(events: AnyEvent[]): DashboardOptions {
  const strategies = uniqueSorted(events.map(event => event.strategyVersion));

  return {
    strategies,
    strategyVersions: strategies,
    symbols: uniqueSorted(events.map(event => event.symbol)),
    sides: uniqueSorted(events.map(event => event.side)),
    eventTypes: uniqueSorted(events.map(event => eventType(event))),
    reasons: uniqueSorted(events.map(event => event.reason)),
    setupClasses: uniqueSorted(events.map(event => event.setupClass)),
    grades: uniqueSorted(events.map(event => event.grade)),
    regimes: uniqueSorted(events.map(eventRegime)),
    flows: uniqueSorted(events.map(eventFlow)),
    btcStates: uniqueSorted(events.map(eventBtcState)),
    rsiZones: uniqueSorted(events.map(event => event.rsiZone)),
    rsiEdges: uniqueSorted(events.map(eventRsiEdge)),
    obBiases: uniqueSorted(events.map(event => event.obBias)),
    obRelations: uniqueSorted(events.map(eventObRelation)),
    spreadBuckets: uniqueSorted(events.map(eventSpreadBucket)),
    depthBuckets: uniqueSorted(events.map(eventDepthBucket))
  };
}

function cohortKey(trade: ClosedTrade): string {
  const explicit = text(getTradeValue(trade, ["cohortKey", "payload.cohortKey"]), "");

  if (explicit) return explicit;

  return [
    `SETUP=${tradeSetupClass(trade)}`,
    `SIDE=${tradeSide(trade)}`,
    `REASON=${tradeReason(trade)}`,
    `RSI=${tradeRsiZone(trade)}`,
    `EDGE=${tradeRsiEdge(trade)}`,
    `FLOW=${tradeFlow(trade)}`,
    `BTC=${tradeBtcState(trade)}`,
    `OB=${tradeObRelation(trade)}`,
    tradeSpreadBucket(trade),
    tradeDepthBucket(trade)
  ].join("|");
}

function passesOptimizerThresholds(row: MetricFields, filters: DashboardFilters): boolean {
  if (row.trades < filters.minTrades) return false;
  if (filters.minWilson > 0 && row.wilson < filters.minWilson / 100) return false;
  if (filters.minWinrate > 0 && row.winrate < filters.minWinrate / 100) return false;

  return true;
}

function buildCohorts(events: AnyEvent[], filters: DashboardFilters): CohortRow[] {
  const trades = buildClosedTrades(events);
  const map = new Map<string, ClosedTrade[]>();

  for (const trade of trades) {
    const key = cohortKey(trade);

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(trade);
  }

  return Array.from(map.entries())
    .map(([key, rows]) => {
      const first = rows[0];
      const metrics = buildMetrics(rows);

      const symbols = uniqueSorted(rows.map(tradeSymbol).filter(symbol => symbol !== "UNKNOWN"));

      return {
        cohortKey: key,
        label: key,
        score: optimizerScore(metrics, filters),
        sample: rows.length,
        count: rows.length,

        setupClass: first ? tradeSetupClass(first) : "UNKNOWN",
        side: first ? tradeSide(first) : "UNKNOWN",
        reason: first ? tradeReason(first) : "UNKNOWN",
        grade: first ? tradeGrade(first) : "UNKNOWN",
        regime: first ? tradeRegime(first) : "UNKNOWN",
        flow: first ? tradeFlow(first) : "UNKNOWN",
        btcState: first ? tradeBtcState(first) : "UNKNOWN",
        rsiZone: first ? tradeRsiZone(first) : "UNKNOWN",
        rsiEdge: first ? tradeRsiEdge(first) : "UNKNOWN",
        obBias: first ? tradeObBias(first) : "UNKNOWN",
        obRelation: first ? tradeObRelation(first) : "UNKNOWN",
        spreadBucket: first ? tradeSpreadBucket(first) : "UNKNOWN",
        depthBucket: first ? tradeDepthBucket(first) : "UNKNOWN",

        avgScore: round(
          rows.reduce((sum, row) => sum + numberValue(getTradeValue(row, ["score", "payload.score"]), 0), 0) / Math.max(1, rows.length),
          1
        ),
        avgConfluence: round(
          rows.reduce((sum, row) => sum + numberValue(getTradeValue(row, ["confluence", "payload.confluence"]), 0), 0) / Math.max(1, rows.length),
          1
        ),
        avgSniper: round(
          rows.reduce((sum, row) => sum + numberValue(getTradeValue(row, ["sniperScore", "payload.sniperScore"]), 0), 0) / Math.max(1, rows.length),
          1
        ),

        symbols,
        examples: symbols.slice(0, 8).join(", "),

        ...metrics
      };
    })
    .filter(row => passesOptimizerThresholds(row, filters))
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const wilsonDiff = b.wilson - a.wilson;
      if (wilsonDiff !== 0) return wilsonDiff;

      return b.totalR - a.totalR;
    })
    .slice(0, 150);
}

function closedTradesForEvents(events: AnyEvent[], selectedEvents: AnyEvent[]): ClosedTrade[] {
  const selectedIds = new Set(selectedEvents.map(event => event.eventId));
  const entryIndex = buildEntryIndex(events);

  return selectedEvents
    .filter(event => eventType(event) === "EXIT")
    .map(exit => ({
      exit,
      entry: exit.tradeId ? entryIndex.get(exit.tradeId) : undefined
    }))
    .filter(trade => selectedIds.has(trade.exit.eventId));
}

function buildBreakdownDimension(
  events: AnyEvent[],
  dimension: string,
  getter: (event: AnyEvent) => string
): BreakdownRow[] {
  const total = events.length || 1;
  const map = new Map<string, AnyEvent[]>();

  for (const event of events) {
    const key = getter(event) || "UNKNOWN";

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
  }

  return Array.from(map.entries()).map(([value, rows]) => {
    const trades = closedTradesForEvents(events, rows);
    const metrics = buildMetrics(trades);

    return {
      dimension,
      value,
      count: rows.length,
      pct: rows.length / total,

      entries: rows.filter(row => eventType(row) === "ENTRY").length,
      exits: rows.filter(row => eventType(row) === "EXIT").length,
      rejects: rows.filter(row => eventType(row) === "REJECT").length,
      snapshots: rows.filter(row => eventType(row) === "SNAPSHOT").length,
      holds: rows.filter(row => eventType(row) === "HOLD").length,

      examples: rows
        .slice(-8)
        .map(row => `${row.symbol || "UNKNOWN"}_${row.side || "unknown"}_${eventType(row)}`)
        .join(", "),

      ...metrics
    };
  });
}

function buildBreakdown(events: AnyEvent[], filters: DashboardFilters): BreakdownRow[] {
  const rows = [
    ...buildBreakdownDimension(events, "reason", event => upper(event.reason, "UNKNOWN")),
    ...buildBreakdownDimension(events, "setupClass", event => upper(event.setupClass, "UNKNOWN")),
    ...buildBreakdownDimension(events, "side", event => upper(event.side, "UNKNOWN")),
    ...buildBreakdownDimension(events, "rsiZone", event => upper(event.rsiZone, "UNKNOWN")),
    ...buildBreakdownDimension(events, "flow", eventFlow),
    ...buildBreakdownDimension(events, "btcState", eventBtcState),
    ...buildBreakdownDimension(events, "obBias", event => upper(event.obBias, "UNKNOWN")),
    ...buildBreakdownDimension(events, "obRelation", eventObRelation),
    ...buildBreakdownDimension(events, "spreadBucket", eventSpreadBucket),
    ...buildBreakdownDimension(events, "depthBucket", eventDepthBucket)
  ];

  return rows
    .filter(row => row.count > 0)
    .filter(row => row.trades >= filters.minTrades || row.trades === 0)
    .sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;

      return b.totalR - a.totalR;
    })
    .slice(0, 250);
}

function buildRecentTrades(events: AnyEvent[]): RecentTradeRow[] {
  return [...events]
    .sort((a, b) => numberValue(b.ts, 0) - numberValue(a.ts, 0))
    .slice(0, 150)
    .map(event => ({
      id: event.eventId,
      eventId: event.eventId,
      tradeId: event.tradeId,

      ts: event.ts,
      receivedAt: event.receivedAt,
      date: new Date(event.ts || event.receivedAt || Date.now()).toISOString(),

      eventType: eventType(event),
      action: event.action,
      reason: event.reason,
      outcome: eventOutcome(event),

      symbol: event.symbol,
      side: event.side,

      setupClass: event.setupClass,
      grade: event.grade,
      regime: eventRegime(event),
      flow: eventFlow(event),
      btcState: eventBtcState(event),
      rsiZone: event.rsiZone,
      rsiEdge: eventRsiEdge(event),
      obBias: event.obBias,
      obRelation: eventObRelation(event),
      spreadBucket: eventSpreadBucket(event),
      depthBucket: eventDepthBucket(event),

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
      sniperScore: event.sniperScore,

      rsi: event.rsi,
      rsiHTF: event.rsiHTF,

      spreadPct: event.spreadPct,
      depthMinUsd1p: event.depthMinUsd1p,

      mfeR: event.mfeR,
      maeR: event.maeR,
      currentR: event.currentR,

      directToSL: event.directToSL,
      nearTpSeen: event.nearTpSeen,
      reachedHalfR: event.reachedHalfR,
      reachedOneR: event.reachedOneR,
      breakEvenActivated: event.breakEvenActivated,
      breakEvenStop: event.breakEvenStop,

      strategyVersion: event.strategyVersion,
      runId: event.runId
    }));
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const allEvents = (await listTradeEvents()).map(event => event as AnyEvent);
  const filteredEvents = allEvents.filter(event => eventPassesFilters(event, filters));

  return {
    overview: buildOverview(filteredEvents),
    options: buildOptions(allEvents),
    cohorts: buildCohorts(filteredEvents, filters),
    breakdown: buildBreakdown(filteredEvents, filters),
    recentTrades: buildRecentTrades(filteredEvents),
    rawEvents: filteredEvents
  };
}