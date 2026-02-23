// api/_lib/forestEngine.js
import {
  kama, std, atr, sma, obv, adx,
  percentileFromWindow, clamp
} from "./indicators.js";

function computeCore(candles, {
  kamaEr = 10, kamaFast = 2, kamaSlow = 30,
  zWin = 208,
  adxLen = 14
} = {}) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const vols   = candles.map(c => c.volume ?? 0);

  const base = kama(closes, kamaEr, kamaFast, kamaSlow);       // basislijn (stabieler dan EMA)
  const resid = closes.map((c, i) => (base[i] == null ? null : (c - base[i])));
  const sd = std(resid, zWin);
  const a = atr(highs, lows, closes, 14);

  const z = resid.map((r, i) => {
    const s = sd[i];
    if (r == null || s == null || s === 0) return null;
    return r / s;
  });

  // volume-confirmatie
  const volSma = sma(vols, 20);
  const relVol = vols.map((v, i) => (volSma[i] ? (v / volSma[i]) : null));
  const obvArr = obv(closes, vols);

  // trend/range detectie
  const adxArr = adx(highs, lows, closes, adxLen);

  return { closes, highs, lows, vols, base, a, z, relVol, obvArr, adxArr };
}

function computeBands(zArr, atrArr, i, lookback = 208) {
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

function scoreConfidence({
  zNow, adxNow, relVolNow, obvSlope, aligned
}) {
  // simpele “meter”
  let s = 0;

  // z strength
  if (zNow != null) {
    const az = Math.abs(zNow);
    if (az >= 2.2) s += 3;
    else if (az >= 1.5) s += 2;
    else if (az >= 0.9) s += 1;
  }

  // trend strength (ADX)
  if (adxNow != null) {
    if (adxNow >= 30) s += 2;
    else if (adxNow >= 20) s += 1;
  }

  // volume confirmation
  if (relVolNow != null) {
    if (relVolNow >= 1.2) s += 2;
    else if (relVolNow >= 1.0) s += 1;
  }

  // obv slope confirms direction
  if (obvSlope != null) {
    if (Math.abs(obvSlope) > 0) s += 1;
  }

  // multi-tf alignment
  if (aligned) s += 2;
  else s -= 2;

  if (s >= 7) return "high";
  if (s >= 4) return "mid";
  return "low";
}

function overlaySeries(candles, baseArr, atrArr, zArr, { zCap = 2.6, mult = 1.0 } = {}) {
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

function zSeries(candles, zArr) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const z = zArr[i];
    if (z == null) continue;
    out.push({ time: candles[i].time, value: z });
  }
  return out;
}

function lastValidIndex(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i;
  return -1;
}

function findLastExtrema(zArr, lookback = 180) {
  // zoek laatste 2 extremen (peak/trough) om een “cycle” te schatten
  const pts = [];
  const start = Math.max(2, zArr.length - lookback);
  for (let i = zArr.length - 2; i >= start; i--) {
    const a = zArr[i - 1], b = zArr[i], c = zArr[i + 1];
    if (a == null || b == null || c == null) continue;

    const isPeak = (b > a && b > c);
    const isTrough = (b < a && b < c);
    if (isPeak || isTrough) {
      pts.push({ i, z: b, type: isPeak ? "peak" : "trough" });
      if (pts.length >= 3) break;
    }
  }
  return pts;
}

