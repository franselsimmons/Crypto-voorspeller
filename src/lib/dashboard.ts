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

export type RecentTradeRow = Record<string, unknown>;

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
  if (!