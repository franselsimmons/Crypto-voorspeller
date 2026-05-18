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
};

export type CohortRow = {
  cohortKey: string;
  label: string;
  score: number;

  sample: number;
  count: number;
  trades: number;
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
  avgRR: number;
};

export type BreakdownRow = {
  dimension: string;
  value: string;

  count: number;
  pct: number;

  trades: number;
  closed: number;
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
  depthMinUsd1p: number | null;
  spreadBucket: string;
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

type EventRecord = NormalizedWebhookEvent & Record<string, unknown>;

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

  const cleaned =
    typeof value === "string"
      ? value.replace("%", "").replace(",", ".").trim()
      : value;

  const num = Number(cleaned);
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

function numParam(value: string | string[] | undefined, fallback: number): number {
  const parsed = n(one(value), fallback);
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

    minTrades: numParam(params.minTrades, 1),
    winrateWeight: numParam(params.winrateWeight, 100),
    pnlWeight: numParam(params.pnlWeight, 6),
    avgRWeight: numParam(params.avgRWeight, 45),
    totalRWeight: numParam(params.totalRWeight, 0.15),
    directSlPenalty: numParam(params.directSlPenalty, 35),
    nearTpWeight: numParam(params.nearTpWeight, 8)
  };
}

function payload(event: NormalizedWebhookEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object" ? event.payload : {};
}

function eventValue(event: NormalizedWebhookEvent, keys: string[], fallback: unknown = ""): unknown {
  const record = event as EventRecord;
  const pay = payload(event);

  for (const key of keys) {
    const direct = record[key];

    if (direct !== undefined && direct !== null && direct !== "") {
      return direct;
    }

    const fromPayload = pay[key];

    if (fromPayload !== undefined && fromPayload !== null && fromPayload !== "") {
      return fromPayload;
    }
  }

  return fallback;
}

function eventText(event: NormalizedWebhookEvent, keys: string[], fallback = "UNKNOWN"): string {
  const value = eventValue(event, keys, fallback);
  const text = String(value || "").trim();
  return text ? text.toUpperCase() : fallback;
}

function eventNumber(event: NormalizedWebhookEvent, keys: string[], fallback = 0): number {
  return n(eventValue(event, keys, fallback), fallback);
}

function eventType(event: NormalizedWebhookEvent): string {
  const value = upper(event.eventType || event.action);

  if (value === "WAIT") return "REJECT";
  if (value === "HOLD") return "SNAPSHOT";

  return value || "UNKNOWN";
}

function eventGrade(event: NormalizedWebhookEvent): string {
  return eventText(event, ["grade"], "UNKNOWN");
}

function eventRegime(event: NormalizedWebhookEvent): string {
  return eventText(event, ["regime"], "UNKNOWN");
}

function eventFlow(event: NormalizedWebhookEvent): string {
  return eventText(event, ["flow"], "UNKNOWN");
}

function eventBtcState(event: NormalizedWebhookEvent): string {
  return eventText(event, ["btcState"], "UNKNOWN");
}

function eventRsiEdge(event: NormalizedWebhookEvent): string {
  return eventText(event, ["rsiEdge", "rsiEntryEdge"], "UNKNOWN");
}

function eventObRelation(event: NormalizedWebhookEvent): string {
  const explicit = eventText(event, ["obRelation", "obSideRelation"], "");

  if (explicit) return explicit;

  const side = lower(event.side);
  const obBias = upper(event.obBias);

  if (!side || !obBias || obBias === "UNKNOWN" || obBias === "NEUTRAL") return "NEUTRAL";

  if (side === "bull" && obBias === "BULLISH") return "WITH";
  if (side === "bear" && obBias === "BEARISH") return "WITH";

  if (side === "bull" && obBias === "BEARISH") return "AGAINST";
  if (side === "bear" && obBias === "BULLISH") return "AGAINST";

  return "NEUTRAL";
}

function spreadBucketFromPct(spreadPct: unknown): string {
  const spread = nullableNumber(spreadPct);

  if (spread === null) return "SPREAD_NA";

  const bps = spread * 10000;

  if (bps < 2) return "SPREAD_LT_2BPS";
  if (bps < 5) return "SPREAD_2_5BPS";
  if (bps < 8) return "SPREAD_5_8BPS";
  if (bps < 12) return "SPREAD_8_12BPS";
  if (bps < 25) return "SPREAD_12_25BPS";

  return "SPREAD_GTE_25BPS";
}

