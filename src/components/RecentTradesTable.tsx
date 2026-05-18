import type { RecentTradeRow } from "@/lib/dashboard";

type RecentTradesTableProps = {
  rows: RecentTradeRow[];
};

function price(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toPrecision(8);
}

function r(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(3)}R`;
}

function pct(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(3)}%`;
}

function dateText(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("nl-NL", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function tone(value: number | null | undefined): string {
  const n = Number(value || 0);

  if (n > 0) return "positive";
  if (n < 0) return "negative";

  return "neutral";
}

export function RecentTradesTable({ rows }: RecentTradesTableProps) {
  if (!rows.length) {
    return (
      <div className="empty">
        Geen recente trades voor deze filters.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Open</th>
            <th>Coin</th>
            <th>Side</th>
            <th>Event</th>
            <th>Setup</th>
            <th>Grade</th>
            <th>Entry</th>
            <th>TP</th>
            <th>SL</th>
            <th>Exit</th>
            <th>R</th>
            <th>PnL %</th>
            <th>Reason</th>
            <th>Flow</th>
            <th>BTC</th>
            <th>RSI</th>
            <th>OB</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(row => (
            <tr key={row.eventId}>
              <td>{dateText(row.date)}</td>
              <td className="mono">{row.symbol || "-"}</td>
              <td>{row.side || "-"}</td>
              <td>{row.eventType}</td>
              <td>{row.setupClass || "-"}</td>
              <td>{row.grade || "-"}</td>
              <td className="mono">{price(row.entry)}</td>
              <td className="mono">{price(row.tp)}</td>
              <td className="mono">{price(row.sl)}</td>
              <td className="mono">{price(row.exit)}</td>
              <td className={tone(row.exitR)}>{r(row.exitR)}</td>
              <td className={tone(row.pnlPct)}>{pct(row.pnlPct)}</td>
              <td className="mono">{row.reason}</td>
              <td>{row.flow}</td>
              <td>{row.btcState}</td>
              <td>{row.rsiZone || "-"}</td>
              <td>{row.obRelation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RecentTradesTable;