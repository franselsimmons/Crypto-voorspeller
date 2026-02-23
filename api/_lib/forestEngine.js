// api/_lib/forestEngine.js
import {
  kama, std, atr, sma, obv, adx,
  percentileFromWindow, clamp
} from "./indicators.js";

function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function computeCore(candles, {
  kamaEr = 10, kamaFast = 2, kamaSlow = 30,
  zWin = 208,
  adxLen = 14
} = {}) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const vols   = candles.map(c => (c.volume ?? 0));

  const base = kama(closes, kamaEr, kamaFast, kamaSlow);
  const resid = closes.map((c, i) => (base[i] == null ? null : (c - base[i])));
  const sd = std(resid, zWin);
  const a = atr(highs, lows, closes, 14);

  const z = resid.map((r, i) => {
    const s = sd[i];
    if (!isNum(r) || !isNum(s) || s === 0) return null;
    return r / s;
  });

  const volSma = sma(vols, 20);
  const relVol = vols.map((v, i) => (isNum(volSma[i]) && volSma[i] !== 0) ? (v / volSma[i]) : null);
  const obvArr = obv(closes, vols);
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

  const freeze = (isNum(p20ATR) && isNum(atrNow)) ? (atrNow < p20ATR) : false;

  return { bandsNow: { p35, p65, p20Z, p80Z, p20ATR }, freezeNow: freeze };
}

function regimeFromZ(zNow, bandsNow) {
  const { p35, p65 } = bandsNow;
  if (!isNum(zNow) || !isNum(p35) || !isNum(p65)) return "NEUTRAL";
  if (zNow > p65) return "BULL";
  if (zNow < p35) return "BEAR";
  return "NEUTRAL";
}

function strengthLabel(zNow) {
  if (!isNum(zNow)) return "";
  const a = Math.abs(zNow);
  if (a >= 2.2) return "EXTREME ";
  if (a >= 1.5) return "STRONG ";
  return "";
}

function scoreConfidence({ zNow, adxNow, relVolNow, obvSlope, aligned }) {
  let s = 0;

  if (isNum(zNow)) {
    const az = Math.abs(zNow);
    if (az >= 2.2) s += 3;
    else if (az >= 1.5) s += 2;
    else if (az >= 0.9) s += 1;
  }

  if (isNum(adxNow)) {
    if (adxNow >= 30) s += 2;
    else if (adxNow >= 20) s += 1;
  }

  if (isNum(relVolNow)) {
    if (relVolNow >= 1.2) s += 2;
    else if (relVolNow >= 1.0) s += 1;
  }

  if (isNum(obvSlope)) {
    if (Math.abs(obvSlope) > 0) s += 1;
  }

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
    if (!isNum(t) || !isNum(base) || !isNum(a) || !isNum(z)) continue;

    const v = base + clamp(z, -zCap, zCap) * a * mult;
    if (!isNum(v)) continue;

    out.push({ time: t, value: v });
  }
  return out;
}

function zSeries(candles, zArr) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time;
    const z = zArr[i];
    if (!isNum(t) || !isNum(z)) continue;
    out.push({ time: t, value: z });
  }
  return out;
}

function lastValidIndex(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) return i;
  return -1;
}

function findLastExtrema(zArr, lookback = 180) {
  const pts = [];
  const start = Math.max(2, zArr.length - lookback);
  for (let i = zArr.length - 2; i >= start; i--) {
    const a = zArr[i - 1], b = zArr[i], c = zArr[i + 1];
    if (!isNum(a) || !isNum(b) || !isNum(c)) continue;

    const isPeak = (b > a && b > c);
    const isTrough = (b < a && b < c);
    if (isPeak || isTrough) {
      pts.push({ i, z: b, type: isPeak ? "peak" : "trough" });
      if (pts.length >= 3) break;
    }
  }
  return pts;
}

