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

  from: string;
  to: string;

  minTrades: number;
  winrateWeight: number;
  pnlWeight: number;
  avgRWeight: number;
  totalRWeight: number;
  profitFactorWeight: number;
  directSlPenalty: number;
  nearTpWeight: number;
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
  outcomes: string[];
};

export type CohortRow = {
  cohortKey: string;
  label: string;
  sample: number;
  count: number;
  trades: number;
  closed: number;

  score: number;

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
  grade: string;

  entries: number;
  exits: number;
  rejects: number;
  snapshots: number;
  holds: number;

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

  avgScore: number;
  avgConfluence: number;
  avgSniper: number;
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
  closed: number;
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

  obBias: string | null;
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

type SummaryStats = {
  trades: number;
  entries: number;
  exits: number;
  closed: number;
  rejects: number;
  snapshots: number;
  holds: number;

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
};

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
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

function parseNumberParam(
  value: string | string[] | undefined,
  fallback: number
): number {
  const raw = one(value);
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
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

    minTrades: parseNumberParam(params.minTrades, 1),
    winrateWeight: parseNumberParam(params.winrateWeight, 35),
    pnlWeight: parseNumberParam(params.pnlWeight, 20),
    avgRWeight: parseNumberParam(params.avgRWeight, 25),
    totalRWeight: parseNumberParam(params.totalRWeight, 15),
    profitFactorWeight: parseNumberParam(params.profitFactorWeight, 10),
    directSlPenalty: parseNumberParam(params.directSlPenalty, 25),
    nearTpWeight: parseNumberParam(params.nearTpWeight, 5)
  };
}

function isWin(event: NormalizedWebhookEvent): boolean {
  return n(event.exitR, 0) > 0 || n(event.pnlPct, 0) > 0;
}

function isLoss(event: NormalizedWebhookEvent): boolean {
  return n(event.exitR, 0) < 0 || n(event.pnlPct, 0) < 0;
}

function payloadText(event: NormalizedWebhookEvent, key: string, fallback = "UNKNOWN"): string {
  const value = event.payload?.[key];
  const text = String(value || "").trim();

  return text || fallback;
}

function eventRegime(event: NormalizedWebhookEvent): string {
  return upper(payloadText(event, "regime"));
}

function eventFlow(event: NormalizedWebhookEvent): string {
  return upper(payloadText(event, "flow"));
}

function eventBtcState(event: NormalizedWebhookEvent): string {
  return upper(payloadText(event, "btcState"));
}

function eventRsiEdge(event: NormalizedWebhookEvent): string {
  return upper(payloadText(event, "rsiEdge"));
}

function eventObRelation(event: NormalizedWebhookEvent): string {
  const explicit = upper(payloadText(event, "obRelation", ""));
  if (explicit) return explicit;

  const side = lower(event.side);
  const obBias = upper(event.obBias);

  if (["NEUTRAL", "UNKNOWN", ""].includes(obBias)) return "NEUTRAL";
  if (side === "bull" && obBias === "BULLISH") return "WITH";
  if (side === "bear" && obBias === "BEARISH") return "WITH";
  if (side === "bull" && obBias === "BEARISH") return "AGAINST";
  if (side === "bear" && obBias === "BULLISH") return "AGAINST";

  return "UNKNOWN";
}

function spreadBucket(value: number | null): string {
  if (value === null) return "SPREAD_NA";

  const bps = value * 10000;

  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 25) return "SPREAD_12_25BPS";

  return "SPREAD_GTE_25BPS";
}

