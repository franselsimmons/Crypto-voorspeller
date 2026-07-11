import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveOnCandles, categoryOf } from "../src/trade/outcomeEngine.js";

const COST = 0.15;
const NO_TIMEOUT = 100 * 60000;
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const pos = (dir = "LONG") => ({
  direction: dir, entry: 100,
  stopLoss: dir === "LONG" ? 90 : 110,
  tp1: dir === "LONG" ? 110 : 90,
  tp2: dir === "LONG" ? 120 : 80,
  candleTime: 0, tfMs: 1000,
  tp1Hit: false, tp1HitAt: null, highestPrice: null, lowestPrice: null,
  nextCheckTs: 1000,
});
const bar = (ts, high, low) => ({ ts, open: 100, high, low, close: (high + low) / 2 });

test("TIMINGPIN: signaalcandle (ts = candleTime) telt nooit mee voor resolutie", () => {
  const res = resolveOnCandles(pos(), [bar(0, 1000, 0), bar(1000, 121, 99)], COST, NO_TIMEOUT);
  assert.equal(res.closed, true);
  assert.equal(res.exitReason, "TP2"); // niet SL uit de signaalbar
  approx(res.grossR, 1.5);
  approx(res.netR, 1.35);
});

test("direct SL vóór TP1 → −1.00 gross / −1.15 net", () => {
  const res = resolveOnCandles(pos(), [bar(1000, 105, 89)], COST, NO_TIMEOUT);
  assert.equal(res.exitReason, "SL");
  approx(res.grossR, -1);
  approx(res.netR, -1.15);
  assert.equal(res.ambiguousBar, false);
});

test("ambigue bar (SL én TP1) → conservatief als LOSS geboekt + gemarkeerd", () => {
  const res = resolveOnCandles(pos(), [bar(1000, 111, 89)], COST, NO_TIMEOUT);
  assert.equal(res.exitReason, "SL");
  assert.equal(res.ambiguousBar, true);
  approx(res.grossR, -1);
});

test("TP1 → BE, met uitgestelde tightening (BE geldt pas vanaf de vólgende bar)", () => {
  // bar 1: TP1 geraakt én low ≤ entry — mag NIET dezelfde bar als BE sluiten
  const res = resolveOnCandles(pos(), [bar(1000, 111, 95), bar(2000, 105, 99)], COST, NO_TIMEOUT);
  assert.equal(res.exitReason, "BE");
  assert.equal(res.tp1Hit, true);
  assert.equal(res.tp1HitAt, 1000);
  assert.equal(res.closedAt, 2000);
  approx(res.grossR, 0.5);
  approx(res.netR, 0.35);
});

test("TP1 en TP2 in dezelfde bar zonder SL → FULL +1.50", () => {
  const res = resolveOnCandles(pos(), [bar(1000, 121, 95)], COST, NO_TIMEOUT);
  assert.equal(res.exitReason, "TP2");
  approx(res.grossR, 1.5);
});

test("na TP1: BE en TP2 in dezelfde bar → conservatief BE + AMBIGUOUS", () => {
  const res = resolveOnCandles(pos(), [bar(1000, 110, 95), bar(2000, 121, 99)], COST, NO_TIMEOUT);
  assert.equal(res.exitReason, "BE");
  assert.equal(res.ambiguousBar, true);
  approx(res.grossR, 0.5);
});

test("timeout vóór TP1 → 0.00 gross / −0.15 net", () => {
  const bars = [bar(1000, 105, 95), bar(2000, 105, 95), bar(5000, 200, 1)];
  const res = resolveOnCandles(pos(), bars, COST, 5000);
  assert.equal(res.exitReason, "TIMEOUT");
  approx(res.grossR, 0);
  approx(res.netR, -0.15);
});

test("PIN D5: timeout ná TP1 → +0.50 gross / +0.35 net", () => {
  const bars = [bar(1000, 111, 95), bar(2000, 115, 101), bar(3000, 115, 101), bar(5000, 1, 1)];
  const res = resolveOnCandles(pos(), bars, COST, 5000);
  assert.equal(res.exitReason, "TIMEOUT_AFTER_TP1");
  approx(res.grossR, 0.5);
  approx(res.netR, 0.35);
});

test("geen resolutie → open blijven, extremen en nextCheckTs bijgewerkt", () => {
  const res = resolveOnCandles(pos(), [bar(1000, 105, 95), bar(2000, 106, 94)], COST, NO_TIMEOUT);
  assert.equal(res.closed, false);
  assert.equal(res.highestPrice, 106);
  assert.equal(res.lowestPrice, 94);
  assert.equal(res.nextCheckTs, 3000);
});

test("SHORT: gespiegelde SL en FULL", () => {
  const sl = resolveOnCandles(pos("SHORT"), [bar(1000, 111, 95)], COST, NO_TIMEOUT);
  assert.equal(sl.exitReason, "SL");
  const full = resolveOnCandles(pos("SHORT"), [bar(1000, 105, 79)], COST, NO_TIMEOUT);
  assert.equal(full.exitReason, "TP2");
  approx(full.grossR, 1.5);
});

test("categoryOf: exacte mapping incl. TIMEOUT_AFTER_TP1 → be", () => {
  assert.equal(categoryOf("SL"), "loss");
  assert.equal(categoryOf("TP2"), "full");
  assert.equal(categoryOf("TIMEOUT"), "timeout");
  assert.equal(categoryOf("BE"), "be");
  assert.equal(categoryOf("TIMEOUT_AFTER_TP1"), "be");
});
