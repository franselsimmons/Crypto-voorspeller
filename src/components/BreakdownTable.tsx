import type { BreakdownRow } from "@/lib/dashboard";
import { compactNumber, pct, r } from "@/lib/format";

type BreakdownTableProps = {
  rows: BreakdownRow[];
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

export function BreakdownTable({ rows }: BreakdownTableProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Breakdown</h2>
          <p>Filterdruk en performance per dimensie.</p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dimensie</th>
              <th>Waarde</th>
              <th>Events</th>
              <th>Closed</th>
              <th>Entries</th>
              <th>Exits</th>
              <th>Rejects</th>
              <th>WR</th>
              <th>Wilson</th>
              <th>Total R</th>
              <th>Avg R</th>
              <th>PnL</th>
              <th>PF</th>
              <th>Direct SL</th>
              <th>Near TP</th>
              <th>Voorbeelden</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="empty-cell">
                  Nog geen data.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.dimension}-${row.value}-${index}`}>
                  <td>{row.dimension}</td>
                  <td className="mono">{row.value}</td>
                  <td>{row.trades}</td>
                  <td>{row.closed}</td>
                  <td>{row.entries}</td>
                  <td>{row.exits}</td>
                  <td>{row.rejects}</td>
                  <td>{pct(row.winrate)}</td>
                  <td>{pct(row.wilson)}</td>
                  <td className={tone(row.totalR)}>{r(row.totalR)}</td>
                  <td className={tone(row.avgR)}>{r(row.avgR)}</td>
                  <td className={tone(row.pnlPct)}>{pct(row.pnlPct / 100)}</td>
                  <td>{profitFactor(row.profitFactor)}</td>
                  <td>{pct(row.directSlPct)}</td>
                  <td>{pct(row.nearTpPct)}</td>
                  <td className="mono">{row.examples}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}