function depthBucketFromUsd(depthValue: unknown): string {
  const depth = nullableNumber(depthValue);

  if (depth === null) return "DEPTH_NA";
  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function eventSpreadBucket(event: NormalizedWebhookEvent): string {
  const explicit = eventText(event, ["spreadBucket"], "");

  if (explicit) return explicit;

  return spreadBucketFromPct(event.spreadPct);
}

function eventDepthBucket(event: NormalizedWebhookEvent): string {
  const explicit = eventText(event, ["depthBucket"], "");

  if (explicit) return explicit;

  return depthBucketFromUsd(event.depthMinUsd1p);
}

function eventOutcome(event: NormalizedWebhookEvent): string {
  if (eventType(event) !== "EXIT") return "";

  const exitR = n(event.exitR, 0);
  const pnlPct = n(event.pnlPct, 0);

  if (exitR > 0 || pnlPct > 0) return "WIN";
  if (exitR < 0 || pnlPct < 0) return "LOSS";

  return "FLAT";
}

function eventPassesFilters(
  event: NormalizedWebhookEvent,
  filters: DashboardFilters
): boolean {
  if (filters.strategyVersion && event.strategyVersion !== filters.strategyVersion) return false;
  if (filters.symbol && upper(event.symbol) !== upper(filters.symbol)) return false;
  if (filters.side && lower(event.side) !== filters.side) return false;
  if (filters.eventType && eventType(event) !== filters.eventType) return false;
  if (filters.reason && upper(event.reason) !== filters.reason) return false;
  if (filters.setupClass && upper(event.setupClass) !== filters.setupClass) return false;

  if (filters.grade && eventGrade(event) !== filters.grade) return false;
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
  const margin =
    z *
    Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

  return Math.max(0, (center - margin) / denom);
}

function profitFactorFromEvents(events: NormalizedWebhookEvent[]): number | null {
  const exits = events.filter(event => eventType(event) === "EXIT");
  const rValues = exits.map(event => n(event.exitR, 0)).filter(Number.isFinite);

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

  const wins = exits.filter(event => n(event.exitR, 0) > 0 || n(event.pnlPct, 0) > 0).length;
  const losses = exits.filter(event => n(event.exitR, 0) < 0 || n(event.pnlPct, 0) < 0).length;
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

  const openByTradeId = new Map<string, NormalizedWebhookEvent>();

  for (const entry of entries) {
    if (!entry.tradeId) continue;
    openByTradeId.set(entry.tradeId, entry);
  }

  for (const exit of exits) {
    if (!exit.tradeId) continue;
    openByTradeId.delete(exit.tradeId);
  }

  const stats = summarizeExitEvents(events);

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
    eventTypes: uniqueSorted(events.map(event => eventType(event))),
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
    `REASON=${event.reason || "UNKNOWN"}`,
    `RSI=${event.rsiZone || "UNKNOWN"}`,
    `EDGE=${eventRsiEdge(event)}`,
    `FLOW=${eventFlow(event)}`,
    `BTC=${eventBtcState(event)}`,
    `OB=${eventObRelation(event)}`,
    `SPREAD=${eventSpreadBucket(event)}`,
    `DEPTH=${eventDepthBucket(event)}`
  ].join("|");
}

function scoreCohort(
  stats: ReturnType<typeof summarizeExitEvents>,
  rows: NormalizedWebhookEvent[],
  filters: DashboardFilters
): number {
  if (rows.length < filters.minTrades) return -999999;

  const score =
    stats.winrate * filters.winrateWeight +
    stats.pnlPct * filters.pnlWeight +
    stats.avgR * filters.avgRWeight +
    stats.totalR * filters.totalRWeight -
    stats.directSlPct * filters.directSlPenalty +
    stats.nearTpPct * filters.nearTpWeight;

  return round(score, 3);
}

