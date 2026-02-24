// api/_lib/forestEngine.js
import {
  kama, std, mad, atr, sma, ema, obv, adx,
  lastSwingLevels,
  percentileFromWindow, clamp
} from "./indicators.js";

function isNum(x){ return typeof x === "number" && Number.isFinite(x); }

// ---------------------------
// Core calc (z + trend + vol)
// ---------------------------
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

  // STD + ROBUST (MAD)
  const sd = std(resid, zWin);
  const rmad = mad(resid, zWin);

  const a = atr(highs, lows, closes, 14);

  const zStd = resid.map((r, i) => {
    const s = sd[i];
    if (!isNum(r) || !isNum(s) || s === 0) return null;
    return r / s;
  });

  const zRobust = resid.map((r, i) => {
    const s = rmad[i];
    if (!isNum(r) || !isNum(s) || s === 0) return null;
    return r / s;
  });

  // beste z: robust als mogelijk, anders std
  const z = zStd.map((_, i) => (isNum(zRobust[i]) ? zRobust[i] : zStd[i]));

  const volSma = sma(vols, 20);
  const relVol = vols.map((v, i) => (isNum(volSma[i]) && volSma[i] !== 0) ? (v / volSma[i]) : null);

  const obvArr = obv(closes, vols);
  const adxArr = adx(highs, lows, closes, adxLen);

  return { closes, highs, lows, vols, base, a, z, relVol, obvArr, adxArr };
}

// ---------------------------
// Bands + freeze + shock mode
// ---------------------------
function computeBands(zArr, atrArr, i, lookback = 208) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);

  const p20ATR = percentileFromWindow(atrWin, 20);
  const p80ATR = percentileFromWindow(atrWin, 80);
  const p95ATR = percentileFromWindow(atrWin, 95);

  const atrNow = atrArr[i];

  const freeze = (isNum(p20ATR) && isNum(atrNow)) ? (atrNow < p20ATR) : false;

  // shock = ATR extreem hoog (nieuws / cascade)
  const shock =
    (isNum(p95ATR) && isNum(atrNow) && atrNow > p95ATR) ||
    (isNum(p80ATR) && isNum(atrNow) && atrNow > p80ATR * 1.35);

  return { bandsNow: { p35, p65, p20ATR, p80ATR, p95ATR }, freezeNow: freeze, shockNow: shock };
}

