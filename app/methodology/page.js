export const revalidate = 3600;

import { cfg } from "../../src/config.js";

export default function MethodologyPage() {
  const c = cfg();
  return (
    <>
      <section className="hero">
        <h1>Methodology</h1>
        <p className="lead">
          Exactly how signals are generated, measured and verified — including the limitations.
        </p>
      </section>

      <section className="section">
        <h2>Scanner</h2>
        <p className="dim">
          Every 15 minutes the system selects the ~150 most liquid USDT perpetual futures on
          Bitget (minimum $5M 24h volume) and runs the ARS-U indicator on each. Analysis uses
          <strong> fully closed candles only</strong>: the scan starts after a safety margin past
          candle close, and higher-timeframe context always uses the previous fully closed 4H
          candle. No repainting, no future leakage.
        </p>
      </section>

      <section className="section">
        <h2>The indicator (ARS-U)</h2>
        <p className="dim">
          ARS-U detects two setup types per direction. <strong>PULLBACK</strong>: a trend
          resumption after a retrace into the fast EMA with a momentum reset.
          <strong> BREAKOUT</strong>: an expansion out of volatility compression with elevated
          volume. Hard blocks reject candidates in extreme volatility, against the 4H trend,
          overextended from the mean, with stops wider than 3 ATR, or without room to the next
          structure level. Surviving candidates receive a 0–100 score across eight components
          (regime, higher timeframe, structure, momentum, volume, liquidity, entry quality,
          room). Class A means score ≥ 80, ELITE ≥ 90. Only A and ELITE are recorded.
        </p>
      </section>

      <section className="section">
        <h2>Trade plan and measurement</h2>
        <p className="dim">
          Entry is the close of the qualifying candle. The stop sits at the structural anchor
          ± 0.35 ATR (bounded 0.5–3.0 ATR). TP1 = 1R, TP2 = 2R. Virtually, 50% closes at TP1,
          the stop moves to break-even, and the remainder runs to TP2. Measurement starts on the
          <strong> next</strong> candle — the signal candle itself never resolves its own outcome.
        </p>
        <p className="dim" style={{ marginTop: 8 }}>
          Outcomes in R: stop before TP1 = <span className="mono">−1.00</span> · TP1 then
          break-even = <span className="mono">+0.50</span> · TP1 and TP2 =
          <span className="mono"> +1.50</span> · timeout after 48h =
          <span className="mono"> 0.00</span> (or <span className="mono">+0.50</span> if TP1 was
          already hit). Every result is charged <span className="mono">{c.costR.toFixed(2)}R</span> in
          fees and slippage: <span className="mono">netR = grossR − {c.costR.toFixed(2)}</span>.
          When stop and target could both be hit inside one candle and the order is unknowable,
          the <strong>worse outcome is booked</strong> and the record is flagged AMBIGUOUS.
        </p>
      </section>

      <section className="section">
        <h2>Statistical verification</h2>
        <p className="dim">
          Results are pooled into 8 families (direction × setup type × class). Per family we
          compute a <strong>bootstrap lower confidence bound</strong> on average net R: the
          outcome distribution — with Bayesian shrinkage of 10 pseudo-observations toward the
          direction-level average — is resampled 4,000 times with a deterministic seed; the LCB
          is the 5th percentile of those means. Across the 8 families a
          <strong> Benjamini-Hochberg FDR correction</strong> (α = {c.bhAlpha}) guards against
          data mining. VERIFIED requires: at least {c.minTotalPerFamily} completed measurements,
          positive net expectancy, LCB &gt; 0 and a passed FDR test. The label is revoked
          automatically — and announced publicly — when the edge fades.
        </p>
        <p className="dim" style={{ marginTop: 8 }}>
          Honest expectation: with an outcome spread of roughly 1R, a true edge of +0.20R needs
          ~70–80 measurements before the LCB clears zero, and +0.10R needs several hundred.
          {" "}{c.minTotalPerFamily} is an <strong>admission threshold, not a verification
          promise</strong>. Families can stay COLLECTING or CANDIDATE for months — or forever, if
          no edge exists. The system will say so rather than pretend otherwise.
        </p>
      </section>

      <section className="section">
        <h2>Integrity and versions</h2>
        <p className="dim">
          Every signal is written to an append-only, hash-chained record before any publication
          decision. Publication (max 12/day to Discord) never affects what is measured. A daily
          root hash is published in the digest and on the status page — tamper-evident, honestly
          stated: not impossible to manipulate, but manipulation would be detectable. Any change
          to indicator logic or parameters starts a <strong>new statistical namespace</strong>{" "}
          (current: <span className="mono">{c.namespace}</span>); old results are never mixed
          with new logic.
        </p>
      </section>

      <section className="section">
        <h2>Limitations</h2>
        <p className="dim">
          (1) Fills are virtual: real execution has spread, slippage and funding costs that the
          flat {c.costR.toFixed(2)}R estimate may not fully cover, especially on thinner pairs.
          (2) Simultaneous positions across correlated coins cluster: one market-wide shock hits
          many open measurements at once, which makes the effective sample smaller than the
          nominal count. (3) The score is heuristic; only measured results — not the score —
          determine verification. (4) Past performance, verified or not, does not guarantee
          future results. Nothing here is financial advice.
        </p>
      </section>
    </>
  );
}
