import type { CohortRow } from "@/lib/dashboard";
import { compactNumber, pct, r } from "@/lib/format";

type CohortTableProps = {
  rows: CohortRow[];
};

function tone(value: number) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}

export function CohortTable({ rows }: CohortTableProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Filter-combinaties</div>
          <div className="panel-subtitle">
            Gerankt op optimizer score. Wilson gebruikt voor winrate-confidence.
          </div>
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
                <td>{row.closed}</td>
                <td>{pct(row.winrate)}</td>
                <td>{pct(row.wilson)}</td>
                <td className={tone(row.totalR)}>{r(row.totalR)}</td>
                <td className={tone(row.avgR)}>{r(row.avgR)}</td>
                <td className={tone(row.pnlPct)}>{pct(row.pnlPct)}</td>
                <td>{row.profitFactor === null ? "—" : compactNumber(row.profitFactor, 2)}</td>
                <td>{pct(row.directSlPct)}</td>
                <td>{pct(row.nearTpPct)}</td>
                <td>{row.rsiZone}</td>
                <td>{row.flow}</td>
                <td>{row.btcState}</td>
                <td>{row.obRelation}</td>
                <td>{row.spreadBucket}</td>
                <td>{row.depthBucket}</td>
              </tr>
            ))}

            {!rows.length ? (
              <tr>
                <td colSpan={21} className="empty">
                  Nog geen cohorts.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}