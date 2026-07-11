export const dynamic = "force-dynamic";

import { requireAdmin } from "../../../../src/security/adminSession.js";
import { adminListSignals } from "../../../../src/site/adminQueries.js";
import { fmtR, rCls, fmtDateTime } from "../../../../src/site/format.js";

function qs(params, overrides = {}) {
  const merged = { ...params, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v != null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function AdminSignalsPage({ searchParams }) {
  requireAdmin();
  const g = (k) => (typeof searchParams?.[k] === "string" ? searchParams[k] : "");
  const current = {
    direction: g("direction"), setupType: g("setupType"), class: g("class"),
    status: g("status"), symbol: g("symbol"), published: g("published"), cursor: g("cursor"),
  };
  const data = await adminListSignals({ ...current, limit: 50 });

  const sel = (name, label, options) => (
    <label className="dim" style={{ fontSize: "0.8rem" }}>
      {label}
      <select className="input" name={name} defaultValue={current[name]} style={{ marginTop: 4 }}>
        <option value="">Any</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <form method="GET" className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        {sel("direction", "Side", ["LONG", "SHORT"])}
        {sel("setupType", "Setup", ["PULLBACK", "BREAKOUT"])}
        {sel("class", "Class", ["A", "ELITE"])}
        {sel("status", "Status", ["OPEN", "CLOSED"])}
        {sel("published", "Published", ["yes", "no"])}
        <label className="dim" style={{ fontSize: "0.8rem" }}>
          Coin
          <input className="input" name="symbol" defaultValue={current.symbol} placeholder="BTCUSDT" style={{ marginTop: 4 }} />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <button className="btn" type="submit">Filter</button>
          <a href="/admin/signals" className="dim" style={{ fontSize: "0.85rem" }}>Reset</a>
        </div>
      </form>

      <section className="section">
        {data.items.length === 0 ? (
          <div className="card dim">No signals match.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th><th>Coin</th><th>Side</th><th>Setup</th><th>Class</th><th>Score</th>
                  <th>Status</th><th>Pub</th><th>Family @ signal</th><th>Exit</th><th>Net R</th><th>Amb</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.signalId}>
                    <td className="mono">{fmtDateTime(s.candleTime)}</td>
                    <td><a href={`/signal/${s.signalId}`}>{s.symbol}</a></td>
                    <td><span className={`badge badge-${s.direction === "LONG" ? "long" : "short"}`}>{s.direction}</span></td>
                    <td>{s.setupType}</td>
                    <td>{s.class}</td>
                    <td>{s.score}</td>
                    <td>{s.status}</td>
                    <td>{s.published ? "✓" : "—"}</td>
                    <td className="dim">{s.familyStatusAtSignal}</td>
                    <td>{s.exitReason ?? "—"}</td>
                    <td className={rCls(s.netR)}>{fmtR(s.netR)}</td>
                    <td className="dim">{s.ambiguousBar ? "⚠" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          {current.cursor ? <a href={`/admin/signals${qs(current, { cursor: undefined })}`}>← First page</a> : null}
          {data.nextCursor != null ? <a href={`/admin/signals${qs(current, { cursor: data.nextCursor })}`}>Next page →</a> : null}
        </div>
      </section>
    </>
  );
}
