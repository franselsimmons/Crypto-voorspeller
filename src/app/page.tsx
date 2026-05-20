import { AutoRefresh } from "@/components/AutoRefresh";
import { BreakdownTable } from "@/components/BreakdownTable";
import { CohortTable } from "@/components/CohortTable";
import { FilterForm } from "@/components/FilterForm";
import { MetricCard } from "@/components/MetricCard";
import { RecentTradesTable } from "@/components/RecentTradesTable";
import {
  getDashboardData,
  parseDashboardFilters,
  type CohortRow,
  type DashboardFilters,
  type SearchParams
} from "@/lib/dashboard";
import { compactNumber, pct, r } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BEST_COHORT_MIN_TRADES_FLOOR = 5;

type Tone = "good" | "bad" | "warn" | "default";
type TradeSide = "LONG" | "SHORT";

function toneFromNumber(value: number): Tone {
  if (value > 0) return "good";
  if (value < 0) return "bad";
  return "default";
}

function numberFromFilter(value: string, fallback: number): number {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function getBestCohortMinTrades(filters: DashboardFilters): number {
  return Math.max(
    BEST_COHORT_MIN_TRADES_FLOOR,
    numberFromFilter(filters.minTrades, BEST_COHORT_MIN_TRADES_FLOOR)
  );
}

function profitFactorText(value: number | null): string {
  if (value === null) return "—";
  if (value >= 999) return "∞";
  return compactNumber(value, 2);
}

function cleanCohortLabel(value: string): string {
  return value
    .replaceAll("|", " | ")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSide(value: unknown): TradeSide | null {
  const side = String(value || "").trim().toUpperCase();

  if (["LONG", "BULL", "BUY", "BULLISH"].includes(side)) return "LONG";
  if (["SHORT", "BEAR", "SELL", "BEARISH"].includes(side)) return "SHORT";

  if (side.includes("SIDE=LONG")) return "LONG";
  if (side.includes("SIDE=SHORT")) return "SHORT";

  return null;
}

function sideFromCohort(row: CohortRow): TradeSide | null {
  return normalizeSide(row.side) || normalizeSide(row.cohortKey);
}

function cohortsForSide(rows: CohortRow[], side: TradeSide): CohortRow[] {
  return rows.filter(row => sideFromCohort(row) === side);
}

function isValidBestCohort(row: CohortRow, minTrades: number): boolean {
  return (
    row.closed >= minTrades &&
    row.count >= minTrades &&
    row.totalR > 0 &&
    row.avgR > 0 &&
    row.winrate > 0
  );
}

function modeRank(row: CohortRow): number {
  const key = row.cohortKey.toUpperCase();

  if (key.includes("MODE=GROUPED")) return 3;
  if (key.includes("MODE=SETUP_SIDE")) return 2;
  if (key.includes("MODE=SIDE_TOTAL")) return 1;

  return 0;
}

function getBestCohortForSide(
  rows: CohortRow[],
  side: TradeSide,
  minTrades: number
): CohortRow | null {
  const validRows = cohortsForSide(rows, side).filter(row =>
    isValidBestCohort(row, minTrades)
  );

  if (!validRows.length) return null;

  return [...validRows].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;

    const modeDiff = modeRank(b) - modeRank(a);
    if (modeDiff !== 0) return modeDiff;

    const rDiff = b.totalR - a.totalR;
    if (rDiff !== 0) return rDiff;

    return b.trades - a.trades;
  })[0];
}

function BestSideFilterCombination({
  title,
  side,
  cohort,
  minTrades
}: {
  title: string;
  side: TradeSide;
  cohort: CohortRow | null;
  minTrades: number;
}) {
  if (!cohort) {
    return (
      <section className="hero best-cohort panel">
        <div>
          <div className="eyebrow">{title}</div>
          <h2>Nog geen betrouwbare {side} combinatie</h2>
          <p>
            Er is nog geen positieve {side} cohort met minimaal {minTrades} closed trades.
            Tot die tijd wordt er geen {side} topfilter gekozen, zodat 1/1 geluk
            niet bovenaan komt.
          </p>
        </div>

        <div className="hero-box">
          <div className="hero-box-label">Min sample</div>
          <code>{minTrades} closed trades</code>
        </div>
      </section>
    );
  }

  const pnlTone = toneFromNumber(cohort.pnlPct);
  const totalRTone = toneFromNumber(cohort.totalR);
  const avgRTone = toneFromNumber(cohort.avgR);
  const isProfitFactorGood = cohort.profitFactor !== null && cohort.profitFactor > 1;

  return (
    <section className="best-cohort panel">
      <header className="hero">
        <div>
          <div className="eyebrow">{title}</div>
          <h2>
            {cohort.setupClass} {cohort.side}
          </h2>
          <p>
            Deze {side} combinatie voldoet aan minimaal {minTrades} closed trades
            en staat bovenaan binnen alleen {side}-cohorts op basis van score,
            winrate/Wilson, total R, avg R, PnL, profit factor, near-TP en direct-SL penalty.
          </p>
        </div>

        <div className="hero-box">
          <div className="hero-box-label">Optimizer score</div>
          <code>{compactNumber(cohort.score, 2)}</code>
        </div>
      </header>

      <section className="metric-grid">
        <MetricCard
          label={`${side} winrate`}
          value={pct(cohort.winrate)}
          sub={`Wilson: ${pct(cohort.wilson)}`}
          tone={cohort.winrate >= 0.5 ? "good" : "default"}
        />

        <MetricCard
          label={`${side} PnL`}
          value={pct(cohort.pnlPct)}
          sub={`Avg: ${pct(cohort.avgPnlPct)}`}
          tone={pnlTone}
        />

        <MetricCard
          label={`${side} Total R`}
          value={r(cohort.totalR)}
          sub={`Avg: ${r(cohort.avgR)}`}
          tone={totalRTone}
        />

        <MetricCard
          label="Avg R"
          value={r(cohort.avgR)}
          sub={`${cohort.closed} closed / ${cohort.count} sample`}
          tone={avgRTone}
        />

        <MetricCard
          label="Profit factor"
          value={profitFactorText(cohort.profitFactor)}
          sub="Gross win / gross loss"
          tone={isProfitFactorGood ? "good" : "default"}
        />

        <MetricCard
          label="Direct SL"
          value={pct(cohort.directSlPct)}
          sub="Lager is beter"
          tone={cohort.directSlPct > 0.3 ? "bad" : "default"}
        />

        <MetricCard
          label="Near TP"
          value={pct(cohort.nearTpPct)}
          sub="TP bijna gehaald"
          tone="warn"
        />

        <MetricCard
          label="Trades"
          value={compactNumber(cohort.count, 0)}
          sub={`${cohort.wins} wins / ${cohort.losses} losses / ${cohort.flats} flat`}
        />
      </section>

      <div className="hero-box" style={{ marginTop: "18px" }}>
        <div className="hero-box-label">{side} filter combinatie</div>
        <code>{cleanCohortLabel(cohort.cohortKey)}</code>
      </div>
    </section>
  );
}