function depthBucket(value: number | null): string {
  if (value === null) return "DEPTH_NA";

  if (value < 50_000) return "DEPTH_LT_50K";
  if (value < 100_000) return "DEPTH_50K_100K";
  if (value < 200_000) return "DEPTH_100K_200K";
  if (value < 500_000) return "DEPTH_200K_500K";
  if (value < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
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

  if (filters.eventType && upper(event.eventType) !== filters.eventType) {
    return false;
  }

  if (filters.reason && upper(event.reason) !== filters.reason) {
    return false;
  }

  if (filters.setupClass && upper(event.setupClass) !== filters.setupClass) {
    return false;
  }

  if (filters.grade && upper(event.grade) !== filters.grade) {
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

  if (filters.spreadBucket && spreadBucket(event.spreadPct) !== filters.spreadBucket) {
    return false;
  }

  if (filters.depthBucket && depthBucket(event.depthMinUsd1p) !== filters.depthBucket) {
    return false;
  }

  if (filters.outcome) {
    if (filters.outcome === "WIN" && !isWin(event)) return false;
    if (filters.outcome === "LOSS" && !isLoss(event)) return false;
    if (filters.outcome === "FLAT" && (isWin(event) || isLoss(event))) return false;
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
  const exits = events.filter(event => event.eventType === "EXIT");
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

function summarizeEvents(events: NormalizedWebhookEvent[]): SummaryStats {
  const entries = events.filter(event => event.eventType === "ENTRY").length;
  const exits = events.filter(event => event.eventType === "EXIT").length;
  const rejects = events.filter(event => event.eventType === "REJECT").length;
  const snapshots = events.filter(event => event.eventType === "SNAPSHOT").length;
  const holds = events.filter(event => event.eventType === "HOLD").length;

  const exitRows = events.filter(event => event.eventType === "EXIT");

  const wins = exitRows.filter(event => n(event.exitR, 0) > 0).length;
  const losses = exitRows.filter(event => n(event.exitR, 0) < 0).length;
  const completed = wins + losses;

  const totalR = exitRows.reduce((sum, event) => sum + n(event.exitR, 0), 0);
  const pnlPct = exitRows.reduce((sum, event) => sum + n(event.pnlPct, 0), 0);

  const directSlCount = exitRows.filter(event => event.directToSL).length;
  const nearTpCount = exitRows.filter(event => event.nearTpSeen).length;

  return {
    trades: events.length,
    entries,
    exits,
    closed: exits,
    rejects,
    snapshots,
    holds,

    wins,
    losses,
    winrate: completed ? wins / completed : 0,
    wilson: wilsonLowerBound(wins, completed),

    totalR: round(totalR, 3),
    avgR: exits ? round(totalR / exits, 3) : 0,
    pnlPct: round(pnlPct, 3),
    profitFactor: profitFactorFromEvents(events),

    directSlPct: exits ? directSlCount / exits : 0,
    nearTpPct: exits ? nearTpCount / exits : 0
  };
}

function buildOverview(events: NormalizedWebhookEvent[]): Overview {
  const entries = events.filter(event => event.eventType === "ENTRY");
  const exits = events.filter(event => event.eventType === "EXIT");

  const wins = exits.filter(event => n(event.exitR, 0) > 0).length;
  const losses = exits.filter(event => n(event.exitR, 0) < 0).length;
  const completed = wins + losses;

  const totalR = exits.reduce((sum, event) => sum + n(event.exitR, 0), 0);
  const pnlPct = exits.reduce((sum, event) => sum + n(event.pnlPct, 0), 0);

  const directSlCount = exits.filter(event => event.directToSL).length;
  const nearTpCount = exits.filter(event => event.nearTpSeen).length;

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
    winrate: completed ? wins / completed : 0,
    wilson: wilsonLowerBound(wins, completed),
    totalR: round(totalR, 3),
    avgR: exits.length ? round(totalR / exits.length, 3) : 0,
    pnlPct: round(pnlPct, 3),
    profitFactor: profitFactorFromEvents(events),
    directSlPct: exits.length ? directSlCount / exits.length : 0,
    nearTpPct: exits.length ? nearTpCount / exits.length : 0
  };
}

function buildOptions(events: NormalizedWebhookEvent[]): DashboardOptions {
  const strategies = uniqueSorted(events.map(event => event.strategyVersion));

  return {
    strategies,
    strategyVersions: strategies,
    symbols: uniqueSorted(events.map(event => event.symbol)),
    sides: uniqueSorted(events.map(event => event.side)),
    eventTypes: uniqueSorted(events.map(event => event.eventType)),
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
    spreadBuckets: uniqueSorted(events.map(event => spreadBucket(event.spreadPct))),
    depthBuckets: uniqueSorted(events.map(event => depthBucket(event.depthMinUsd1p))),
    outcomes: ["WIN", "LOSS", "FLAT"]
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
    `OB_REL=${eventObRelation(event)}`,
    `SPREAD=${spreadBucket(event.spreadPct)}`,
    `DEPTH=${depthBucket(event.depthMinUsd1p)}`,
    `REASON=${event.reason || "UNKNOWN"}`
  ].join("|");
}

function scoreCohort(stats: SummaryStats, filters: DashboardFilters): number {
  const winrateScore = stats.winrate * filters.winrateWeight;
  const pnlScore = stats.pnlPct * filters.pnlWeight;
  const avgRScore = stats.avgR * filters.avgRWeight;
  const totalRScore = stats.totalR * filters.totalRWeight;
  const pfScore = (stats.profitFactor || 0) * filters.profitFactorWeight;
  const nearTpScore = stats.nearTpPct * filters.nearTpWeight;
  const directSlPenalty = stats.directSlPct * filters.directSlPenalty;

  return round(
    winrateScore +
      pnlScore +
      avgRScore +
      totalRScore +
      pfScore +
      nearTpScore -
      directSlPenalty,
    3
  );
}

function buildCohorts(
  events: NormalizedWebhookEvent[],
  filters: DashboardFilters
): CohortRow[] {
  const exits = events.filter(event => event.eventType === "EXIT");
  const map = new Map<string, NormalizedWebhookEvent[]>();

  for (const event of exits) {
    const key = event.cohortKey || getCohortKey(event);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)!.push(event);
  }

  return Array.from(map.entries())
    .map(([cohortKey, rows]) => {
      const first = rows[0];
      const stats = summarizeEvents(rows);

      return {
        cohortKey,
        label: cohortKey,
        sample: rows.length,
        count: rows.length,

        score: scoreCohort(stats, filters),

        setupClass: first?.setupClass || "UNKNOWN",
        side: first?.side || "unknown",
        rsiZone: first?.rsiZone || "UNKNOWN",
        rsiEdge: first ? eventRsiEdge(first) : "UNKNOWN",
        flow: first ? eventFlow(first) : "UNKNOWN",
        btcState: first ? eventBtcState(first) : "UNKNOWN",
        regime: first ? eventRegime(first) : "UNKNOWN",
        obBias: first?.obBias || "UNKNOWN",
        obRelation: first ? eventObRelation(first) : "UNKNOWN",
        spreadBucket: first ? spreadBucket(first.spreadPct) : "SPREAD_NA",
        depthBucket: first ? depthBucket(first.depthMinUsd1p) : "DEPTH_NA",
        reason: first?.reason || "UNKNOWN",
        grade: first?.grade || "UNKNOWN",

        avgScore: round(
          rows.reduce((sum, row) => sum + n(row.score, 0), 0) / Math.max(1, rows.length),
          1
        ),
        avgConfluence: round(
          rows.reduce((sum, row) => sum + n(row.confluence, 0), 0) / Math.max(1, rows.length),
          1
        ),
        avgSniper: round(
          rows.reduce((sum, row) => sum + n(row.sniperScore, 0), 0) / Math.max(1, rows.length),
          1
        ),

        ...stats
      };
    })
    .filter(row => row.closed >= filters.minTrades)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      return b.closed - a.closed;
    })
    .slice(0, 100);
}

