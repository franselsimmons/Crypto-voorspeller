// api/_lib/forestEngine.js
import {
  kama, std, mad, atr, sma, obv,
  adxDi,
  lastSwingLevels,
  percentileFromWindow, percentileRank, clamp
} from "./indicators.js";

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }

// ------------------------------
// Adaptive zWin: ATR-percentile => zWinUsed
// low vol => langer window (stabieler)
// high vol => korter window (sneller reageren)
// ------------------------------
function adaptiveZWinFromAtr(atrArr, idx) {
  const r = percentileRank(atrArr, idx, 520); // 0..1
  if (!isNum(r)) return 208;

  // 3 regimes (simpel maar werkt)
  if (r >= 0.80) return 120;  // heel volatiel
  if (r >= 0.55) return 160;  // normaal
  return 220;                 // rustig => langer
}

function computeCore(candles, {
  kamaEr = 10, kamaFast = 2, kamaSlow = 30,
  adxLen = 14,
  zWin = 208
} = {}) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const vols   = candles.map(c => (c.volume ?? 0));

  const base = kama(closes, kamaEr, kamaFast, kamaSlow);
  const resid = closes.map((c, i) => (base[i] == null ? null : (c - base[i])));

  const a = atr(highs, lows, closes, 14);

  const sd = std(resid, zWin);
  const rmad = mad(resid, zWin);

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

  // beste z: robust waar kan, anders std
  const z = zStd.map((_, i) => (isNum(zRobust[i]) ? zRobust[i] : zStd[i]));

  const volSma = sma(vols, 20);
  const relVol = vols.map((v, i) => (isNum(volSma[i]) && volSma[i] !== 0) ? (v / volSma[i]) : null);

  const obvArr = obv(closes, vols);

  const di = adxDi(highs, lows, closes, adxLen);
  const adxArr = di.adx;
  const diPlusArr = di.diPlus;
  const diMinusArr = di.diMinus;

  return {
    closes, highs, lows, vols,
    base, resid, a,
    z, relVol, obvArr,
    adxArr, diPlusArr, diMinusArr
  };
}

function computeBands(zArr, atrArr, i, lookback = 208) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);

  const p20ATR = percentileFromWindow(atrWin, 20);
  const atrNow = atrArr[i];

  const freeze = (isNum(p20ATR) && isNum(atrNow)) ? (atrNow < p20ATR) : false;
  return { bandsNow: { p35, p65, p20ATR }, freezeNow: freeze };
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

// --- Liquidation influence (nearest “magnet”) ---
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

  const pressure = clamp((best.weight * 1.25) * (1 / Math.max(1, (best.dist / Math.max(1, priceNow)) / 0.01)), 0, 1);
  const dir = (best.price > priceNow) ? +1 : -1;
  const pull = dir * pressure;

  return { nearest: { price: best.price, weight: best.weight }, pull, pressure };
}

