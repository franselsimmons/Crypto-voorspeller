export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../../src/security/adminSession.js";
import { positionsDetail } from "../../../../src/site/adminQueries.js";
import { priceStr } from "../../../../src/utils/math.js";
import { fmtR, rCls, fmtDur } from "../../../../src/site/format.js";

export default async function AdminPositionsPage() {
  requireAdmin();
  const data = await positionsDetail(true);

  return (
    <>
      <h2>Open virtual positions ({data.count})</h2>
      {data.count === 0 ? (
        <div className="card dim" style={{ marginTop: 12 }}>No open positions.</div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Coin</th><th>Side</th><th>Family</th><th>Entry</th><th>SL</th><th>TP1</th>
                <th>TP2</th><th>Last</th><th>Current R</th><th>Age</th><th>Timeout at (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p) => (
                <tr key={p.signalId}>
                  <td><a href={`/signal/${p.signalId}`}>{p.symbol}</a></td>
                  <td><span className={`badge badge-${p.direction === "LONG" ? "long" : "short"}`}>{p.direction}</span></td>
                  <td className="mono dim">{p.familyId}</td>
                  <td className="mono">{priceStr(p.entry, 1e-8)}</td>
                  <td className="mono">{priceStr(p.stopLoss, 1e-8)}</td>
                  <td className="mono">{priceStr(p.tp1, 1e-8)}{p.tp1Hit ? " ✓" : ""}</td>
                  <td className="mono">{priceStr(p.tp2, 1e-8)}</td>
                  <td className="mono">{p.last != null ? priceStr(p.last, 1e-8) : "—"}</td>
                  <td className={rCls(p.currentR)}>{fmtR(p.currentR)}</td>
                  <td>{fmtDur(p.ageMinutes)}</td>
                  <td className="mono dim">{p.timeoutAtIso.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="dim" style={{ marginTop: 10, fontSize: "0.8rem" }}>
        Current R is indicative (last price vs initial risk); resolution always happens on closed candles in the monitor.
      </p>
    </>
  );
}
