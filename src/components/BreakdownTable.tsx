import type { BreakdownRow } from "@/lib/dashboard";
import { pct, r } from "@/lib/format";

type BreakdownTableProps = {
  rows: BreakdownRow[];
};

function tone(value: number) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}

export function BreakdownTable({ rows }: BreakdownTableProps) {
  return (
    <div className="panel">
      <div className="panel-title">Losse filterwaardes</div>
      <div className="panel-subtitle">
        Hiermee zie je snel welke losse waardes structureel winstgevend of zwak zijn.
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Filter</th>
              <th>Waarde</th>
              <th>Trades</th>
              <th>Closed</th>
              <th>WR</th>
              <th>Wilson</th>
              <th>Total R</th>
              <th>Avg R</th>
              <th>PnL</th>
              <th>Direct SL</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.dimension}-${row.value}-${index}`}>
                <td>{row.dimension}</td>
                <td className="mono">{row.value}</td>
                <td>{row.trades}</td>
                <td>{row.closed}</td>
                <td>{pct(row.winrate)}</td>
                <td>{pct(row.wilson)}</td>
                <td className={tone(row.totalR)}>{r(row.totalR)}</td>
                <td className={tone(row.avgR)}>{r(row.avgR)}</td>
                <td className={tone(row.pnlPct)}>{pct(row.pnlPct)}</td>
                <td>{pct(row.directSlPct)}</td>
              </tr>
            ))}

            {!rows.length ? (
              <tr>
                <td colSpan={10} className="empty">
                  Nog geen filterdata.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}