// --- Confidence score ---
function scoreConfidence({
  zNow, adxNow, relVolNow, obvSlope, aligned, structureOK, freezeNow,
  diPlusNow, diMinusNow,
  oiChange1, etfNetFlow
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

  // DI direction sanity: DI- >> DI+ ondersteunt BEAR, andersom ondersteunt BULL
  if (isNum(diPlusNow) && isNum(diMinusNow)) {
    const diff = diPlusNow - diMinusNow;
    if (Math.abs(diff) > 10) s += 1;
  }

  if (isNum(relVolNow)) {
    if (relVolNow >= 1.2) s += 2;
    else if (relVolNow >= 1.0) s += 1;
  }

  if (isNum(obvSlope) && Math.abs(obvSlope) > 0) s += 1;

  if (aligned) s += 2; else s -= 2;
  if (structureOK) s += 2; else s -= 2;
  if (freezeNow) s -= 2;

  // extra: OI change (explosie in leverage) verhoogt kans op “move”, maar ook flip risk
  if (isNum(oiChange1) && Math.abs(oiChange1) > 0.03) s += 1;

  // extra: ETF flows aanwezig en sterk => meer “bias confidence”
  if (isNum(etfNetFlow) && Math.abs(etfNetFlow) > 200_000_000) s += 1;

  if (s >= 8) return "high";
  if (s >= 4) return "mid";
  return "low";
}

function sigmoid(x){ return 1 / (1 + Math.exp(-x)); }

// --- Regime flip probability (0..1) ---
function computeFlipProbability({
  regNow, zNow, bandsNow, adxNow, structureOK, aligned, freezeNow,
  fundingFlip, fundingPercentile, fundingExtreme,
  liqPressure,
  oiChange1,
  etfFlip
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

  const liq = clamp(liqPressure, 0, 1);

  // funding extremes => hogere flip-kans (crowded)
  const fundExtremeBoost =
    (fundingExtreme === "EXTREME_POS" || fundingExtreme === "EXTREME_NEG") ? 1 :
    (fundingExtreme === "HIGH_POS" || fundingExtreme === "HIGH_NEG") ? 0.6 :
    0;

  // OI spike => leverage => meer “snap”
  const oi = isNum(oiChange1) ? clamp(Math.abs(oiChange1) / 0.06, 0, 1) : 0;

  // ETF flip => macro-flow draait => flip-kans iets omhoog
  const etf = etfFlip ? 1 : 0;

  const fundFlip = fundingFlip ? 1 : 0;
  const fundRank = isNum(fundingPercentile) ? clamp(Math.abs(fundingPercentile - 0.5) * 2, 0, 1) : 0;

  let x =
    1.6 * distWeak +
    1.1 * adxWeak +
    0.8 * structBad +
    0.7 * alignBad +
    0.6 * freeze +
    0.6 * liq +
    0.7 * fundExtremeBoost +
    0.5 * fundFlip * (0.5 + 0.5 * fundRank) +
    0.6 * oi +
    0.4 * etf;

  if (regNow === "NEUTRAL") x += 0.6;

  const p = sigmoid((x - 2.0) * 1.3);
  return clamp(p, 0, 1);
}

// --- Funding squeeze probability (0..1) ---
// Idee: funding extreem + OI stijgt = crowding.
// Als regime BEAR en funding positief extreem => long squeeze kans.
// Als regime BULL en funding negatief extreem => short squeeze kans.
function computeFundingSqueezeProb({
  regNow,
  fundingExtreme,
  fundingRate,
  oiChange1
}) {
  const oi = isNum(oiChange1) ? clamp(Math.max(0, oiChange1) / 0.06, 0, 1) : 0;

  const extremePos = (fundingExtreme === "EXTREME_POS" || fundingExtreme === "HIGH_POS");
  const extremeNeg = (fundingExtreme === "EXTREME_NEG" || fundingExtreme === "HIGH_NEG");

  let base = 0;

  if (regNow === "BEAR" && extremePos) base = 0.55; // longs crowded, maar prijs zwak
  if (regNow === "BULL" && extremeNeg) base = 0.55; // shorts crowded, maar prijs sterk

  // funding magnitude
  const mag = isNum(fundingRate) ? clamp(Math.abs(fundingRate) / 0.0025, 0, 1) : 0;

  // leverage buildup (OI up) maakt squeeze waarschijnlijker
  const p = clamp(base + 0.25 * mag + 0.25 * oi, 0, 1);
  return p;
}

// --- Forward fan helpers ---
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
  const n = (rng() + rng() + rng() + rng() - 2);
  if (u < 0.9) return n * 0.6;
  return n * 2.3;
}

function quantile(sortedArr, q) {
  if (!sortedArr.length) return null;
  const idx = clamp(Math.floor(q * (sortedArr.length - 1)), 0, sortedArr.length - 1);
  return sortedArr[idx];
}

// Forward fan met asymmetry + funding/liq/etf bias
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
  etfBias
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

  // base slope (drift)
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

  const volPct = clamp((atrNow / Math.max(1, baseNow)), 0.002, 0.12);

  const tight = clamp(stabilityScore / 100, 0.2, 1.0);
  const fanScale = clamp(1.25 - 0.55 * tight, 0.6, 1.25);

  // ✅ Asymmetry: bear sneller
  const downMult = (regimeNow === "BEAR") ? 1.25 : 1.10;
  const upMult   = (regimeNow === "BULL") ? 0.95 : 1.05;

  const regimeBias =
    regimeNow === "BULL" ? +0.0007 :
    regimeNow === "BEAR" ? -0.0009 :
    0;

  // fundingBias en etfBias zijn al “klein”
  const bias =
    regimeBias +
    (isNum(fundingBias) ? fundingBias : 0) +
    (isNum(etfBias) ? etfBias : 0) +
    (isNum(liqPull) ? liqPull * 0.0006 : 0);

  const paths = (horizonBars <= 60) ? 220 : 140;
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

export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  tf = "1d",
  horizonBars = 90,
  weeklyTruthCandles = null,

  // extern (derivs)
  funding = null,
  liqLevels = [],
  oi = null,
  etf = null
}) {
  // -------- 1) Eerst core met “dummy zWin”, dan adapt zWinUsed op ATR --------
  const t0 = computeCore(candlesTruth, { zWin: 208 });
  const lastIdxBase = lastValidIndex(t0.base);
  const idx = lastIdxBase >= 0 ? lastIdxBase : lastValidIndex(t0.closes);

  // fallback
  const zWinUsed = idx >= 0 ? adaptiveZWinFromAtr(t0.a, idx) : 208;

  // recompute core met echte zWinUsed
  const t = computeCore(candlesTruth, { zWin: zWinUsed });
  const lastIdxT = lastValidIndex(t.z);

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBands(t.z, t.a, lastIdxT, zWinUsed)
    : { bandsNow: {}, freezeNow: false };

  // ✅ FIX: zNow direct hier, zodat je hem overal veilig kan gebruiken
  const zNow = lastIdxT >= 0 ? t.z[lastIdxT] : null;

  let reg = regimeFromZ(zNow, bandsNow);

  // trend/range filter via ADX
  const adxNow = t.adxArr[lastIdxT];
  const trending = (isNum(adxNow) && adxNow >= 25);
  if (!trending && reg !== "NEUTRAL" && isNum(zNow)) {
    if (Math.abs(zNow) < 1.2) reg = "NEUTRAL";
  }

  const diPlusNow = t.diPlusArr[lastIdxT];
  const diMinusNow = t.diMinusArr[lastIdxT];

  // volume/orderflow
  const relVolNow = t.relVol[lastIdxT];
  const obvNow = t.obvArr[lastIdxT];
  const obvPrev = t.obvArr[Math.max(0, lastIdxT - 5)];
  const obvSlope = (isNum(obvNow) && isNum(obvPrev)) ? (obvNow - obvPrev) : null;

  // structuurfilter (pivot/swing break)
  const { lastSwingHigh, lastSwingLow } = lastSwingLevels(t.highs, t.lows, 3, 3, 220);
  const closeNow = t.closes[lastIdxT];
  let structureOK = true;
  if (reg === "BULL" && isNum(lastSwingHigh) && isNum(closeNow)) structureOK = closeNow > lastSwingHigh;
  if (reg === "BEAR" && isNum(lastSwingLow) && isNum(closeNow)) structureOK = closeNow < lastSwingLow;

  // weekly alignment
  let aligned = true;
  let weeklyReg = null;
  if (tf === "1d" && Array.isArray(weeklyTruthCandles) && weeklyTruthCandles.length > 100) {
    const w0 = computeCore(weeklyTruthCandles, { zWin: 208 });
    const wIdxBase = lastValidIndex(w0.base);
    const wZWinUsed = wIdxBase >= 0 ? adaptiveZWinFromAtr(w0.a, wIdxBase) : 208;

    const w = computeCore(weeklyTruthCandles, { zWin: wZWinUsed });
    const wIdx = lastValidIndex(w.z);
    const wBands = computeBands(w.z, w.a, wIdx, wZWinUsed).bandsNow;

    const wZNow = w.z[wIdx];
    weeklyReg = regimeFromZ(wZNow, wBands);

    if (weeklyReg === "BULL" && reg === "BEAR") aligned = false;
    if (weeklyReg === "BEAR" && reg === "BULL") aligned = false;

    if (isNum(wZNow) && Math.abs(wZNow) >= 2.0) {
      if (weeklyReg !== "NEUTRAL") reg = weeklyReg;
    }
  }

  // -------- 2) Liq influence --------
  const priceNow = isNum(closeNow) ? closeNow : null;
  const liq = liqInfluence(priceNow, liqLevels);

  // -------- 3) Funding (percentile/extreme/flip/bias) + fallback --------
  let fundingRate = null;
  let fundingBias = 0;
  let fundingFlip = false;
  let fundingPercentile = null;
  let fundingExtreme = null;

  if (isNum(funding?.fundingRate)) {
    fundingRate = funding.fundingRate;
    fundingBias = isNum(funding?.fundingBias) ? funding.fundingBias : 0;
    fundingFlip = !!funding?.fundingFlip;
    fundingPercentile = isNum(funding?.fundingPercentile) ? funding.fundingPercentile : null;
    fundingExtreme = funding?.fundingExtreme ?? null;
  } else {
    // fallback: synthetic crowding
    if (isNum(zNow) && isNum(relVolNow)) {
      if (zNow > 1.2 && relVolNow > 1.1) {
        fundingBias = -0.0015; fundingFlip = true;
        fundingExtreme = "HIGH_POS";
      }
      if (zNow < -1.2 && relVolNow > 1.1) {
        fundingBias = +0.0015; fundingFlip = true;
        fundingExtreme = "HIGH_NEG";
      }
    }
  }

  // -------- 4) Open Interest change --------
  const oiNow = oi?.oiNow ?? null;
  const oiChange1 = oi?.oiChange1 ?? null;
  const oiChange7 = oi?.oiChange7 ?? null;

  // -------- 5) ETF flows --------
  const etfNetFlow = etf?.etfNetFlow ?? null;
  const etfFlow7 = etf?.etfFlow7 ?? null;
  const etfPercentile = etf?.etfPercentile ?? null;
  const etfFlip = !!etf?.etfFlip;
  const etfBias = etf?.etfBias ?? 0;

  // -------- 6) Scores --------
  const confidence = scoreConfidence({
    zNow, adxNow, relVolNow, obvSlope, aligned, structureOK, freezeNow,
    diPlusNow, diMinusNow,
    oiChange1,
    etfNetFlow
  });

  const stabilityScore = Math.round(clamp(
    (aligned ? 20 : 5) +
    (structureOK ? 25 : 5) +
    (freezeNow ? 0 : 10) +
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
    fundingFlip,
    fundingPercentile,
    fundingExtreme,
    liqPressure: liq.pressure,
    oiChange1,
    etfFlip
  });

  const squeezeProb = computeFundingSqueezeProb({
    regNow: reg,
    fundingExtreme,
    fundingRate,
    oiChange1
  });

  const regimeLabel = `${strengthLabel(zNow)}${reg} (${isNum(zNow) ? zNow.toFixed(2) : "n/a"})`;

  // -------- 7) Series --------
  const forestOverlayTruth = overlaySeries(candlesTruth, t.base, t.a, t.z);
  const forestZTruth = zSeries(candlesTruth, t.z);

  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l0 = computeCore(candlesWithLive, { zWin: 208 });
    const lIdxBase = lastValidIndex(l0.base);
    const lZWinUsed = lIdxBase >= 0 ? adaptiveZWinFromAtr(l0.a, lIdxBase) : zWinUsed;

    const l = computeCore(candlesWithLive, { zWin: lZWinUsed });
    forestOverlayLive = overlaySeries(candlesWithLive, l.base, l.a, l.z);
    forestZLive = zSeries(candlesWithLive, l.z);
  }

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
    etfBias
  });

  const nowTime = candlesTruth[lastIdxT]?.time ?? null;

  const nowPoint = {
    time: isNum(nowTime) ? nowTime : null,
    price: isNum(priceNow) ? priceNow : null,
    overlay: forestOverlayTruth.length ? forestOverlayTruth[forestOverlayTruth.length - 1].value : null,

    z: isNum(zNow) ? zNow : null,
    zWinUsed,

    regimeNow: reg,
    confidence,
    stabilityScore,
    flipProbability: flipProb,

    // ADX direction
    adxNow: isNum(adxNow) ? adxNow : null,
    diPlusNow: isNum(diPlusNow) ? diPlusNow : null,
    diMinusNow: isNum(diMinusNow) ? diMinusNow : null,

    weeklyReg,
    structureOK,
    aligned,

    lastSwingHigh: isNum(lastSwingHigh) ? lastSwingHigh : null,
    lastSwingLow: isNum(lastSwingLow) ? lastSwingLow : null,

    // funding
    fundingRate,
    fundingBias,
    fundingFlip,
    fundingPercentile,
    fundingExtreme,

    // liq heatmap
    liqNearest: liq.nearest,
    liqPressure: liq.pressure,

    // OI
    oiNow,
    oiChange1,
    oiChange7,

    // ETF
    etfNetFlow,
    etfFlow7,
    etfPercentile,
    etfFlip,

    // squeeze
    squeezeProb
  };

  return {
    regimeLabel,
    regimeNow: reg,
    confidence,
    stabilityScore,
    flipProbability: flipProb,
    squeezeProb,

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