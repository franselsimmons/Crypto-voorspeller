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
  type SearchParams
} from "@/lib/dashboard";
import { compactNumber, pct, r } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function toneFromNumber(value: number): "good" | "bad" | "warn" | "default" {
  if (value > 0) return "good";
  if (value < 0) return "bad";
  return "default";
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

function getBestCohort(rows: CohortRow[]): CohortRow | null {
  if (!rows.length) return null;

  const profitable = rows.find(row =>
    row.closed > 0 &&
    row.totalR > 0 &&
    row.avgR > 0 &&
    row.winrate > 0
  );

  return profitable || rows[0] || null;
}

function BestFilterCombination({ cohort }: { cohort: CohortRow | null }) {
  if (!cohort) {
    return (
      <section className="hero best-cohort">
        <div>
          <div className="eyebrow">Beste filter combinatie</div>
          <h2>Nog geen betrouwbare combinatie</h2>
          <p>
            Er zijn nog geen closed trades die door de huidige filters komen.
            Wacht op exits of verlaag tijdelijk je minimum filters.
          </p>
        </div>

        <div className="hero-box">
          <div className="hero-box-label">Status</div>
          <code>NO_COHORT_DATA</code>
        </div>
      </section>
    );
  }

  const pnlTone = toneFromNumber(cohort.pnlPct);
  const totalRTone = toneFromNumber(cohort.totalR);
  const avgRTone = toneFromNumber(cohort.avgR);

  return (
    <section className="best-cohort">
      <header className="hero">
        <div>
          <div className="eyebrow">Beste filter combinatie</div>
          <h2>{cohort.setupClass} {cohort.side}</h2>
          <p>
            Deze combinatie staat bovenaan op basis van optimizer-score,
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
          label="Beste winrate"
          value={pct(cohort.winrate)}
          sub={`Wilson: ${pct(cohort.wilson)}`}
          tone={cohort.winrate > 0.5 ? "good" : "default"}
        />

        <MetricCard
          label="Beste PnL"
          value={pct(cohort.pnlPct)}
          sub={`Avg: ${pct(cohort.avgPnlPct)}`}
          tone={pnlTone}
        />

        <MetricCard
          label="Beste Total R"
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
          tone={
            cohort.profitFactor !== null && cohort.profitFactor > 1
              ? "good"
              : "default"
          }
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

      <div className="hero-box">
        <div className="hero-box-label">Filter combinatie</div>
        <code>{cleanCohortLabel(cohort.cohortKey)}</code>
      </div>
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
  const bestCohort = getBestCohort(data.cohorts);

  const totalRTone =
    data.overview.totalR > 0
      ? "good"
      : data.overview.totalR < 0
        ? "bad"
        : "default";

  const pnlTone =
    data.overview.pnlPct > 0
      ? "good"
      : data.overview.pnlPct < 0
        ? "bad"
        : "default";

  return (
    <main className="shell">
      <AutoRefresh intervalMs={10000} />

      <header className="hero">
        <div>
          <div className="eyebrow">VolatilityForge</div>
          <h1>Trade Filter Optimizer</h1>
          <p>
            Alle entry, exit, path en filterwaardes worden opgeslagen. Doel:
            filter-combinaties vinden met de beste balans tussen winrate, total R,
            PnL en lage direct-SL ratio.
          </p>
        </div>

        <div className="hero-box">
          <div className="hero-box-label">Webhook</div>
          <code>/api/webhooks/tradesystem</code>
        </div>
      </header>

      <FilterForm filters={filters} options={data.options} />

      <BestFilterCombination cohort={bestCohort} />

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
          value={
            data.overview.profitFactor === null
              ? "—"
              : compactNumber(data.overview.profitFactor, 2)
          }
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

      <CohortTable rows={data.cohorts} />

      <BreakdownTable rows={data.breakdown} />

      <RecentTradesTable rows={data.recentTrades} />
    </main>
  );
}