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

  score: number;

  setupClass: string;
  side: string;
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
  reason: string;

  avgScore: number;
  avgConfluence: number;
  avgSniper: number;

  symbols: string[];
  examples: string;
};

export type BreakdownRow = {
  dimension: string;
  value: string;

  count: number;
  pct: number;

  entries: number;
  exits: number;
  rejects: number;
  holds: number;
  snapshots: number;

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

  score: number;
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
  grade: string;

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
  rsiZone: string;

  rsiEdge: string;
  flow: string;
  btcState: string;
  regime: string;

  obBias: string;
  obRelation: string;
  spreadPct: number | null;
  depthMinUsd1p: number | null;
  spreadBucket: string;
  depthBucket: string;

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

function isRecord(value: unknown): value is Record<string, unknown> {
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

function getValue(event: NormalizedWebhookEvent, paths: string[], fallback: unknown = null): unknown {
  const record = event as EventRecord;

  for (const path of paths) {
    const direct = readPath(record, path);

    if (direct !== undefined && direct !== null && direct !== "") {
      return direct;
    }

    const fromPayload = readPath(record.payload, path);

    if (fromPayload !== undefined && fromPayload !== null && fromPayload !== "") {
      return fromPayload;
    }
  }

  return fallback;
}

function eventText(
  event: NormalizedWebhookEvent,
  paths: string[],
  fallback = "UNKNOWN"
): string {
  const value = getValue(event, paths, fallback);
  const text = String(value || fallback).trim();

  return text || fallback;
}

function eventUpper(
  event: NormalizedWebhookEvent,
  paths: string[],
  fallback = "UNKNOWN"
): string {
  return eventText(event, paths, fallback).toUpperCase();
}

function eventLower(
  event: NormalizedWebhookEvent,
  paths: string[],
  fallback = "unknown"
): string {
  return eventText(event, paths, fallback).toLowerCase();
}

function eventNumber(
  event: NormalizedWebhookEvent,
  paths: string[],
  fallback: number | null = null
): number | null {
  const value = getValue(event, paths, null);
  const num = nullableNumber(value);

  return num === null ? fallback : num;
}

function eventGrade(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["grade", "payload.grade"], "UNKNOWN");
}

function eventRegime(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["regime", "payload.regime", "market.regime"], "UNKNOWN");
}

function eventFlow(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["flow", "payload.flow", "market.flow"], "UNKNOWN");
}

function eventBtcState(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["btcState", "payload.btcState", "market.btcState"], "UNKNOWN");
}

function eventRsiZone(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["rsiZone", "payload.rsiZone"], "UNKNOWN");
}

function eventRsiEdge(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["rsiEdge", "rsiEntryEdge", "payload.rsiEdge", "payload.rsiEntryEdge"], "UNKNOWN");
}

function eventObBias(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["obBias", "payload.obBias", "ob.bias", "orderbook.bias"], "UNKNOWN");
}

function eventSide(event: NormalizedWebhookEvent): string {
  const side = eventLower(event, ["side", "payload.side"], "unknown");

  if (side === "bull" || side === "long" || side === "buy") return "bull";
  if (side === "bear" || side === "short" || side === "sell") return "bear";

  return side;
}

function eventObRelation(event: NormalizedWebhookEvent): string {
  const explicit = eventUpper(
    event,
    ["obRelation", "payload.obRelation", "ob.relation", "orderbook.relation"],
    ""
  );

  if (explicit) return explicit;

  const side = eventSide(event);
  const obBias = eventObBias(event);

  if (obBias === "NEUTRAL" || obBias === "UNKNOWN") return "NEUTRAL";

  if (side === "bull" && obBias === "BULLISH") return "WITH";
  if (side === "bear" && obBias === "BEARISH") return "WITH";

  if (side === "bull" && obBias === "BEARISH") return "AGAINST";
  if (side === "bear" && obBias === "BULLISH") return "AGAINST";

  return "UNKNOWN";
}

function eventSpreadBucket(event: NormalizedWebhookEvent): string {
  const explicit = eventUpper(
    event,
    ["spreadBucket", "payload.spreadBucket", "ob.spreadBucket"],
    ""
  );

  if (explicit) return explicit;

  const spreadPct = eventNumber(event, ["spreadPct", "payload.spreadPct", "ob.spreadPct"], null);

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
  const explicit = eventUpper(
    event,
    ["depthBucket", "payload.depthBucket", "ob.depthBucket"],
    ""
  );

  if (explicit) return explicit;

  const depth = eventNumber(
    event,
    ["depthMinUsd1p", "payload.depthMinUsd1p", "depthUsd1p", "payload.depthUsd1p", "ob.depthMinUsd1p"],
    null
  );

  if (depth === null) return "DEPTH_NA";
  if (depth < 50_000) return "DEPTH_LT_50K";
  if (depth < 100_000) return "DEPTH_50K_100K";
  if (depth < 200_000) return "DEPTH_100K_200K";
  if (depth < 500_000) return "DEPTH_200K_500K";
  if (depth < 1_000_000) return "DEPTH_500K_1M";

  return "DEPTH_GTE_1M";
}

