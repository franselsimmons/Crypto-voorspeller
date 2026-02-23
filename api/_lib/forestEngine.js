import { ema, std, atr, percentileFromWindow, clamp } from "./indicators.js";

function pickParams(tf) {
  if (tf === "1d") {
    return { emaLen: 200, zWin: 730, lookbackBands: 730, atrLen: 14 };
  }
  return { emaLen: 50, zWin: 208, lookbackBands: 208, atrLen: 14 };
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

  return { bandsNow: { p35, p65, p20Z, p80Z, p20ATR }, freezeNow: freeze };
}

function strengthLabel(zNow) {
  if (zNow == null) return "";
  const a = Math.abs(zNow);
  if (a >= 2.2) return "EXTREME ";
  if (a >= 1.5) return "STRONG ";
  return "";
}

function buildOverlayPoints(candles, emaArr, atrArr, zArr, { zCap = 2.5 } = {}) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const base = emaArr[i];
    const a = atrArr[i];
    const z = zArr[i];
    if (base == null || a == null || z == null) continue;
    out.push({ time: candles[i].time, value: base + clamp(z, -zCap, zCap) * a });
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

/**
 * Altijd een richting kiezen:
 * - UP / DOWN / NEUTRAL (maar als NEUTRAL, dan kiezen we alsnog UP of DOWN als "grootste kans")
 * Confidence: high / medium / low
 *
 * Idee in Jip-en-Janneke taal:
 * - Kijk waar de z-score nu staat t.o.v. je bandjes (p35/p65) en hoe hard hij beweegt (slope).
 * - Als hij duidelijk boven p65 zit: UP (hoog vertrouwen)
 * - duidelijk onder p35: DOWN (hoog vertrouwen)
 * - anders: kijk naar de slope: stijgt = UP, daalt = DOWN (laag vertrouwen)
 */
function decideDirection({ zNow, slope, bandsNow, freezeNow }) {
  const { p35, p65 } = bandsNow || {};
  if (zNow == null || p35 == null || p65 == null) {
    return { direction: "NEUTRAL", confidence: "low", reason: "not_enough_data" };
  }

  if (freezeNow) {
    // in freeze is markt vaak “stil”: we kiezen wel een kant, maar confidence blijft laag
    const dir = (slope >= 0) ? "UP" : "DOWN";
    return { direction: dir, confidence: "low", reason: "freeze_low_vol" };
  }

  if (zNow > p65) return { direction: "UP", confidence: "high", reason: "z_above_p65" };
  if (zNow < p35) return { direction: "DOWN", confidence: "high", reason: "z_below_p35" };

  // middengebied: we kiezen de kant van de slope
  const absSlope = Math.abs(slope || 0);
  const conf = absSlope > 0.08 ? "medium" : "low";
  const dir = (slope >= 0) ? "UP" : "DOWN";
  return { direction: dir, confidence: conf, reason: "neutral_slope_vote" };
}

function buildForwardFanFromTruth({ truthCandles, emaArr, atrArr, zArr, tf, horizonBars, decision }) {
  const n = truthCandles.length;
  if (n < 20) return { mid: [], upper: [], lower: [] };

  const lastIdx = n - 1;
  const lastTime = truthCandles[lastIdx].time;
  const lastZ = zArr[lastIdx];
  const lastEma = emaArr[lastIdx];
  const lastAtr = atrArr[lastIdx];
  if (lastZ == null || lastEma == null || lastAtr == null) return { mid: [], upper: [], lower: [] };

  const zs = lastValid(zArr, lastIdx, 5);
  if (zs.length < 5) return { mid: [], upper: [], lower: [] };

  const slopeRaw = (zs[0] - zs[4]) / 4;

  const zCap = 2.5;
  const dt = intervalSecFromTf(tf);

  // 🔒 Cruciaal: bij lage confidence -> bijna vlak (geen nep-voorspelling)
  const slopeCap = (tf === "1d") ? 0.18 : 0.60;
  const baseStep = clamp(slopeRaw, -slopeCap, slopeCap);

  let confidenceFactor = 0.15; // low
  if (decision.confidence === "medium") confidenceFactor = 0.35;
  if (decision.confidence === "high") confidenceFactor = 0.70;

  // En als direction DOWN maar step positief (of omgekeerd), duwen we hem zachtjes richting gekozen kant
  const dirSign = decision.direction === "DOWN" ? -1 : 1;
  const step = (Math.sign(baseStep) === dirSign ? baseStep : Math.abs(baseStep) * dirSign) * confidenceFactor;

  const mid = [];
  const upper = [];
  const lower = [];

  // start
  const z0 = clamp(lastZ, -zCap, zCap);
  const y0 = lastEma + z0 * lastAtr;
  mid.push({ time: lastTime, value: y0 });

  // fan width groeit met sqrt(k), maar bij low confidence groeit hij sneller (eerlijk!)
  const fanBase = (tf === "1d") ? 0.9 : 1.2;
  const uncertaintyBoost = decision.confidence === "high" ? 1.0 : (decision.confidence === "medium" ? 1.25 : 1.6);

  for (let k = 1; k <= horizonBars; k++) {
    const zF = clamp(lastZ + step * k, -zCap, zCap);
    const y = lastEma + zF * lastAtr;
    const t = lastTime + dt * k;

    const width = (lastAtr * fanBase) * Math.sqrt(k) * uncertaintyBoost;

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

  const zNow = t.z[lastIdxT];

  const zs = lastValid(t.z, lastIdxT, 3);
  const slope = (zs.length >= 3) ? (zs[0] - zs[2]) / 2 : 0;

  const decision = decideDirection({ zNow, slope, bandsNow, freezeNow });

  const label = `${strengthLabel(zNow)}${decision.direction} (${zNow != null ? zNow.toFixed(2) : "n/a"}) • ${decision.confidence}`;

  const forestOverlayTruth = buildOverlayPoints(candlesTruth, t.emaArr, t.atrArr, t.z);
  const forestZTruth = buildZSeries(candlesTruth, t.z);

  // LIVE
  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeForestZ(candlesWithLive, p);
    forestOverlayLive = buildOverlayPoints(candlesWithLive, l.emaArr, l.atrArr, l.z);
    forestZLive = buildZSeries(candlesWithLive, l.z);
  }

  // FORWARD always
  const fan = buildForwardFanFromTruth({
    truthCandles: candlesTruth,
    emaArr: t.emaArr,
    atrArr: t.atrArr,
    zArr: t.z,
    tf,
    horizonBars,
    decision
  });

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
    freezeNow,

    // extra info voor UI
    directionNow: decision.direction,
    confidenceNow: decision.confidence,
    reasonNow: decision.reason
  };
}