function buildBreakdownGroup(
  dimension: string,
  value: string,
  rows: NormalizedWebhookEvent[],
  total: number
): BreakdownRow {
  const stats = summarizeEvents(rows);

  return {
    dimension,
    value,
    label: `${dimension}: ${value}`,

    count: rows.length,
    pct: rows.length / Math.max(1, total),

    examples: rows
      .slice(-8)
      .map(row => `${row.symbol}_${row.side}_${row.eventType}`)
      .join(", "),

    ...stats
  };
}

function buildBreakdown(events: NormalizedWebhookEvent[]): BreakdownRow[] {
  const total = events.length || 1;

  const dimensions: Array<{
    dimension: string;
    getter: (event: NormalizedWebhookEvent) => string;
  }> = [
    { dimension: "reason", getter: event => event.reason || "UNKNOWN" },
    { dimension: "eventType", getter: event => event.eventType || "UNKNOWN" },
    { dimension: "setupClass", getter: event => event.setupClass || "UNKNOWN" },
    { dimension: "side", getter: event => event.side || "unknown" },
    { dimension: "grade", getter: event => event.grade || "UNKNOWN" },
    { dimension: "rsiZone", getter: event => event.rsiZone || "UNKNOWN" },
    { dimension: "rsiEdge", getter: event => eventRsiEdge(event) },
    { dimension: "flow", getter: event => eventFlow(event) },
    { dimension: "btcState", getter: event => eventBtcState(event) },
    { dimension: "regime", getter: event => eventRegime(event) },
    { dimension: "obBias", getter: event => event.obBias || "UNKNOWN" },
    { dimension: "obRelation", getter: event => eventObRelation(event) },
    { dimension: "spreadBucket", getter: event => spreadBucket(event.spreadPct) },
    { dimension: "depthBucket", getter: event => depthBucket(event.depthMinUsd1p) }
  ];

  const result: BreakdownRow[] = [];

  for (const item of dimensions) {
    const map = new Map<string, NormalizedWebhookEvent[]>();

    for (const event of events) {
      const value = item.getter(event) || "UNKNOWN";

      if (!map.has(value)) {
        map.set(value, []);
      }

      map.get(value)!.push(event);
    }

    for (const [value, rows] of map.entries()) {
      result.push(buildBreakdownGroup(item.dimension, value, rows, total));
    }
  }

  return result
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

      eventType: event.eventType,
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

      obBias: event.obBias,
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
    breakdown: buildBreakdown(filteredEvents),
    recentTrades: buildRecentTrades(filteredEvents),
    rawEvents: filteredEvents
  };
}