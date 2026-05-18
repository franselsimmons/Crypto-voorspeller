import type { CohortRow } from "@/lib/dashboard";
import { compactNumber, pct, r } from "@/lib/format";

type CohortTableProps = {
  rows: CohortRow[];
};

function tone(value: number | null | undefined): string {
  const n = Number(value || 0);

  if (n > 0) return "good";
  if (n < 0) return "bad";

  return "";
}

function profitFactor(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 999) return "∞";

  return compactNumber(value, 2);
}

export function CohortTable({ rows }: CohortTableProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Beste cohorts</h2>
          <p>Gerangschikt op optimizer-score, winrate, R en PnL.</p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Score</th>
              <th>Cohort</th>
              <th>Setup</th>
              <th>Side</th>
              <th>Reason</th>
              <th>Trades</th>
              <th>Closed</th>
              <th>WR</th>
              <th>Wilson</th>
              <th>Total R</th>
              <th>Avg R</th>
              <th>PnL</th>
              <th>PF</th>
              <th>Direct SL</th>
              <th>Near TP</th>
              <th>RSI</th>
              <th>Edge</th>
              <th>Flow</th>
              <th>BTC</th>
              <th>OB</th>
              <th>Spread</th>
              <th>Depth</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={23} className="empty-cell">
                  Nog geen gesloten trades voor cohorts.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.cohortKey}-${index}`}>
                  <td>{index + 1}</td>
                  <td className={tone(row.score)}>{compactNumber(row.score, 2)}</td>
                  <td className="mono cohort-cell">{row.cohortKey}</td>
                  <td>{row.setupClass}</td>
                  <td>{row.side}</td>
                  <td>{row.reason}</td>
                  <td>{row.trades}</td>
                  <td>{row.closed}</td>
                  <td>{pct(row.winrate)}</td>
                  <td>{pct(row.wilson)}</td>
                  <td className={tone(row.totalR)}>{r(row.totalR)}</td>
                  <td className={tone(row.avgR)}>{r(row.avgR)}</td>
                  <td className={tone(row.pnlPct)}>{pct(row.pnlPct / 100)}</td>
                  <td>{profitFactor(row.profitFactor)}</td>
                  <td>{pct(row.directSlPct)}</td>
                  <td>{pct(row.nearTpPct)}</td>
                  <td>{row.rsiZone}</td>
                  <td>{row.rsiEdge}</td>
                  <td>{row.flow}</td>
                  <td>{row.btcState}</td>
                  <td>{row.obRelation}</td>
                  <td>{row.spreadBucket}</td>
                  <td>{row.depthBucket}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}