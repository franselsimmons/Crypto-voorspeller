export const revalidate = 60;

import { getOverview } from "../../src/site/queries.js";
import WaitlistForm from "../../components/WaitlistForm.js";

const FEATURES = [
  "Real-time A and ELITE signals across ~150 coins",
  "Entry, stop-loss, TP1 and TP2 on every signal",
  "#verified channel — only statistically verified families",
  "Daily digest with results and family statistics",
  "Full public track record, hash-chained and exportable",
];

export default async function PricingPage() {
  let ov = { phase: "COLLECTING", paidLaunch: false, monthlyPriceEur: 99 };
  try {
    ov = await getOverview();
  } catch {
    // fallback: collecting-weergave
  }

  return (
    <>
      <section className="hero">
        <h1>Pricing</h1>
        <p className="lead">
          {ov.paidLaunch
            ? "One plan. Everything included. Cancel anytime."
            : "Collecting data — join the waitlist. We do not accept payments before the verification layer has real, public results."}
        </p>
        {!ov.paidLaunch ? <div className="phase-banner">DATA COLLECTION IN PROGRESS</div> : null}
      </section>

      <section className="section">
        <div className="card" style={{ maxWidth: 520 }}>
          <h2 style={{ marginBottom: 4 }}>ARS-U Access</h2>
          <p style={{ fontSize: "2rem", fontWeight: 700 }}>
            €{ov.monthlyPriceEur}
            <span className="dim" style={{ fontSize: "0.95rem", fontWeight: 400 }}> / month</span>
          </p>
          <ul style={{ listStyle: "none", marginTop: 12 }}>
            {FEATURES.map((f) => (
              <li key={f} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span className="pos">✓</span> <span className="dim">{f}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 16 }}>
            {ov.paidLaunch ? (
              <p className="dim">Checkout opens here at launch.</p>
            ) : (
              <WaitlistForm />
            )}
          </div>
        </div>
        <p className="dim" style={{ fontSize: "0.8rem", marginTop: 14, maxWidth: 640 }}>
          No profit guarantees, ever. Signals are information, not financial advice; all tracked
          positions are virtual. Verified status describes measured history, not future results.
        </p>
      </section>
    </>
  );
}
