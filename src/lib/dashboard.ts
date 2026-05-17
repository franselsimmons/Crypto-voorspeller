import { sql } from "./db";
import { objectiveScore, wilsonLowerBound } from "./stats";

export type SearchParams = Record<string, string | string[] | undefined>;

export type DashboardFilters = {
  from: string;
  to: string;
  symbol: string;
  side: string;
  setupClass: string;
  grade: string;
  regime: string;
  flow: string;
  btcState: string;
  obRelation: string;
  rsiZone: string;
  spreadBucket: string;
  depthBucket: string;
  outcome: string;

  minTrades: number;
  winrateWeight: number;
  pnlWeight: number;
  avgRWeight: number;
  totalRWeight: number;
  directSlPenalty: number;
};

export type DashboardOptions = {
  symbols: string[];
  sides: string[];
  setupClasses: string[];
  grades: string[];
  regimes: string[];
  flows: string[];
  btcStates: string[];
  obRelations: string[];
  rsiZones: string[];
  spreadBuckets: string[];
  depthBuckets: string[];
};

export type OverviewStats = {
  entries: number;
  closed: number;
  open: number;
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
  bePct: number;
};

export type CohortRow = {
  cohortKey: string;
  setupClass: string;
  side: string;
  grade: string;
  rsiZone: string;
  rsiEdge: string;
  flow: string;
  btcState: string;
  obRelation: string;
  spreadBucket: string;
  depthBucket: string;

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
  bePct: number;
  score: number;
};

export type BreakdownRow = {
  dimension: string;
  value: string;
  trades: number;
  closed: number;
  wins: number;
  winrate: number;
  wilson: number;
  totalR: number;
  avgR: number;
  pnlPct: number;
  directSlPct: number;
};

export type TradeRow = {
  openedAt: string;
  closedAt: string | null;
  tradeId: string;
  symbol: string;
  side: string;
  cohortKey: string;
  setupClass: string;
  grade: string;
  entryReason: string;
  entryPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;
  exitReason: string | null;
  exitR: number | null;
  pnlPct: number | null;
  mfeR: number | null;
  maeR: number | null;
  holdMinutes: number | null;
  directToSL: boolean | null;
  nearTpSeen: boolean | null;
  rsi: number | null;
  rsiZone: string | null;
  flow: string | null;
  regime: string | null;
  btcState: string | null;
  obRelation: string | null;
  spreadBps: number | null;
  depthUsd1p: number | null;
};

export type DashboardData = {
  options: DashboardOptions;
  overview: OverviewStats;
  cohorts: CohortRow[];
  breakdown: BreakdownRow[];
  recentTrades: TradeRow[];
};

