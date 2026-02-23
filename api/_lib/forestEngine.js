// api/_lib/forestEngine.js

import { ema, std, mad, atr, adx, percentileFromWindow, clamp } from "./indicators.js";

function computeZCore(candles, { emaLen, zWin, robust } = {}) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const base = ema(closes, emaLen);
  const resid = closes.map((c, i) => (base[i] == null ? null : (c - base[i])));

  const scale = robust ? mad(resid, zWin) : std(resid, zWin);
  const atrArr = atr(highs, lows, closes, 14);
  const adxArr = adx(highs, lows, closes, 14);

  const z = resid.map((r, i) => {
    const s = scale[i];
    if (r == null || s == null || s === 0) return null;
    return r / s;
  });

  return { closes, highs, lows, base, resid, scale, atrArr, adxArr, z };
}

function computeBands(zArr, atrArr, i, lookback = 180) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);
  const p20 = percentileFromWindow(zWin, 20);
  const p80 = percentileFromWindow(zWin, 80);

  const p20ATR = percentileFromWindow(atrWin, 20);
  const atrNow = atrArr[i];

  const freeze = (p20ATR != null && atrNow != null) ? (atrNow < p20ATR) : false;
  return { bandsNow: { p35, p65, p20, p80, p20ATR }, freezeNow: freeze };
}

function regimeFromZ(zNow, bandsNow) {
  if (zNow == null) return "NEUTRAL";
  const { p35, p65 } = bandsNow || {};
  if (p35 == null || p65 == null) return "NEUTRAL";
  if (zNow > p65) return "BULL";
  if (zNow < p35) return "BEAR";
  return "NEUTRAL";
}

function strengthLabel(zNow) {
  if (zNow == null) return "";
  const a = Math.abs(zNow);
  if (a >= 2.2) return "EXTREME ";
  if (a >= 1.5) return "STRONG ";
  return "";
}

function confidenceLabel(zNow, adxNow, freezeNow) {
  // Heel simpel: als freeze -> low.
  if (freezeNow) return "low";
  const a = (zNow == null) ? 0 : Math.abs(zNow);

  // trend/range: als ADX hoog, dan iets “meer vertrouwen” in richting
  const trending = (adxNow != null && adxNow >= 25);

  if (a >= 2.0) return "high";
  if (a >= 1.2) return trending ? "high" : "medium";
  return trending ? "medium" : "low";
}

function buildLine(candles, values) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v == null) continue;
    out.push({ time: candles[i].time, value: v });
  }
  return out;
}

function overlayFromZ(baseArr, atrArr, zArr, zCap = 2.5, mult = 1.0) {
  const out = Array(baseArr.length).fill(null);
  for (let i = 0; i < baseArr.length; i++) {
    const b = baseArr[i], a = atrArr[i], z = zArr[i];
    if (b == null || a == null || z == null) continue;
    out[i] = b + clamp(z, -zCap, zCap) * a * mult;
  }
  return out;
}

function weeklyBiasFromWeekly(weeklyTruthCandles) {
  if (!weeklyTruthCandles?.length) return { bias: "NEUTRAL", ema200: null, lastClose: null };
  const closes = weeklyTruthCandles.map(c => c.close);
  const ema200 = ema(closes, 200);
  const last = closes[closes.length - 1];
  const e = ema200[ema200.length - 1];
  if (e == null || last == null) return { bias: "NEUTRAL", ema200: e ?? null, lastClose: last ?? null };
  return { bias: (last >= e) ? "BULL" : "BEAR", ema200: e, lastClose: last };
}

function buildForwardFan({ lastTime, base, atrNow, zNow, slope, barsForward, intervalSec }) {
  // Altijd iets laten zien: als slope bijna 0, dan “vlak” maar wel aanwezig.
  const zCap = 2.5;
  const step = clamp(slope ?? 0, -0.25, 0.25); // daily: rustig
  const outMid = [];
  const outUp  = [];
  const outLo  = [];

  // “fan breedte” = ATR * factor
  const band = (atrNow ?? 0) * 1.25;

  // Startpunt
  const start = base + clamp(zNow ?? 0, -zCap, zCap) * (atrNow ?? 0);
  outMid.push({ time: lastTime, value: start });
  outUp.push({ time: lastTime, value: start + band });
  outLo.push({ time: lastTime, value: start - band });

  for (let k = 1; k <= barsForward; k++) {
    const zF = clamp((zNow ?? 0) + step * k, -zCap, zCap);
    const v = base + zF * (atrNow ?? 0);

    const t = lastTime + intervalSec * k;
    outMid.push({ time: t, value: v });
    outUp.push({ time: t, value: v + band });
    outLo.push({ time: t, value: v - band });
  }

  return { outMid, outUp, outLo };
}