function regimeFromZ(zNow, bandsNow) {
  const { p35, p65 } = bandsNow || {};
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

function overlaySeries(candles, baseArr, atrArr, zArr, { zCap = 2.6 } = {}) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time;
    const base = baseArr[i];
    const a = atrArr[i];
    const z = zArr[i];
    if (!isNum(t) || !isNum(base) || !isNum(a) || !isNum(z)) continue;
    const v = base + clamp(z, -zCap, zCap) * a;
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

// ---------------------------
// Liquidation magnet (heatmap)
// ---------------------------
function liqInfluence(priceNow, liqLevels) {
  if (!isNum(priceNow) || !Array.isArray(liqLevels) || !liqLevels.length) {
    return { nearest: null, pull: 0, pressure: 0 };
  }
  let best = null;
  for (const lv of liqLevels) {
    const p = Number(lv?.price);
    const w = Number(lv?.weight);
    if (!isNum(p) || !isNum(w)) continue;
    const dist = Math.abs(p - priceNow);
    if (best == null || dist < best.dist) best = { price: p, weight: clamp(w, 0, 1), dist };
  }
  if (!best) return { nearest: null, pull: 0, pressure: 0 };

  // dichterbij + zwaarder = meer druk
  const pressure = clamp(
    (best.weight * 1.25) * (1 / Math.max(1, (best.dist / Math.max(1, priceNow)) / 0.01)),
    0, 1
  );

  const dir = (best.price > priceNow) ? +1 : -1;
  const pull = dir * pressure;

  return { nearest: { price: best.price, weight: best.weight }, pull, pressure };
}

// ---------------------------
// Confidence score
// ---------------------------
function scoreConfidence({
  zNow, adxNow, relVolNow, obvSlope,
  aligned, structureOK, freezeNow,
  shockNow, weekendNow
}) {
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

  if (isNum(obvSlope) && Math.abs(obvSlope) > 0) s += 1;

  if (aligned) s += 2; else s -= 2;
  if (structureOK) s += 2; else s -= 2;

  if (freezeNow) s -= 2;
  if (shockNow)  s -= 2;
  if (weekendNow) s -= 1;

  if (s >= 8) return "high";
  if (s >= 4) return "mid";
  return "low";
}

function sigmoid(x){ return 1 / (1 + Math.exp(-x)); }

// ---------------------------
// Regime flip probability
// ---------------------------
function computeFlipProbability({
  regNow, zNow, bandsNow, adxNow,
  structureOK, aligned, freezeNow,
  shockNow, weekendNow,
  fundingFlip, fundingRate,
  liqPressure
}) {
  const { p35, p65 } = bandsNow || {};
  if (!isNum(zNow) || !isNum(p35) || !isNum(p65)) return 0;

  const mid = (p35 + p65) / 2;
  const distToMid = Math.abs(zNow - mid);

  const adxWeak = isNum(adxNow) ? clamp((25 - adxNow) / 20, 0, 1) : 0.5;
  const distWeak = clamp(1 - (distToMid / 1.2), 0, 1);

  const structBad = structureOK ? 0 : 1;
  const alignBad = aligned ? 0 : 1;
  const freeze = freezeNow ? 1 : 0;
  const shock = shockNow ? 1 : 0;
  const weekend = weekendNow ? 1 : 0;

  const fundFlip = fundingFlip ? 1 : 0;
  const fundMag = isNum(fundingRate) ? clamp(Math.abs(fundingRate) / 0.002, 0, 1) : 0;

  const liq = clamp(liqPressure, 0, 1);

  let x =
    1.6 * distWeak +
    1.1 * adxWeak +
    0.8 * structBad +
    0.7 * alignBad +
    0.6 * freeze +
    0.7 * shock +
    0.4 * weekend +
    0.5 * fundFlip * (0.5 + 0.5 * fundMag) +
    0.6 * liq;

  if (regNow === "NEUTRAL") x += 0.6;

  const p = sigmoid((x - 2.0) * 1.3);
  return clamp(p, 0, 1);
}

// ---------------------------
// Forward fan (deterministic)
// ---------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function sampleFat(rng) {
  const u = rng();
  const n = (rng() + rng() + rng() + rng() - 2); // approx normal
  if (u < 0.9) return n * 0.6;
  return n * 2.3; // shock tails
}

function quantile(sortedArr, q) {
  if (!sortedArr.length) return null;
  const idx = clamp(Math.floor(q * (sortedArr.length - 1)), 0, sortedArr.length - 1);
  return sortedArr[idx];
}

