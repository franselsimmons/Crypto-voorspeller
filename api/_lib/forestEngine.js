// api/_lib/forestEngine.js
// Daily/Weekly Forest + Forecast (niet-recht)
// - Truth = gesloten candles (betrouwbaar)
// - Live = preview (mag wiebelen)
// - Forecast = ALTIJD gebaseerd op Truth (dus geen “achteraf veranderen”)

import {
  atr,
  percentileFromWindow,
  clamp,
  kama,
  mad,
  dominantCycleLength
} from "./indicators.js";

function computeCore(candles, { kamaEr = 10, kamaFast = 2, kamaSlow = 30, zWin = 180 } = {}) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const base = kama(closes, kamaEr, kamaFast, kamaSlow);
  const resid = closes.map((c, i) => (base[i] == null ? null : (c - base[i])));

  const madArr = mad(resid, zWin);
  const atrArr = atr(highs, lows, closes, 14);

  // robust z-score (fat-tail proof-ish)
  const z = resid.map((r, i) => {
    const m = madArr[i];
    const sigma = (m == null) ? null : (1.4826 * m);
    if (r == null || sigma == null || sigma === 0) return null;
    return r / sigma;
  });

  return { closes, highs, lows, base, resid, atrArr, z };
}

function bandsFromZ(zArr, atrArr, i, lookback = 208) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);

  const p20Z = percentileFromWindow(zWin, 20);
  const p80Z = percentileFromWindow(zWin, 80);

  const p20ATR = percentileFromWindow(atrWin, 20);
  const atrNow = atrArr[i];
  const freeze = (p20ATR != null && atrNow != null) ? (atrNow < p20ATR) : false;

  return { bandsNow: { p35, p65, p20Z, p80Z, p20ATR }, freezeNow: freeze };
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

function confidenceFromZ(zNow, freezeNow) {
  if (freezeNow) return "low";
  if (zNow == null) return "low";
  const a = Math.abs(zNow);
  if (a >= 2.2) return "high";
  if (a >= 1.5) return "mid";
  return "low";
}

function buildOverlaySeries(candles, baseArr, atrArr, zArr, { zCap = 2.5, mult = 1.0 } = {}) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time;
    const base = baseArr[i];
    const a = atrArr[i];
    const z = zArr[i];
    if (base == null || a == null || z == null) continue;
    const v = base + clamp(z, -zCap, zCap) * a * mult;
    out.push({ time: t, value: v });
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

function slopeOf(arr, endIdx, len) {
  // simpele slope: (last - first)/len
  const i0 = Math.max(0, endIdx - len + 1);
  const a0 = arr[i0];
  const a1 = arr[endIdx];
  if (a0 == null || a1 == null) return 0;
  return (a1 - a0) / Math.max(1, (endIdx - i0));
}

