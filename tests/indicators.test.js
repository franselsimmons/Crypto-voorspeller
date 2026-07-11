import { test } from "node:test";
import assert from "node:assert/strict";

import {
  smaArr, emaPine, rmaArr, atrArr, rsiArr, erArr,
  percentRankArr, highestArr, lowestArr, crossArrFn,
} from "../src/indicator/indicators.js";

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("smaArr: venster en null-warmup", () => {
  assert.deepEqual(smaArr([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
});

test("emaPine: seed = eerste waarde, daarna alpha-recursie", () => {
  assert.deepEqual(emaPine([1, 2, 3], 3), [1, 1.5, 2.25]); // alpha 0.5, exact
  const flat = emaPine([10, 10, 10, 10], 5);
  for (const v of flat) approx(v, 10);
});

test("rmaArr (Wilder): seed = SMA van eerste len", () => {
  assert.deepEqual(rmaArr([1, 1, 1, 1, 1], 3), [null, null, 1, 1, 1]);
  const r = rmaArr([3, 6, 9, 3], 3);
  assert.equal(r[2], 6);       // seed = (3+6+9)/3
  approx(r[3], 5);             // (6·2+3)/3
});

test("atrArr: true range met gap-componenten", () => {
  const candles = [
    { high: 12, low: 10, close: 11 },
    { high: 13, low: 11, close: 12 },
  ];
  const atr = atrArr(candles, 2);
  assert.equal(atr[0], null);
  approx(atr[1], 2);
});

test("rsiArr: stijgend → 100, dalend → 0, warmup null", () => {
  const up = [...Array(20).keys()].map((i) => i + 1);
  const rsiUp = rsiArr(up, 14);
  assert.equal(rsiUp[13], null);
  assert.equal(rsiUp[14], 100);
  assert.equal(rsiUp[19], 100);
  const down = [...up].reverse();
  assert.equal(rsiArr(down, 14)[19], 0);
});

test("erArr: perfecte trend → 1, oscillatie → 0", () => {
  const trend = [...Array(31).keys()];
  approx(erArr(trend, 10)[15], 1);
  const osc = [...Array(31).keys()].map((i) => i % 2);
  assert.equal(erArr(osc, 10)[15], 0);
});

test("percentRankArr — PIN A1: vorige len waarden, tieregel ≤, huidige bar uitgesloten", () => {
  const asc = percentRankArr([1, 2, 3, 4, 5], 3);
  assert.equal(asc[2], null);   // pas vanaf i=len
  assert.equal(asc[3], 100);    // venster [1,2,3] alle ≤ 4
  assert.equal(asc[4], 100);
  const desc = percentRankArr([5, 4, 3, 2, 1], 3);
  assert.equal(desc[3], 0);     // venster [5,4,3] geen ≤ 2
  const ties = percentRankArr([2, 2, 2, 2], 3);
  assert.equal(ties[3], 100);   // ≤ telt gelijke waarden mee
});

test("highestArr / lowestArr", () => {
  assert.deepEqual(highestArr([1, 3, 2, 5], 2), [null, 3, 3, 5]);
  assert.deepEqual(lowestArr([4, 2, 3, 1], 2), [null, 2, 2, 1]);
});

test("crossArrFn: beide richtingen, raken ≠ kruisen", () => {
  assert.deepEqual(crossArrFn([1, 3], [2, 2]), [false, true]);   // omhoog
  assert.deepEqual(crossArrFn([3, 1], [2, 2]), [false, true]);   // omlaag
  assert.deepEqual(crossArrFn([1, 2], [2, 2]), [false, false]);  // raken
});
