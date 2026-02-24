// api/_lib/forestEngine.js
import {
  kama, std, mad, atr, sma, obv, adx,
  percentileFromWindow, clamp
} from "./indicators.js";

function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

/**
 * Pivot (fractal) detectie.
 * Pivot-high pas "bevestigd" als we right bars verder zijn.
 * => geen repaint.
 */
function findConfirmedPivots(candles, left = 3, right = 3) {
  const pivotsHigh = Array(candles.length).fill(null);
  const pivotsLow = Array(candles.length).fill(null);

  for (let i = left; i < candles.length - right; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    if (!isNum(h) || !isNum(l)) continue;

    let isHigh = true;
    let isLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      const hj = candles[j]?.high;
      const lj = candles[j]?.low;
      if (!isNum(hj) || !isNum(lj)) { isHigh = false; isLow = false; break; }
      if (hj >= h) isHigh = false;
      if (lj <= l) isLow = false;
      if (!isHigh && !isLow) break;
    }

    // bevestigde pivot wordt pas "zichtbaar" bij i+right (na bevestiging)
    const confirmedAt = i + right;
    if (isHigh) pivotsHigh[confirmedAt] = h;
    if (isLow) pivotsLow[confirmedAt] = l;
  }

  return { pivotsHigh, pivotsLow };
}

