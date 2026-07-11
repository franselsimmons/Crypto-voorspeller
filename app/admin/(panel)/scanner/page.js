export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../../src/security/adminSession.js";
import { scannerInfo } from "../../../../src/site/adminQueries.js";

export default async function AdminScannerPage() {
  requireAdmin();
  const info = await scannerInfo();

  return (
    <>
      <p className="dim">Shards configured: {info.shardsConfigured} · concurrency per shard: {info.concurrency}</p>
      {info.cycles.map((cy) => (
        <section className="section" key={cy.cycleId}>
          <h2 className="mono">Cycle {cy.cycleIso}</h2>
          <p className="dim">
            Status: {cy.meta.status ?? "—"} · shards {cy.meta.completedShardCount ?? 0}/{cy.meta.expectedShardCount ?? info.shardsConfigured}
          </p>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr><th>Shard</th><th>Processed</th><th>Failed</th><th>Candidates</th><th>API calls</th><th>Duration</th><th>Top candidates</th></tr>
              </thead>
              <tbody>
                {cy.shards.map((s) => (
                  <tr key={s.shard}>
                    <td>{s.shard}</td>
                    <td>{s.present ? s.processed : "—"}</td>
                    <td className={s.failed ? "neg" : ""}>{s.present ? s.failed : "—"}</td>
                    <td>{s.present ? s.candidates : "—"}</td>
                    <td>{s.present ? s.apiCalls : "—"}</td>
                    <td>{s.present ? `${s.durationMs} ms` : "—"}</td>
                    <td className="mono dim">
                      {s.present && s.top.length
                        ? s.top.map((t) => `${t.symbol} ${t.direction[0]}${t.class === "ELITE" ? "*" : ""} ${t.score}`).join(" · ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
