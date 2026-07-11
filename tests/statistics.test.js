import { test } from "node:test";
import assert from "node:assert/strict";

import { outcomeValues, bootstrapLcb, parentProbsFor } from "../src/verification/statistics.js";
import { benjaminiHochberg } from "../src/verification/fdr.js";

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("outcomeValues: netR per categorie met COST_R 0.15", () => {
  const v = outcomeValues();
  approx(v.loss, -1.15);
  approx(v.be, 0.35);
  approx(v.full, 1.35);
  approx(v.timeout, -0.15);
});

test("bootstrapLcb: deterministisch bij identieke input", () => {
  const counts = { loss: 10, be: 10, full: 10, timeout: 0 };
  const parent = { loss: 1 / 3, be: 1 / 3, full: 1 / 3, timeout: 0 };
  const a = bootstrapLcb(counts, parent, "ns:FAM");
  const b = bootstrapLcb(counts, parent, "ns:FAM");
  assert.deepEqual(a, b);
});

test("bootstrapLcb: n=0 → nulls", () => {
  const r = bootstrapLcb({ loss: 0, be: 0, full: 0, timeout: 0 }, { loss: 0.25, be: 0.25, full: 0.25, timeout: 0.25 }, "x");
  assert.equal(r.n, 0);
  assert.equal(r.lcb, null);
  assert.equal(r.pValue, null);
});

test("sterke familie (n=100, mean +0.55) → LCB > 0, p ≈ vloer", () => {
  const counts = { loss: 20, be: 30, full: 50, timeout: 0 };
  const parent = { loss: 0.2, be: 0.3, full: 0.5, timeout: 0 };
  const r = bootstrapLcb(counts, parent, "ns:STRONG");
  approx(r.mean, 0.55, 1e-6);
  assert.ok(r.lcb > 0, `lcb ${r.lcb}`);
  assert.ok(r.pValue < 0.01, `p ${r.pValue}`);
});

test("negatieve familie (mean −0.40) → LCB < 0, p hoog", () => {
  const counts = { loss: 60, be: 25, full: 15, timeout: 0 };
  const parent = { loss: 0.6, be: 0.25, full: 0.15, timeout: 0 };
  const r = bootstrapLcb(counts, parent, "ns:WEAK");
  approx(r.mean, -0.4, 1e-6);
  assert.ok(r.lcb < 0);
  assert.ok(r.pValue > 0.9, `p ${r.pValue}`);
});

test("SHRINKAGE-GUARD: 3-uit-3 winst met pessimistische parent → mean 1.35 maar LCB < 0", () => {
  const counts = { loss: 0, be: 0, full: 3, timeout: 0 };
  const parent = { loss: 0.7, be: 0.1, full: 0.1, timeout: 0.1 };
  const r = bootstrapLcb(counts, parent, "ns:TINY");
  approx(r.mean, 1.35, 1e-6);     // empirisch gemiddelde blijft eerlijk gerapporteerd
  assert.ok(r.lcb < 0, `lcb ${r.lcb}`); // maar bewijst niets — kPrior drukt de LCB onder nul
});

test("parentProbsFor: per richting geaggregeerd, uniform bij lege data", () => {
  const stats = {
    "LONG:PULLBACK:A": { counts: { loss: 1, be: 1, full: 2, timeout: 0 } },
    "SHORT:PULLBACK:A": { counts: { loss: 5, be: 0, full: 0, timeout: 5 } },
  };
  const L = parentProbsFor("LONG", stats);
  approx(L.loss, 0.25); approx(L.be, 0.25); approx(L.full, 0.5); approx(L.timeout, 0);
  const S = parentProbsFor("SHORT", stats);
  approx(S.loss, 0.5); approx(S.timeout, 0.5);
  const U = parentProbsFor("LONG", {});
  approx(U.loss, 0.25); approx(U.full, 0.25);
});

test("benjaminiHochberg: bekend voorbeeld, α=0.10, m=8 → eerste 4 slagen", () => {
  const items = [
    { id: "f1", p: 0.001 }, { id: "f2", p: 0.01 }, { id: "f3", p: 0.02 },
    { id: "f4", p: 0.04 }, { id: "f5", p: 0.2 }, { id: "f6", p: 0.5 },
    { id: "f7", p: 0.8 }, { id: "f8", p: 0.9 },
  ];
  const pass = benjaminiHochberg(items, 0.10);
  assert.equal(pass.size, 4);
  for (const id of ["f1", "f2", "f3", "f4"]) assert.ok(pass.has(id));
});

test("benjaminiHochberg: null-p uitgesloten (COLLECTING telt niet mee als hypothese)", () => {
  const pass = benjaminiHochberg(
    [{ id: "a", p: 0.001 }, { id: "b", p: null }, { id: "c", p: null }],
    0.10
  );
  assert.ok(pass.has("a"));
  assert.equal(pass.size, 1);
});