// Split forward in 4 blokken (voor 4 kleuren)
function splitForward4(series, barsForward) {
  if (!series?.length) return { w1: [], w2: [], w3: [], w4: [] };
  // series bevat start + barsForward punten
  const total = series.length - 1; // zonder start
  if (total <= 0) return { w1: series.slice(), w2: [], w3: [], w4: [] };

  const q = Math.max(1, Math.floor(total / 4));

  const idx1 = 1 + q;
  const idx2 = idx1 + q;
  const idx3 = idx2 + q;

  const start = series[0];

  const w1 = [start, ...series.slice(1, Math.min(series.length, idx1 + 1))];
  const w2 = [series[Math.min(series.length - 1, idx1)], ...series.slice(Math.min(series.length, idx1 + 1), Math.min(series.length, idx2 + 1))];
  const w3 = [series[Math.min(series.length - 1, idx2)], ...series.slice(Math.min(series.length, idx2 + 1), Math.min(series.length, idx3 + 1))];
  const w4 = [series[Math.min(series.length - 1, idx3)], ...series.slice(Math.min(series.length, idx3 + 1))];

  return { w1, w2, w3, w4 };
}

export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  tf = "1d",
  horizonBars = 90,
  weeklyTruthForBias = null
}) {
  const emaLen = (tf === "1w") ? 50 : 55;
  const zWin   = (tf === "1w") ? 208 : 180;
  const lookbackBands = zWin;

  // Robust aan: MAD (fat-tail fix)
  const t = computeZCore(candlesTruth, { emaLen, zWin, robust: true });
  const lastIdxT = candlesTruth.length - 1;

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBands(t.z, t.atrArr, lastIdxT, lookbackBands)
    : { bandsNow: {}, freezeNow: false };

  const zNow = t.z[lastIdxT];
  const adxNow = t.adxArr[lastIdxT];
  const reg = regimeFromZ(zNow, bandsNow);
  const conf = confidenceLabel(zNow, adxNow, freezeNow);

  // Weekly bias (optioneel, maar als meegegeven: gebruikt als extra context)
  let weeklyBias = { bias: "NEUTRAL", ema200: null, lastClose: null };
  if (weeklyTruthForBias?.length) weeklyBias = weeklyBiasFromWeekly(weeklyTruthForBias);

  // Overlay truth
  const overlayTruthArr = overlayFromZ(t.base, t.atrArr, t.z, 2.5, 1.0);
  const forestOverlayTruth = buildLine(candlesTruth, overlayTruthArr);
  const forestZTruth = buildLine(candlesTruth, t.z);

  // Live
  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeZCore(candlesWithLive, { emaLen, zWin, robust: true });
    const overlayLiveArr = overlayFromZ(l.base, l.atrArr, l.z, 2.5, 1.0);
    forestOverlayLive = buildLine(candlesWithLive, overlayLiveArr);
    forestZLive = buildLine(candlesWithLive, l.z);
  }

  // Slope van z (laatste 5 geldige)
  const lastZs = [];
  for (let i = lastIdxT; i >= 0 && lastZs.length < 6; i--) {
    if (t.z[i] != null) lastZs.push(t.z[i]);
  }
  const slope = (lastZs.length >= 6) ? ((lastZs[0] - lastZs[5]) / 5) : 0;

  // Interval
  const intervalSec = (tf === "1w") ? 7 * 24 * 60 * 60 : 24 * 60 * 60;

  // Forward fan (altijd tonen)
  const lastTime = candlesTruth[lastIdxT]?.time;
  const baseNow = t.base[lastIdxT] ?? candlesTruth[lastIdxT]?.close ?? 0;
  const atrNow = t.atrArr[lastIdxT] ?? 0;

  const fan = buildForwardFan({
    lastTime,
    base: baseNow,
    atrNow,
    zNow: zNow ?? 0,
    slope,
    barsForward: horizonBars,
    intervalSec
  });

  // split mid in 4 blokken (4 kleuren in UI)
  const forwardMid4 = splitForward4(fan.outMid, horizonBars);

  // NOW point (bolletje)
  const nowPoint = (lastTime != null && zNow != null)
    ? { time: lastTime, value: zNow }
    : null;

  const label = `${strengthLabel(zNow)}${reg} (${zNow != null ? zNow.toFixed(2) : "n/a"})`;

  // Grootste kans (met bias)
  // Heel simpel: als weekly bias bull en reg neutraal -> "NEUTRAL (bull bias)"
  let biggest = `${reg} (${conf})`;
  if (tf === "1d" && weeklyBias.bias !== "NEUTRAL" && reg === "NEUTRAL") {
    biggest = `NEUTRAL (${conf}, ${weeklyBias.bias} bias)`;
  }

  return {
    regimeLabel: label,
    biggestChance: biggest,

    forestOverlayTruth,
    forestOverlayLive,

    forestOverlayForwardMid: fan.outMid,
    forestOverlayForwardUpper: fan.outUp,
    forestOverlayForwardLower: fan.outLo,

    // 4 kleur-blokken (mid)
    forestOverlayForwardMidW1: forwardMid4.w1,
    forestOverlayForwardMidW2: forwardMid4.w2,
    forestOverlayForwardMidW3: forwardMid4.w3,
    forestOverlayForwardMidW4: forwardMid4.w4,

    forestZTruth,
    forestZLive,
    nowPoint,

    bandsNow,
    freezeNow,

    // extra debug / context
    adxNow,
    confidence: conf,
    weeklyBias
  };
}