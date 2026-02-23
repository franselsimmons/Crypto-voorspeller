// api/_lib/forestEngine.js
// Forest v2 (betrouwbaarder voor “blind volgen”):
// ✅ Truth = alleen gesloten weekly candles (geen repaint)
// ✅ Percentiel-drempels (adaptief)
// ✅ Regime-lock (hysterese) + extreme fast-switch
// ✅ Volatility freeze blokkeert switches
// ✅ Structuur-gate met confirmed fractals (pivot high/low)
// ✅ Overlay op prijs + z-paneel + 4w forward “hint”

import { ema, std, atr, percentileFromWindow, clamp } from "./indicators.js";

const WEEK_SEC = 7 * 24 * 60 * 60;

function computeForestZ(candles, { emaLen = 50, zWin = 208 } = {}) {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const emaArr = ema(closes, emaLen);
  const resid = closes.map((c, i) => (emaArr[i] == null ? null : c - emaArr[i]));
  const sdArr = std(resid, zWin);
  const atrArr = atr(highs, lows, closes, 14);

  const z = resid.map((r, i) => {
    const sd = sdArr[i];
    if (r == null || sd == null || sd === 0) return null;
    return r / sd;
  });

  return { closes, emaArr, atrArr, z };
}

function computeBandsAndFreeze(zArr, atrArr, i, lookback = 208) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);

  // extreme “fast switch” drempels (zeldzaam)
  const p20Z = percentileFromWindow(zWin, 20);
  const p80Z = percentileFromWindow(zWin, 80);

  // freeze = ATR onder P20 -> blokkeer regimewissels
  const p20ATR = percentileFromWindow(atrWin, 20);
  const atrNow = atrArr[i];
  const freeze = p20ATR != null && atrNow != null ? atrNow < p20ATR : false;

  return {
    bandsNow: { p35, p65, p20Z, p80Z, p20ATR },
    freezeNow: freeze
  };
}

function strengthLabel(zNow) {
  if (zNow == null) return "";
  const a = Math.abs(zNow);
  if (a >= 2.2) return "EXTREME ";
  if (a >= 1.5) return "STRONG ";
  return "";
}

// ----------------- STRUCTURE (confirmed fractals) -----------------
// Confirmed pivot high/low: left/right = 3
// Pivot is “confirmed” pas na right bars. Dus: bij week i mogen we alleen pivots gebruiken t/m i-right.
function findConfirmedPivots(candles, left = 3, right = 3) {
  const pivots = []; // { idx, time, type, price }
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) pivots.push({ idx: i, time: c.time, type: "high", price: c.high });
    if (isLow) pivots.push({ idx: i, time: c.time, type: "low", price: c.low });
  }
  return pivots;
}

function lastConfirmedPivotBefore(pivots, maxIdx, type) {
  // pak laatste pivot van type met idx <= maxIdx
  for (let k = pivots.length - 1; k >= 0; k--) {
    const p = pivots[k];
    if (p.type === type && p.idx <= maxIdx) return p;
  }
  return null;
}

// ----------------- REGIME STATE MACHINE -----------------
function buildRegimeSeries({
  candlesTruth,
  zArr,
  bandsPerIndex,
  freezePerIndex,
  structurePerIndex
}) {
  // Regime wisselt alleen bij bevestiging:
  // - Normaal: 2 weken boven/below p65/p35
  // - Extreem: 1 week boven p80Z / onder p20Z (fast switch)
  // - Freeze = nooit wisselen
  // - Structure gate = wissel alleen als structuur “ok” is (bull: boven last pivot high, bear: onder last pivot low)

  let regime = "NEUTRAL";
  let bullConfirm = 0;
  let bearConfirm = 0;

  const series = [];

  for (let i = 0; i < candlesTruth.length; i++) {
    const z = zArr[i];
    const bands = bandsPerIndex[i] || {};
    const freeze = !!freezePerIndex[i];
    const struct = structurePerIndex[i] || { bullOk: true, bearOk: true };

    const p35 = bands.p35;
    const p65 = bands.p65;
    const p20Z = bands.p20Z;
    const p80Z = bands.p80Z;

    // default: reset confirms als we geen data hebben
    if (z == null || p35 == null || p65 == null) {
      bullConfirm = 0;
      bearConfirm = 0;
      series.push({ time: candlesTruth[i].time, regime });
      continue;
    }

    // Freeze = regime blijft staan, maar we resetten bevestigingen (anders “springt” hij na freeze)
    if (freeze) {
      bullConfirm = 0;
      bearConfirm = 0;
      series.push({ time: candlesTruth[i].time, regime });
      continue;
    }

    // Fast extreme triggers (1 week)
    const extremeBull = p80Z != null && z > p80Z;
    const extremeBear = p20Z != null && z < p20Z;

    // Normal triggers (2 weken)
    const normalBull = z > p65;
    const normalBear = z < p35;

    // structure gates
    const bullAllowed = !!struct.bullOk;
    const bearAllowed = !!struct.bearOk;

    // update confirms
    bullConfirm = normalBull ? bullConfirm + 1 : 0;
    bearConfirm = normalBear ? bearConfirm + 1 : 0;

    // decide switch
    const canSwitchBull =
      bullAllowed && (extremeBull || bullConfirm >= 2);

    const canSwitchBear =
      bearAllowed && (extremeBear || bearConfirm >= 2);

    // als beide tegelijk waar zouden zijn (zeldzaam), doen we niets (veilig)
    if (canSwitchBull && !canSwitchBear) regime = "BULL";
    if (canSwitchBear && !canSwitchBull) regime = "BEAR";

    series.push({ time: candlesTruth[i].time, regime });
  }

  return series;
}

