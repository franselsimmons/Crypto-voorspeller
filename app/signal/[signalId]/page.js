export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getSignal } from "../../../src/site/queries.js";
import { priceStr } from "../../../src/utils/math.js";
import { fmtR, rCls, fmtDateTime, fmtDur, statusBadge } from "../../../src/site/format.js";

const SCORE_LABELS = {
  regime: "Regime", htf: "Higher timeframe", structure: "Structure", momentum: "Momentum",
  volume: "Volume", liquidity: "Liquidity", entry: "Entry quality", room: "Room / RR",
};

export default async function SignalPage({ params }) {
  const id = String(params?.signalId || "");
  if (!/^ARS-[a-f0-9]{16}$/.test(id)) notFound();

  let s = null;
  let loadError = null;
  try {
    s = await getSignal(id);
  } catch (err) {
    loadError = String(err?.message || err);
  }
  if (loadError) {
    return <section className="section"><div className="card neg">Signal temporarily unavailable: {loadError}</div></section>;
  }
  if (!s) notFound();

  const t = s.tick;
  const rows = [
    ["Entry", priceStr(s.entry, t)],
    ["Stop-loss", priceStr(s.stopLoss, t)],
    ["TP1 · 1R", priceStr(s.tp1, t)],
    ["TP2 · 2R", priceStr(s.tp2, t)],
    ["Risk distance", priceStr(s.riskDistance, t)],
    ["Stop (ATR)", s.stopAtr != null ? s.stopAtr.toFixed(2) : "—"],
    ["Room to structure", s.roomToStructureR != null ? `${s.roomToStructureR.toFixed(2)}R` : "—"],
  ];

  return (
    <>
      <section className="hero">
        <h1>
          <span className={`badge badge-${s.direction === "LONG" ? "long" : "short"}`}>{s.direction}</span>{" "}
          {s.symbol} · {s.class} · score {s.score}
        </h1>
        <p className="lead">
          15M {s.setupType} · signal candle {fmtDateTime(s.candleTime)} · family{" "}
          <span className="mono">{s.familyId}</span>{" "}
          <span className={statusBadge(s.familyStatusAtSignal)}>{s.familyStatusAtSignal}</span>
        </p>
      </section>

      <section className="section grid grid-3">
        <div className="card">
          <h3>Trade plan</h3>
          <table style={{ minWidth: 0 }}>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}><td className="dim">{k}</td><td className="mono">{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Market context</h3>
          <table style={{ minWidth: 0 }}>
            <tbody>
              <tr><td className="dim">Regime</td><td>{s.regime ?? "—"}</td></tr>
              <tr><td className="dim">4H bias</td><td>{s.htfBias === 1 ? "BULL" : s.htfBias === -1 ? "BEAR" : "NEUTRAL"}</td></tr>
              <tr><td className="dim">Structure bias</td><td>{s.structureBias === 1 ? "UP" : s.structureBias === -1 ? "DOWN" : "FLAT"}</td></tr>
              <tr><td className="dim">Vol rank</td><td>{s.volRank ?? "—"}</td></tr>
              <tr><td className="dim">ER rank</td><td>{s.erRank ?? "—"}</td></tr>
              <tr><td className="dim">Relative volume</td><td>{s.relativeVolume ?? "—"}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Score breakdown</h3>
          <table style={{ minWidth: 0 }}>
            <tbody>
              {Object.entries(SCORE_LABELS).map(([key, label]) => (
                <tr key={key}>
                  <td className="dim">{label}</td>
                  <td className="mono">{s.scoreParts?.[key] != null ? s.scoreParts[key].toFixed(1) : "—"}</td>
                </tr>
              ))}
              <tr><td><strong>Total</strong></td><td className="mono"><strong>{s.score}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section grid grid-3">
        <div className="card">
          <h3>Timeline</h3>
          <table style={{ minWidth: 0 }}>
            <tbody>
              <tr><td className="dim">Signal candle</td><td className="mono">{fmtDateTime(s.candleTime)}</td></tr>
              <tr><td className="dim">Recorded</td><td className="mono">{fmtDateTime(s.createdAt)}</td></tr>
              <tr><td className="dim">TP1 hit</td><td className="mono">{s.outcome?.tp1Hit ? fmtDateTime(s.outcome.tp1HitAt) : "—"}</td></tr>
              <tr><td className="dim">Closed</td><td className="mono">{fmtDateTime(s.outcome?.closedAt)}</td></tr>
              <tr><td className="dim">Duration</td><td>{fmtDur(s.outcome?.durationMinutes)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Outcome</h3>
          {s.status !== "CLOSED" ? (
            <p className="dim">Position is still open. Outcome appears here after resolution.</p>
          ) : (
            <table style={{ minWidth: 0 }}>
              <tbody>
                <tr><td className="dim">Exit</td><td>{s.outcome.exitReason}{s.outcome.ambiguousBar ? " · AMBIGUOUS_BAR" : ""}</td></tr>
                <tr><td className="dim">Gross R</td><td className={rCls(s.outcome.grossR)}>{fmtR(s.outcome.grossR)}</td></tr>
                <tr><td className="dim">Cost R</td><td className="dim">−{s.outcome.costR.toFixed(2)}R</td></tr>
                <tr><td className="dim">Net R</td><td className={rCls(s.outcome.netR)}><strong>{fmtR(s.outcome.netR)}</strong></td></tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Integrity</h3>
          <p className="dim" style={{ fontSize: "0.8rem" }}>Record hash (open)</p>
          <p className="mono" style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>{s.recordHash}</p>
          {s.closeRecordHash ? (
            <>
              <p className="dim" style={{ fontSize: "0.8rem", marginTop: 8 }}>Record hash (close)</p>
              <p className="mono" style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>{s.closeRecordHash}</p>
            </>
          ) : null}
          <p className="mono dim" style={{ fontSize: "0.72rem", marginTop: 8 }}>
            {s.indicatorVersion} · params {s.parameterHash} · engine {s.engineVersion}
          </p>
        </div>
      </section>
    </>
  );
}