function eventOutcome(event: NormalizedWebhookEvent): string {
  if (event.eventType !== "EXIT") return "UNKNOWN";

  const exitR = n(event.exitR, 0);

  if (exitR > 0) return "WIN";
  if (exitR < 0) return "LOSS";

  return "FLAT";
}

function eventSymbol(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["symbol", "payload.symbol"], "UNKNOWN");
}

function eventSetupClass(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["setupClass", "payload.setupClass"], "UNKNOWN");
}

function eventReason(event: NormalizedWebhookEvent): string {
  return eventUpper(event, ["reason", "payload.reason"], "UNKNOWN");
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
    to: one(params.to)
  };
}

function eventPassesFilters(
  event: NormalizedWebhookEvent,
  filters: DashboardFilters
): boolean {
  if (filters.strategyVersion && event.strategyVersion !== filters.strategyVersion) {
    return false;
  }

  if (filters.symbol && eventSymbol(event) !== upper(filters.symbol)) {
    return false;
  }

  if (filters.side && eventSide(event) !== filters.side) {
    return false;
  }

  if (filters.eventType && upper(event.eventType) !== filters.eventType) {
    return false;
  }

  if (filters.reason && eventReason(event) !== filters.reason) {
    return false;
  }

  if (filters.setupClass && eventSetupClass(event) !== filters.setupClass) {
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

  if (filters.rsiZone && eventRsiZone(event) !== filters.rsiZone) {
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

function summarizeExitEvents(events: NormalizedWebhookEvent[]) {
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

function scoreStats(stats: {
  closed: number;
  winrate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  pnlPct: number;
  profitFactor: number | null;
  directSlPct: number;
  nearTpPct: number;
}): number {
  const sampleWeight = Math.min(1, stats.closed / 30);
  const pf = Math.min(5, Number(stats.profitFactor || 0));

  const raw =
    stats.totalR * 12 +
    stats.avgR * 30 +
    stats.winrate * 25 +
    stats.wilson * 20 +
    pf * 4 +
    stats.pnlPct * 2 +
    stats.nearTpPct * 5 -
    stats.directSlPct * 25;

  return round(raw * Math.max(0.2, sampleWeight), 2);
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
    symbols: uniqueSorted(events.map(event => eventSymbol(event))),
    sides: uniqueSorted(events.map(event => eventSide(event))),
    eventTypes: uniqueSorted(events.map(event => event.eventType)),
    reasons: uniqueSorted(events.map(event => eventReason(event))),
    setupClasses: uniqueSorted(events.map(event => eventSetupClass(event))),
    grades: uniqueSorted(events.map(event => eventGrade(event))),
    regimes: uniqueSorted(events.map(event => eventRegime(event))),
    flows: uniqueSorted(events.map(event => eventFlow(event))),
    btcStates: uniqueSorted(events.map(event => eventBtcState(event))),
    rsiZones: uniqueSorted(events.map(event => eventRsiZone(event))),
    rsiEdges: uniqueSorted(events.map(event => eventRsiEdge(event))),
    obBiases: uniqueSorted(events.map(event => eventObBias(event))),
    obRelations: uniqueSorted(events.map(event => eventObRelation(event))),
    spreadBuckets: uniqueSorted(events.map(event => eventSpreadBucket(event))),
    depthBuckets: uniqueSorted(events.map(event => eventDepthBucket(event)))
  };
}

function getCohortKey(event: NormalizedWebhookEvent): string {
  return [
    `SETUP=${eventSetupClass(event)}`,
    `SIDE=${eventSide(event)}`,
    `GRADE=${eventGrade(event)}`,
    `RSI=${eventRsiZone(event)}`,
    `EDGE=${eventRsiEdge(event)}`,
    `FLOW=${eventFlow(event)}`,
    `BTC=${eventBtcState(event)}`,
    `REGIME=${eventRegime(event)}`,
    `OB=${eventObRelation(event)}`,
    `SPREAD=${eventSpreadBucket(event)}`,
    `DEPTH=${eventDepthBucket(event)}`,
    `REASON=${eventReason(event)}`
  ].join("|");
}

function buildCohorts(events: NormalizedWebhookEvent[]): CohortRow[] {
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
      const stats = summarizeExitEvents(rows);
      const score = scoreStats(stats);

      const symbols = uniqueSorted(rows.map(event => eventSymbol(event)));

      return {
        cohortKey,
        label: cohortKey,

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

        score,

        setupClass: first ? eventSetupClass(first) : "UNKNOWN",
        side: first ? eventSide(first) : "unknown",
        grade: first ? eventGrade(first) : "UNKNOWN",
        rsiZone: first ? eventRsiZone(first) : "UNKNOWN",
        rsiEdge: first ? eventRsiEdge(first) : "UNKNOWN",
        flow: first ? eventFlow(first) : "UNKNOWN",
        btcState: first ? eventBtcState(first) : "UNKNOWN",
        regime: first ? eventRegime(first) : "UNKNOWN",
        obBias: first ? eventObBias(first) : "UNKNOWN",
        obRelation: first ? eventObRelation(first) : "UNKNOWN",
        spreadBucket: first ? eventSpreadBucket(first) : "SPREAD_NA",
        depthBucket: first ? eventDepthBucket(first) : "DEPTH_NA",
        reason: first ? eventReason(first) : "UNKNOWN",

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

        symbols,
        examples: rows
          .slice(-8)
          .map(row => `${eventSymbol(row)}_${eventSide(row)}_${eventOutcome(row)}_${n(row.exitR, 0)}R`)
          .join(", ")
      };
    })
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
  events: NormalizedWebhookEvent[],
  dimension: string,
  valueGetter: (event: NormalizedWebhookEvent) => string
): BreakdownRow[] {
  const total = events.length || 1;
  const map = new Map<string, NormalizedWebhookEvent[]>();

  for (const event of events) {
    const value = valueGetter(event) || "UNKNOWN";

    if (!map.has(value)) {
      map.set(value, []);
    }

    map.get(value)!.push(event);
  }

  return Array.from(map.entries()).map(([value, rows]) => {
    const stats = summarizeExitEvents(rows);
    const score = scoreStats(stats);

    return {
      dimension,
      value,

      count: rows.length,
      pct: rows.length / total,

      entries: rows.filter(row => row.eventType === "ENTRY").length,
      exits: rows.filter(row => row.eventType === "EXIT").length,
      rejects: rows.filter(row => row.eventType === "REJECT").length,
      holds: rows.filter(row => row.eventType === "HOLD").length,
      snapshots: rows.filter(row => row.eventType === "SNAPSHOT").length,

      trades: stats.closed,
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

      score,
      examples: rows
        .slice(-8)
        .map(row => `${eventSymbol(row)}_${eventSide(row)}_${row.eventType}`)
        .join(", ")
    };
  });
}

function buildBreakdown(events: NormalizedWebhookEvent[]): BreakdownRow[] {
  return [
    ...buildBreakdownGroup(events, "Reason", eventReason),
    ...buildBreakdownGroup(events, "Setup", eventSetupClass),
    ...buildBreakdownGroup(events, "Side", eventSide),
    ...buildBreakdownGroup(events, "Grade", eventGrade),
    ...buildBreakdownGroup(events, "RSI zone", eventRsiZone),
    ...buildBreakdownGroup(events, "RSI edge", eventRsiEdge),
    ...buildBreakdownGroup(events, "Flow", eventFlow),
    ...buildBreakdownGroup(events, "BTC state", eventBtcState),
    ...buildBreakdownGroup(events, "Regime", eventRegime),
    ...buildBreakdownGroup(events, "OB bias", eventObBias),
    ...buildBreakdownGroup(events, "OB relation", eventObRelation),
    ...buildBreakdownGroup(events, "Spread", eventSpreadBucket),
    ...buildBreakdownGroup(events, "Depth", eventDepthBucket),
    ...buildBreakdownGroup(events, "Outcome", eventOutcome)
  ]
    .sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;

      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

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
      reason: eventReason(event),
      outcome: eventOutcome(event),

      symbol: event.symbol,
      side: event.side,

      setupClass: event.setupClass,
      grade: eventGrade(event),

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
      rsiZone: eventRsiZone(event),

      rsiEdge: eventRsiEdge(event),
      flow: eventFlow(event),
      btcState: eventBtcState(event),
      regime: eventRegime(event),

      obBias: eventObBias(event),
      obRelation: eventObRelation(event),
      spreadPct: event.spreadPct,
      depthMinUsd1p: event.depthMinUsd1p,
      spreadBucket: eventSpreadBucket(event),
      depthBucket: eventDepthBucket(event),

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