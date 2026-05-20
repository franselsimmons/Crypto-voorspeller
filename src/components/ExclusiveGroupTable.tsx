import type { ExclusiveGroupRow } from "@/lib/dashboard";
import { compactNumber, pct, r } from "@/lib/format";

function profitFactorText(value: number | null): string {
  if (value === null) return "—";
  if (value >= 999) return "∞";
  return compactNumber(value, 2);
}

function renderObject(value: Record<string, unknown>, maxItems = 10): string {
  const entries = Object.entries(value).slice(0, maxItems);

  if (!entries.length) return "—";

  return entries
    .map(([key, val]) => `${key}=${String(val)}`)
    .join(" | ");
}

function renderMixed(value: Record<string, Record<string, number>>, maxDims = 8): string {
  const dims = Object.entries(value).slice(0, maxDims);

  if (!dims.length) return "—";

  return dims
    .map(([key, dist]) => {
      const top = Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([v, count]) => `${v}:${count}`)
        .join(",");

      return `${key}[${top}]`;
    })
    .join(" | ");
}

export function ExclusiveGroupTable({ rows }: { rows: ExclusiveGroupRow[] }) {
  if (!rows.length) {
    return (
      <div className="panel">
        <p>Geen exclusive groups gevonden.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Group</th>
            <th>Score</th>
            <th>Trades</th>
            <th>Winrate</th>
            <th>Wilson</th>
            <th>Total R</th>
            <th>Avg R</th>
            <th>PF</th>
            <th>Near TP</th>
            <th>Direct SL</th>
            <th>Fixed filters</th>
            <th>Mixed filters</th>
            <th>Group key</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={row.groupId}>
              <td>{index + 1}</td>
              <td>
                <strong>{row.groupId}</strong>
                <br />
                <small>{row.patternName}</small>
              </td>
              <td>{compactNumber(row.score, 2)}</td>
              <td>{compactNumber(row.trades, 0)}</td>
              <td>{pct(row.winrate)}</td>
              <td>{pct(row.wilson)}</td>
              <td>{r(row.totalR)}</td>
              <td>{r(row.avgR)}</td>
              <td>{profitFactorText(row.profitFactor)}</td>
              <td>{pct(row.nearTpPct)}</td>
              <td>{pct(row.directSlPct)}</td>
              <td>
                <code>{renderObject(row.fixedFilters)}</code>
              </td>
              <td>
                <code>{renderMixed(row.mixedFilters)}</code>
              </td>
              <td>
                <code>{row.cohortKey}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}