import type { TradeRow } from "@/lib/dashboard";
import { compactNumber, dateTime, money, pct, r } from "@/lib/format";

type RecentTradesTableProps = {
  rows: TradeRow[];
};

function tone(value: number | null) {
  if (value === null) return "";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}

function yesNo(value: boolean | null) {
  if (value === null) return "—";
  return value ? "YES" : "NO";
}

export function RecentTradesTable({ rows }: RecentTradesTableProps) {
  return (
    <div className="panel">
      <div className="panel-title">Alle trades</div>
      <div className="panel-subtitle">
        Laatste 150 entries met exit, path en filter-snapshot.
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Open</th>
              <th>Coin</th>
              <th>Side</th>
              <th>Setup</th>
              <th>Grade</th>
              <th>Entry</th>
              <th>TP</th>
              <th>SL</th>
              <th>Exit</th>
              <th>R</th>
              <th>PnL</th>
              <th>MFE</th>
              <th>MAE</th>
              <th>Hold</th>
              <th>Direct SL</th>
              <th>Near TP</th>
              <th>RSI</th>
              <th>RSI zone</th>
              <th>Flow</th>
              <th>Regime</th>
              <th>BTC</th>
              <th>OB</th>
              <th>Spread</th>
              <th>Depth</th>
              <th>Cohort</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(row => (
              <tr key={row.tradeId}>
                <td>{dateTime(row.openedAt)}</td>
                <td>{row.symbol}</td>
                <td>{row.side}</td>
                <td>{row.setupClass}</td>
                <td>{row.grade}</td>
                <td>{money(row.entryPrice)}</td>
                <td>{money(row.tpPrice)}</td>
                <td>{money(row.slPrice)}</td>
                <td>{row.exitReason || "OPEN"}</td>
                <td className={tone(row.exitR)}>{row.exitR === null ? "—" : r(row.exitR)}</td>
                <td className={tone(row.pnlPct)}>{row.pnlPct === null ? "—" : pct(row.pnlPct)}</td>
                <td className={tone(row.mfeR)}>{row.mfeR === null ? "—" : r(row.mfeR)}</td>
                <td className={tone(row.maeR)}>{row.maeR === null ? "—" : r(row.maeR)}</td>
                <td>{row.holdMinutes === null ? "—" : `${compactNumber(row.holdMinutes, 0)}m`}</td>
                <td>{yesNo(row.directToSL)}</td>
                <td>{yesNo(row.nearTpSeen)}</td>
                <td>{compactNumber(row.rsi, 2)}</td>
                <td>{row.rsiZone || "—"}</td>
                <td>{row.flow || "—"}</td>
                <td>{row.regime || "—"}</td>
                <td>{row.btcState || "—"}</td>
                <td>{row.obRelation || "—"}</td>
                <td>{row.spreadBps === null ? "—" : `${compactNumber(row.spreadBps, 2)} bps`}</td>
                <td>{row.depthUsd1p === null ? "—" : money(row.depthUsd1p, 0)}</td>
                <td className="mono cohort-cell">{row.cohortKey}</td>
              </tr>
            ))}

            {!rows.length ? (
              <tr>
                <td colSpan={25} className="empty">
                  Nog geen trades.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}