// ----------------- SERIES BUILDERS -----------------
function buildOverlayPoints(candles, emaArr, atrArr, zArr, { zCap = 2.5 } = {}) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const base = emaArr[i];
    const a = atrArr[i];
    const z = zArr[i];
    if (base == null || a == null || z == null) continue;
    out.push({
      time: candles[i].time,
      value: base + clamp(z, -zCap, zCap) * a
    });
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

function buildForwardFromTruth(truthCandles, truthEma, truthAtr, truthZ, weeksForward = 4) {
  const n = truthCandles.length;
  if (n < 10) return [];

  const lastIdx = n - 1;
  const lastTime = truthCandles[lastIdx].time;
  const lastZ = truthZ[lastIdx];
  const lastEma = truthEma[lastIdx];
  const lastAtr = truthAtr[lastIdx];

  if (lastZ == null || lastEma == null || lastAtr == null) return [];

  // slope op laatste 3 geldige Z punten
  const lastZs = [];
  for (let i = lastIdx; i >= 0 && lastZs.length < 3; i--) {
    if (truthZ[i] != null) lastZs.push(truthZ[i]);
  }
  if (lastZs.length < 3) return [];

  const slope = (lastZs[0] - lastZs[2]) / 2;
  const slopeCapped = clamp(slope, -0.6, 0.6);

  const damp = 1 - Math.min(Math.abs(lastZ) / 3, 1);
  const step = slopeCapped * (0.35 + 0.65 * damp);

  const out = [];
  const startOverlay = lastEma + clamp(lastZ, -2.5, 2.5) * lastAtr;
  out.push({ time: lastTime, value: startOverlay });

  for (let k = 1; k <= weeksForward; k++) {
    const zF = clamp(lastZ + step * k, -2.5, 2.5);
    const overlay = lastEma + zF * lastAtr;
    out.push({ time: lastTime + WEEK_SEC * k, value: overlay });
  }
  return out;
}

// ----------------- MAIN EXPORT -----------------
export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive }) {
  // ---------- TRUTH ----------
  const t = computeForestZ(candlesTruth);
  const n = candlesTruth.length;

  // per-index bands/freeze + structure gates
  const bandsPerIndex = Array(n).fill(null);
  const freezePerIndex = Array(n).fill(false);
  const structurePerIndex = Array(n).fill(null);

  // pivots (confirmed) op truth candles
  const left = 3, right = 3;
  const pivots = findConfirmedPivots(candlesTruth, left, right);

  for (let i = 0; i < n; i++) {
    const { bandsNow, freezeNow } = computeBandsAndFreeze(t.z, t.atrArr, i, 208);
    bandsPerIndex[i] = bandsNow;
    freezePerIndex[i] = freezeNow;

    // structure: gebruik alleen pivots t/m i-right (confirmed)
    const maxPivotIdx = i - right;
    const lastHigh = lastConfirmedPivotBefore(pivots, maxPivotIdx, "high");
    const lastLow = lastConfirmedPivotBefore(pivots, maxPivotIdx, "low");

    const closeNow = t.closes[i];

    const bullOk = lastHigh ? closeNow > lastHigh.price : true; // als nog geen pivot: niet blokkeren
    const bearOk = lastLow ? closeNow < lastLow.price : true;

    structurePerIndex[i] = {
      bullOk,
      bearOk,
      lastPivotHigh: lastHigh ? { time: lastHigh.time, price: lastHigh.price } : null,
      lastPivotLow: lastLow ? { time: lastLow.time, price: lastLow.price } : null
    };
  }

  const regimeSeries = buildRegimeSeries({
    candlesTruth,
    zArr: t.z,
    bandsPerIndex,
    freezePerIndex,
    structurePerIndex
  });

  const lastIdxT = n - 1;
  const zNow = lastIdxT >= 0 ? t.z[lastIdxT] : null;
  const regNow = lastIdxT >= 0 ? regimeSeries[lastIdxT].regime : "NEUTRAL";
  const label = `${strengthLabel(zNow)}${regNow} (${zNow != null ? zNow.toFixed(2) : "n/a"})`;

  const forestOverlayTruth = buildOverlayPoints(candlesTruth, t.emaArr, t.atrArr, t.z);
  const forestZTruth = buildZSeries(candlesTruth, t.z);
  const forestOverlayForward = buildForwardFromTruth(candlesTruth, t.emaArr, t.atrArr, t.z, 4);

  // ---------- LIVE (optioneel) ----------
  let forestOverlayLive = [];
  let forestZLive = [];

  if (hasLive && candlesWithLive?.length) {
    const l = computeForestZ(candlesWithLive);
    forestOverlayLive = buildOverlayPoints(candlesWithLive, l.emaArr, l.atrArr, l.z);
    forestZLive = buildZSeries(candlesWithLive, l.z);
  }

  // debug “onder motorkap”
  const bandsNow = lastIdxT >= 0 ? bandsPerIndex[lastIdxT] : {};
  const freezeNow = lastIdxT >= 0 ? freezePerIndex[lastIdxT] : false;
  const structureNow = lastIdxT >= 0 ? structurePerIndex[lastIdxT] : null;

  return {
    regimeLabel: label,

    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,

    forestZTruth,
    forestZLive,

    bandsNow,
    freezeNow,
    structureNow,
    regimeNow: regNow
  };
}