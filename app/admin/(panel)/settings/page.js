export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../../src/security/adminSession.js";
import { cfg, ARS_PARAMS } from "../../../../src/config.js";

export default function AdminSettingsPage() {
  requireAdmin();
  const c = cfg();
  const rows = [
    ["NODE_ENV", process.env.NODE_ENV || "—"],
    ["APP_URL", c.appUrl],
    ["COLLECTING_MODE", String(c.collectingMode)],
    ["PAID_LAUNCH_ENABLED", String(c.paidLaunch)],
    ["MONTHLY_PRICE_EUR", String(c.monthlyPriceEur)],
    ["MAX_UNIVERSE_SIZE", String(c.maxUniverse)],
    ["MIN_DAILY_VOLUME_USD", String(c.minDailyVolumeUsd)],
    ["MAX_PUBLICATIONS_PER_DAY", String(c.maxPubsPerDay)],
    ["SCAN_SHARDS", String(c.scanShards)],
    ["SCAN_CONCURRENCY", String(c.scanConcurrency)],
    ["POSITION_TIMEOUT_MINUTES", String(c.timeoutMinutes)],
    ["COST_R", c.costR.toFixed(2)],
    ["Candle window", String(c.candleLimit)],
    ["Warmup bars", String(c.warmupBars)],
    ["Family min n", String(c.minTotalPerFamily)],
    ["Shrinkage k", String(c.kPrior)],
    ["Bootstrap B", String(c.bootstrapB)],
    ["BH alpha", String(c.bhAlpha)],
    ["INDICATOR_VERSION", c.indicatorVersion],
    ["PARAMETER_VERSION", c.parameterVersion],
    ["Parameter hash", c.parameterHash],
    ["Namespace", c.namespace],
    ["Engine version", c.engineVersion],
  ];
  const hooks = Object.entries(c.webhooks).map(([k, v]) => [k, v ? "configured" : "not set"]);

  return (
    <>
      <h2>Configuration (read-only)</h2>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><td className="dim">{k}</td><td className="mono">{v}</td></tr>
            ))}
            {hooks.map(([k, v]) => (
              <tr key={k}><td className="dim">Webhook · {k}</td><td className={v === "configured" ? "pos" : "neg"}>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dim" style={{ marginTop: 12, fontSize: "0.85rem" }}>
        Values change via Vercel environment variables + redeploy. Secrets are never displayed here.
        Changing indicator parameters changes the parameter hash and starts a fresh statistical namespace.
      </p>
      <details style={{ marginTop: 14 }}>
        <summary className="dim">ARS parameters (hashed into namespace)</summary>
        <pre className="mono dim" style={{ fontSize: "0.75rem", marginTop: 8, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(ARS_PARAMS, null, 2)}
        </pre>
      </details>
    </>
  );
}
