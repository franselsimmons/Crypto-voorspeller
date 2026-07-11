export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../../src/security/adminSession.js";
import { discordLogsList } from "../../../../src/site/adminQueries.js";
import { fmtDateTime } from "../../../../src/site/format.js";

export default async function AdminDiscordPage() {
  requireAdmin();
  const { logs } = await discordLogsList(100);

  return (
    <>
      <h2>Discord delivery log (last {logs.length})</h2>
      {logs.length === 0 ? (
        <div className="card dim" style={{ marginTop: 12 }}>No posts yet.</div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>When</th><th>Channel</th><th>Result</th><th>Status</th><th>Dedupe key</th></tr></thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={`${l.t}-${i}`}>
                  <td className="mono">{fmtDateTime(l.t)}</td>
                  <td>{l.channel}</td>
                  <td className={l.ok ? "pos" : "neg"}>{l.ok ? "SUCCESS" : "FAILED"}</td>
                  <td className="mono">{String(l.status)}</td>
                  <td className="mono dim" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.dedupeKey ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="dim" style={{ marginTop: 10, fontSize: "0.8rem" }}>
        Failures never block scanning or measurement; delivery is retried on the next qualifying event.
      </p>
    </>
  );
}