function buildForecastFromTruth(truthCandles, core, { tf = "1d", horizonBars = 90 } = {}) {
  const n = truthCandles.length;
  if (n < 200) return { mid: [], upper: [], lower: [], nowPoint: null };

  const lastIdx = n - 1;
  const lastTime = truthCandles[lastIdx].time;

  const lastBase = core.base[lastIdx];
  const lastAtr = core.atrArr[lastIdx];
  const lastZ = core.z[lastIdx];

  if (lastBase == null || lastAtr == null || lastZ == null) {
    return { mid: [], upper: [], lower: [], nowPoint: null };
  }

  const stepSec = (tf === "1w") ? 7 * 24 * 60 * 60 : 24 * 60 * 60;

  // 1) Basis trend drift (KAMA slope)
  const baseSlope = slopeOf(core.base, lastIdx, tf === "1w" ? 8 : 20); // weekly=8w, daily=20d

  // 2) Dominante cyclus uit resid
  const resid = core.resid;
  const minLag = (tf === "1w") ? 4 : 18;
  const maxLag = (tf === "1w") ? 26 : 60;
  const cycleLen = dominantCycleLength(resid, minLag, maxLag);

  // phase: kijk naar laatste 2 punten om richting te pakken
  const rNow = resid[lastIdx] ?? 0;
  const rPrev = resid[lastIdx - 1] ?? rNow;
  const phaseDir = (rNow - rPrev) >= 0 ? 1 : -1;

  // amplitude: ATR gedreven (niet overdreven)
  const amp = clamp(lastAtr * 0.9, lastAtr * 0.4, lastAtr * 1.4);

  // 3) Mean reversion op z (extremen trekken terug)
  const z0 = clamp(lastZ, -2.5, 2.5);
  const reversion = 0.035; // per bar
  const zTarget = 0;       // terug naar "normaal"

  // Forecast arrays
  const mid = [];
  const upper = [];
  const lower = [];

  // start: sluit aan op “nu”
  const nowOverlay = lastBase + z0 * lastAtr;
  mid.push({ time: lastTime, value: nowOverlay });

  // onzekerheidsband groeit met tijd (maar niet absurd)
  // daily 180 bars: band groeit langzaam
  for (let k = 1; k <= horizonBars; k++) {
    const t = lastTime + stepSec * k;

    // basis drift
    const baseF = lastBase + baseSlope * k;

    // cycle component (sinus)
    const omega = (2 * Math.PI) / Math.max(6, cycleLen);
    const cyc = Math.sin(omega * k) * amp * 0.55 * phaseDir;

    // z mean reversion (kleine correctie op base)
    const zF = z0 + (zTarget - z0) * (1 - Math.exp(-reversion * k));
    const zComp = zF * lastAtr * 0.35;

    // MID
    const y = baseF + cyc + zComp;
    mid.push({ time: t, value: y });

    // FAN: groeit met sqrt(k) + ATR (fat-tail: iets breder)
    const fan = lastAtr * (0.9 + 0.06 * Math.sqrt(k));
    upper.push({ time: t, value: y + fan });
    lower.push({ time: t, value: y - fan });
  }

  const nowPoint = {
    time: lastTime,
    price: truthCandles[lastIdx].close,
    overlay: nowOverlay,
    z: lastZ
  };

  return { mid, upper, lower, nowPoint };
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive, tf = "1d", horizonBars = 90 }) {
  // TRUTH core
  const t = computeCore(candlesTruth, { zWin: tf === "1w" ? 208 : 180 });
  const lastIdxT = candlesTruth.length - 1;

  const { bandsNow, freezeNow } = lastIdxT >= 0
    ? bandsFromZ(t.z, t.atrArr, lastIdxT, tf === "1w" ? 208 : 180)
    : { bandsNow: {}, freezeNow: false };

  const reg = regimeFromZ(t.z[lastIdxT], bandsNow);
  const conf = confidenceFromZ(t.z[lastIdxT], freezeNow);
  const label = `${strengthLabel(t.z[lastIdxT])}${reg} (${t.z[lastIdxT] != null ? t.z[lastIdxT].toFixed(2) : "n/a"})`;

  const forestOverlayTruth = buildOverlaySeries(candlesTruth, t.base, t.atrArr, t.z);
  const forestZTruth = buildZSeries(candlesTruth, t.z);

  // LIVE overlay/z (preview) – mag “wiebelen”
  let forestOverlayLive = [];
  let forestZLive = [];

  if (hasLive && candlesWithLive?.length) {
    const l = computeCore(candlesWithLive, { zWin: tf === "1w" ? 208 : 180 });
    forestOverlayLive = buildOverlaySeries(candlesWithLive, l.base, l.atrArr, l.z);
    forestZLive = buildZSeries(candlesWithLive, l.z);
  }

  // FORECAST: altijd op TRUTH (betrouwbaar)
  const fc = buildForecastFromTruth(candlesTruth, t, { tf, horizonBars });

  return {
    regimeLabel: label,
    confidence: conf,

    forestOverlayTruth,
    forestOverlayLive,

    forestOverlayForwardMid: fc.mid,
    forestOverlayForwardUpper: fc.upper,
    forestOverlayForwardLower: fc.lower,

    forestZTruth,
    forestZLive,

    nowPoint: fc.nowPoint,

    bandsNow,
    freezeNow,
    regimeNow: reg
  };
}