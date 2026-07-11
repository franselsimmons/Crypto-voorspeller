export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../src/security/adminSession.js";
import { adminOverview } from "../../../src/site/adminQueries.js";
import { fmtDateTime } from "../../../src/site/format.js";

export default async function AdminOverviewPage() {
  requireAdmin();
  const o = await adminOverview();
  const runs = [
    ["Universe", o.runs.universe], ["Finalize", o.runs.finalize],
    ["Monitor", o.runs.monitor], ["Digest", o.runs.digest],
    ["Last shard scan", o.runs.lastShardScan],
  ];

  return (
    <>
      <section className="grid grid-stats">
        <div className="card stat">
          <div className="stat-value">{o.universe.count}</div>
          <div className="stat-label">Universe coins · {fmtDateTime(o.universe.updatedAt)}</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{o.signals.measured}</div>
          <div className="stat-label">Signals measured · {o.signals.open} open</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{o.signals.publishedToday} / {o.signals.maxPerDay}</div>
          <div className="stat-label">Published today (UTC)</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{o.verifiedFamilies.length} / 8</div>
          <div className="stat-label">Verified families</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{o.waitlistCount}</div>
          <div className="stat-label">Waitlist emails</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{o.system.memoryMb} MB</div>
          <div className="stat-label">RSS · {o.system.collectingMode ? "COLLECTING" : "LIVE"} · paid {o.system.paidLaunch ? "on" : "off"}</div>
        </div>
      </section>

      <section className="section">
        <h2>Runs</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Status</th><th>Completed</th><th>Duration</th><th>Error</th></tr></thead>
            <tbody>
              {runs.map(([name, r]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{r?.status ?? "—"}</td>
                  <td className="mono">{fmtDateTime(r?.completedAt)}</td>
                  <td>{r?.durationMs != null ? `${r.durationMs} ms` : "—"}</td>
                  <td className="neg">{r?.errorSummary ?? ""}</td>
                </tr>
              ))}
              {o.runs.shardStatuses.map((s) => (
                <tr key={`shard-${s.shard}`}>
                  <td className="dim">Scan shard {s.shard}</td>
                  <td>{s.status ?? "—"}</td>
                  <td className="mono">{fmtDateTime(s.at)}</td>
                  <td>—</td><td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Discord</h2>
        <div className="card dim">
          Last post: {o.discord.lastPost
            ? `${o.discord.lastPost.ok ? "SUCCESS" : `FAILED (${o.discord.lastPost.status})`} · ${o.discord.lastPost.channel} · ${fmtDateTime(o.discord.lastPost.t)}`
            : "—"}
          {" · "}namespace <span className="mono">{o.system.namespace}</span>
        </div>
      </section>
    </>
  );
}
