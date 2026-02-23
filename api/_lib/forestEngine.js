// api/_lib/forestEngine.js
import { ema, std, atr, percentileFromWindow, clamp } from "./indicators.js";

function computeForestZ(candles, { emaLen = 50, zWin = 208 } = {}) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const emaArr = ema(closes, emaLen);
  const resid  = closes.map((c, i) => (emaArr[i] == null ? null : (c - emaArr[i])));
  const sdArr  = std(resid, zWin);
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
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time;
    const base = emaArr[i];
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

function buildForwardFromTruth(truthCandles, truthEma, truthAtr, truthZ, weeksForward = 4) {
  const n = truthCandles.length;
  if (n < 10) return [];

  const lastIdx = n - 1;
  const lastTime = truthCandles[lastIdx].time;
  const lastZ = truthZ[lastIdx];
  const lastEma = truthEma[lastIdx];
  const lastAtr = truthAtr[lastIdx];

  if (lastZ == null || lastEma == null || lastAtr == null) return [];

  const lastZs = [];
  for (let i = lastIdx; i >= 0 && lastZs.length < 3; i--) {
    if (truthZ[i] != null) lastZs.push(truthZ[i]);
  }
  if (lastZs.length < 3) return [];

  const slope = (lastZs[0] - lastZs[2]) / 2;
  const slopeCap = 0.6;
  const slopeCapped = clamp(slope, -slopeCap, slopeCap);

  const damp = 1 - Math.min(Math.abs(lastZ) / 3, 1);
  const step = slopeCapped * (0.35 + 0.65 * damp);

  const weekSec = 7 * 24 * 60 * 60;
  const out = [];

  const startOverlay = lastEma + clamp(lastZ, -2.5, 2.5) * lastAtr;
  out.push({ time: lastTime, value: startOverlay });

  for (let k = 1; k <= weeksForward; k++) {
    const zF = clamp(lastZ + step * k, -2.5, 2.5);
    const overlay = lastEma + zF * lastAtr;
    out.push({ time: lastTime + weekSec * k, value: overlay });
  }

  return out;
}

function last(arr){ return (arr && arr.length) ? arr[arr.length - 1] : null; }

/**
 * Daily routeplanner:
 * - Anchor = laatste TRUTH weekly punt (tijd + waarde)
 * - Target = 1 week vooruit (weekly forward[1])
 * - We tekenen dagpunten tot target met “max stap” op basis van daily ATR14
 */
function buildDailyRouteToNextWeek({
  dailyCandlesTruth,
  anchorTime,
  anchorValue,
  targetTime,
  targetValue
}) {
  if (!dailyCandlesTruth?.length) return [];
  if (!anchorTime || anchorValue == null || !targetTime || targetValue == null) return [];
  if (targetTime <= anchorTime) return [];

  // Pak de laatste gesloten daily candle (truth)
  const dLast = last(dailyCandlesTruth);
  if (!dLast?.time) return [];

  // Als we al voorbij target zitten: niets
  if (dLast.time >= targetTime) return [];

  // Daily ATR voor “max stap per dag”
  const highs = dailyCandlesTruth.map(c => c.high);
  const lows  = dailyCandlesTruth.map(c => c.low);
  const closes= dailyCandlesTruth.map(c => c.close);
  const atrArr = atr(highs, lows, closes, 14);
  const atrNow = atrArr[atrArr.length - 1];
  const capPerDay = (atrNow != null) ? (atrNow * 0.85) : null; // simpele rem

  const daySec = 24 * 60 * 60;

  // Start op “vandaag” (laatste daily close tijd), met lineaire positie op de lijn
  const frac = (dLast.time - anchorTime) / (targetTime - anchorTime);
  const startValue = anchorValue + (targetValue - anchorValue) * clamp(frac, 0, 1);

  // Hoeveel dagen nog tot target?
  const daysLeft = Math.max(1, Math.round((targetTime - dLast.time) / daySec));

  const out = [];
  out.push({ time: dLast.time, value: startValue });

  let prev = startValue;
  for (let k = 1; k <= daysLeft; k++) {
    const t = dLast.time + daySec * k;
    const remaining = Math.max(1, daysLeft - (k - 1));
    const idealStep = (targetValue - prev) / remaining;

    let step = idealStep;
    if (capPerDay != null) step = clamp(step, -capPerDay, capPerDay);

    prev = prev + step;
    out.push({ time: t, value: prev });
  }

  // Forceer exact eindpunt (target)
  out[out.length - 1] = { time: targetTime, value: targetValue };

  return out;
}

export function buildForestOverlay({
  candlesTruth,
  candlesWithLive,
  hasLive,
  dailyCandlesTruth,
  dailyCandlesWithLive, // (nu niet nodig, maar laten staan)
  dailyHasLive
}) {
  // TRUTH weekly
  const t = computeForestZ(candlesTruth);
  const lastIdxT = candlesTruth.length - 1;

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBandsAndFreeze(t.z, t.atrArr, lastIdxT, 208)
    : { bandsNow: {}, freezeNow: false };

  const reg = regimeFromZ(t.z[lastIdxT], bandsNow);
  const label = `${strengthLabel(t.z[lastIdxT])}${reg} (${t.z[lastIdxT] != null ? t.z[lastIdxT].toFixed(2) : "n/a"})`;

  const forestOverlayTruth = buildOverlayPoints(candlesTruth, t.emaArr, t.atrArr, t.z);
  const forestZTruth = buildZSeries(candlesTruth, t.z);

  // LIVE weekly preview (optioneel)
  let forestOverlayLive = [];
  let forestZLive = [];

  if (hasLive && candlesWithLive?.length) {
    const l = computeForestZ(candlesWithLive);
    forestOverlayLive = buildOverlayPoints(candlesWithLive, l.emaArr, l.atrArr, l.z);
    forestZLive = buildZSeries(candlesWithLive, l.z);
  }

  // Forward weekly hint (4w)
  const forestOverlayForward = buildForwardFromTruth(candlesTruth, t.emaArr, t.atrArr, t.z, 4);

  // ---- NIEUW: Daily route naar “next weekly target” ----
  // Anchor = laatste TRUTH overlay punt
  const anchor = last(forestOverlayTruth);
  // Target = 1 week vooruit = forestOverlayForward[1]
  const target = (forestOverlayForward && forestOverlayForward.length >= 2) ? forestOverlayForward[1] : null;

  const dailyRouteToNextWeek = buildDailyRouteToNextWeek({
    dailyCandlesTruth,
    anchorTime: anchor?.time,
    anchorValue: anchor?.value,
    targetTime: target?.time,
    targetValue: target?.value
  });

  return {
    regimeLabel: label,

    forestOverlayTruth,
    forestOverlayLive,
    forestOverlayForward,

    // NIEUW
    dailyRouteToNextWeek,

    forestZTruth,
    forestZLive,

    bandsNow,
    freezeNow
  };
}