function buildForwardWave({ candlesTruth, baseArr, atrArr, zArr, horizonBars, tf }) {
  const n = candlesTruth.length;
  if (n < 50) return { mid: [], upper: [], lower: [] };

  const lastIdx = lastValidIndex(zArr);
  if (lastIdx < 0) return { mid: [], upper: [], lower: [] };

  const lastTime = candlesTruth[lastIdx].time;
  const baseNow = baseArr[lastIdx];
  const atrNow = atrArr[lastIdx];
  const zNow = zArr[lastIdx];

  if (!isNum(lastTime) || !isNum(baseNow) || !isNum(atrNow) || !isNum(zNow)) {
    return { mid: [], upper: [], lower: [] };
  }

  const stepSec = (tf === "1w") ? (7 * 24 * 3600) : (24 * 3600);

  let slope = 0;
  let cnt = 0;
  for (let k = 1; k <= 10; k++) {
    const i1 = lastIdx - k;
    const i2 = lastIdx - k - 1;
    if (i2 < 0) break;
    const b1 = baseArr[i1], b2 = baseArr[i2];
    if (!isNum(b1) || !isNum(b2)) continue;
    slope += (b1 - b2);
    cnt++;
  }
  const baseSlopePerBar = cnt ? (slope / cnt) : 0;

  const ex = findLastExtrema(zArr, 220);
  let period = Math.min(horizonBars, Math.max(14, Math.round(horizonBars / 2)));
  if (ex.length >= 2) {
    const p = Math.abs(ex[0].i - ex[1].i);
    if (p >= 10 && p <= 1200) period = p;
  }

  const ampBase = clamp(Math.abs(zNow), 0.6, 2.4);
  const horizonDamp = clamp(90 / Math.max(30, horizonBars), 0.35, 1.0);
  const amp = ampBase * horizonDamp;

  const mr = clamp(0.985, 0.96, 0.995);
  let zCenter = zNow;

  let phase = 0;
  if (ex.length >= 1) phase = (ex[0].type === "peak") ? Math.PI : 0;

  const mid = [];
  const upper = [];
  const lower = [];

  for (let k = 0; k <= horizonBars; k++) {
    const t = lastTime + stepSec * k;
    if (!isNum(t)) continue;

    const baseF = baseNow + baseSlopePerBar * k;

    zCenter = zCenter * mr;

    const w = (2 * Math.PI * k) / Math.max(10, period);
    const zWave = amp * Math.sin(w + phase);

    const zMid = clamp(zCenter + zWave, -2.8, 2.8);

    const widen = clamp(0.35 + (k / Math.max(1, horizonBars)) * 0.65, 0.35, 1.0);
    const band = 0.55 * widen;

    const zUp = clamp(zMid + band, -3.0, 3.0);
    const zLo = clamp(zMid - band, -3.0, 3.0);

    const vMid = baseF + zMid * atrNow;
    const vUp  = baseF + zUp  * atrNow;
    const vLo  = baseF + zLo  * atrNow;

    if (isNum(vMid)) mid.push({ time: t, value: vMid });
    if (isNum(vUp))  upper.push({ time: t, value: vUp });
    if (isNum(vLo))  lower.push({ time: t, value: vLo });
  }

  return { mid, upper, lower };
}

export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  tf = "1d",
  horizonBars = 90,
  weeklyTruthCandles = null
}) {
  const t = computeCore(candlesTruth, { zWin: 208 });
  const lastIdxT = lastValidIndex(t.z);

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBands(t.z, t.a, lastIdxT, 208)
    : { bandsNow: {}, freezeNow: false };

  let reg = regimeFromZ(t.z[lastIdxT], bandsNow);

  const adxNow = t.adxArr[lastIdxT];
  const trending = (isNum(adxNow) && adxNow >= 25);
  if (!trending && reg !== "NEUTRAL" && isNum(t.z[lastIdxT])) {
    if (Math.abs(t.z[lastIdxT]) < 1.2) reg = "NEUTRAL";
  }

  const relVolNow = t.relVol[lastIdxT];
  const obvNow = t.obvArr[lastIdxT];
  const obvPrev = t.obvArr[Math.max(0, lastIdxT - 5)];
  const obvSlope = (isNum(obvNow) && isNum(obvPrev)) ? (obvNow - obvPrev) : null;

  let aligned = true;
  let weeklyReg = null;

  if (tf === "1d" && Array.isArray(weeklyTruthCandles) && weeklyTruthCandles.length > 100) {
    const w = computeCore(weeklyTruthCandles, { zWin: 208 });
    const wIdx = lastValidIndex(w.z);
    const wBands = computeBands(w.z, w.a, wIdx, 208).bandsNow;
    weeklyReg = regimeFromZ(w.z[wIdx], wBands);

    if (weeklyReg === "BULL" && reg === "BEAR") aligned = false;
    if (weeklyReg === "BEAR" && reg === "BULL") aligned = false;

    const wZ = w.z[wIdx];
    if (isNum(wZ) && Math.abs(wZ) >= 2.0) {
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

  const zNow = t.z[lastIdxT];
  const regimeLabel = `${strengthLabel(zNow)}${reg} (${isNum(zNow) ? zNow.toFixed(2) : "n/a"})`;

  const forestOverlayTruth = overlaySeries(candlesTruth, t.base, t.a, t.z);
  const forestZTruth = zSeries(candlesTruth, t.z);

  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeCore(candlesWithLive, { zWin: 208 });
    forestOverlayLive = overlaySeries(candlesWithLive, l.base, l.a, l.z);
    forestZLive = zSeries(candlesWithLive, l.z);
  }

  const safeH = freezeNow ? Math.min(20, horizonBars) : horizonBars;
  const fwd = buildForwardWave({
    candlesTruth,
    baseArr: t.base,
    atrArr: t.a,
    zArr: t.z,
    horizonBars: safeH,
    tf
  });

  const nowTime = candlesTruth[lastIdxT]?.time ?? null;
  const nowPrice = candlesTruth[lastIdxT]?.close ?? null;

  const nowPoint = {
    time: isNum(nowTime) ? nowTime : null,
    price: isNum(nowPrice) ? nowPrice : null,
    overlay: forestOverlayTruth.length ? forestOverlayTruth[forestOverlayTruth.length - 1].value : null,
    z: isNum(zNow) ? zNow : null,
    regimeNow: reg,
    confidence,
    weeklyReg
  };

  return {
    regimeLabel,
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