function SideCohortSection({
  title,
  side,
  rows
}: {
  title: string;
  side: TradeSide;
  rows: CohortRow[];
}) {
  return (
    <section className="panel">
      <header className="hero">
        <div>
          <div className="eyebrow">Cohort analyse</div>
          <h2>{title}</h2>
          <p>
            Alleen {side}-cohorts. Gebruik deze tabel om de beste {side} filtergroep
            te beoordelen op score, winrate, Wilson, total R, avg R, profit factor
            en direct-SL.
          </p>
        </div>

        <div className="hero-box">
          <div className="hero-box-label">{side} cohorts</div>
          <code>{compactNumber(rows.length, 0)}</code>
        </div>
      </header>

      <CohortTable rows={rows} />
    </section>
  );
}

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const filters = parseDashboardFilters(params);
  const data = await getDashboardData(filters);

  const bestCohortMinTrades = getBestCohortMinTrades(filters);

  const longCohorts = cohortsForSide(data.cohorts, "LONG");
  const shortCohorts = cohortsForSide(data.cohorts, "SHORT");

  const bestLongCohort = getBestCohortForSide(
    data.cohorts,
    "LONG",
    bestCohortMinTrades
  );

  const bestShortCohort = getBestCohortForSide(
    data.cohorts,
    "SHORT",
    bestCohortMinTrades
  );

  const totalRTone = toneFromNumber(data.overview.totalR);
  const pnlTone = toneFromNumber(data.overview.pnlPct);

  return (
    <main className="shell">
      <AutoRefresh intervalMs={10000} />

      <header className="hero">
        <div>
          <div className="eyebrow">VolatilityForge</div>
          <h1>Trade Filter Optimizer</h1>
          <p>
            Alle entry, exit, path en filterwaardes worden opgeslagen. Doel:
            aparte beste filter-combinaties vinden voor LONG en SHORT, met balans tussen
            winrate, total R, PnL en lage direct-SL ratio.
          </p>
        </div>

        <div className="hero-box">
          <div className="hero-box-label">Webhook</div>
          <code>/api/webhooks/tradesystem</code>
        </div>
      </header>

      <FilterForm filters={filters} options={data.options} />

      <BestSideFilterCombination
        title="Beste LONG filter combinatie"
        side="LONG"
        cohort={bestLongCohort}
        minTrades={bestCohortMinTrades}
      />

      <BestSideFilterCombination
        title="Beste SHORT filter combinatie"
        side="SHORT"
        cohort={bestShortCohort}
        minTrades={bestCohortMinTrades}
      />

      <section className="metric-grid">
        <MetricCard
          label="Entries"
          value={compactNumber(data.overview.entries, 0)}
          sub="Totaal ontvangen"
        />

        <MetricCard
          label="Closed"
          value={compactNumber(data.overview.closed, 0)}
          sub={`${data.overview.open} open`}
        />

        <MetricCard
          label="Winrate"
          value={pct(data.overview.winrate)}
          sub={`Wilson: ${pct(data.overview.wilson)}`}
        />

        <MetricCard
          label="Total R"
          value={r(data.overview.totalR)}
          sub={`Avg: ${r(data.overview.avgR)}`}
          tone={totalRTone}
        />

        <MetricCard
          label="PnL"
          value={pct(data.overview.pnlPct)}
          sub="Som van closed trades"
          tone={pnlTone}
        />

        <MetricCard
          label="Profit factor"
          value={profitFactorText(data.overview.profitFactor)}
          sub="Gross win / gross loss"
        />

        <MetricCard
          label="Direct SL"
          value={pct(data.overview.directSlPct)}
          sub="MFE kwam bijna niet op gang"
          tone="bad"
        />

        <MetricCard
          label="Near TP"
          value={pct(data.overview.nearTpPct)}
          sub="TP bijna gehaald"
          tone="warn"
        />
      </section>

      <SideCohortSection
        title="LONG cohort tabel"
        side="LONG"
        rows={longCohorts}
      />

      <SideCohortSection
        title="SHORT cohort tabel"
        side="SHORT"
        rows={shortCohorts}
      />

      <BreakdownTable rows={data.breakdown} />

      <RecentTradesTable rows={data.recentTrades} />
    </main>
  );
}