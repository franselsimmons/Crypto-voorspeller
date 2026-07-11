export const revalidate = 60;

import { getFamilyList } from "../../src/site/queries.js";
import { fmtR, rCls, fmtDate, statusBadge } from "../../src/site/format.js";

export default async function FamiliesPage() {
  let data = null;
  let loadError = null;
  try {
    data = await getFamilyList();
  } catch (err) {
    loadError = String(err?.message || err);
  }

  return (
    <>
      <section className="hero">
        <h1>Setup families</h1>
        <p className="lead">
          Eight families: direction × setup type × class. Verification happens here — a family is
          only VERIFIED when its statistical lower bound on average net R is positive after costs,
          with at least {data?.minCompleted ?? 30} completed measurements and an FDR correction
          (α = {data?.bhAlpha ?? 0.1}) across all families.
        </p>
      </section>

      <section className="section">
        {loadError ? (
          <div className="card neg">Family data temporarily unavailable: {loadError}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Family</th><th>Status</th><th>n</th><th>Avg net R</th><th>LCB (5%)</th>
                  <th>PF</th><th>Win %</th><th>Max DD</th><th>Last 30</th><th>Last 50</th>
                  <th>Verified</th><th>Edge lost</th>
                </tr>
              </thead>
              <tbody>
                {data.families.map((f) => (
                  <tr key={f.familyId}>
                    <td className="mono">{f.familyId}</td>
                    <td><span className={statusBadge(f.status)}>{f.status}</span></td>
                    <td>{f.completed}</td>
                    <td className={rCls(f.avgNetR)}>{fmtR(f.avgNetR)}</td>
                    <td className={rCls(f.lcb)}>{fmtR(f.lcb)}</td>
                    <td>{f.profitFactor ?? "—"}</td>
                    <td>{f.winrate != null ? `${f.winrate.toFixed(1)}%` : "—"}</td>
                    <td className="neg">{f.maxDrawdownR ? `−${f.maxDrawdownR.toFixed(2)}R` : "—"}</td>
                    <td className={rCls(f.last30AvgR)}>{fmtR(f.last30AvgR)}</td>
                    <td className={rCls(f.last50AvgR)}>{fmtR(f.last50AvgR)}</td>
                    <td className="dim">{fmtDate(f.verifiedAt)}</td>
                    <td className="dim">{fmtDate(f.lostEdgeAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>What the statuses mean</h2>
        <div className="grid grid-3">
          <div className="card">
            <h3><span className="badge badge-collecting">COLLECTING</span></h3>
            <p className="dim">Fewer than {data?.minCompleted ?? 30} completed measurements. No claim is made either way.</p>
          </div>
          <div className="card">
            <h3><span className="badge badge-neutral">CANDIDATE</span></h3>
            <p className="dim">Positive average, but the lower bound or the FDR test does not (yet) confirm it. Statistically: promising, unproven.</p>
          </div>
          <div className="card">
            <h3><span className="badge badge-verified">VERIFIED</span></h3>
            <p className="dim">Lower confidence bound above zero after costs, FDR-corrected. This label is revoked automatically and publicly if the edge fades.</p>
          </div>
        </div>
      </section>
    </>
  );
}
