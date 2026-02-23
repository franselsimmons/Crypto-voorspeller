// api/_lib/forestEngine.js
// Daily + Weekly, no repaint on TRUTH.
// Forward = hint (90 bars) + fan (upper/lower).

import { ema, std, atr, percentileFromWindow, clamp } from "./indicators.js";

function pickParams(tf) {
  // Daily is noisy -> longer baseline.
  if (tf === "1d") {
    return {
      emaLen: 200,   // daily trend baseline
      zWin: 730,     // ~2 jaar daily
      lookbackBands: 730,
      atrLen: 14
    };
  }
  // Weekly
  return {
    emaLen: 50,
    zWin: 208,
    lookbackBands: 208,
    atrLen: 14
  };
}

function intervalSecFromTf(tf) {
  return tf === "1w" ? 7 * 24 * 60 * 60 : 24 * 60 * 60;
}

function computeForestZ(candles, { emaLen, zWin, atrLen }) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const emaArr = ema(closes, emaLen);
  const resid  = closes.map((c, i) => (emaArr[i] == null ? null : (c - emaArr[i])));
  const sdArr  = std(resid, zWin);
  const atrArr = atr(highs, lows, closes, atrLen);

  const z = resid.map((r, i) => {
    const sd = sdArr[i];
    if (r == null || sd == null || sd === 0) return null;
    return r / sd;
  });

  return { emaArr, atrArr, z };
}

function computeBandsAndFreeze(zArr, atrArr, i, lookback) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);
  const p20Z = percentileFromWindow(zWin, 20);
  const p80Z = percentileFromWindow(zWin, 80);

  const p20ATR = percentileFromWindow(atrWin, 20);
  const atrNow = atrArr[i];

  const freeze = (p20ATR != null && atrNow != null) ? (atrNow < p20ATR) : false;

  return {
    bandsNow: { p35, p65, p20Z, p80Z, p20ATR },
    freezeNow: freeze
  };
}

function regimeFromZ(zNow, bandsNow) {
  const { p35, p65 } = bandsNow;
  if (zNow == null || p35 == null || p65 == null) return "NEUTRAL";
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

function buildOverlayPoints(candles, emaArr, atrArr, zArr, { zCap = 2.5, mult = 1.0 } = {}) {
  // overlay = EMA + clamp(z)*ATR*mult
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const base = emaArr[i];
    const a = atrArr[i];
    const z = zArr[i];
    if (base == null || a == null || z == null) continue;
    out.push({ time: candles[i].time, value: base + clamp(z, -zCap, zCap) * a * mult });
  }
  return out;
}

function buildZSeries(candles, zArr) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const z = zArr[i];
    if (z == null) continue;
    out.push({ time: candles[i].time, value: z });
  }
  return out;
}

function lastValid(values, startIdx, need = 5) {
  const arr = [];
  for (let i = startIdx; i >= 0 && arr.length < need; i--) {
    if (values[i] != null) arr.push(values[i]);
  }
  return arr;
}

function buildForwardFanFromTruth({ truthCandles, emaArr, atrArr, zArr, tf, horizonBars }) {
  // Mid line = projected Z (damped & capped), then converted to overlay price using last EMA/ATR.
  // Fan = uncertainty grows with sqrt(k). (very important for "quality")

  const n = truthCandles.length;
  if (n < 20) return { mid: [], upper: [], lower: [] };

  const lastIdx = n - 1;
  const lastTime = truthCandles[lastIdx].time;
  const lastZ = zArr[lastIdx];
  const lastEma = emaArr[lastIdx];
  const lastAtr = atrArr[lastIdx];
  if (lastZ == null || lastEma == null || lastAtr == null) return { mid: [], upper: [], lower: [] };

  // slope from last 5 Z points
  const zs = lastValid(zArr, lastIdx, 5);
  if (zs.length < 5) return { mid: [], upper: [], lower: [] };
  // average slope (per bar)
  const slope = (zs[0] - zs[4]) / 4;

  // safety caps
  const zCap = 2.5;
  const slopeCap = tf === "1d" ? 0.18 : 0.60; // daily = smaller steps
  const slopeCapped = clamp(slope, -slopeCap, slopeCap);

  // damping: extreme z -> push less
  const damp = 1 - Math.min(Math.abs(lastZ) / 3, 1); // |z|=3 => 0
  const step = slopeCapped * (0.35 + 0.65 * damp);

  const dt = intervalSecFromTf(tf);

  const mid = [];
  const upper = [];
  const lower = [];

  // start point (connect)
  const z0 = clamp(lastZ, -zCap, zCap);
  const base0 = lastEma + z0 * lastAtr;
  mid.push({ time: lastTime, value: base0 });

  // fan width base
  // daily: fan grows slower but exists
  const fanMult = tf === "1d" ? 0.9 : 1.2;

  for (let k = 1; k <= horizonBars; k++) {
    const zF = clamp(lastZ + step * k, -zCap, zCap);
    const y = lastEma + zF * lastAtr;

    const t = lastTime + dt * k;

    // uncertainty grows with sqrt(k), reduced by confidence (damp)
    const width = (lastAtr * fanMult) * Math.sqrt(k) * (0.55 + 0.45 * (1 - damp));

    mid.push({ time: t, value: y });
    upper.push({ time: t, value: y + width });
    lower.push({ time: t, value: y - width });
  }

  return { mid, upper, lower };
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive, tf = "1d", horizonBars = 90 }) {
  const p = pickParams(tf);

  // TRUTH
  const t = computeForestZ(candlesTruth, p);
  const lastIdxT = candlesTruth.length - 1;

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBandsAndFreeze(t.z, t.atrArr, lastIdxT, p.lookbackBands)
    : { bandsNow: {}, freezeNow: false };

  const reg = regimeFromZ(t.z[lastIdxT], bandsNow);
  const zNow = t.z[lastIdxT];
  const label = `${strengthLabel(zNow)}${reg} (${zNow != null ? zNow.toFixed(2) : "n/a"})`;

  const forestOverlayTruth = buildOverlayPoints(candlesTruth, t.emaArr, t.atrArr, t.z);
  const forestZTruth = buildZSeries(candlesTruth, t.z);

  // LIVE (preview)
  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeForestZ(candlesWithLive, p);
    forestOverlayLive = buildOverlayPoints(candlesWithLive, l.emaArr, l.atrArr, l.z);
    forestZLive = buildZSeries(candlesWithLive, l.z);
  }

  // Forward always visible as hint, but still safe + fan
  const fan = buildForwardFanFromTruth({
    truthCandles: candlesTruth,
    emaArr: t.emaArr,
    atrArr: t.atrArr,
    zArr: t.z,
    tf,
    horizonBars
  });

  // for "bolletje waar we nu staan"
  const nowPoint = (candlesTruth.length && zNow != null)
    ? { time: candlesTruth[lastIdxT].time, z: zNow }
    : null;

  return {
    regimeLabel: label,
    forestOverlayTruth,
    forestOverlayLive,

    forestOverlayForwardMid: fan.mid,
    forestOverlayForwardUpper: fan.upper,
    forestOverlayForwardLower: fan.lower,

    forestZTruth,
    forestZLive,
    nowPoint,

    bandsNow,
    freezeNow
  };
}