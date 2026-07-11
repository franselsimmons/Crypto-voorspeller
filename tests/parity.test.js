import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ARS_PARAMS } from "../src/config.js";
import { emaPine, rsiArr, atrArr, erArr, percentRankArr, smaArr } from "../src/indicator/indicators.js";
import { createStructure } from "../src/indicator/marketStructure.js";

const FIX_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const WARMUP = 260;

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length);
  const header = lines[0].split(",").map((h) => h.trim());
  const cols = {};
  header.forEach((h, i) => { cols[h] = i; });
  const rows = lines.slice(1).map((l) => l.split(","));
  const num = (r, name) => {
    const i = cols[name];
    if (i == null) return null;
    const v = Number(r[i]);
    return Number.isFinite(v) ? v : null;
  };
  return { cols, rows, num };
}

/** Vergelijkt series; pass = |a−b| ≤ abs + rel·max(|a|,|b|). Faalt met eerste afwijking. */
function cmp(name, nodeArr, fixArr, { abs = 0, rel = 0 }, from) {
  let compared = 0;
  for (let i = from; i < nodeArr.length; i++) {
    const a = nodeArr[i], b = fixArr[i];
    if (a == null || b == null) continue;
    compared++;
    const tol = abs + rel * Math.max(Math.abs(a), Math.abs(b));
    assert.ok(
      Math.abs(a - b) <= tol,
      `${name} wijkt af op bar ${i}: node=${a} pine=${b} (tol ${tol})`
    );
  }
  return compared;
}

test("Pine-pariteit (fixtures uit TradingView)", async (t) => {
  const files = existsSync(FIX_DIR)
    ? readdirSync(FIX_DIR).filter((f) => /^parity_.*\.csv$/i.test(f))
    : [];
  if (!files.length) {
    t.skip("geen tests/fixtures/parity_*.csv — protocol: docs/PINE_NODE_PARITY.md");
    return;
  }

  for (const file of files) {
    await t.test(file, () => {
      const { rows, num, cols } = parseCsv(readFileSync(join(FIX_DIR, file), "utf8"));
      assert.ok(rows.length > WARMUP + 40, `${file}: te weinig bars (${rows.length}), exporteer ≥ 600`);
      const t0 = Number(rows[0][cols.time]);
      assert.ok(Number.isFinite(t0), `${file}: time-kolom niet numeriek — exporteer met UNIX time format`);
      const tsMul = t0 < 1e12 ? 1000 : 1; // seconden → ms

      const parsed = rows
        .map((r) => ({
          ts: Number(r[cols.time]) * tsMul,
          open: num(r, "open"), high: num(r, "high"), low: num(r, "low"), close: num(r, "close"),
          volume: num(r, "px_volume"),
          fix: {
            emaF: num(r, "px_emaF"), emaS: num(r, "px_emaS"), rsi: num(r, "px_rsi"),
            atr: num(r, "px_atr"), atrPct: num(r, "px_atrPct"),
            volRank: num(r, "px_volRank"), erRank: num(r, "px_erRank"),
            relVol: num(r, "px_relVol"), flow: num(r, "px_flow"),
            swingHigh: num(r, "px_swingHigh"), swingLow: num(r, "px_swingLow"),
            structBias: num(r, "px_structBias"),
          },
        }))
        .sort((a, b) => a.ts - b.ts);

      const close = parsed.map((x) => x.close);
      const open = parsed.map((x) => x.open);
      const highs = parsed.map((x) => x.high);
      const lows = parsed.map((x) => x.low);
      const vols = parsed.map((x) => x.volume ?? 0);
      const tsArr = parsed.map((x) => x.ts);
      const candles = parsed.map((x) => ({ high: x.high, low: x.low, close: x.close }));

      // Node-series (identieke parameters als productie)
      const emaF = emaPine(close, ARS_PARAMS.emaFastLen);
      const emaS = emaPine(close, ARS_PARAMS.emaSlowLen);
      const rsi = rsiArr(close, ARS_PARAMS.rsiLen);
      const atr = atrArr(candles, ARS_PARAMS.atrLen);
      const atrPct = atr.map((a, i) => (a == null || close[i] <= 0 ? null : (a / close[i]) * 100));
      const volRank = percentRankArr(atrPct, ARS_PARAMS.volWin);
      const er = erArr(close, ARS_PARAMS.erLen);
      const erRank = percentRankArr(er, ARS_PARAMS.volWin);
      const avgVol = smaArr(vols, ARS_PARAMS.volLen);
      const relVol = vols.map((v, i) => (avgVol[i] == null ? null : v / Math.max(avgVol[i], 1e-10)));
      const signed = vols.map((v, i) => Math.sign(close[i] - open[i]) * v);
      const flow = emaPine(signed, ARS_PARAMS.flowLen);

      const st = createStructure(ARS_PARAMS);
      const swingHigh = new Array(parsed.length).fill(null);
      const swingLow = new Array(parsed.length).fill(null);
      const bias = new Array(parsed.length).fill(null);
      for (let i = 0; i < parsed.length; i++) {
        const out = st.step(i, highs, lows, close, tsArr);
        swingHigh[i] = out.lastSwingHigh ?? 0; // Pine nz() → 0
        swingLow[i] = out.lastSwingLow ?? 0;
        bias[i] = out.structureBias;
      }

      const f = (k) => parsed.map((x) => x.fix[k]);
      const flowScale = Math.max(...flow.map((v) => Math.abs(v ?? 0)), 1);

      let total = 0;
      total += cmp("emaF", emaF, f("emaF"), { rel: 1e-3 }, WARMUP);
      total += cmp("emaS", emaS, f("emaS"), { rel: 1e-3 }, WARMUP);
      total += cmp("rsi", rsi, f("rsi"), { abs: 0.05 }, WARMUP);
      total += cmp("atr", atr, f("atr"), { rel: 1e-3 }, WARMUP);
      total += cmp("atrPct", atrPct, f("atrPct"), { rel: 1e-3 }, WARMUP);
      total += cmp("volRank (PIN A1)", volRank, f("volRank"), { abs: 0.5 }, WARMUP);
      total += cmp("erRank (PIN A1)", erRank, f("erRank"), { abs: 0.5 }, WARMUP);
      total += cmp("relVol", relVol, f("relVol"), { rel: 1e-4 }, WARMUP);
      total += cmp("flow", flow, f("flow"), { abs: 1e-3 * flowScale, rel: 1e-3 }, WARMUP);
      total += cmp("swingHigh (PIN A2)", swingHigh, f("swingHigh"), { rel: 1e-9 }, WARMUP);
      total += cmp("swingLow (PIN A2)", swingLow, f("swingLow"), { rel: 1e-9 }, WARMUP);
      total += cmp("structBias", bias, f("structBias"), { abs: 0 }, WARMUP);

      assert.ok(total > 0, `${file}: geen enkele px_-kolom gevonden — exportblok toegevoegd?`);
    });
  }
});
