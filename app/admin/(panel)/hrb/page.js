export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../../src/security/adminSession.js";
import { hrbCfg, HRB_FAMILY_IDS } from "../../../../src/hrb/config.js";
import { rcmd } from "../../../../src/storage/redis.js";
import { HK } from "../../../../src/hrb/hrbKeys.js";
import { loadHrbFamilies } from "../../../../src/hrb/hrbFamilyEngine.js";
import { lastRun } from "../../../../src/observability/runs.js";
import { fmtR, rCls, fmtDateTime, fmtDate, statusBadge } from "../../../../src/site/format.js";

export default async function AdminHrbPage() {
  requireAdmin();
  const c = hrbCfg();

  const [fams, measured, open, closed, scanRun, finRun, monRun] = await Promise.all([
    loadHrbFamilies(),
    rcmd("ZCARD", HK.byTime()), rcmd("SCARD", HK.open()), rcmd("ZCARD", HK.closed()),
    lastRun("HRB_SCAN"), lastRun("HRB_FINALIZE"), lastRun("HRB_MONITOR"),
  ]);

  let totalNetR = 0, completedTotal = 0;
  for (const fid of HRB_FAMILY_IDS) {
    totalNetR += fams[fid].netR || 0;
    completedTotal += fams[fid].completed || 0;
  }

  const runs = [
    ["Scan", scanRun], ["Finalize", finRun], ["Monitor", monRun],
  ];

  return (
    <>
      <section className="hero" style={{ paddingTop: 8 }}>
        <h1>HRB — Hybrid RSI Band <span className="badge badge-collecting">EXPERIMENT</span></h1>
        <p className="lead">
          Tweede indicatorsysteem, meet stil naast ARS-U. Namespace{" "}
          <span className="mono">{c.namespace}</span> · zelfde exit-model, zelfde
          statistiek · min n={c.minTotalPerFamily} · niets naar Discord.
        </p>
      </section>

      <section className="grid grid-stats">
        <div className="card stat">
          <div className="stat-value">{Number(measured || 0)}</div>
          <div className="stat-label">Signalen gemeten · {Number(open || 0)} open</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{Number(closed || 0)}</div>
          <div className="stat-label">Afgerond</div>
        </div>
        <div className="card stat">
          <div className={`stat-value ${rCls(totalNetR)}`}>{fmtR(Number(totalNetR.toFixed(2)))}</div>
          <div className="stat-label">Totaal netto (alle families)</div>
        </div>
      </section>

      <section className="section">
        <h2>Runs</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Status</th><th>Voltooid</th><th>Kandidaten</th></tr></thead>
            <tbody>
              {runs.map(([name, r]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{r?.status ?? "—"}</td>
                  <td className="mono">{fmtDateTime(r?.completedAt)}</td>
                  <td>{name === "Scan" ? (r?.candidates ?? "—") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Families (4)</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Family</th><th>Status</th><th>Seen</th><th>Open</th><th>n</th>
                <th>L/BE/TP2/TO</th><th>Avg net R</th><th>LCB</th><th>p</th><th>FDR</th>
                <th>PF</th><th>Win %</th><th>Max DD</th><th>Last 30</th><th>Verified</th><th>Lost</th>
              </tr>
            </thead>
            <tbody>
              {HRB_FAMILY_IDS.map((fid) => {
                const f = fams[fid];
                return (
                  <tr key={fid}>
                    <td className="mono">{fid}</td>
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
                    <td className={rCls(f.last30AvgR)}>{fmtR(f.last30AvgR)}</td>
                    <td className="dim">{fmtDate(f.verifiedAt)}</td>
                    <td className="dim">{fmtDate(f.lostEdgeAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="dim" style={{ marginTop: 10, fontSize: "0.8rem" }}>
          Verwachting: HRB filtert streng (Band + HPE-bevestiging), dus n groeit langzaam —
          weken, niet dagen. Diagnose in de motor: <span className="mono">/api/admin/hrb-diagnose?bars=64</span>.
          Niets aan drempels of parameters wijzigen tijdens het verzamelen.
        </p>
      </section>
    </>
  );
}
