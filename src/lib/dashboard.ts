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
  from: string;
  to: string;
};

type Overview = {
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

type DashboardOptions = {
  strategies: string[];
  strategyVersions: string[];
  symbols: string[];
  sides: string[];
  eventTypes: string[];
  reasons: string[];
  setupClasses: string[];
};

type CohortRow = Record<string, unknown>;
type BreakdownRow = Record<string, unknown>;
type RecentTradeRow = Record<string, unknown>;

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
    setupClasses: uniqueSorted(events.map(event => event.setupClass))
  };
}

function getCohortKey(event: NormalizedWebhookEvent): string {
  return [
    event.setupClass || "UNKNOWN",
    event.side || "unknown",
    event.rsiZone || "UNKNOWN",
    event.obBias || "UNKNOWN",
    event.reason || "UNKNOWN"
  ].join("|");
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
        sample: rows.length,
        count: rows.length,
        trades: rows.length,

        setupClass: first?.setupClass || "UNKNOWN",
        side: first?.side || "unknown",
        rsiZone: first?.rsiZone || "UNKNOWN",
        obBias: first?.obBias || "UNKNOWN",
        reason: first?.reason || "UNKNOWN",

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
    .sort((a, b) => n(b.totalR, 0) - n(a.totalR, 0))
    .slice(0, 100);
}

function buildBreakdown(events: NormalizedWebhookEvent[]): BreakdownRow[] {
  const total = events.length || 1;
  const map = new Map<string, NormalizedWebhookEvent[]>();

  for (const event of events) {
    const key = event.reason || "UNKNOWN";

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key)!.push(event);
  }

  return Array.from(map.entries())
    .map(([reason, rows]) => {
      const entries = rows.filter(row => row.eventType === "ENTRY").length;
      const exits = rows.filter(row => row.eventType === "EXIT").length;
      const rejects = rows.filter(row => row.eventType === "REJECT").length;
      const holds = rows.filter(row => row.eventType === "HOLD").length;

      const stats = summarizeExitEvents(rows);

      return {
        reason,
        count: rows.length,
        pct: rows.length / total,

        entries,
        exits,
        rejects,
        holds,

        examples: rows
          .slice(-8)
          .map(row => `${row.symbol}_${row.side}_${row.eventType}`)
          .join(", "),

        ...stats
      };
    })
    .sort((a, b) => n(b.count, 0) - n(a.count, 0))
    .slice(0, 100);
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