function buildCohorts(events: NormalizedWebhookEvent[], filters: DashboardFilters): CohortRow[] {
  const exits = events.filter(event => eventType(event) === "EXIT");
  const map = new Map<string, NormalizedWebhookEvent[]>();

  for (const event of exits) {
    const key = getCohortKey(event);

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
  }

  return Array.from(map.entries())
    .map(([cohortKey, rows]) => {
      const first = rows[0];
      const stats = summarizeExitEvents(rows);

      return {
        cohortKey,
        label: cohortKey,
        score: scoreCohort(stats, rows, filters),

        sample: rows.length,
        count: rows.length,
        trades: rows.length,
        closed: stats.closed,

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

        setupClass: first?.setupClass || "UNKNOWN",
        side: first?.side || "unknown",
        reason: first?.reason || "UNKNOWN",
        grade: eventGrade(first),

        rsiZone: first?.rsiZone || "UNKNOWN",
        rsiEdge: eventRsiEdge(first),
        flow: eventFlow(first),
        btcState: eventBtcState(first),
        regime: eventRegime(first),

        obBias: first?.obBias || "UNKNOWN",
        obRelation: eventObRelation(first),
        spreadBucket: eventSpreadBucket(first),
        depthBucket: eventDepthBucket(first),

        avgScore: round(rows.reduce((sum, row) => sum + n(row.score, 0), 0) / Math.max(1, rows.length), 1),
        avgConfluence: round(rows.reduce((sum, row) => sum + n(row.confluence, 0), 0) / Math.max(1, rows.length), 1),
        avgSniper: round(rows.reduce((sum, row) => sum + n(row.sniperScore, 0), 0) / Math.max(1, rows.length), 1),
        avgRR: round(rows.reduce((sum, row) => sum + n(row.finalRr ?? row.plannedRR ?? row.rr, 0), 0) / Math.max(1, rows.length), 2)
      };
    })
    .filter(row => row.trades >= filters.minTrades)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const totalRDiff = b.totalR - a.totalR;
      if (totalRDiff !== 0) return totalRDiff;

      return b.trades - a.trades;
    })
    .slice(0, 150);
}

function buildBreakdownDimension(
  events: NormalizedWebhookEvent[],
  dimension: string,
  getter: (event: NormalizedWebhookEvent) => string
): BreakdownRow[] {
  const total = events.length || 1;
  const map = new Map<string, NormalizedWebhookEvent[]>();

  for (const event of events) {
    const key = getter(event) || "UNKNOWN";

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
  }

  return Array.from(map.entries()).map(([value, rows]) => {
    const stats = summarizeExitEvents(rows);

    return {
      dimension,
      value,

      count: rows.length,
      pct: rows.length / total,

      trades: rows.length,
      closed: stats.closed,
      entries: rows.filter(row => eventType(row) === "ENTRY").length,
      exits: rows.filter(row => eventType(row) === "EXIT").length,
      rejects: rows.filter(row => eventType(row) === "REJECT").length,
      snapshots: rows.filter(row => eventType(row) === "SNAPSHOT").length,
      holds: rows.filter(row => eventType(row) === "HOLD").length,

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
  });
}

function buildBreakdown(events: NormalizedWebhookEvent[]): BreakdownRow[] {
  return [
    ...buildBreakdownDimension(events, "reason", event => event.reason || "UNKNOWN"),
    ...buildBreakdownDimension(events, "setupClass", event => event.setupClass || "UNKNOWN"),
    ...buildBreakdownDimension(events, "side", event => event.side || "unknown"),
    ...buildBreakdownDimension(events, "grade", eventGrade),
    ...buildBreakdownDimension(events, "rsiZone", event => event.rsiZone || "UNKNOWN"),
    ...buildBreakdownDimension(events, "rsiEdge", eventRsiEdge),
    ...buildBreakdownDimension(events, "flow", eventFlow),
    ...buildBreakdownDimension(events, "btcState", eventBtcState),
    ...buildBreakdownDimension(events, "regime", eventRegime),
    ...buildBreakdownDimension(events, "obBias", event => event.obBias || "UNKNOWN"),
    ...buildBreakdownDimension(events, "obRelation", eventObRelation),
    ...buildBreakdownDimension(events, "spreadBucket", eventSpreadBucket),
    ...buildBreakdownDimension(events, "depthBucket", eventDepthBucket)
  ]
    .sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;

      return b.totalR - a.totalR;
    })
    .slice(0, 250);
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
      depthMinUsd1p: event.depthMinUsd1p,
      spreadBucket: eventSpreadBucket(event),
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
    breakdown: buildBreakdown(filteredEvents),
    recentTrades: buildRecentTrades(filteredEvents),
    rawEvents: filteredEvents
  };
}