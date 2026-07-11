import { getOverview, getRecentSignals } from "../src/site/queries.js";
import WaitlistForm from "../components/WaitlistForm.js";

export const revalidate = 60;

const fmtR = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`);
const rCls = (v) => (v == null ? "dim" : v >= 0 ? "pos" : "neg");
const fmtTime = (ms) =>
  new Date(ms).toISOString().slice(5, 16).replace("T", " ") + " UTC";

const FALLBACK = {
  phase: "COLLECTING", paidLaunch: false, monthlyPriceEur: 99,
  coinsTracked: 0, signalsMeasured: 0, signalsOpen: 0, signalsCompleted: 0,
  totalNetR: 0, verifiedCount: 0, indicatorVersion: "ARS-U-6.1", parameterHash: "—",
};

export default async function HomePage() {
  let ov = FALLBACK;
  let recent = [];
  try {
    ov = await getOverview();
    recent = await getRecentSignals({ limit: 8, onlyPublished: true });
  } catch {
    // Redis onbereikbaar → statische fallback; pagina blijft functioneren
  }

  return (
    <>
      <section className="hero">
        <h1>
          Signals that <span className="accent">earn</span> their label.
        </h1>
        <p className="lead">
          ARS-U scans the {ov.coinsTracked || 150} most liquid USDT perpetual futures every
          15 minutes. Every qualifying setup is measured — published or not — and recorded in a
          tamper-evident public track record. A setup family is only marked VERIFIED when its
          statistical lower bound is positive after costs. Until then, we say so.
        </p>
        {ov.phase === "COLLECTING" ? (
          <div className="phase-banner">DATA COLLECTION IN PROGRESS</div>
        ) : null}
      </section>

      <section className="section">
        <div className="grid grid-stats">
          <div className="card stat">
            <div className="stat-value">{ov.coinsTracked}</div>
            <div className="stat-label">Coins tracked</div>
          </div>
          <div className="card stat">
            <div className="stat-value">{ov.signalsMeasured}</div>
            <div className="stat-label">Setups measured</div>
          </div>
          <div className="card stat">
            <div className="stat-value">{ov.signalsCompleted}</div>
            <div className="stat-label">Setups completed</div>
          </div>
          <div className="card stat">
            <div className="stat-value">{ov.verifiedCount} / 8</div>
            <div className="stat-label">Verified families</div>
          </div>
          <div className="card stat">
            <div className={`stat-value ${rCls(ov.totalNetR)}`}>{fmtR(ov.totalNetR)}</div>
            <div className="stat-label">Total net result</div>
          </div>
          <div className="card stat">
            <div className="stat-value">{ov.signalsOpen}</div>
            <div className="stat-label">Open virtual positions</div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>How verification works</h2>
        <div className="grid grid-3 steps">
          <div className="card">
            <h3>Measure everything</h3>
            <p className="dim">
              Every A and ELITE setup is tracked virtually from the next candle: stop-loss, TP1,
              break-even, TP2 or timeout. Costs of 0.15R are deducted from every result. Nothing
              is deleted, ever.
            </p>
          </div>
          <div className="card">
            <h3>Statistics per family</h3>
            <p className="dim">
              Results are grouped into 8 setup families. Each family gets a bootstrap lower
              confidence bound on its average net R, with shrinkage and a false-discovery-rate
              correction across all families.
            </p>
          </div>
          <div className="card">
            <h3>Labels are earned</h3>
            <p className="dim">
              VERIFIED requires 30+ completed measurements, positive expectancy and a lower bound
              above zero after costs. If the edge fades, the label is publicly revoked. That rule
              has no exceptions.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Latest published signals</h2>
        {recent.length === 0 ? (
          <div className="card dim">
            No published signals yet. The scanner is collecting its first measurements — the
            full track record will appear here as setups complete.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th><th>Symbol</th><th>Side</th><th>Type</th><th>Class</th>
                  <th>Score</th><th>Status</th><th>Net R</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.signalId}>
                    <td className="mono">{fmtTime(s.candleTime)}</td>
                    <td><a href={`/signal/${s.signalId}`}>{s.symbol}</a></td>
                    <td><span className={`badge badge-${s.direction === "LONG" ? "long" : "short"}`}>{s.direction}</span></td>
                    <td>{s.setupType}</td>
                    <td>{s.class}</td>
                    <td>{s.score}</td>
                    <td>{s.status}</td>
                    <td className={rCls(s.netR)}>{fmtR(s.netR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: 10 }}>
          <a href="/track-record">Open the full track record →</a>
        </p>
      </section>

      <section className="section">
        <h2>{ov.paidLaunch ? `Get access — €${ov.monthlyPriceEur}/month` : "Join the waitlist"}</h2>
        <p className="dim" style={{ maxWidth: 640, marginBottom: 14 }}>
          {ov.paidLaunch
            ? "Real-time A and ELITE signals with entry, stop-loss and targets, plus the verified channel and daily digest."
            : "We are in the public data-collection phase. No payments are accepted until the verification layer has real results to show. Leave your email and be first in line."}
        </p>
        <WaitlistForm />
      </section>
    </>
  );
}
