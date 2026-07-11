export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../../src/security/adminSession.js";
import { familiesDetail } from "../../../../src/site/adminQueries.js";
import { fmtR, rCls, fmtDateTime, fmtDate, statusBadge } from "../../../../src/site/format.js";

export default async function AdminFamiliesPage() {
  requireAdmin();
  const d = await familiesDetail();

  return (
    <>
      <p className="dim">
        Namespace <span className="mono">{d.namespace}</span> · min n={d.minCompleted} · shrinkage k={d.kPrior} ·
        bootstrap B={d.bootstrapB} · BH α={d.bhAlpha}
      </p>

      <section className="section">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Family</th><th>Status</th><th>Seen</th><th>Open</th><th>n</th>
                <th>L/BE/TP2/TO</th><th>Avg net R</th><th>LCB</th><th>p</th><th>FDR</th>
                <th>PF</th><th>Win %</th><th>Max DD</th><th>Cur DD</th><th>Streak ±</th>
                <th>Last 30</th><th>Last 50</th><th>Verified</th><th>Lost</th>
              </tr>
            </thead>
            <tbody>
              {d.families.map((f) => (
                <tr key={f.familyId}>
                  <td className="mono">{f.familyId}</td>
                  <td><span className={statusBadge(f.status)}>{f.status}</span></td>
                  <td>{f.seen}</td>
                  <td>{f.open}</td>
                  <td>{f.completed}</td>
                  <td className="mono dim">{f.counts.loss}/{f.counts.be}/{f.counts.full}/{f.counts.timeout}</td>
                  <td className={rCls(f.avgNetR)}>{fmtR(f.avgNetR)}</td>
                  <td className={rCls(f.lcb)}>{fmtR(f.lcb)}</td>
                  <td className="mono">{f.pValue != null ? f.pValue.toFixed(3) : "—"}</td>
                  <td>{f.fdrPass ? "✓" : "—"}</td>
                  <td>{f.profitFactor ?? "—"}</td>
                  <td>{f.winrate != null ? `${f.winrate.toFixed(1)}%` : "—"}</td>
                  <td className="neg">{f.maxDrawdownR ? `−${f.maxDrawdownR.toFixed(2)}R` : "—"}</td>
                  <td className="dim">{f.currentDrawdownR ? `−${f.currentDrawdownR.toFixed(2)}R` : "—"}</td>
                  <td className="mono dim">{f.bestStreak}/{f.worstStreak}</td>
                  <td className={rCls(f.last30AvgR)}>{fmtR(f.last30AvgR)}</td>
                  <td className={rCls(f.last50AvgR)}>{fmtR(f.last50AvgR)}</td>
                  <td className="dim">{fmtDate(f.verifiedAt)}</td>
                  <td className="dim">{fmtDate(f.lostEdgeAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Status history</h2>
        {d.statusLog.length === 0 ? (
          <div className="card dim">No status changes yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Family</th><th>From</th><th>To</th><th>n</th><th>Avg net R</th><th>LCB</th></tr></thead>
              <tbody>
                {d.statusLog.map((c, i) => (
                  <tr key={`${c.familyId}-${c.at}-${i}`}>
                    <td className="mono">{fmtDateTime(c.at)}</td>
                    <td className="mono">{c.familyId}</td>
                    <td>{c.from}</td>
                    <td><span className={statusBadge(c.to)}>{c.to}</span></td>
                    <td>{c.n}</td>
                    <td className={rCls(c.avgNetR)}>{fmtR(c.avgNetR)}</td>
                    <td className={rCls(c.lcb)}>{fmtR(c.lcb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
