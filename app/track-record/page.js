export const dynamic = "force-dynamic";

import { listSignals } from "../../src/site/queries.js";
import { FAMILY_IDS } from "../../src/config.js";
import { priceStr } from "../../src/utils/math.js";
import { fmtR, rCls, fmtDateTime, fmtDur } from "../../src/site/format.js";

function qs(params, overrides = {}) {
  const merged = { ...params, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function TrackRecordPage({ searchParams }) {
  const g = (k) => (typeof searchParams?.[k] === "string" ? searchParams[k] : "");
  const current = {
    direction: g("direction"), setupType: g("setupType"), class: g("class"),
    familyId: g("familyId"), status: g("status"), symbol: g("symbol"),
    dateFrom: g("dateFrom"), dateTo: g("dateTo"), result: g("result"),
    cursor: g("cursor"),
  };

  let data = { items: [], nextCursor: null };
  let loadError = null;
  try {
    data = await listSignals({ ...current, limit: 50 });
  } catch (err) {
    loadError = String(err?.message || err);
  }

  const sel = (name, label, options) => (
    <label className="dim" style={{ fontSize: "0.8rem" }}>
      {label}
      <select className="input" name={name} defaultValue={current[name]} style={{ marginTop: 4 }}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <section className="hero">
        <h1>Live track record</h1>
        <p className="lead">
          Every qualifying A and ELITE setup, published or not. Records are append-only and
          hash-chained; losers are never removed.
        </p>
      </section>

      <section className="section">
        <form method="GET" className="card grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {sel("direction", "Side", ["LONG", "SHORT"])}
          {sel("setupType", "Setup", ["PULLBACK", "BREAKOUT"])}
          {sel("class", "Class", ["A", "ELITE"])}
          {sel("familyId", "Family", FAMILY_IDS)}
          {sel("status", "Status", ["OPEN", "CLOSED"])}
          {sel("result", "Result", ["win", "loss"])}
          <label className="dim" style={{ fontSize: "0.8rem" }}>
            Coin
            <input className="input" name="symbol" defaultValue={current.symbol} placeholder="BTCUSDT" style={{ marginTop: 4 }} />
          </label>
          <label className="dim" style={{ fontSize: "0.8rem" }}>
            From
            <input className="input" type="date" name="dateFrom" defaultValue={current.dateFrom} style={{ marginTop: 4 }} />
          </label>
          <label className="dim" style={{ fontSize: "0.8rem" }}>
            To
            <input className="input" type="date" name="dateTo" defaultValue={current.dateTo} style={{ marginTop: 4 }} />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <button className="btn" type="submit">Filter</button>
            <a href="/track-record" className="dim" style={{ fontSize: "0.85rem" }}>Reset</a>
          </div>
        </form>
      </section>

      <section className="section">
        {loadError ? (
          <div className="card neg">Track record temporarily unavailable: {loadError}</div>
        ) : data.items.length === 0 ? (
          <div className="card dim">No signals match these filters yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date (UTC)</th><th>Coin</th><th>Side</th><th>Setup</th><th>Class</th>
                  <th>Score</th><th>Entry</th><th>SL</th><th>TP1</th><th>TP2</th>
                  <th>Status</th><th>Result</th><th>Gross R</th><th>Cost R</th><th>Net R</th>
                  <th>Duration</th><th>Version</th>
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
                    <td className="mono">{priceStr(s.entry, s.tick)}</td>
                    <td className="mono">{priceStr(s.stopLoss, s.tick)}</td>
                    <td className="mono">{priceStr(s.tp1, s.tick)}</td>
                    <td className="mono">{priceStr(s.tp2, s.tick)}</td>
                    <td>{s.status}</td>
                    <td>{s.result ?? "—"}</td>
                    <td className={rCls(s.grossR)}>{fmtR(s.grossR)}</td>
                    <td className="dim">{s.costR != null ? `−${s.costR.toFixed(2)}R` : "—"}</td>
                    <td className={rCls(s.netR)}>{fmtR(s.netR)}</td>
                    <td>{fmtDur(s.durationMinutes)}</td>
                    <td className="mono dim">{s.indicatorVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          {current.cursor ? <a href={`/track-record${qs(current, { cursor: undefined })}`}>← First page</a> : null}
          {data.nextCursor != null ? (
            <a href={`/track-record${qs(current, { cursor: data.nextCursor })}`}>Next page →</a>
          ) : null}
          <a href={`/api/public/export${qs(current, { cursor: undefined })}`} className="dim">
            Download CSV
          </a>
        </div>
      </section>
    </>
  );
}