function firstParam(value: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function numParam(value: string | string[] | undefined, fallback: number): number {
  const raw = firstParam(value, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function n(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableN(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

export function parseDashboardFilters(searchParams: SearchParams): DashboardFilters {
  return {
    from: firstParam(searchParams.from),
    to: firstParam(searchParams.to),
    symbol: firstParam(searchParams.symbol),
    side: firstParam(searchParams.side),
    setupClass: firstParam(searchParams.setupClass),
    grade: firstParam(searchParams.grade),
    regime: firstParam(searchParams.regime),
    flow: firstParam(searchParams.flow),
    btcState: firstParam(searchParams.btcState),
    obRelation: firstParam(searchParams.obRelation),
    rsiZone: firstParam(searchParams.rsiZone),
    spreadBucket: firstParam(searchParams.spreadBucket),
    depthBucket: firstParam(searchParams.depthBucket),
    outcome: firstParam(searchParams.outcome),

    minTrades: numParam(searchParams.minTrades, 5),
    winrateWeight: numParam(searchParams.winrateWeight, 35),
    pnlWeight: numParam(searchParams.pnlWeight, 25),
    avgRWeight: numParam(searchParams.avgRWeight, 25),
    totalRWeight: numParam(searchParams.totalRWeight, 15),
    directSlPenalty: numParam(searchParams.directSlPenalty, 15)
  };
}

function joinWhere(parts: any[]) {
  return parts.reduce((acc, part) => sql`${acc} AND ${part}`, sql`TRUE`);
}

function buildWhere(filters: DashboardFilters) {
  const parts: any[] = [];

  if (filters.from) parts.push(sql`e.opened_at >= ${new Date(filters.from)}`);
  if (filters.to) parts.push(sql`e.opened_at <= ${new Date(filters.to)}`);

  if (filters.symbol) parts.push(sql`e.symbol = ${filters.symbol}`);
  if (filters.side) parts.push(sql`e.side = ${filters.side}`);
  if (filters.setupClass) parts.push(sql`e.setup_class = ${filters.setupClass}`);
  if (filters.grade) parts.push(sql`e.grade = ${filters.grade}`);
  if (filters.regime) parts.push(sql`e.regime = ${filters.regime}`);
  if (filters.flow) parts.push(sql`e.flow = ${filters.flow}`);
  if (filters.btcState) parts.push(sql`e.btc_state = ${filters.btcState}`);
  if (filters.obRelation) parts.push(sql`e.ob_relation = ${filters.obRelation}`);
  if (filters.rsiZone) parts.push(sql`e.rsi_zone = ${filters.rsiZone}`);
  if (filters.spreadBucket) parts.push(sql`e.spread_bucket = ${filters.spreadBucket}`);
  if (filters.depthBucket) parts.push(sql`e.depth_bucket = ${filters.depthBucket}`);

  if (filters.outcome === "WIN") parts.push(sql`x.exit_r > 0`);
  if (filters.outcome === "LOSS") parts.push(sql`x.exit_r <= 0`);
  if (filters.outcome === "OPEN") parts.push(sql`x.trade_id IS NULL`);
  if (filters.outcome === "DIRECT_SL") parts.push(sql`x.direct_to_sl IS TRUE`);
  if (filters.outcome === "NEAR_TP") parts.push(sql`x.near_tp_seen IS TRUE`);

  return joinWhere(parts);
}

async function distinctValues(expr: any): Promise<string[]> {
  const rows = await sql<{ value: string }[]>`
    SELECT DISTINCT ${expr}::text AS value
    FROM trade_entries
    WHERE ${expr} IS NOT NULL
    ORDER BY 1 ASC
    LIMIT 500
  `;

  return rows.map(row => row.value).filter(Boolean);
}

export async function getDashboardOptions(): Promise<DashboardOptions> {
  const [
    symbols,
    sides,
    setupClasses,
    grades,
    regimes,
    flows,
    btcStates,
    obRelations,
    rsiZones,
    spreadBuckets,
    depthBuckets
  ] = await Promise.all([
    distinctValues(sql`symbol`),
    distinctValues(sql`side`),
    distinctValues(sql`setup_class`),
    distinctValues(sql`grade`),
    distinctValues(sql`regime`),
    distinctValues(sql`flow`),
    distinctValues(sql`btc_state`),
    distinctValues(sql`ob_relation`),
    distinctValues(sql`rsi_zone`),
    distinctValues(sql`spread_bucket`),
    distinctValues(sql`depth_bucket`)
  ]);

  return {
    symbols,
    sides,
    setupClasses,
    grades,
    regimes,
    flows,
    btcStates,
    obRelations,
    rsiZones,
    spreadBuckets,
    depthBuckets
  };
}

async function getOverview(filters: DashboardFilters): Promise<OverviewStats> {
  const where = buildWhere(filters);

  const rows = await sql<any[]>`
    SELECT
      COUNT(*) AS entries,
      COUNT(x.trade_id) AS closed,
      COUNT(*) FILTER (WHERE x.trade_id IS NULL) AS open,
      COUNT(*) FILTER (WHERE x.exit_r > 0) AS wins,
      COUNT(*) FILTER (WHERE x.exit_r <= 0) AS losses,

      COALESCE(SUM(x.exit_r), 0) AS total_r,
      COALESCE(AVG(x.exit_r), 0) AS avg_r,
      COALESCE(SUM(x.pnl_pct), 0) AS pnl_pct,

      CASE
        WHEN ABS(SUM(CASE WHEN x.exit_r < 0 THEN x.exit_r ELSE 0 END)) = 0 THEN NULL
        ELSE SUM(CASE WHEN x.exit_r > 0 THEN x.exit_r ELSE 0 END)
          / ABS(SUM(CASE WHEN x.exit_r < 0 THEN x.exit_r ELSE 0 END))
      END AS profit_factor,

      COUNT(*) FILTER (WHERE x.direct_to_sl IS TRUE) AS direct_sl,
      COUNT(*) FILTER (WHERE x.near_tp_seen IS TRUE) AS near_tp,
      COUNT(*) FILTER (WHERE x.break_even_activated IS TRUE) AS be_activated

    FROM trade_entries e
    LEFT JOIN LATERAL (
      SELECT *
      FROM trade_exits tx
      WHERE tx.trade_id = e.trade_id
      ORDER BY tx.closed_at DESC
      LIMIT 1
    ) x ON TRUE
    WHERE ${where}
  `;

  const row = rows[0] ?? {};
  const entries = n(row.entries);
  const closed = n(row.closed);
  const wins = n(row.wins);

  return {
    entries,
    closed,
    open: n(row.open),
    wins,
    losses: n(row.losses),
    winrate: closed ? (wins / closed) * 100 : 0,
    wilson: wilsonLowerBound(wins, closed) * 100,
    totalR: n(row.total_r),
    avgR: n(row.avg_r),
    pnlPct: n(row.pnl_pct),
    profitFactor: nullableN(row.profit_factor),
    directSlPct: closed ? (n(row.direct_sl) / closed) * 100 : 0,
    nearTpPct: closed ? (n(row.near_tp) / closed) * 100 : 0,
    bePct: closed ? (n(row.be_activated) / closed) * 100 : 0
  };
}

async function getCohorts(filters: DashboardFilters): Promise<CohortRow[]> {
  const where = buildWhere(filters);

  const rows = await sql<any[]>`
    SELECT
      e.cohort_key,
      COALESCE(e.setup_class, 'NA') AS setup_class,
      COALESCE(e.side, 'NA') AS side,
      COALESCE(e.grade, 'NA') AS grade,
      COALESCE(e.rsi_zone, 'NA') AS rsi_zone,
      COALESCE(e.rsi_edge, 'NA') AS rsi_edge,
      COALESCE(e.flow, 'NA') AS flow,
      COALESCE(e.btc_state, 'NA') AS btc_state,
      COALESCE(e.ob_relation, 'NA') AS ob_relation,
      COALESCE(e.spread_bucket, 'NA') AS spread_bucket,
      COALESCE(e.depth_bucket, 'NA') AS depth_bucket,

      COUNT(*) AS trades,
      COUNT(x.trade_id) AS closed,
      COUNT(*) FILTER (WHERE x.exit_r > 0) AS wins,
      COUNT(*) FILTER (WHERE x.exit_r <= 0) AS losses,

      COALESCE(SUM(x.exit_r), 0) AS total_r,
      COALESCE(AVG(x.exit_r), 0) AS avg_r,
      COALESCE(SUM(x.pnl_pct), 0) AS pnl_pct,

      CASE
        WHEN ABS(SUM(CASE WHEN x.exit_r < 0 THEN x.exit_r ELSE 0 END)) = 0 THEN NULL
        ELSE SUM(CASE WHEN x.exit_r > 0 THEN x.exit_r ELSE 0 END)
          / ABS(SUM(CASE WHEN x.exit_r < 0 THEN x.exit_r ELSE 0 END))
      END AS profit_factor,

      COUNT(*) FILTER (WHERE x.direct_to_sl IS TRUE) AS direct_sl,
      COUNT(*) FILTER (WHERE x.near_tp_seen IS TRUE) AS near_tp,
      COUNT(*) FILTER (WHERE x.break_even_activated IS TRUE) AS be_activated

    FROM trade_entries e
    LEFT JOIN LATERAL (
      SELECT *
      FROM trade_exits tx
      WHERE tx.trade_id = e.trade_id
      ORDER BY tx.closed_at DESC
      LIMIT 1
    ) x ON TRUE
    WHERE ${where}
    GROUP BY
      e.cohort_key,
      e.setup_class,
      e.side,
      e.grade,
      e.rsi_zone,
      e.rsi_edge,
      e.flow,
      e.btc_state,
      e.ob_relation,
      e.spread_bucket,
      e.depth_bucket
    ORDER BY closed DESC, total_r DESC
    LIMIT 250
  `;

  return rows.map(row => {
    const trades = n(row.trades);
    const closed = n(row.closed);
    const wins = n(row.wins);
    const losses = n(row.losses);
    const totalR = n(row.total_r);
    const avgR = n(row.avg_r);
    const pnlPct = n(row.pnl_pct);
    const directSlPct = closed ? (n(row.direct_sl) / closed) * 100 : 0;

    const score = objectiveScore({
      trades: closed,
      wins,
      totalR,
      avgR,
      pnl: pnlPct,
      directSlPct,
      winrateWeight: filters.winrateWeight,
      pnlWeight: filters.pnlWeight,
      avgRWeight: filters.avgRWeight,
      totalRWeight: filters.totalRWeight,
      directSlPenalty: filters.directSlPenalty,
      minTrades: filters.minTrades
    });

    return {
      cohortKey: row.cohort_key || "NA",
      setupClass: row.setup_class || "NA",
      side: row.side || "NA",
      grade: row.grade || "NA",
      rsiZone: row.rsi_zone || "NA",
      rsiEdge: row.rsi_edge || "NA",
      flow: row.flow || "NA",
      btcState: row.btc_state || "NA",
      obRelation: row.ob_relation || "NA",
      spreadBucket: row.spread_bucket || "NA",
      depthBucket: row.depth_bucket || "NA",

      trades,
      closed,
      wins,
      losses,
      winrate: closed ? (wins / closed) * 100 : 0,
      wilson: wilsonLowerBound(wins, closed) * 100,
      totalR,
      avgR,
      pnlPct,
      profitFactor: nullableN(row.profit_factor),
      directSlPct,
      nearTpPct: closed ? (n(row.near_tp) / closed) * 100 : 0,
      bePct: closed ? (n(row.be_activated) / closed) * 100 : 0,
      score
    };
  });
}

async function groupDimension(
  filters: DashboardFilters,
  dimension: string,
  expr: any
): Promise<BreakdownRow[]> {
  const where = buildWhere(filters);

  const rows = await sql<any[]>`
    SELECT
      COALESCE(${expr}::text, 'NA') AS value,
      COUNT(*) AS trades,
      COUNT(x.trade_id) AS closed,
      COUNT(*) FILTER (WHERE x.exit_r > 0) AS wins,
      COALESCE(SUM(x.exit_r), 0) AS total_r,
      COALESCE(AVG(x.exit_r), 0) AS avg_r,
      COALESCE(SUM(x.pnl_pct), 0) AS pnl_pct,
      COUNT(*) FILTER (WHERE x.direct_to_sl IS TRUE) AS direct_sl
    FROM trade_entries e
    LEFT JOIN LATERAL (
      SELECT *
      FROM trade_exits tx
      WHERE tx.trade_id = e.trade_id
      ORDER BY tx.closed_at DESC
      LIMIT 1
    ) x ON TRUE
    WHERE ${where}
    GROUP BY 1
    HAVING COUNT(*) >= 1
    ORDER BY closed DESC, total_r DESC
    LIMIT 30
  `;

  return rows.map(row => {
    const closed = n(row.closed);
    const wins = n(row.wins);

    return {
      dimension,
      value: row.value || "NA",
      trades: n(row.trades),
      closed,
      wins,
      winrate: closed ? (wins / closed) * 100 : 0,
      wilson: wilsonLowerBound(wins, closed) * 100,
      totalR: n(row.total_r),
      avgR: n(row.avg_r),
      pnlPct: n(row.pnl_pct),
      directSlPct: closed ? (n(row.direct_sl) / closed) * 100 : 0
    };
  });
}

async function getBreakdown(filters: DashboardFilters): Promise<BreakdownRow[]> {
  const dimensions = [
    ["Coin", sql`e.symbol`],
    ["Side", sql`e.side`],
    ["Setup", sql`e.setup_class`],
    ["Grade", sql`e.grade`],
    ["RSI zone", sql`e.rsi_zone`],
    ["RSI edge", sql`e.rsi_edge`],
    ["Flow", sql`e.flow`],
    ["BTC", sql`e.btc_state`],
    ["Regime", sql`e.regime`],
    ["OB relation", sql`e.ob_relation`],
    ["Spread bucket", sql`e.spread_bucket`],
    ["Depth bucket", sql`e.depth_bucket`],
    ["Funding bucket", sql`e.funding_bucket`],
    ["Quality gate", sql`e.quality_gate_reason`]
  ] as const;

  const result = await Promise.all(
    dimensions.map(([dimension, expr]) => groupDimension(filters, dimension, expr))
  );

  return result.flat();
}

async function getRecentTrades(filters: DashboardFilters): Promise<TradeRow[]> {
  const where = buildWhere(filters);

  const rows = await sql<any[]>`
    SELECT
      e.opened_at,
      x.closed_at,
      e.trade_id,
      e.symbol,
      e.side,
      e.cohort_key,
      e.setup_class,
      e.grade,
      e.entry_reason,

      e.entry_price,
      e.tp_price,
      e.sl_price,

      x.exit_reason,
      x.exit_r,
      x.pnl_pct,
      x.mfe_r,
      x.mae_r,
      x.hold_minutes,
      x.direct_to_sl,
      x.near_tp_seen,

      e.rsi,
      e.rsi_zone,
      e.flow,
      e.regime,
      e.btc_state,
      e.ob_relation,
      e.spread_bps,
      e.depth_usd_1p

    FROM trade_entries e
    LEFT JOIN LATERAL (
      SELECT *
      FROM trade_exits tx
      WHERE tx.trade_id = e.trade_id
      ORDER BY tx.closed_at DESC
      LIMIT 1
    ) x ON TRUE
    WHERE ${where}
    ORDER BY e.opened_at DESC
    LIMIT 150
  `;

  return rows.map(row => ({
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    tradeId: row.trade_id,
    symbol: row.symbol,
    side: row.side,
    cohortKey: row.cohort_key || "",
    setupClass: row.setup_class || "",
    grade: row.grade || "",
    entryReason: row.entry_reason || "",
    entryPrice: nullableN(row.entry_price),
    tpPrice: nullableN(row.tp_price),
    slPrice: nullableN(row.sl_price),
    exitReason: row.exit_reason,
    exitR: nullableN(row.exit_r),
    pnlPct: nullableN(row.pnl_pct),
    mfeR: nullableN(row.mfe_r),
    maeR: nullableN(row.mae_r),
    holdMinutes: nullableN(row.hold_minutes),
    directToSL: boolOrNull(row.direct_to_sl),
    nearTpSeen: boolOrNull(row.near_tp_seen),
    rsi: nullableN(row.rsi),
    rsiZone: row.rsi_zone,
    flow: row.flow,
    regime: row.regime,
    btcState: row.btc_state,
    obRelation: row.ob_relation,
    spreadBps: nullableN(row.spread_bps),
    depthUsd1p: nullableN(row.depth_usd_1p)
  }));
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const [options, overview, cohorts, breakdown, recentTrades] = await Promise.all([
    getDashboardOptions(),
    getOverview(filters),
    getCohorts(filters),
    getBreakdown(filters),
    getRecentTrades(filters)
  ]);

  return {
    options,
    overview,
    cohorts,
    breakdown,
    recentTrades
  };
}