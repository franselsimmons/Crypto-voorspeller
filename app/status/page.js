export const dynamic = "force-dynamic";

import { getStatusInfo } from "../../src/site/queries.js";
// Gedocumenteerde uitzondering (zie PROJECT_STATE): laatste Discord-publicatie wordt
// rechtstreeks uit Redis gelezen om queries.js niet te hoeven hervers leveren.
import { rcmd } from "../../src/storage/redis.js";
import { K } from "../../src/storage/keys.js";
import { fmtDateTime } from "../../src/site/format.js";

const healthBadge = (h) =>
  h === "OK" ? "badge badge-verified" : h === "DEGRADED" ? "badge badge-collecting" : "badge badge-lost";

export default async function StatusPage() {
  let info = null;
  let lastDiscord = null;
  let loadError = null;
  try {
    info = await getStatusInfo();
    const raw = await rcmd("LRANGE", K.discordLogs(), 0, 0);
    if (raw && raw[0]) lastDiscord = JSON.parse(raw[0]);
  } catch (err) {
    loadError = String(err?.message || err);
  }

  if (loadError) {
    return <section className="section"><div className="card neg">Status unavailable: {loadError}</div></section>;
  }

  const runs = [
    ["Universe", info.lastUniverse],
    ["Scan finalize", info.lastFinalize],
    ["Monitor", info.lastMonitor],
    ["Daily digest", info.lastDigest],
  ];

  return (
    <>
      <section className="hero">
        <h1>System status <span className={healthBadge(info.health)}>{info.health}</span></h1>
        <p className="lead">Live health of the scanner, monitor and publication pipeline.</p>
      </section>

      <section className="section grid grid-stats">
        <div className="card stat">
          <div className="stat-value">{info.universeCount}</div>
          <div className="stat-label">Coins in universe</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{info.openPositions}</div>
          <div className="stat-label">Open virtual positions</div>
        </div>
        <div className="card stat">
          <div className="stat-value mono" style={{ fontSize: "1rem" }}>{info.indicatorVersion}</div>
          <div className="stat-label">Indicator · params {info.parameterHash} · engine {info.engineVersion}</div>
        </div>
      </section>

      <section className="section">
        <h2>Runs</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Status</th><th>Completed at</th></tr></thead>
            <tbody>
              {runs.map(([name, r]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{r?.status ?? "—"}</td>
                  <td className="mono">{fmtDateTime(r?.at)}</td>
                </tr>
              ))}
              <tr>
                <td>Last Discord post</td>
                <td>{lastDiscord ? (lastDiscord.ok ? "SUCCESS" : `FAILED (${lastDiscord.status})`) : "—"}</td>
                <td className="mono">{fmtDateTime(lastDiscord?.t)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Yesterday's manifest</h2>
        <div className="card">
          <p className="dim" style={{ fontSize: "0.85rem" }}>
            Date {info.yesterdayManifest.date} · records {info.yesterdayManifest.recordCount}
          </p>
          <p className="dim" style={{ fontSize: "0.8rem", marginTop: 6 }}>Daily root hash</p>
          <p className="mono" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
            {info.yesterdayManifest.dailyRootHash ?? "— (no records yet)"}
          </p>
        </div>
      </section>
    </>
  );
}
