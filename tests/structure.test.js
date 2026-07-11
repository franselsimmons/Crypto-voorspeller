import { test } from "node:test";
import assert from "node:assert/strict";

import { createStructure } from "../src/indicator/marketStructure.js";

const P = { pivLen: 2, sweepMem: 8, failWin: 6, breakMem: 10 };

function run(bars) {
  const st = createStructure(P);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const closes = bars.map((b) => b.c);
  const ts = bars.map((_, i) => i * 1000);
  const outs = [];
  for (let i = 0; i < bars.length; i++) outs.push(st.step(i, highs, lows, closes, ts));
  return outs;
}

test("pivot high: bevestiging na pivLen bars rechts, met juiste prijs en ts", () => {
  const outs = run([
    { h: 10, l: 5, c: 7 }, { h: 11, l: 6, c: 8 }, { h: 15, l: 7, c: 12 },
    { h: 11, l: 6, c: 9 }, { h: 10, l: 5, c: 8 },
  ]);
  assert.equal(outs[3].lastSwingHigh, null);       // nog onbevestigd
  assert.equal(outs[4].lastSwingHigh, 15);
  assert.equal(outs[4].lastSwingHighTs, 2000);
  assert.equal(outs[4].structureBias, 0);
});

test("PIN A2: gelijke toppen vormen géén pivot (strikte ongelijkheid)", () => {
  const outs = run([
    { h: 10, l: 5, c: 7 }, { h: 15, l: 6, c: 8 }, { h: 15, l: 7, c: 9 },
    { h: 11, l: 6, c: 8 }, { h: 10, l: 5, c: 7 }, { h: 9, l: 4, c: 6 },
  ]);
  for (const o of outs) assert.equal(o.lastSwingHigh, null);
});

test("BOS up → bias 1, daarna failed break → recentFailedUp", () => {
  const outs = run([
    { h: 10, l: 5, c: 7 }, { h: 11, l: 6, c: 8 }, { h: 15, l: 7, c: 12 },
    { h: 11, l: 6, c: 9 }, { h: 10, l: 5, c: 8 },
    { h: 16, l: 9, c: 15.5 },   // close > 15 → BOS up
    { h: 15, l: 9, c: 14 },     // close < breaklevel 15 → failed
  ]);
  assert.equal(outs[5].structureBias, 1);
  assert.equal(outs[5].recentBreakUp, true);
  assert.equal(outs[5].swingHighTaken, true);
  assert.equal(outs[6].recentFailedUp, true);
});

test("CHoCH: BOS down na bias 1 flipt naar −1 en zet chochBar", () => {
  const outs = run([
    { h: 10, l: 5, c: 7 }, { h: 11, l: 6, c: 8 }, { h: 15, l: 7, c: 12 },
    { h: 11, l: 6, c: 9 }, { h: 10, l: 5, c: 8 },
    { h: 16, l: 9, c: 15.5 },   // bias → 1
    { h: 15, l: 9, c: 14 },     // (pivot low 5 op idx 4 wordt hier bevestigd)
    { h: 10, l: 4, c: 4.5 },    // close < swing low 5 → BOS down + CHoCH
  ]);
  assert.equal(outs[6].lastSwingLow, 5);
  assert.equal(outs[7].structureBias, -1);
  assert.equal(outs[7].chochBar, 7);
  assert.equal(outs[7].recentBreakDown, true);
});

test("sweep low: wick onder swing low, close erboven — bias ongewijzigd", () => {
  const outs = run([
    { h: 10, l: 5, c: 7 }, { h: 11, l: 6, c: 8 }, { h: 12, l: 3, c: 9 },
    { h: 11, l: 6, c: 9 }, { h: 10, l: 7, c: 8 },   // pivot low 3 bevestigd
    { h: 10, l: 2, c: 6 },                           // low 2 < 3, close 6 > 3
  ]);
  assert.equal(outs[4].lastSwingLow, 3);
  assert.equal(outs[5].recentSweepLow, true);
  assert.equal(outs[5].structureBias, 0);
  assert.equal(outs[5].swingLowTaken, false);
});
