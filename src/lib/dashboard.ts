import { listTradeEvents } from "./store";
import type { NormalizedWebhookEvent } from "./normalize";

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

  minTrades: string;
  winrateWeight: string;
  pnlWeight: string;
  avgRWeight: string;
  totalRWeight: string;
  profitFactorWeight: string;
  directSlWeight: string;
  nearTpWeight: string;
  wilsonWeight: string;

  from: string;
  to: string;
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
  cohortKey: string;
  label: string;
  score: number;

  sample: number;
  count: number;
  trades: number;
  exits: number;
  closed: number;
  wins: number;
  losses: number;

  winrate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  pnlPct: number;
  profitFactor: number | null;
  directSlPct: number;
  nearTpPct: number;

  setupClass: string;
  side: string;
  rsiZone: string;
  rsiEdge: string;
  flow: string;
  btcState: string;
  regime: string;
  obBias: string;
  obRelation: string;
  spreadBucket: string;
  depthBucket: string;
  reason: string;

  avgScore: number;
  avgConfluence: number;
  avgSniper: number;

  examples: string;
};

export type BreakdownRow = {
  dimension: string;
  value: string;
  label: string;

  count: number;
  pct: number;

  trades: number;
  entries: number;
  exits: number;
  rejects: number;
  holds: number;
  snapshots: number;

  wins: number;
  losses: number;
  winrate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  pnlPct: number;
  profitFactor: number | null;
  directSlPct: number;
  nearTpPct: number;

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

  score: number;
  confluence: number;
  sniperScore: number;

  rsi: number | null;
  rsiHTF: number | null;
  rsiZone: string | null;
  rsiEdge: string;

  obBias: string | null;
  obRelation: string;
  spreadPct: number | null;
  spreadBucket: string;
  depthMinUsd1p: number | null;
  depthBucket: string;

  flow: string;
  btcState: string;
  regime: string;

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

type AnyRecord = Record<string, unknown>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function upper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function lower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function n(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(value => String(value || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function parseDateMs(value: string): number | null {
  if (!value) return null;

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
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

function getPayloadValue(event: NormalizedWebhookEvent, paths: string[], fallback: unknown = ""): unknown {
  for (const path of paths) {
    const value = readPath(event.payload, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function getEventText(
  event: NormalizedWebhookEvent,
  directValue: unknown,
  payloadPaths: string[],
  fallback = "UNKNOWN"
): string {
  const direct = String(directValue || "").trim();
  if (direct) return direct.toUpperCase();

  const payloadValue = getPayloadValue(event, payloadPaths, fallback);
  return String(payloadValue || fallback).trim().toUpperCase();
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

    minTrades: one(params.minTrades) || "1",
    winrateWeight: one(params.winrateWeight) || "1",
    pnlWeight: one(params.pnlWeight) || "1",
    avgRWeight: one(params.avgRWeight) || "1",
    totalRWeight: one(params.totalRWeight) || "1",
    profitFactorWeight: one(params.profitFactorWeight) || "0.5",
    directSlWeight: one(params.directSlWeight) || "1",
    nearTpWeight: one(params.nearTpWeight) || "0.25",
    wilsonWeight: one(params.wilsonWeight) || "0.5",

    from: one(params.from),
    to: one(params.to)
  };
}

function eventType(event: NormalizedWebhookEvent): string {
  const raw = upper(event.eventType || event.action);

  if (raw === "WAIT") return "REJECT";
  if (raw === "ENTRY") return "ENTRY";
  if (raw === "EXIT") return "EXIT";
  if (raw === "REJECT") return "REJECT";
  if (raw === "HOLD") return "HOLD";
  if (raw === "SNAPSHOT") return "SNAPSHOT";

  return raw || "UNKNOWN";
}

function eventGrade(event: NormalizedWebhookEvent): string {
  return getEventText(event, event.grade, ["grade"], "UNKNOWN");
}

function eventRegime(event: NormalizedWebhookEvent): string {
  return getEventText(event, null, ["regime", "market.regime"], "UNKNOWN");
}

function eventFlow(event: NormalizedWebhookEvent): string {
  return getEventText(event, null, ["flow", "market.flow"], "UNKNOWN");
}

function eventBtcState(event: NormalizedWebhookEvent): string {
  return getEventText(event, null, ["btcState", "market.btcState"], "UNKNOWN");
}

function eventRsiEdge(event: NormalizedWebhookEvent): string {
  return getEventText(event, null, ["rsiEdge", "rsiEntryEdge"], "UNKNOWN");
}

function eventObRelation(event: NormalizedWebhookEvent): string {
  const explicit = getEventText(event, null, ["obRelation", "orderbook.relation", "ob.relation"], "");

  if (explicit) return explicit;

  const side = lower(event.side);
  const obBias = upper(event.obBias);

  if (!side || !obBias || obBias === "UNKNOWN" || obBias === "NEUTRAL") {
    return "NEUTRAL";
  }

  if (side === "bull" && obBias === "BULLISH") return "WITH";
  if (side === "bear" && obBias === "BEARISH") return "WITH";

  if (side === "bull" && obBias === "BEARISH") return "AGAINST";
  if (side === "bear" && obBias === "BULLISH") return "AGAINST";

  return "NEUTRAL";
}

function eventSpreadBucket(event: NormalizedWebhookEvent): string {
  const explicit = getEventText(event, null, ["spreadBucket", "ob.spreadBucket"], "");

  if (explicit) return explicit;

  const spreadPct = nullableNumber(event.spreadPct);
  if (spreadPct === null) return "SPREAD_NA";

  const bps = spreadPct * 10000;

  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 25) return "SPREAD_12_25BPS";

  return "SPREAD_GTE_25BPS";
}

function eventDepthBucket(event: NormalizedWebhookEvent): string {
  const explicit = getEventText(event, null, ["depthBucket", "ob.depthBucket"], "");

  if (explicit) return explicit;

  const depth = nullableNumber(event.depthMinUsd1p);
  if (depth === null) return "DEPTH_NA";

  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function eventOutcome(event: NormalizedWebhookEvent): string {
  if (eventType(event) !== "EXIT") return "";

  const exitR = nullableNumber(event.exitR);
  if (exitR !== null && exitR > 0) return "WIN";
  if (exitR !== null && exitR < 0) return "LOSS";
  if (exitR !== null && exitR === 0) return "FLAT";

  const pnlPct = nullableNumber(event.pnlPct);
  if (pnlPct !== null && pnlPct > 0) return "WIN";
  if (pnlPct !== null && pnlPct < 0) return "LOSS";
  if (pnlPct !== null && pnlPct === 0) return "FLAT";

  return "FLAT";
}

function eventPassesFilters(
  event: NormalizedWebhookEvent,
  filters: DashboardFilters
): boolean {
  if (filters.strategyVersion && event.strategyVersion !== filters.strategyVersion) {
    return false;
  }

  if (filters.symbol && upper(event.symbol) !== upper(filters.symbol)) {
    return false;
  }

  if (filters.side && lower(event.side) !== filters.side) {
    return false;
  }

  if (filters.eventType && eventType(event) !== filters.eventType) {
    return false;
  }

  if (filters.reason && upper(event.reason) !== filters.reason) {
    return false;
  }

  if (filters.setupClass && upper(event.setupClass) !== filters.setupClass) {
    return false;
  }

  if (filters.grade && eventGrade(event) !== filters.grade) {
    return false;
  }

  if (filters.regime && eventRegime(event) !== filters.regime) {
    return false;
  }

  if (filters.flow && eventFlow(event) !== filters.flow) {
    return false;
  }

  if (filters.btcState && eventBtcState(event) !== filters.btcState) {
    return false;
  }

  if (filters.rsiZone && upper(event.rsiZone) !== filters.rsiZone) {
    return false;
  }

  if (filters.rsiEdge && eventRsiEdge(event) !== filters.rsiEdge) {
    return false;
  }

  if (filters.obBias && upper(event.obBias) !== filters.obBias) {
    return false;
  }

  if (filters.obRelation && eventObRelation(event) !== filters.obRelation) {
    return false;
  }

  if (filters.spreadBucket && eventSpreadBucket(event) !== filters.spreadBucket) {
    return false;
  }

  if (filters.depthBucket && eventDepthBucket(event) !== filters.depthBucket) {
    return false;
  }

  if (filters.outcome && eventOutcome(event) !== filters.outcome) {
    return false;
  }

  const fromMs = parseDateMs(filters.from);
  const toMs = parseDateMs(filters.to);

  if (fromMs !== null && Number(event.ts || 0) < fromMs) {
    return false;
  }

  if (toMs !== null && Number(event.ts || 0) > toMs) {
    return false;
  }

  return true;
}

function wilsonLowerBound(wins: number, total: number): number {
  if (!total) return 0;

  const z = 1.96;
  const p = wins / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin =
    z *
    Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

  return Math.max(0, (center - margin) / denom);
}

function profitFactorFromEvents(events: NormalizedWebhookEvent[]): number | null {
  const exits = events.filter(event => eventType(event) === "EXIT");

  const rValues = exits
    .map(event => n(event.exitR, 0))
    .filter(Number.isFinite);

  const grossWin = rValues
    .filter(value => value > 0)
    .reduce((sum, value) => sum + value, 0);

  const grossLoss = Math.abs(
    rValues
      .filter(value => value < 0)
      .reduce((sum, value) => sum + value, 0)
  );

  if (!grossWin && !grossLoss) return null;
  if (!grossLoss) return 999;

  return round(grossWin / grossLoss, 3);
}

function summarizeExitEvents(events: NormalizedWebhookEvent[]) {
  const exits = events.filter(event => eventType(event) === "EXIT");

  const wins = exits.filter(event => n(event.exitR, 0) > 0).length;
  const losses = exits.filter(event => n(event.exitR, 0) < 0).length;
  const completed = wins + losses;

  const totalR = exits.reduce((sum, event) => sum + n(event.exitR, 0), 0);
  const pnlPct = exits.reduce((sum, event) => sum + n(event.pnlPct, 0), 0);

  const directSlCount = exits.filter(event => event.directToSL).length;
  const nearTpCount = exits.filter(event => event.nearTpSeen).length;

  return {
    exits: exits.length,
    closed: exits.length,
    wins,
    losses,
    winrate: completed ? wins / completed : 0,
    wilson: wilsonLowerBound(wins, completed),
    totalR: round(totalR, 3),
    avgR: exits.length ? round(totalR / exits.length, 3) : 0,
    pnlPct: round(pnlPct, 3),
    profitFactor: profitFactorFromEvents(exits),
    directSlPct: exits.length ? directSlCount / exits.length : 0,
    nearTpPct: exits.length ? nearTpCount / exits.length : 0
  };
}

function buildOverview(events: NormalizedWebhookEvent[]): Overview {
  const entries = events.filter(event => eventType(event) === "ENTRY");
  const exits = events.filter(event => eventType(event) === "EXIT");

  const stats = summarizeExitEvents(events);

  const openByTradeId = new Map<string, NormalizedWebhookEvent>();

  for (const entry of entries) {
    if (!entry.tradeId) continue;
    openByTradeId.set(entry.tradeId, entry);
  }

  for (const exit of exits) {
    if (!exit.tradeId) continue;
    openByTradeId.delete(exit.tradeId);
  }

  return {
    entries: entries.length,
    closed: exits.length,
    open: openByTradeId.size,
    winrate: stats.winrate,
    wilson: stats.wilson,
    totalR: stats.totalR,
    avgR: stats.avgR,
    pnlPct: stats.pnlPct,
    profitFactor: stats.profitFactor,
    directSlPct: stats.directSlPct,
    nearTpPct: stats.nearTpPct
  };
}

function buildOptions(events: NormalizedWebhookEvent[]): DashboardOptions {
  const strategies = uniqueSorted(events.map(event => event.strategyVersion));

  return {
    strategies,
    strategyVersions: strategies,
    symbols: uniqueSorted(events.map(event => event.symbol)),
    sides: uniqueSorted(events.map(event => event.side)),
    eventTypes: uniqueSorted(events.map(eventType)),
    reasons: uniqueSorted(events.map(event => event.reason)),
    setupClasses: uniqueSorted(events.map(event => event.setupClass)),
    grades: uniqueSorted(events.map(eventGrade)),
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

function getCohortKey(event: NormalizedWebhookEvent): string {
  return [
    `SETUP=${event.setupClass || "UNKNOWN"}`,
    `SIDE=${event.side || "unknown"}`,
    `RSI=${event.rsiZone || "UNKNOWN"}`,
    `EDGE=${eventRsiEdge(event)}`,
    `FLOW=${eventFlow(event)}`,
    `BTC=${eventBtcState(event)}`,
    `OB=${eventObRelation(event)}`,
    `SPREAD=${eventSpreadBucket(event)}`,
    `DEPTH=${eventDepthBucket(event)}`,
    `REASON=${event.reason || "UNKNOWN"}`
  ].join("|");
}

function scoreStats(stats: ReturnType<typeof summarizeExitEvents>, filters: DashboardFilters): number {
  const winrateWeight = n(filters.winrateWeight, 1);
  const pnlWeight = n(filters.pnlWeight, 1);
  const avgRWeight = n(filters.avgRWeight, 1);
  const totalRWeight = n(filters.totalRWeight, 1);
  const profitFactorWeight = n(filters.profitFactorWeight, 0.5);
  const directSlWeight = n(filters.directSlWeight, 1);
  const nearTpWeight = n(filters.nearTpWeight, 0.25);
  const wilsonWeight = n(filters.wilsonWeight, 0.5);

  const profitFactor = Math.min(n(stats.profitFactor, 0), 10);

  const score =
    stats.winrate * 100 * winrateWeight +
    stats.wilson * 100 * wilsonWeight +
    stats.pnlPct * pnlWeight +
    stats.avgR * 25 * avgRWeight +
    stats.totalR * 5 * totalRWeight +
    profitFactor * 5 * profitFactorWeight -
    stats.directSlPct * 100 * directSlWeight -
    stats.nearTpPct * 20 * nearTpWeight;

  return round(score, 3);
}

function buildCohorts(events: NormalizedWebhookEvent[], filters: DashboardFilters): CohortRow[] {
  const exits = events.filter(event => eventType(event) === "EXIT");
  const minTrades = Math.max(1, n(filters.minTrades, 1));
  const map = new Map<string, NormalizedWebhookEvent[]>();

  for (const event of exits) {
    const key = getCohortKey(event);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)!.push(event);
  }

  return Array.from(map.entries())
    .map(([cohortKey, rows]) => {
      const first = rows[0];
      const stats = summarizeExitEvents(rows);

      const row: CohortRow = {
        cohortKey,
        label: cohortKey,
        score: scoreStats(stats, filters),

        sample: rows.length,
        count: rows.length,
        trades: rows.length,
        ...stats,

        setupClass: first?.setupClass || "UNKNOWN",
        side: first?.side || "unknown",
        rsiZone: first?.rsiZone || "UNKNOWN",
        rsiEdge: first ? eventRsiEdge(first) : "UNKNOWN",
        flow: first ? eventFlow(first) : "UNKNOWN",
        btcState: first ? eventBtcState(first) : "UNKNOWN",
        regime: first ? eventRegime(first) : "UNKNOWN",
        obBias: first?.obBias || "UNKNOWN",
        obRelation: first ? eventObRelation(first) : "UNKNOWN",
        spreadBucket: first ? eventSpreadBucket(first) : "UNKNOWN",
        depthBucket: first ? eventDepthBucket(first) : "UNKNOWN",
        reason: first?.reason || "UNKNOWN",

        avgScore: round(rows.reduce((sum, rowItem) => sum + n(rowItem.score, 0), 0) / Math.max(1, rows.length), 1),
        avgConfluence: round(rows.reduce((sum, rowItem) => sum + n(rowItem.confluence, 0), 0) / Math.max(1, rows.length), 1),
        avgSniper: round(rows.reduce((sum, rowItem) => sum + n(rowItem.sniperScore, 0), 0) / Math.max(1, rows.length), 1),

        examples: rows
          .slice(-8)
          .map(rowItem => `${rowItem.symbol}_${rowItem.side}_${rowItem.reason}`)
          .join(", ")
      };

      return row;
    })
    .filter(row => row.trades >= minTrades)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      return b.trades - a.trades;
    })
    .slice(0, 100);
}

function buildBreakdownGroup(
  dimension: string,
  value: string,
  rows: NormalizedWebhookEvent[],
  total: number
): BreakdownRow {
  const entries = rows.filter(row => eventType(row) === "ENTRY").length;
  const exits = rows.filter(row => eventType(row) === "EXIT").length;
  const rejects = rows.filter(row => eventType(row) === "REJECT").length;
  const holds = rows.filter(row => eventType(row) === "HOLD").length;
  const snapshots = rows.filter(row => eventType(row) === "SNAPSHOT").length;

  const stats = summarizeExitEvents(rows);

  return {
    dimension,
    value,
    label: `${dimension}: ${value}`,

    count: rows.length,
    pct: total ? rows.length / total : 0,

    trades: rows.length,
    entries,
    exits,
    rejects,
    holds,
    snapshots,

    wins: stats.wins,
    losses: stats.losses,
    winrate: stats.winrate,
    wilson: stats.wilson,
    totalR: stats.totalR,
    avgR: stats.avgR,
    pnlPct: stats.pnlPct,
    profitFactor: stats.profitFactor,
    directSlPct: stats.directSlPct,
    nearTpPct: stats.nearTpPct,

    examples: rows
      .slice(-8)
      .map(row => `${row.symbol}_${row.side}_${eventType(row)}`)
      .join(", ")
  };
}

function buildBreakdown(events: NormalizedWebhookEvent[], filters: DashboardFilters): BreakdownRow[] {
  const total = events.length || 1;
  const minTrades = Math.max(1, n(filters.minTrades, 1));

  const groups: Array<{
    dimension: string;
    getter: (event: NormalizedWebhookEvent) => string;
  }> = [
    { dimension: "reason", getter: event => event.reason || "UNKNOWN" },
    { dimension: "eventType", getter: event => eventType(event) },
    { dimension: "setupClass", getter: event => event.setupClass || "UNKNOWN" },
    { dimension: "symbol", getter: event => event.symbol || "UNKNOWN" },
    { dimension: "side", getter: event => event.side || "unknown" },
    { dimension: "grade", getter: eventGrade },
    { dimension: "regime", getter: eventRegime },
    { dimension: "flow", getter: eventFlow },
    { dimension: "btcState", getter: eventBtcState },
    { dimension: "rsiZone", getter: event => event.rsiZone || "UNKNOWN" },
    { dimension: "rsiEdge", getter: eventRsiEdge },
    { dimension: "obBias", getter: event => event.obBias || "UNKNOWN" },
    { dimension: "obRelation", getter: eventObRelation },
    { dimension: "spreadBucket", getter: eventSpreadBucket },
    { dimension: "depthBucket", getter: eventDepthBucket }
  ];

  const output: BreakdownRow[] = [];

  for (const group of groups) {
    const map = new Map<string, NormalizedWebhookEvent[]>();

    for (const event of events) {
      const value = group.getter(event) || "UNKNOWN";

      if (!map.has(value)) {
        map.set(value, []);
      }

      map.get(value)!.push(event);
    }

    for (const [value, rows] of map.entries()) {
      if (rows.length < minTrades && group.dimension !== "reason") continue;
      output.push(buildBreakdownGroup(group.dimension, value, rows, total));
    }
  }

  return output
    .sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;

      return b.totalR - a.totalR;
    })
    .slice(0, 150);
}

function buildRecentTrades(events: NormalizedWebhookEvent[]): RecentTradeRow[] {
  return [...events]
    .sort((a, b) => n(b.ts, 0) - n(a.ts, 0))
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

      symbol: event.symbol,
      side: event.side,

      setupClass: event.setupClass,
      grade: event.grade,

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
      rsiZone: event.rsiZone,
      rsiEdge: eventRsiEdge(event),

      obBias: event.obBias,
      obRelation: eventObRelation(event),
      spreadPct: event.spreadPct,
      spreadBucket: eventSpreadBucket(event),
      depthMinUsd1p: event.depthMinUsd1p,
      depthBucket: eventDepthBucket(event),

      flow: eventFlow(event),
      btcState: eventBtcState(event),
      regime: eventRegime(event),

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

export async function getDashboardData(
  filters: DashboardFilters
): Promise<DashboardData> {
  const allEvents = await listTradeEvents();

  const filteredEvents = allEvents.filter(event =>
    eventPassesFilters(event, filters)
  );

  return {
    overview: buildOverview(filteredEvents),
    options: buildOptions(allEvents),
    cohorts: buildCohorts(filteredEvents, filters),
    breakdown: buildBreakdown(filteredEvents, filters),
    recentTrades: buildRecentTrades(filteredEvents),
    rawEvents: filteredEvents
  };
}