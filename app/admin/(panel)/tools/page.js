export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../../src/security/adminSession.js";
import AdminRunButton from "../../../../components/AdminRunButton.js";

export default function AdminToolsPage() {
  requireAdmin();
  return (
    <>
      <h2>Manual runs</h2>
      <p className="dim" style={{ fontSize: "0.85rem", marginTop: 6 }}>
        Manual routes use the same locks, cycle idempotency and signal dedupe as the crons — running
        them alongside a scheduled run can never create duplicate signals.
      </p>
      <div className="section grid grid-3">
        <div className="card">
          <h3>Universe</h3>
          <p className="dim" style={{ marginBottom: 10 }}>Refresh the ~150-coin universe snapshot.</p>
          <AdminRunButton path="/api/admin/run-universe" label="Run universe" />
        </div>
        <div className="card">
          <h3>Scan + finalize</h3>
          <p className="dim" style={{ marginBottom: 10 }}>All shards for the current cycle, then finalize.</p>
          <AdminRunButton
            path="/api/admin/run-scan"
            label="Run full scan"
            confirmText="Run all shards + finalize for the current cycle?"
          />
        </div>
        <div className="card">
          <h3>Monitor</h3>
          <p className="dim" style={{ marginBottom: 10 }}>Resolve open virtual positions now.</p>
          <AdminRunButton path="/api/admin/run-monitor" label="Run monitor" />
        </div>
        <div className="card">
          <h3>Daily digest</h3>
          <p className="dim" style={{ marginBottom: 10 }}>Rebuild and (re)post yesterday's digest via the cron path.</p>
          <AdminRunButton
            path="/api/admin/run-digest"
            label="Run digest"
            confirmText="Post the daily digest to Discord now?"
          />
        </div>
        <div className="card">
          <h3>Exports</h3>
          <p className="dim" style={{ marginBottom: 10 }}>Full JSON (admin) or filtered CSV (public).</p>
          <p><a href="/api/admin/export">Download JSON export</a></p>
          <p><a href="/api/public/export">Download CSV export</a></p>
        </div>
        <div className="card">
          <h3>Health</h3>
          <p className="dim" style={{ marginBottom: 10 }}>Public status JSON and page.</p>
          <p><a href="/api/public/status">/api/public/status</a></p>
          <p><a href="/status">/status</a></p>
        </div>
      </div>
      <p className="dim" style={{ fontSize: "0.8rem" }}>
        Reset functions are intentionally not implemented (per spec they require an explicit
        environment flag; the safest implementation of a destructive tool is its absence).
      </p>
    </>
  );
}
