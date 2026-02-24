// api/_lib/forestEngine.js
import {
  kama, std, mad, atr, sma, obv, adx,
  lastSwingLevels,
  percentileFromWindow, clamp
} from "./indicators.js";

function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function safeNum(x, fallback = null) {
  return isNum(x) ? x : fallback;
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

  // ✅ STD + MAD (robust)
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

  // ✅ “beste” z: robust waar mogelijk, anders std
  const z = zStd.map((_, i) => (isNum(zRobust[i]) ? zRobust[i] : zStd[i]));

  const volSma = sma(vols, 20);
  const relVol = vols.map((v, i) =>
    (isNum(volSma[i]) && volSma[i] !== 0) ? (v / volSma[i]) : null
  );

  const obvArr = obv(closes, vols);
  const adxArr = adx(highs, lows, closes, adxLen);

  return { closes, highs, lows, vols, base, a, resid, sd, rmad, zStd, zRobust, z, relVol, obvArr, adxArr };
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

function scoreConfidence({
  zNow, adxNow, relVolNow, obvSlope,
  aligned, structureOK, freezeNow,
  fundingBiasScore, liqMagnetScore
}) {
  let s = 0;

  // z kracht
  if (isNum(zNow)) {
    const az = Math.abs(zNow);
    if (az >= 2.2) s += 3;
    else if (az >= 1.5) s += 2;
    else if (az >= 0.9) s += 1;
  }

  // ADX trendkracht
  if (isNum(adxNow)) {
    if (adxNow >= 30) s += 2;
    else if (adxNow >= 20) s += 1;
  }

  // Volume confirm
  if (isNum(relVolNow)) {
    if (relVolNow >= 1.2) s += 2;
    else if (relVolNow >= 1.0) s += 1;
  }

  // OBV slope
  if (isNum(obvSlope)) {
    if (Math.abs(obvSlope) > 0) s += 1;
  }

  // Weekly alignment
  if (aligned) s += 2;
  else s -= 2;

  // Structuurfilter
  if (structureOK) s += 2;
  else s -= 2;

  // Freeze penalty
  if (freezeNow) s -= 2;

  // Funding + Liq extra signal
  if (isNum(fundingBiasScore)) s += clamp(fundingBiasScore, -2, 2);
  if (isNum(liqMagnetScore)) s += clamp(liqMagnetScore, -2, 2);

  if (s >= 8) return "high";
  if (s >= 4) return "mid";
  return "low";
}

function computeRegimeStability({ zNow, bandsNow, adxNow, aligned, structureOK, freezeNow }) {
  if (!isNum(zNow)) return 0;
  let score = 0;

  // afstand tot midden van p35/p65
  const { p35, p65 } = bandsNow || {};
  if (isNum(p35) && isNum(p65)) {
    const mid = (p35 + p65) / 2;
    const dist = Math.abs(zNow - mid);
    score += clamp(dist * 25, 0, 25);
  }

  // ADX trendkracht
  if (isNum(adxNow)) score += clamp((adxNow - 15) * 2, 0, 20);

  // structuur
  if (structureOK) score += 20;

  // weekly alignment
  if (aligned) score += 15;

  // niet frozen
  if (!freezeNow) score += 10;

  return Math.round(clamp(score, 0, 100));
}

// ✅ Regime flip probability: kans dat “label” snel flippt
function computeRegimeFlipProbability({
  stabilityScore,
  zNow,
  bandsNow,
  adxNow,
  structureOK,
  aligned,
  fundingAgainst,
  liqPullAgainst
}) {
  let p = 0;

  // basis: lage stability => hogere kans op flip
  p += clamp(1 - (stabilityScore / 100), 0, 1) * 0.55;

  // dichtbij flip-zone (p35/p65) => hogere kans
  const { p35, p65 } = bandsNow || {};
  if (isNum(zNow) && isNum(p35) && isNum(p65)) {
    const distToEdge = Math.min(Math.abs(zNow - p35), Math.abs(zNow - p65));
    // dist klein => p omhoog
    const edgeBoost = clamp(1 - clamp(distToEdge / 0.45, 0, 1), 0, 1);
    p += edgeBoost * 0.25;
  }

  // lage ADX => range => flip vaker
  if (isNum(adxNow) && adxNow < 20) p += 0.12;

  // structuur niet ok => flip waarschijnlijk
  if (!structureOK) p += 0.12;

  // weekly misalignment => flip kans
  if (!aligned) p += 0.08;

  // funding staat “tegen” => flip kans
  if (fundingAgainst) p += 0.08;

  // liq pull staat “tegen” => flip kans
  if (liqPullAgainst) p += 0.08;

  return clamp(p, 0, 0.95);
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

// deterministic PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// fat-tail sample
function sampleFat(rng) {
  const u = rng();
  const n = (rng() + rng() + rng() + rng() - 2); // approx normal
  if (u < 0.9) return n * 0.6;
  return n * 2.2;
}

function quantile(sortedArr, q) {
  if (!sortedArr.length) return null;
  const idx = clamp(Math.floor(q * (sortedArr.length - 1)), 0, sortedArr.length - 1);
  return sortedArr[idx];
}

// ------------------------------
// ✅ Liquidation heatmap integratie (magnet/pull)
// input liqLevels: [{ price: 65000, strength: 0.8, side: "short"|"long" }, ...]
// - short liq boven price => “magnet omhoog” (short squeeze target)
// - long liq onder price  => “magnet omlaag” (long flush target)
// ------------------------------
function computeLiqMagnet({ priceNow, atrNow, liqLevels = [] }) {
  if (!isNum(priceNow) || !isNum(atrNow) || !Array.isArray(liqLevels) || !liqLevels.length) {
    return {
      liqPull: 0,
      liqMagnetScore: 0,
      nearestAbove: null,
      nearestBelow: null,
      pullAgainst: false
    };
  }

  const levels = liqLevels
    .map(x => ({
      price: Number(x?.price),
      strength: Number(x?.strength ?? 0.5),
      side: String(x?.side ?? "unknown").toLowerCase()
    }))
    .filter(x => isNum(x.price) && isNum(x.strength) && x.strength > 0);

  if (!levels.length) {
    return { liqPull: 0, liqMagnetScore: 0, nearestAbove: null, nearestBelow: null, pullAgainst: false };
  }

  // zoek dichtste cluster boven/onder
  let above = null;
  let below = null;
  for (const lv of levels) {
    if (lv.price >= priceNow) {
      if (!above || (lv.price < above.price)) above = lv;
    } else {
      if (!below || (lv.price > below.price)) below = lv;
    }
  }

  // pull sterkte: dichtbij = sterker, strength weegt mee
  function pullTo(lv, dir) {
    if (!lv) return 0;
    const dist = Math.abs(lv.price - priceNow);
    const distAtr = dist / Math.max(1, atrNow);
    const near = clamp(1 - distAtr / 6, 0, 1); // binnen ~6 ATR = relevant
    // “side” bepaalt agressie
    // short-liq boven: trekt omhoog
    // long-liq onder: trekt omlaag
    const side = lv.side;
    let sideMult = 1.0;
    if (side === "short" && dir > 0) sideMult = 1.25;
    if (side === "long" && dir < 0) sideMult = 1.25;

    return dir * lv.strength * near * sideMult;
  }

  const pullUp = pullTo(above, +1);
  const pullDn = pullTo(below, -1);

  const liqPull = clamp(pullUp + pullDn, -1.2, 1.2); // signed
  const liqMagnetScore = clamp(Math.abs(liqPull) * 2, 0, 2);

  return {
    liqPull,
    liqMagnetScore,
    nearestAbove: above ? { price: above.price, strength: above.strength, side: above.side } : null,
    nearestBelow: below ? { price: below.price, strength: below.strength, side: below.side } : null,
    pullAgainst: false // wordt later ingevuld t.o.v. regime
  };
}

// ------------------------------
// ✅ Funding flip bias
// fundingNow: bv 0.0001 (0.01%) per 8h of per dag, maakt niet uit: we gebruiken thresholds.
// Positief funding => longs betalen => bearish bias
// Negatief funding => shorts betalen => bullish bias
// ------------------------------
function computeFundingBias({ fundingNow }) {
  const f = safeNum(fundingNow, null);
  if (!isNum(f)) {
    return { fundingBias: 0, fundingBiasScore: 0, fundingAgainst: false };
  }

  // thresholds (simpel en stabiel)
  // 0.01% = 0.0001
  const mild = 0.00007;
  const hot  = 0.00020;

  let bias = 0;
  let score = 0;

  if (f >= hot) { bias = -0.0014; score = 2; }
  else if (f >= mild) { bias = -0.0007; score = 1; }
  else if (f <= -hot) { bias = +0.0014; score = 2; }
  else if (f <= -mild) { bias = +0.0007; score = 1; }

  return { fundingBias: bias, fundingBiasScore: score, fundingAgainst: false };
}

// ✅ Forward: scenario fan (p10 / p50 / p90) met asymmetry
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
  asymmetry = true
}) {
  const n = candlesTruth.length;
  if (n < 100) return { mid: [], upper: [], lower: [] };

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

  // base slope (drift)
  let slope = 0;
  let cnt = 0;
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

  // regime drift bias (klein)
  const regimeBias =
    regimeNow === "BULL" ? +0.0006 :
    regimeNow === "BEAR" ? -0.0006 :
    0;

  // volatility scale: ATR / prijs
  let volPct = clamp((atrNow / Math.max(1, baseNow)), 0.002, 0.12);

  // ✅ Scenario asymmetry: BEAR beweegt sneller
  // - in BEAR: meer downside vol + grotere negatieve shocks
  // - in BULL: iets minder asym (bear is “sneller” in realiteit)
  const bearFast = (regimeNow === "BEAR");
  if (bearFast) volPct = clamp(volPct * 1.15, 0.002, 0.18);

  // stability => strakkere fan
  const tight = clamp(stabilityScore / 100, 0.2, 1.0);
  const fanScale = clamp(1.25 - 0.55 * tight, 0.6, 1.25);

  const paths = (horizonBars <= 60) ? 220 : 140;

  // seed: deterministisch
  const seed = (lastTime ^ (tf === "1w" ? 1337 : 7331)) >>> 0;

  const mid = [];
  const upper = [];
  const lower = [];

  for (let k = 0; k <= horizonBars; k++) {
    const t = lastTime + stepSec * k;
    if (!isNum(t)) continue;

    const baseF = baseNow + baseSlopePerBar * k;

    const returns = [];
    for (let p = 0; p < paths; p++) {
      const rng = mulberry32(seed + p * 9973 + k * 7919);

      // uncertainty groeit met sqrt(k)
      const stepVol = volPct * Math.sqrt(Math.max(1, k)) * fanScale;

      // fat-tail shock
      let shock = sampleFat(rng) * stepVol;

      // asymmetry: bear down moves sterker
      if (asymmetry) {
        if (bearFast) {
          if (shock < 0) shock *= 1.35;
          else shock *= 0.85;
        } else if (regimeNow === "BULL") {
          // bull asymmetry zachter (bear blijft sneller overall)
          if (shock > 0) shock *= 1.10;
          else shock *= 0.95;
        }
      }

      // drift: trend + regime + funding + liquidation pull
      const driftTrend = (baseSlopePerBar / Math.max(1, baseNow)) * k;
      const drift = driftTrend + (regimeBias * k) + ((fundingBias ?? 0) * k) + ((liqPull ?? 0) * 0.0009 * k);

      // combine
      let r = drift + shock;

      // clamp tegen absurde values
      r = clamp(r, -0.75, 0.75);

      // prijs scenario
      const price = baseF + r * baseNow;
      returns.push(price);
    }

    returns.sort((a, b) => a - b);

    const p10 = quantile(returns, 0.10);
    const p50 = quantile(returns, 0.50);
    const p90 = quantile(returns, 0.90);

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

  // ✅ nieuwe inputs
  fundingNow = null,
  liqLevels = null
}) {
  const t = computeCore(candlesTruth, { zWin: 208 });
  const lastIdxT = lastValidIndex(t.z);

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBands(t.z, t.a, lastIdxT, 208)
    : { bandsNow: {}, freezeNow: false };

  let reg = regimeFromZ(t.z[lastIdxT], bandsNow);

  // trend/range filter via ADX
  const adxNow = t.adxArr[lastIdxT];
  const trending = (isNum(adxNow) && adxNow >= 25);
  if (!trending && reg !== "NEUTRAL" && isNum(t.z[lastIdxT])) {
    if (Math.abs(t.z[lastIdxT]) < 1.2) reg = "NEUTRAL";
  }

  // volume/orderflow
  const relVolNow = t.relVol[lastIdxT];
  const obvNow = t.obvArr[lastIdxT];
  const obvPrev = t.obvArr[Math.max(0, lastIdxT - 5)];
  const obvSlope = (isNum(obvNow) && isNum(obvPrev)) ? (obvNow - obvPrev) : null;

  // ✅ structuurfilter (pivot/swing break)
  const { lastSwingHigh, lastSwingLow } = lastSwingLevels(t.highs, t.lows, 3, 3, 220);
  const closeNow = t.closes[lastIdxT];
  let structureOK = true;
  if (reg === "BULL" && isNum(lastSwingHigh) && isNum(closeNow)) structureOK = closeNow > lastSwingHigh;
  if (reg === "BEAR" && isNum(lastSwingLow) && isNum(closeNow)) structureOK = closeNow < lastSwingLow;

  // weekly alignment
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

  const zNow = t.z[lastIdxT];

  // ✅ liquidation magnet
  const liq = computeLiqMagnet({
    priceNow: closeNow,
    atrNow: t.a[lastIdxT],
    liqLevels: Array.isArray(liqLevels) ? liqLevels : []
  });

  // ✅ funding bias
  const fund = computeFundingBias({ fundingNow });

  // fundingAgainst / pullAgainst t.o.v. regime
  fund.fundingAgainst =
    (reg === "BULL" && isNum(fundingNow) && fundingNow > 0) ||
    (reg === "BEAR" && isNum(fundingNow) && fundingNow < 0);

  liq.pullAgainst =
    (reg === "BULL" && liq.liqPull < 0) ||
    (reg === "BEAR" && liq.liqPull > 0);

  const stabilityScore = computeRegimeStability({
    zNow,
    bandsNow,
    adxNow,
    aligned,
    structureOK,
    freezeNow
  });

  const regimeFlipProbability = computeRegimeFlipProbability({
    stabilityScore,
    zNow,
    bandsNow,
    adxNow,
    structureOK,
    aligned,
    fundingAgainst: fund.fundingAgainst,
    liqPullAgainst: liq.pullAgainst
  });

  const confidence = scoreConfidence({
    zNow,
    adxNow,
    relVolNow,
    obvSlope,
    aligned,
    structureOK,
    freezeNow,
    fundingBiasScore: fund.fundingBiasScore,
    liqMagnetScore: liq.liqMagnetScore
  });

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

  // forward: fan (freeze => horizon korter)
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
    fundingBias: fund.fundingBias,
    liqPull: liq.liqPull,
    asymmetry: true
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
    stabilityScore,
    regimeFlipProbability,

    weeklyReg,
    structureOK,
    aligned,

    lastSwingHigh: isNum(lastSwingHigh) ? lastSwingHigh : null,
    lastSwingLow: isNum(lastSwingLow) ? lastSwingLow : null,

    fundingNow: isNum(fundingNow) ? fundingNow : null,
    fundingBias: fund.fundingBias,
    fundingAgainst: fund.fundingAgainst,

    liqPull: liq.liqPull,
    nearestLiqAbove: liq.nearestAbove,
    nearestLiqBelow: liq.nearestBelow,
    liqPullAgainst: liq.pullAgainst
  };

  return {
    regimeLabel,
    regimeNow: reg,
    confidence,
    stabilityScore,
    regimeFlipProbability,

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