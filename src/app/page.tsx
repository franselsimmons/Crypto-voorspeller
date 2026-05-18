import { AutoRefresh } from "@/components/AutoRefresh";
import { BreakdownTable } from "@/components/BreakdownTable";
import { CohortTable } from "@/components/CohortTable";
import { FilterForm } from "@/components/FilterForm";
import { MetricCard } from "@/components/MetricCard";
import { RecentTradesTable } from "@/components/RecentTradesTable";
import {
  getDashboardData,
  parseDashboardFilters,
  type SearchParams
} from "@/lib/dashboard";
import { compactNumber, pct, r } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const filters = parseDashboardFilters(params);
  const data = await getDashboardData(filters);

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