function lastPivotBefore(idx, pivArr) {
  for (let i = idx; i >= 0; i--) {
    if (isNum(pivArr[i])) return { i, price: pivArr[i] };
  }
  return null;
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

  // STD + MAD naast elkaar
  const sdStd = std(resid, zWin);
  const sdMad = mad(resid, zWin);

  const a = atr(highs, lows, closes, 14);

  // Robuste Z keuze:
  // - als std ontbreekt/0 -> MAD
  // - als std "te klein" -> MAD
  // - bij extreme spikes -> MAD
  const zStd = resid.map((r, i) => {
    const s = sdStd[i];
    if (!isNum(r) || !isNum(s) || s === 0) return null;
    return r / s;
  });

  const zRobust = resid.map((r, i) => {
    const s = sdMad[i];
    if (!isNum(r) || !isNum(s) || s === 0) return null;
    return r / s;
  });

  const z = resid.map((r, i) => {
    const sStd = sdStd[i];
    const sMad = sdMad[i];

    if (!isNum(r)) return null;

    // voorkeur: std, maar fallback op mad
    if (!isNum(sStd) || sStd === 0) {
      if (isNum(sMad) && sMad !== 0) return r / sMad;
      return null;
    }

    const zS = r / sStd;

    // als zStd absurd/extreem -> robust gebruiken
    if (isNum(zS) && Math.abs(zS) > 4.0 && isNum(sMad) && sMad > 0) {
      return r / sMad;
    }

    // als std veel kleiner is dan mad (indicatie van rare verdeling) -> robust
    if (isNum(sMad) && sMad > 0 && sStd < 0.55 * sMad) {
      return r / sMad;
    }

    return zS;
  });

  const volSma = sma(vols, 20);
  const relVol = vols.map((v, i) => (isNum(volSma[i]) && volSma[i] !== 0) ? (v / volSma[i]) : null);
  const obvArr = obv(closes, vols);
  const adxArr = adx(highs, lows, closes, adxLen);

  return {
    closes, highs, lows, vols,
    base, a,
    z, zStd, zRobust,
    relVol, obvArr, adxArr
  };
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

function scoreConfidence({ zNow, adxNow, relVolNow, obvSlope, aligned, structureOK }) {
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

  if (isNum(obvSlope)) s += 1;

  if (aligned) s += 2;
  else s -= 2;

  // Structuurfilter is mega belangrijk
  if (structureOK) s += 2;
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

/**
 * Forward fan:
 * - mid: base drift + z mean-revert richting 0 (sneller in range, trager in trend)
 * - bands: wijder met horizon (sqrt), scaled met ATR en regime/volatiliteit
 * Geen sinus, geen "mooie wave".
 */
function buildForwardFan({ candlesTruth, baseArr, atrArr, zArr, horizonBars, tf, reg, trending }) {
  const n = candlesTruth.length;
  if (n < 80) return { mid: [], upper: [], lower: [] };

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

  // baseSlope: gemiddelde slope van laatste 10 bars
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

  // mean reversion snelheid:
  // - in trend: langzaam (we laten trend doorlopen)
  // - in range: sneller terug naar 0
  const mr = trending ? 0.992 : 0.975; // per bar

  // regime drift: kleine push in regime-richting (maar capped)
  const driftZ = (reg === "BULL") ? 0.08 : (reg === "BEAR") ? -0.08 : 0.0;

  // fan breedte basis: gebaseerd op actuele |z| + horizon
  const baseBand = clamp(0.55 + 0.15 * Math.min(3, Math.abs(zNow)), 0.55, 1.05);

  const mid = [];
  const upper = [];
  const lower = [];

  let zC = zNow;

  for (let k = 0; k <= horizonBars; k++) {
    const t = lastTime + stepSec * k;
    if (!isNum(t)) continue;

    const baseF = baseNow + baseSlopePerBar * k;

    // z evolutie: mean revert + regime drift, maar nooit gek
    zC = zC * mr + driftZ;
    zC = clamp(zC, -2.8, 2.8);

    // band wordt wijder met sqrt(horizon) (eerlijk)
    const widen = Math.sqrt(Math.max(1, k)) / Math.sqrt(Math.max(1, horizonBars));
    const band = clamp(baseBand * (0.35 + 0.95 * widen), 0.35, 1.35);

    const zUp = clamp(zC + band, -3.0, 3.0);
    const zLo = clamp(zC - band, -3.0, 3.0);

    const vMid = baseF + zC * atrNow;
    const vUp  = baseF + zUp * atrNow;
    const vLo  = baseF + zLo * atrNow;

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

  // Trend vs range hard (ADX)
  const adxNow = t.adxArr[lastIdxT];
  const trending = (isNum(adxNow) && adxNow >= 25);

  // In range: minder snel BULL/BEAR tenzij z echt stevig is
  if (!trending && reg !== "NEUTRAL" && isNum(t.z[lastIdxT])) {
    if (Math.abs(t.z[lastIdxT]) < 1.2) reg = "NEUTRAL";
  }

  // Weekly bias alignment (alleen als daily)
  let aligned = true;
  let weeklyReg = null;

  if (tf === "1d" && Array.isArray(weeklyTruthCandles) && weeklyTruthCandles.length > 100) {
    const w = computeCore(weeklyTruthCandles, { zWin: 208 });
    const wIdx = lastValidIndex(w.z);
    const wBands = computeBands(w.z, w.a, wIdx, 208).bandsNow;
    weeklyReg = regimeFromZ(w.z[wIdx], wBands);

    if (weeklyReg === "BULL" && reg === "BEAR") aligned = false;
    if (weeklyReg === "BEAR" && reg === "BULL") aligned = false;

    // als weekly extreem is: weekly wint
    const wZ = w.z[wIdx];
    if (isNum(wZ) && Math.abs(wZ) >= 2.0) {
      if (weeklyReg !== "NEUTRAL") reg = weeklyReg;
    }
  }

  // Volume confirm (OBV slope + relVol)
  const relVolNow = t.relVol[lastIdxT];
  const obvNow = t.obvArr[lastIdxT];
  const obvPrev = t.obvArr[Math.max(0, lastIdxT - 5)];
  const obvSlope = (isNum(obvNow) && isNum(obvPrev)) ? (obvNow - obvPrev) : null;

  // --------- UPGRADE 1: STRUCTUURFILTER ----------
  const { pivotsHigh, pivotsLow } = findConfirmedPivots(candlesTruth, 3, 3);
  const lastHigh = lastPivotBefore(lastIdxT, pivotsHigh);
  const lastLow  = lastPivotBefore(lastIdxT, pivotsLow);
  const closeNow = t.closes[lastIdxT];

  let structureOK = true;
  let structureNow = {
    lastPivotHigh: lastHigh?.price ?? null,
    lastPivotLow: lastLow?.price ?? null
  };

  if (reg === "BULL") {
    // Bull alleen als close boven laatste pivot-high breekt
    if (lastHigh && isNum(closeNow)) structureOK = (closeNow > lastHigh.price);
  } else if (reg === "BEAR") {
    // Bear alleen als close onder laatste pivot-low breekt
    if (lastLow && isNum(closeNow)) structureOK = (closeNow < lastLow.price);
  }

  // Als structuur niet klopt -> NEUTRAL (i.p.v. “toch flippen”)
  if (!structureOK) reg = "NEUTRAL";

  const confidence = scoreConfidence({
    zNow: t.z[lastIdxT],
    adxNow,
    relVolNow,
    obvSlope,
    aligned,
    structureOK
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

  // Forward horizon veilig: in freeze korter, maar altijd “fan”
  const safeH = freezeNow ? Math.min(20, horizonBars) : horizonBars;

  // --------- UPGRADE 3: EERLIJKE FORWARD FAN ----------
  // Alleen tekenen als we niet in freeze zijn (en niet NEUTRAL)
  const allowForward = (!freezeNow && reg !== "NEUTRAL");
  const fwd = allowForward
    ? buildForwardFan({
        candlesTruth,
        baseArr: t.base,
        atrArr: t.a,
        zArr: t.z,
        horizonBars: safeH,
        tf,
        reg,
        trending
      })
    : { mid: [], upper: [], lower: [] };

  const nowTime = candlesTruth[lastIdxT]?.time ?? null;
  const nowPrice = candlesTruth[lastIdxT]?.close ?? null;

  const nowPoint = {
    time: isNum(nowTime) ? nowTime : null,
    price: isNum(nowPrice) ? nowPrice : null,
    overlay: forestOverlayTruth.length ? forestOverlayTruth[forestOverlayTruth.length - 1].value : null,
    z: isNum(zNow) ? zNow : null,
    regimeNow: reg,
    confidence,
    weeklyReg,
    trending,
    adxNow: isNum(adxNow) ? adxNow : null,
    relVolNow: isNum(relVolNow) ? relVolNow : null,
    structureNow
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
    nowPoint,

    // extra debug voor frontend
    structureNow
  };
}