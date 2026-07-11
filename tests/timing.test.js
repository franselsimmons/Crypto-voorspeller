import { test } from "node:test";
import assert from "node:assert/strict";

import { floorTo, currentCycleId, lastClosedOpenTime } from "../src/utils/time.js";
import { closedOnly } from "../src/market/bitgetClient.js";
import { htfBiasFor } from "../src/market/htfContext.js";

const TF = 15 * 60 * 1000;
const HTF = 4 * 60 * 60 * 1000;

/** Voert fn maximaal 3× uit tot de klok tijdens de meting niet over een grens tikte. */
function stableClock(fn) {
  for (let i = 0; i < 3; i++) {
    const before = currentCycleId(TF, 0);
    const result = fn();
    const after = currentCycleId(TF, 0);
    if (before === after) return result;
  }
  throw new Error("klok bleef niet stabiel over 3 pogingen (astronomisch onwaarschijnlijk)");
}

test("currentCycleId: altijd op candlegrens, marge schuift exact één stap", () => {
  stableClock(() => {
    const c0 = currentCycleId(TF, 0);
    assert.equal(c0 % TF, 0);
    assert.equal(currentCycleId(TF, TF), c0 - TF); // floor((x−tf)/tf)·tf = floor(x/tf)·tf − tf
    return true;
  });
});

test("lastClosedOpenTime = currentCycleId − tf (zelfde marge)", () => {
  stableClock(() => {
    const cur = currentCycleId(TF, 45000);
    assert.equal(lastClosedOpenTime(TF, 45000), cur - TF);
    return true;
  });
});

test("closedOnly: alleen volledig afgesloten candles, grensgeval inclusief", () => {
  const g = TF;
  const now = 10 * g;
  const candles = [
    { ts: 8 * g },     // ts+g = 9g  ≤ now → dicht
    { ts: 9 * g },     // ts+g = 10g ≤ now → dicht (exacte grens)
    { ts: 9 * g + 1 }, // ts+g > now → nog open
    { ts: 10 * g },    // vormende candle → open
  ];
  const closed = closedOnly(candles, g, now);
  assert.deepEqual(closed.map((c) => c.ts), [8 * g, 9 * g]);
});

test("htfBiasFor: bull / bear / gemengd / ontbrekend", () => {
  const map = new Map();
  map.set(7 * HTF, { emaF: 110, emaS: 100, close: 120 });
  const ts15 = 8 * HTF + 3 * TF; // 15m-bar binnen 4H-blok 8 → target = blok 7
  assert.equal(htfBiasFor(map, ts15, HTF), 1);

  map.set(7 * HTF, { emaF: 90, emaS: 100, close: 80 });
  assert.equal(htfBiasFor(map, ts15, HTF), -1);

  map.set(7 * HTF, { emaF: 110, emaS: 100, close: 95 }); // emaF>emaS maar close<emaS
  assert.equal(htfBiasFor(map, ts15, HTF), 0);

  assert.equal(htfBiasFor(new Map(), ts15, HTF), 0); // target ontbreekt
  assert.equal(htfBiasFor(null, ts15, HTF), 0);
});

test("FUTURE-LEAK-PIN: het lopende 4H-blok wordt nooit gelezen", () => {
  const map = new Map();
  // Alleen het LOPENDE blok (8) is sterk bullish; het vorige blok (7) ontbreekt.
  map.set(8 * HTF, { emaF: 200, emaS: 100, close: 300 });
  assert.equal(htfBiasFor(map, 8 * HTF + 3 * TF, HTF), 0);

  // Vorig blok bearish + lopend blok bullish → bias volgt het vórige blok.
  map.set(7 * HTF, { emaF: 90, emaS: 100, close: 80 });
  assert.equal(htfBiasFor(map, 8 * HTF + 3 * TF, HTF), -1);
});

test("FUTURE-LEAK-PIN: exacte blokgrens gebruikt het juiste vorige blok", () => {
  const map = new Map();
  map.set(6 * HTF, { emaF: 110, emaS: 100, close: 120 }); // bull
  map.set(7 * HTF, { emaF: 90, emaS: 100, close: 80 });   // bear
  assert.equal(htfBiasFor(map, 8 * HTF, HTF), -1);     // eerste ms van blok 8 → blok 7
  assert.equal(htfBiasFor(map, 8 * HTF - 1, HTF), 1);  // laatste ms van blok 7 → blok 6
});

test("floorTo: exacte veelvouden blijven staan", () => {
  assert.equal(floorTo(9 * TF, TF), 9 * TF);
  assert.equal(floorTo(9 * TF + 1, TF), 9 * TF);
});
