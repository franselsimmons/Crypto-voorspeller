import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeWindow } from "../src/indicator/arsEngine.js";
import { mulberry32 } from "../src/utils/prng.js";

/** Deterministische random-walk-candles (15m). */
function makeCandles(seed, n = 340) {
  const rng = mulberry32(seed);
  const out = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(1, open + (rng() - 0.5) * 0.02 * open);
    const wick = 0.004 * open;
    out.push({
      ts: i * 900000,
      open,
      high: Math.max(open, close) + wick * rng(),
      low: Math.min(open, close) - wick * rng(),
      close,
      volume: 50 + 100 * rng(),
    });
    price = close;
  }
  return out;
}

test("warmup-guard: < 260 bars → INSUFFICIENT_HISTORY", () => {
  const res = analyzeWindow(makeCandles(1, 259), { mode: "triggers" });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "INSUFFICIENT_HISTORY");
  assert.equal(res.bars, 259);
});

test("determinisme: identieke candles → bit-identieke output (beide modes)", () => {
  const candles = makeCandles(42);
  const a1 = analyzeWindow(candles, { mode: "triggers" });
  const a2 = analyzeWindow(candles, { mode: "triggers" });
  assert.deepEqual(a1, a2);
  const b1 = analyzeWindow(candles, { mode: "full", htfMap: null });
  const b2 = analyzeWindow(candles, { mode: "full", htfMap: null });
  assert.equal(JSON.stringify(b1), JSON.stringify(b2));
});

test("PREFILTER-EXACTHEID (D2): triggers-mode mist nooit een full-mode-signaal", () => {
  for (const seed of [7, 42, 1337, 2024, 555]) {
    const candles = makeCandles(seed);
    const A = analyzeWindow(candles, { mode: "triggers" });
    const B = analyzeWindow(candles, { mode: "full", htfMap: null });
    assert.equal(A.ok, true, `seed ${seed}: triggers niet ok`);
    assert.equal(B.ok, true, `seed ${seed}: full niet ok`);
    assert.equal(typeof A.candidateLong, "boolean");
    assert.equal(typeof A.candidateShort, "boolean");
    // Kern-invariant: geen kandidaat op de laatste bar ⇒ geen signaal op de laatste bar.
    if (!A.candidateLong) assert.equal(B.signalLong, null, `seed ${seed}: LONG-lek`);
    if (!A.candidateShort) assert.equal(B.signalShort, null, `seed ${seed}: SHORT-lek`);
    // En omgekeerd: elk signaal impliceert een kandidaat.
    if (B.signalLong) assert.equal(A.candidateLong, true);
    if (B.signalShort) assert.equal(A.candidateShort, true);
  }
});

test("full-mode: outputvorm stabiel, htfMap null geeft geen HTF-blokkades", () => {
  const B = analyzeWindow(makeCandles(99), { mode: "full", htfMap: null });
  assert.equal(B.ok, true);
  assert.ok("signalLong" in B && "signalShort" in B);
  assert.ok(Array.isArray(B.blockedInfo));
  for (const b of B.blockedInfo) assert.ok(!/HTF CONFLICT/.test(b), "HTF-blok zonder htfMap");
  if (B.signalLong) {
    const s = B.signalLong;
    assert.equal(s.setupType === "PULLBACK" || s.setupType === "BREAKOUT", true);
    assert.ok(s.plan.entry > 0 && s.plan.stop > 0 && s.plan.tp1 > 0 && s.plan.tp2 > 0);
    assert.ok(s.score.total >= 80); // qualified ⇒ minimaal A
  }
});

test("signaal draagt fingerprintBase met structuur-/compressie-ID (D4)", () => {
  // Over veel seeds: áls er een signaal valt, moet de fingerprint het juiste formaat hebben.
  for (const seed of [3, 11, 21, 33, 47, 61, 77, 91]) {
    const B = analyzeWindow(makeCandles(seed), { mode: "full", htfMap: null });
    for (const s of [B.signalLong, B.signalShort]) {
      if (!s) continue;
      assert.match(s.fingerprintBase, /^(PB|BO):(LONG|SHORT):\d+$/);
    }
  }
});