function buildForwardWave({
  candlesTruth, baseArr, atrArr, zArr,
  horizonBars,
  tf
}) {
  const n = candlesTruth.length;
  if (n < 50) return { mid: [], upper: [], lower: [] };

  const lastIdx = lastValidIndex(zArr);
  if (lastIdx < 0) return { mid: [], upper: [], lower: [] };

  const lastTime = candlesTruth[lastIdx].time;
  const baseNow = baseArr[lastIdx];
  const atrNow = atrArr[lastIdx];
  const zNow = zArr[lastIdx];

  if (baseNow == null || atrNow == null || zNow == null) {
    return { mid: [], upper: [], lower: [] };
  }

  // timestep
  const stepSec = (tf === "1w") ? (7 * 24 * 3600) : (24 * 3600);

  // project baseline slope (laatste 10 punten)
  let slope = 0;
  let cnt = 0;
  for (let k = 1; k <= 10; k++) {
    const i1 = lastIdx - k;
    const i2 = lastIdx - k - 1;
    if (i2 < 0) break;
    const b1 = baseArr[i1], b2 = baseArr[i2];
    if (b1 == null || b2 == null) continue;
    slope += (b1 - b2);
    cnt++;
  }
  const baseSlopePerBar = (cnt ? (slope / cnt) : 0);

  // cycle schatten via extrema in z
  const ex = findLastExtrema(zArr, 220);
  let period = Math.min(horizonBars, Math.max(14, Math.round(horizonBars / 2)));
  if (ex.length >= 2) {
    const p = Math.abs(ex[0].i - ex[1].i);
    if (p >= 10 && p <= 1200) period = p;
  }

  // amplitude: kleiner bij grote horizon + demping bij extreme z
  const ampBase = clamp(Math.abs(zNow), 0.6, 2.4);
  const horizonDamp = clamp(90 / Math.max(30, horizonBars), 0.35, 1.0);
  const amp = ampBase * horizonDamp;

  // mean reversion naar 0 (z kruipt richting 0)
  const mr = clamp(0.985, 0.96, 0.995); // per bar demping
  let zCenter = zNow;

  // fase: als we weten of laatste extreem peak/trough was, start de wave logisch
  let phase = 0;
  if (ex.length >= 1) {
    phase = (ex[0].type === "peak") ? Math.PI : 0;
  }

  const mid = [];
  const upper = [];
  const lower = [];

  for (let k = 0; k <= horizonBars; k++) {
    const t = lastTime + stepSec * k;

    // baseline doorrollen
    const baseF = baseNow + baseSlopePerBar * k;

    // z center langzaam naar 0
    zCenter = zCenter * mr;

    // wave component
    const w = (2 * Math.PI * k) / Math.max(10, period);
    const zWave = amp * Math.sin(w + phase);

    // mid z is center + wave
    const zMid = clamp(zCenter + zWave, -2.8, 2.8);

    // fan band (±0.6 z) -> wordt iets breder met horizon
    const widen = clamp(0.35 + (k / Math.max(1, horizonBars)) * 0.65, 0.35, 1.0);
    const band = 0.55 * widen;

    const zUp = clamp(zMid + band, -3.0, 3.0);
    const zLo = clamp(zMid - band, -3.0, 3.0);

    const vMid = baseF + zMid * atrNow;
    const vUp  = baseF + zUp  * atrNow;
    const vLo  = baseF + zLo  * atrNow;

    mid.push({ time: t, value: vMid });
    upper.push({ time: t, value: vUp });
    lower.push({ time: t, value: vLo });
  }

  return { mid, upper, lower };
}

