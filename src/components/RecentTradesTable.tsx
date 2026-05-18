import type { RecentTradeRow } from "@/lib/dashboard";
import { compactNumber, pct, r } from "@/lib/format";

type RecentTradesTableProps = {
  rows: RecentTradeRow[];
};

function tone(value: number | null | undefined): string {
  const n = Number(value || 0);

  if (n > 0) return "good";
  if (n < 0) return "bad";

  return "";
}

function fmt(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return "—";
  return compactNumber(value, decimals);
}

function dateText(ts: number): string {
  if (!ts) return "—";

  try {
    return new Date(ts).toLocaleString("nl-NL");
  } catch {
    return "—";
  }
}

export function RecentTradesTable({ rows }: RecentTradesTableProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Recente events</h2>
          <p>Laatste entry, exit, reject en snapshot records.</p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tijd</th>
              <th>Event</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Setup</th>
              <th>Reason</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP</th>
              <th>Exit</th>
              <th>RR</th>
              <th>Exit R</th>
              <th>PnL</th>
              <th>Score</th>
              <th>Conf</th>
              <th>Sniper</th>
              <th>RSI</th>
              <th>Edge</th>
              <th>Flow</th>
              <th>BTC</th>
              <th>OB</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={21} className="empty-cell">
                  Nog geen events ontvangen.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.eventId}>
                  <td>{dateText(row.ts || row.receivedAt)}</td>
                  <td>{row.eventType}</td>
                  <td className="mono">{row.symbol || "—"}</td>
                  <td>{row.side || "—"}</td>
                  <td>{row.setupClass || "—"}</td>
                  <td>{row.reason}</td>
                  <td>{fmt(row.entry)}</td>
                  <td>{fmt(row.sl)}</td>
                  <td>{fmt(row.tp)}</td>
                  <td>{fmt(row.exit)}</td>
                  <td>{fmt(row.finalRr ?? row.plannedRR ?? row.rr, 2)}</td>
                  <td className={tone(row.exitR)}>{row.exitR === null ? "—" : r(row.exitR)}</td>
                  <td className={tone(row.pnlPct)}>
                    {row.pnlPct === null ? "—" : pct(row.pnlPct / 100)}
                  </td>
                  <td>{compactNumber(row.score, 0)}</td>
                  <td>{compactNumber(row.confluence, 0)}</td>
                  <td>{compactNumber(row.sniperScore, 0)}</td>
                  <td>{row.rsiZone || "—"}</td>
                  <td>{row.rsiEdge}</td>
                  <td>{row.flow}</td>
                  <td>{row.btcState}</td>
                  <td>{row.obRelation}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}