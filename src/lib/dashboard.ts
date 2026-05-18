import { listTradeEvents } from "./store";
import type { NormalizedWebhookEvent } from "./normalize";

export type SearchParams = Record<string, string | string[] | undefined>;

type AnyRecord = Record<string, unknown>;

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

export type ExitSummary = {
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
};

export type CohortRow = ExitSummary & {
  cohortKey: string;
  label: string;
  score: number;

  sample: number;
  count: number;
  trades: number;

  setupClass: string;
  side: string;
  reason: string;
  grade: string;

  rsiZone: string;
  rsiEdge: string;

  flow: string;
  btcState: string;
  regime: string;

  obBias: string;
  obRelation: string;

  spreadBucket: string;
  depthBucket: string;

  avgScore: number;
  avgConfluence: number;
  avgSniper: number;
};

export type BreakdownRow = ExitSummary & {
  dimension: string;
  value: string;
  reason: string;

  count: number;
  pct: number;
  trades: number;

  entries: number;
  exits: number;
  rejects: number;
  holds: number;
  snapshots: number;

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

function getValue(
  event: NormalizedWebhookEvent,
  paths: string[],
  fallback: unknown = null
): unknown {
  for (const path of paths) {
    const value = readPath(event, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
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
    from: one(params.from),
    to: one(params.to)
  };
}

function eventText(
  event: NormalizedWebhookEvent,
  paths: string[],
  fallback = "UNKNOWN"
): string {
  return upper(getValue(event, paths, fallback)) || fallback;
}

function eventGrade(event: NormalizedWebhookEvent): string {
  return upper(event.grade || getValue(event, ["payload.grade"], "UNKNOWN")) || "UNKNOWN";
}

function eventFlow(event: NormalizedWebhookEvent): string {
  return eventText(event, [
    "flow",
    "payload.flow",
    "liveFilterMetrics.flow",
    "payload.liveFilterMetrics.flow"
  ]);
}

function eventBtcState(event: NormalizedWebhookEvent): string {
  return eventText(event, [
    "btcState",
    "payload.btcState",
    "liveFilterMetrics.btcState",
    "payload.liveFilterMetrics.btcState"
  ]);
}

function eventRegime(event: NormalizedWebhookEvent): string {
  return eventText(event, [
    "regime",
    "payload.regime",
    "liveFilterMetrics.regime",
    "payload.liveFilterMetrics.regime"
  ]);
}

function eventRsiEdge(event: NormalizedWebhookEvent): string {
  return eventText(event, [
    "rsiEdge",
    "payload.rsiEdge",
    "rsiEntryEdge",
    "payload.rsiEntryEdge"
  ]);
}

function eventObBias(event: NormalizedWebhookEvent): string {
  return eventText(event, [
    "obBias",
    "payload.obBias",
    "liveFilterMetrics.obBias",
    "payload.liveFilterMetrics.obBias"
  ]);
}

function eventObRelation(event: NormalizedWebhookEvent): string {
  const explicit = eventText(event, [
    "obRelation",
    "payload.obRelation",
    "obSideRelation",
    "payload.obSideRelation"
  ], "");

  if (explicit) return explicit;

  const side = lower(event.side);
  const obBias = eventObBias(event);

  if (["NEUTRAL", "UNKNOWN", ""].includes(obBias)) return "NEUTRAL";

  if (side === "bull" && obBias === "BULLISH") return "WITH";
  if (side === "bear" && obBias === "BEARISH") return "WITH";

  if (side === "bull" && obBias === "BEARISH") return "AGAINST";
  if (side === "bear" && obBias === "BULLISH") return "AGAINST";

  return "UNKNOWN";
}

function eventSpreadBucket(event: NormalizedWebhookEvent): string {
  const explicit = eventText(event, [
    "spreadBucket",
    "payload.spreadBucket"
  ], "");

  if (explicit) return explicit;

  const spreadPct = n(getValue(event, [
    "spreadPct",
    "payload.spreadPct",
    "liveFilterMetrics.spreadPct",
    "payload.liveFilterMetrics.spreadPct"
  ]), NaN);

  if (!Number.isFinite(spreadPct)) return "SPREAD_NA";

  const bps = spreadPct * 10000;

  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 25) return "SPREAD_12_25BPS";

  return "SPREAD_GTE_25BPS";
}

function eventDepthBucket(event: NormalizedWebhookEvent): string {
  const explicit = eventText(event, [
    "depthBucket",
    "payload.depthBucket"
  ], "");

  if (explicit) return explicit;

  const depth = n(getValue(event, [
    "depthMinUsd1p",
    "payload.depthMinUsd1p",
    "liveFilterMetrics.depthMinUsd1p",
    "payload.liveFilterMetrics.depthMinUsd1p"
  ]), NaN);

  if (!Number.isFinite(depth)) return "DEPTH_NA";

  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

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

  if (filters.obBias && eventObBias(event) !== filters.obBias) {
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

    grades: uniqueSorted(events.map(event => eventGrade(event))),
    regimes: uniqueSorted(events.map(event => eventRegime(event))),
    flows: uniqueSorted(events.map(event => eventFlow(event))),
    btcStates: uniqueSorted(events.map(event => eventBtcState(event))),

    rsiZones: uniqueSorted(events.map(event => event.rsiZone)),
    rsiEdges: uniqueSorted(events.map(event => eventRsiEdge(event))),

    obBiases: uniqueSorted(events.map(event => eventObBias(event))),
    obRelations: uniqueSorted(events.map(event => eventObRelation(event))),

    spreadBuckets: uniqueSorted(events.map(event => eventSpreadBucket(event))),
    depthBuckets: uniqueSorted(events.map(event => eventDepthBucket(event)))
  };
}

function summarizeExitEvents(events: NormalizedWebhookEvent[]): ExitSummary {
  const exits = events.filter(event => event.eventType === "EXIT");

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

function getCohortKey(event: NormalizedWebhookEvent): string {
  return [
    `SETUP=${event.setupClass || "UNKNOWN"}`,
    `GRADE=${eventGrade(event)}`,
    `SIDE=${event.side || "unknown"}`,
    `REASON=${event.reason || "UNKNOWN"}`,
    `RSI=${event.rsiZone || "UNKNOWN"}`,
    `EDGE=${eventRsiEdge(event)}`,
    `FLOW=${eventFlow(event)}`,
    `BTC=${eventBtcState(event)}`,
    `REGIME=${eventRegime(event)}`,
    `OB=${eventObRelation(event)}`,
    eventSpreadBucket(event),
    eventDepthBucket(event)
  ].join("|");
}

function scoreCohort(stats: ExitSummary, sample: number): number {
  const sampleWeight = Math.min(1, sample / 30);
  const profitFactor = stats.profitFactor === null ? 0 : Math.min(stats.profitFactor, 5);

  const rawScore =
    stats.winrate * 35 +
    stats.wilson * 25 +
    stats.avgR * 18 +
    stats.totalR * 2 +
    profitFactor * 4 -
    stats.directSlPct * 18 +
    stats.nearTpPct * 4;

  return round(rawScore * sampleWeight, 2);
}

function buildCohorts(events: NormalizedWebhookEvent[]): CohortRow[] {
  const exits = events.filter(event => event.eventType === "EXIT");
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

      return {
        cohortKey,
        label: cohortKey,
        score: scoreCohort(stats, rows.length),

        sample: rows.length,
        count: rows.length,
        trades: rows.length,

        setupClass: first?.setupClass || "UNKNOWN",
        side: first?.side || "unknown",
        reason: first?.reason || "UNKNOWN",
        grade: first ? eventGrade(first) : "UNKNOWN",

        rsiZone: first?.rsiZone || "UNKNOWN",
        rsiEdge: first ? eventRsiEdge(first) : "UNKNOWN",

        flow: first ? eventFlow(first) : "UNKNOWN",
        btcState: first ? eventBtcState(first) : "UNKNOWN",
        regime: first ? eventRegime(first) : "UNKNOWN",

        obBias: first ? eventObBias(first) : "UNKNOWN",
        obRelation: first ? eventObRelation(first) : "UNKNOWN",

        spreadBucket: first ? eventSpreadBucket(first) : "SPREAD_NA",
        depthBucket: first ? eventDepthBucket(first) : "DEPTH_NA",

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
    .sort((a, b) => {
      const scoreDiff = n(b.score, 0) - n(a.score, 0);
      if (scoreDiff !== 0) return scoreDiff;

      const totalRDiff = n(b.totalR, 0) - n(a.totalR, 0);
      if (totalRDiff !== 0) return totalRDiff;

      return n(b.trades, 0) - n(a.trades, 0);
    })
    .slice(0, 100);
}

function makeBreakdownRows(
  events: NormalizedWebhookEvent[],
  dimension: string,
  getRowValue: (event: NormalizedWebhookEvent) => string | null | undefined
): BreakdownRow[] {
  const total = events.length || 1;
  const map = new Map<string, NormalizedWebhookEvent[]>();

  for (const event of events) {
    const value = String(getRowValue(event) || "UNKNOWN").trim() || "UNKNOWN";

    if (!map.has(value)) {
      map.set(value, []);
    }

    map.get(value)!.push(event);
  }

  return Array.from(map.entries()).map(([value, rows]) => {
    const entries = rows.filter(row => row.eventType === "ENTRY").length;
    const exits = rows.filter(row => row.eventType === "EXIT").length;
    const rejects = rows.filter(row => row.eventType === "REJECT").length;
    const holds = rows.filter(row => row.eventType === "HOLD").length;
    const snapshots = rows.filter(row => row.eventType === "SNAPSHOT").length;

    const stats = summarizeExitEvents(rows);

    return {
      dimension,
      value,
      reason: value,

      count: rows.length,
      pct: rows.length / total,
      trades: exits,

      entries,
      exits,
      rejects,
      holds,
      snapshots,

      examples: rows
        .slice(-8)
        .map(row => `${row.symbol}_${row.side}_${row.eventType}`)
        .join(", "),

      ...stats
    };
  });
}

function buildBreakdown(events: NormalizedWebhookEvent[]): BreakdownRow[] {
  return [
    ...makeBreakdownRows(events, "reason", event => event.reason),
    ...makeBreakdownRows(events, "eventType", event => event.eventType),
    ...makeBreakdownRows(events, "setupClass", event => event.setupClass),
    ...makeBreakdownRows(events, "grade", event => eventGrade(event)),
    ...makeBreakdownRows(events, "side", event => event.side),
    ...makeBreakdownRows(events, "rsiZone", event => event.rsiZone),
    ...makeBreakdownRows(events, "rsiEdge", event => eventRsiEdge(event)),
    ...makeBreakdownRows(events, "flow", event => eventFlow(event)),
    ...makeBreakdownRows(events, "btcState", event => eventBtcState(event)),
    ...makeBreakdownRows(events, "regime", event => eventRegime(event)),
    ...makeBreakdownRows(events, "obBias", event => eventObBias(event)),
    ...makeBreakdownRows(events, "obRelation", event => eventObRelation(event)),
    ...makeBreakdownRows(events, "spreadBucket", event => eventSpreadBucket(event)),
    ...makeBreakdownRows(events, "depthBucket", event => eventDepthBucket(event)),
    ...makeBreakdownRows(events, "symbol", event => event.symbol)
  ]
    .sort((a, b) => {
      const countDiff = n(b.count, 0) - n(a.count, 0);
      if (countDiff !== 0) return countDiff;

      return n(b.totalR, 0) - n(a.totalR, 0);
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
    cohorts: buildCohorts(filteredEvents),
    breakdown: buildBreakdown(filteredEvents),
    recentTrades: buildRecentTrades(filteredEvents),
    rawEvents: filteredEvents
  };
}