export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  tf = "1d",
  horizonBars = 90,

  // multi-tf input (optioneel)
  weeklyTruthCandles = null
}) {
  // ---- TRUTH CORE ----
  const t = computeCore(candlesTruth, { zWin: 208 });
  const lastIdxT = lastValidIndex(t.z);

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBands(t.z, t.a, lastIdxT, 208)
    : { bandsNow: {}, freezeNow: false };

  let reg = regimeFromZ(t.z[lastIdxT], bandsNow);
  let label = `${strengthLabel(t.z[lastIdxT])}${reg} (${t.z[lastIdxT] != null ? t.z[lastIdxT].toFixed(2) : "n/a"})`;

  // ---- UPGRADE #1: ADX regime detect (trend vs range) ----
  const adxNow = t.adxArr[lastIdxT];
  const trending = (adxNow != null && adxNow >= 25);

  // als niet trending: maak bands strenger (minder whipsaw)
  // (range -> sneller NEUTRAL)
  if (!trending && reg !== "NEUTRAL" && t.z[lastIdxT] != null) {
    // in range willen we alleen bull/bear als z echt “ver” is
    if (Math.abs(t.z[lastIdxT]) < 1.2) reg = "NEUTRAL";
  }

  // ---- UPGRADE #2: volume confirmation ----
  const relVolNow = t.relVol[lastIdxT];
  const obvNow = t.obvArr[lastIdxT];
  const obvPrev = t.obvArr[Math.max(0, lastIdxT - 5)];
  const obvSlope = (obvNow != null && obvPrev != null) ? (obvNow - obvPrev) : null;

  // als volume zwak: confidence omlaag (maar regime blijft “grootste kans”)
  // ---- UPGRADE #3: multi-timeframe alignment (daily + weekly) ----
  let aligned = true;
  let weeklyReg = null;

  if (tf === "1d" && Array.isArray(weeklyTruthCandles) && weeklyTruthCandles.length > 100) {
    const w = computeCore(weeklyTruthCandles, { zWin: 208 });
    const wIdx = lastValidIndex(w.z);
    const wBands = computeBands(w.z, w.a, wIdx, 208).bandsNow;
    weeklyReg = regimeFromZ(w.z[wIdx], wBands);

    // alignment = weekly mag niet de andere kant op zijn
    if (weeklyReg === "BULL" && reg === "BEAR") aligned = false;
    if (weeklyReg === "BEAR" && reg === "BULL") aligned = false;

    // als weekly extreem, weegt zwaarder
    const wZ = w.z[wIdx];
    if (wZ != null && Math.abs(wZ) >= 2.0) {
      if (weeklyReg !== "NEUTRAL") reg = weeklyReg;
    }
  }

  const confidence = scoreConfidence({
    zNow: t.z[lastIdxT],
    adxNow,
    relVolNow,
    obvSlope,
    aligned
  });

  label = `${strengthLabel(t.z[lastIdxT])}${reg} (${t.z[lastIdxT] != null ? t.z[lastIdxT].toFixed(2) : "n/a"})`;

  // overlay + z series
  const forestOverlayTruth = overlaySeries(candlesTruth, t.base, t.a, t.z);
  const forestZTruth = zSeries(candlesTruth, t.z);

  // LIVE preview (zelfde logic, alleen visueel)
  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeCore(candlesWithLive, { zWin: 208 });
    forestOverlayLive = overlaySeries(candlesWithLive, l.base, l.a, l.z);
    forestZLive = zSeries(candlesWithLive, l.z);
  }

  // forward wave + fan bands
  // als freeze: forward blijft “maar klein” (geen grote beloftes)
  const safeH = freezeNow ? Math.min(20, horizonBars) : horizonBars;
  const fwd = buildForwardWave({
    candlesTruth,
    baseArr: t.base,
    atrArr: t.a,
    zArr: t.z,
    horizonBars: safeH,
    tf
  });

  const nowPoint = {
    time: candlesTruth[lastIdxT]?.time ?? null,
    price: candlesTruth[lastIdxT]?.close ?? null,
    overlay: forestOverlayTruth.length ? forestOverlayTruth[forestOverlayTruth.length - 1].value : null,
    z: t.z[lastIdxT] ?? null,
    regimeNow: reg,
    confidence,
    weeklyReg
  };

  return {
    regimeLabel: label,
    regimeNow: reg,
    confidence,

    forestOverlayTruth,
    forestOverlayLive,

    forestOverlayForwardMid: fwd.mid,
    forestOverlayForwardUpper: fwd.upper,
    forestOverlayForwardLower: fwd.lower,

    forestZTruth,
    forestZLive,

    bandsNow,
    freezeNow,
    nowPoint
  };
}