function buildForwardFan({
  candlesTruth,
  baseArr,
  atrArr,
  zArr,
  horizonBars,
  tf,
  regimeNow,
  stabilityScore,
  fundingBias,
  liqPull,
  shockNow,
  weekendNow
}) {
  const n = candlesTruth.length;
  if (n < 100) return { mid: [], upper: [], lower: [] };

  const lastIdx = lastValidIndex(zArr);
  if (lastIdx < 0) return { mid: [], upper: [], lower: [] };

  const lastTime = candlesTruth[lastIdx].time;
  const baseNow = baseArr[lastIdx];
  const atrNow = atrArr[lastIdx];

  if (!isNum(lastTime) || !isNum(baseNow) || !isNum(atrNow)) {
    return { mid: [], upper: [], lower: [] };
  }

  const stepSec = (tf === "1w") ? (7 * 24 * 3600) : (24 * 3600);

  // base drift
  let slope = 0, cnt = 0;
  for (let k = 1; k <= 14; k++) {
    const i1 = lastIdx - k;
    const i2 = lastIdx - k - 1;
    if (i2 < 0) break;
    const b1 = baseArr[i1], b2 = baseArr[i2];
    if (!isNum(b1) || !isNum(b2)) continue;
    slope += (b1 - b2);
    cnt++;
  }
  const baseSlopePerBar = cnt ? (slope / cnt) : 0;

  // volatility scale
  const volPct = clamp((atrNow / Math.max(1, baseNow)), 0.002, 0.12);

  // stability -> fan tighter
  const tight = clamp(stabilityScore / 100, 0.2, 1.0);
  let fanScale = clamp(1.25 - 0.55 * tight, 0.6, 1.25);

  // shock/weekend = fan breder (want onzekerder)
  if (shockNow) fanScale = clamp(fanScale * 1.25, 0.6, 1.8);
  if (weekendNow) fanScale = clamp(fanScale * 1.15, 0.6, 1.8);

  // ✅ asymmetry (bear sneller)
  const downMult = (regimeNow === "BEAR") ? 1.25 : 1.10;
  const upMult   = (regimeNow === "BULL") ? 0.95 : 1.05;

  // regime bias + funding bias + liq pull bias
  const regimeBias =
    regimeNow === "BULL" ? +0.0007 :
    regimeNow === "BEAR" ? -0.0009 :
    0;

  const bias =
    regimeBias +
    (isNum(fundingBias) ? fundingBias : 0) +
    (isNum(liqPull) ? liqPull * 0.0006 : 0);

  const paths = (horizonBars <= 60) ? 220 : 140;

  // deterministic seed
  const seed = (lastTime ^ (tf === "1w" ? 1337 : 7331)) >>> 0;

  const mid = [], upper = [], lower = [];

  for (let k = 0; k <= horizonBars; k++) {
    const t = lastTime + stepSec * k;
    if (!isNum(t)) continue;

    const baseF = baseNow + baseSlopePerBar * k;

    const prices = [];
    for (let p = 0; p < paths; p++) {
      const rng = mulberry32(seed + p * 9973 + k * 7919);

      const stepVol = volPct * Math.sqrt(Math.max(1, k)) * fanScale;

      const shockRaw = sampleFat(rng) * stepVol;
      const shock = shockRaw < 0 ? shockRaw * downMult : shockRaw * upMult;

      const drift = (baseSlopePerBar / Math.max(1, baseNow)) * k + bias * k;

      let r = drift + shock;
      r = clamp(r, -0.75, 0.75);

      prices.push(baseF + r * baseNow);
    }

    prices.sort((a, b) => a - b);

    const p10 = quantile(prices, 0.10);
    const p50 = quantile(prices, 0.50);
    const p90 = quantile(prices, 0.90);

    if (isNum(p50)) mid.push({ time: t, value: p50 });
    if (isNum(p90)) upper.push({ time: t, value: p90 });
    if (isNum(p10)) lower.push({ time: t, value: p10 });
  }

  return { mid, upper, lower };
}

