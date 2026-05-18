import type { BreakdownRow } from "@/lib/dashboard";

type BreakdownTableProps = {
  rows: BreakdownRow[];
};

function pct(value: number): string {
  if (!Number.isFinite(value)) return "0.00%";
  return `${(value * 100).toFixed(2)}%`;
}

function r(value: number): string {
  if (!Number.isFinite(value)) return "0.000R";
  return `${value.toFixed(3)}R`;
}

function tone(value: number | null | undefined): string {
  const n = Number(value || 0);

  if (n > 0) return "positive";
  if (n < 0) return "negative";

  return "neutral";
}

export function BreakdownTable({ rows }: BreakdownTableProps) {
  if (!rows.length) {
    return (
      <div className="empty">
        Geen breakdown-data voor deze filters.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Filter</th>
            <th>Waarde</th>
            <th>Events</th>
            <th>Closed</th>
            <th>Winrate</th>
            <th>Wilson</th>
            <th>Total R</th>
            <th>Avg R</th>
            <th>Entries</th>
            <th>Exits</th>
            <th>Rejects</th>
            <th>Snapshots</th>
            <th>Voorbeelden</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.dimension}-${row.value}-${index}`}>
              <td>{row.dimension}</td>
              <td className="mono">{row.value}</td>
              <td>{row.count}</td>
              <td>{row.closed}</td>
              <td>{pct(row.winrate)}</td>
              <td>{pct(row.wilson)}</td>
              <td className={tone(row.totalR)}>{r(row.totalR)}</td>
              <td className={tone(row.avgR)}>{r(row.avgR)}</td>
              <td>{row.entries}</td>
              <td>{row.exits}</td>
              <td>{row.rejects}</td>
              <td>{row.snapshots}</td>
              <td className="mono">{row.examples}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default BreakdownTable;