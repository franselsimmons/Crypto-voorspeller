import type { CohortRow } from "@/lib/dashboard";

type CohortTableProps = {
  rows: CohortRow[];
};

function pct(value: number): string {
  if (!Number.isFinite(value)) return "0.00%";
  return `${(value * 100).toFixed(2)}%`;
}

function r(value: number): string {
  if (!Number.isFinite(value)) return "0.000R";
  return `${value.toFixed(3)}R`;
}

function compactNumber(value: number | null, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";

  return Number(value).toFixed(decimals);
}

function tone(value: number | null | undefined): string {
  const n = Number(value || 0);

  if (n > 0) return "positive";
  if (n < 0) return "negative";

  return "neutral";
}

export function CohortTable({ rows }: CohortTableProps) {
  if (!rows.length) {
    return (
      <div className="empty">
        Geen cohort-data voor deze filters.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Score</th>
            <th>Cohort</th>
            <th>Setup</th>
            <th>Side</th>
            <th>Trades</th>
            <th>Winrate</th>
            <th>Wilson</th>
            <th>Total R</th>
            <th>Avg R</th>
            <th>PF</th>
            <th>Near TP</th>
            <th>Direct SL</th>
            <th>RSI</th>
            <th>Flow</th>
            <th>BTC</th>
            <th>OB</th>
            <th>Spread</th>
            <th>Depth</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.cohortKey}-${index}`}>
              <td>{index + 1}</td>
              <td className={tone(row.score)}>{compactNumber(row.score, 2)}</td>
              <td className="mono cohort-cell">{row.cohortKey}</td>
              <td>{row.setupClass}</td>
              <td>{row.side}</td>
              <td>{row.trades}</td>
              <td>{pct(row.winrate)}</td>
              <td>{pct(row.wilson)}</td>
              <td className={tone(row.totalR)}>{r(row.totalR)}</td>
              <td className={tone(row.avgR)}>{r(row.avgR)}</td>
              <td>{row.profitFactor === null ? "-" : compactNumber(row.profitFactor, 2)}</td>
              <td>{pct(row.nearTpPct)}</td>
              <td>{pct(row.directSlPct)}</td>
              <td>{row.rsiZone}</td>
              <td>{row.flow}</td>
              <td>{row.btcState}</td>
              <td>{row.obRelation}</td>
              <td>{row.spreadBucket}</td>
              <td>{row.depthBucket}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CohortTable;