// ---------------------------
// MAIN
// ---------------------------
export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  tf = "1d",
  horizonBars = 90,
  weeklyTruthCandles = null,

  // optional external data
  funding = null,      // { fundingRate, fundingBias, fundingFlip }
  liqLevels = []       // [{ price, weight }]
}) {
  const t = computeCore(candlesTruth, { zWin: 208 });
  const lastIdxT = lastValidIndex(t.z);

  const { bandsNow, freezeNow, shockNow } = (lastIdxT >= 0)
    ? computeBands(t.z, t.a, lastIdxT, 208)
    : { bandsNow: {}, freezeNow: false, shockNow: false };

  // zNow MOET hier al bestaan (fix voor jouw error)
  const zNow = (lastIdxT >= 0) ? t.z[lastIdxT] : null;

  let reg = regimeFromZ(zNow, bandsNow);

  // weekend thin liquidity
  const nowTime = candlesTruth[lastIdxT]?.time ?? null;
  let weekendNow = false;
  if (isNum(nowTime)) {
    const d = new Date(nowTime * 1000);
    const day = d.getUTCDay(); // 0=zondag
    weekendNow = (day === 0 || day === 6);
  }

  // ADX trend/range
  const adxNow = t.adxArr[lastIdxT];
  const trending = (isNum(adxNow) && adxNow >= 25);
  if (!trending && reg !== "NEUTRAL" && isNum(zNow)) {
    if (Math.abs(zNow) < 1.2) reg = "NEUTRAL";
  }

  // OBV slope
  const relVolNow = t.relVol[lastIdxT];
  const obvNow = t.obvArr[lastIdxT];
  const obvPrev = t.obvArr[Math.max(0, lastIdxT - 5)];
  const obvSlope = (isNum(obvNow) && isNum(obvPrev)) ? (obvNow - obvPrev) : null;

  // structuurfilter (swing break)
  const { lastSwingHigh, lastSwingLow } = lastSwingLevels(t.highs, t.lows, 3, 3, 220);
  const closeNow = t.closes[lastIdxT];
  let structureOK = true;
  if (reg === "BULL" && isNum(lastSwingHigh) && isNum(closeNow)) structureOK = closeNow > lastSwingHigh;
  if (reg === "BEAR" && isNum(lastSwingLow) && isNum(closeNow)) structureOK = closeNow < lastSwingLow;

  // weekly alignment + EMA200 bias
  let aligned = true;
  let weeklyReg = null;
  let weeklyEma200 = null;
  let weeklyBias = null;

  if (tf === "1d" && Array.isArray(weeklyTruthCandles) && weeklyTruthCandles.length > 220) {
    const w = computeCore(weeklyTruthCandles, { zWin: 208 });
    const wIdx = lastValidIndex(w.z);

    const wBands = computeBands(w.z, w.a, wIdx, 208).bandsNow;
    weeklyReg = regimeFromZ(w.z[wIdx], wBands);

    // ema200 bias op weekly close
    const wCloses = weeklyTruthCandles.map(c => c.close);
    const wEma = ema(wCloses, 200);
    weeklyEma200 = wEma[wIdx];
    const wCloseNow = wCloses[wIdx];

    if (isNum(wCloseNow) && isNum(weeklyEma200)) {
      weeklyBias = (wCloseNow >= weeklyEma200) ? "BULL_BIAS" : "BEAR_BIAS";
    }

    if (weeklyReg === "BULL" && reg === "BEAR") aligned = false;
    if (weeklyReg === "BEAR" && reg === "BULL") aligned = false;

    // bias conflict maakt ook alignment slechter
    if (weeklyBias === "BULL_BIAS" && reg === "BEAR") aligned = false;
    if (weeklyBias === "BEAR_BIAS" && reg === "BULL") aligned = false;

    // weekly override alleen als die echt hard is
    const wZ = w.z[wIdx];
    if (isNum(wZ) && Math.abs(wZ) >= 2.0) {
      if (weeklyReg !== "NEUTRAL") reg = weeklyReg;
    }
  }

  // liquidation influence
  const priceNow = isNum(closeNow) ? closeNow : null;
  const liq = liqInfluence(priceNow, liqLevels);

  // funding (echt of synthetic)
  let fundingRate = null;
  let fundingBias = 0;
  let fundingFlip = false;

  // 1) echte funding als je het aanlevert
  if (isNum(funding?.fundingRate)) {
    fundingRate = funding.fundingRate;
    fundingBias = isNum(funding?.fundingBias) ? funding.fundingBias : 0;
    fundingFlip = !!funding?.fundingFlip;
  } else {
    // 2) synthetic crowding (als we geen funding feed hebben)
    if (isNum(zNow) && isNum(relVolNow)) {
      if (zNow > 1.2 && relVolNow > 1.1) { fundingBias = -0.0015; fundingFlip = true; } // long crowd -> contrarian
      if (zNow < -1.2 && relVolNow > 1.1) { fundingBias =  0.0015; fundingFlip = true; } // short crowd -> contrarian
    }
  }

  // confidence + stability
  const confidence = scoreConfidence({
    zNow, adxNow, relVolNow, obvSlope,
    aligned, structureOK, freezeNow,
    shockNow, weekendNow
  });

  const stabilityScore = Math.round(clamp(
    (aligned ? 22 : 6) +
    (structureOK ? 26 : 6) +
    (freezeNow ? 0 : 10) +
    (shockNow ? 0 : 10) +
    (weekendNow ? 5 : 10) +
    (isNum(adxNow) ? clamp((adxNow - 15) * 2, 0, 20) : 10) +
    (isNum(zNow) ? clamp(Math.abs(zNow) * 10, 0, 25) : 10),
    0, 100
  ));

  const flipProb = computeFlipProbability({
    regNow: reg,
    zNow,
    bandsNow,
    adxNow,
    structureOK,
    aligned,
    freezeNow,
    shockNow,
    weekendNow,
    fundingFlip,
    fundingRate,
    liqPressure: liq.pressure
  });

  // series
  const forestOverlayTruth = overlaySeries(candlesTruth, t.base, t.a, t.z);
  const forestZTruth = zSeries(candlesTruth, t.z);

  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeCore(candlesWithLive, { zWin: 208 });
    forestOverlayLive = overlaySeries(candlesWithLive, l.base, l.a, l.z);
    forestZLive = zSeries(candlesWithLive, l.z);
  }

  // horizon safety
  const safeH = freezeNow ? Math.min(20, horizonBars) : horizonBars;

  const fwd = buildForwardFan({
    candlesTruth,
    baseArr: t.base,
    atrArr: t.a,
    zArr: t.z,
    horizonBars: safeH,
    tf,
    regimeNow: reg,
    stabilityScore,
    fundingBias,
    liqPull: liq.pull,
    shockNow,
    weekendNow
  });

  const regimeLabel = `${strengthLabel(zNow)}${reg} (${isNum(zNow) ? zNow.toFixed(2) : "n/a"})`;

  const nowPoint = {
    time: isNum(nowTime) ? nowTime : null,
    price: isNum(priceNow) ? priceNow : null,
    overlay: forestOverlayTruth.length ? forestOverlayTruth[forestOverlayTruth.length - 1].value : null,
    z: isNum(zNow) ? zNow : null,

    regimeNow: reg,
    regimeLabel,
    confidence,
    stabilityScore,
    flipProbability: flipProb,

    weeklyReg,
    weeklyEma200: isNum(weeklyEma200) ? weeklyEma200 : null,
    weeklyBias,

    structureOK,
    aligned,

    freezeNow,
    shockNow,
    weekendNow,

    lastSwingHigh: isNum(lastSwingHigh) ? lastSwingHigh : null,
    lastSwingLow: isNum(lastSwingLow) ? lastSwingLow : null,

    fundingRate,
    fundingBias,
    fundingFlip,

    liqNearest: liq.nearest,
    liqPressure: liq.pressure
  };

  return {
    regimeLabel,
    regimeNow: reg,
    confidence,
    stabilityScore,
    flipProbability: flipProb,

    forestOverlayTruth,
    forestOverlayLive,

    forestOverlayForwardMid: fwd.mid,
    forestOverlayForwardUpper: fwd.upper,
    forestOverlayForwardLower: fwd.lower,

    forestZTruth,
    forestZLive,

    bandsNow,
    freezeNow,
    shockNow,
    weekendNow,

    nowPoint
  };
}