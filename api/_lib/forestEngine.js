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

function rawRegimeFromZ(zNow, bandsNow) {
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

// Confidence score voor “mag ik überhaupt flippen?”
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
    // OBV slope richting/flow
    s += 1;
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

/**
 * INERTIA / LATE-TURN LOCK:
 * - We maken eerst een "desire regime" per bar (raw regime + trend/range filter)
 * - Daarna locken we hem: flip pas na confirmBars, behalve extreme => fastConfirmBars
 * - Extra streng in range (ADX laag): confirmBars omhoog
 * - Geen flips als confidence nog HIGH is (confidence-collapse gate)
 * - Freeze blokkeert flips
 */
function computeLockedRegimeSeries({
  zArr,
  atrArr,
  adxArr,
  relVolArr,
  obvArr,
  bandsPerIdx,
  tf,
  weeklyTruthCandles
}) {
  const n = zArr.length;
  const locked = Array(n).fill("NEUTRAL");

  // weekly bias (alleen als tf=1d en weeklyTruthCandles aanwezig)
  let weeklyReg = null;
  let weeklyZ = null;
  if (tf === "1d" && Array.isArray(weeklyTruthCandles) && weeklyTruthCandles.length > 120) {
    const w = computeCore(weeklyTruthCandles, { zWin: 208 });
    const wIdx = lastValidIndex(w.z);
    if (wIdx >= 0) {
      const wBands = computeBands(w.z, w.a, wIdx, 208).bandsNow;
      weeklyReg = rawRegimeFromZ(w.z[wIdx], wBands);
      weeklyZ = w.z[wIdx];
    }
  }

  let cur = "NEUTRAL";
  let pending = null;
  let pendingCount = 0;

  for (let i = 0; i < n; i++) {
    const zNow = zArr[i];
    const bandsNow = bandsPerIdx[i]?.bandsNow || {};
    const freezeNow = !!bandsPerIdx[i]?.freezeNow;

    // basis regime uit z
    let desire = rawRegimeFromZ(zNow, bandsNow);

    // Trend vs Range hard (ADX)
    const adxNow = adxArr[i];
    const trending = (isNum(adxNow) && adxNow >= 25);

    // In range: maak hem strenger (minder snel bull/bear)
    if (!trending && desire !== "NEUTRAL" && isNum(zNow)) {
      if (Math.abs(zNow) < 1.2) desire = "NEUTRAL";
    }

    // weekly alignment (1d)
    let aligned = true;
    if (tf === "1d" && weeklyReg) {
      if (weeklyReg === "BULL" && desire === "BEAR") aligned = false;
      if (weeklyReg === "BEAR" && desire === "BULL") aligned = false;

      // als weekly extreem is, weekly wint (maar nog steeds locken)
      if (isNum(weeklyZ) && Math.abs(weeklyZ) >= 2.0 && weeklyReg !== "NEUTRAL") {
        desire = weeklyReg;
      }
    }

    // OBV slope + relVol voor confidence gate
    const obvNow = obvArr[i];
    const obvPrev = obvArr[Math.max(0, i - 5)];
    const obvSlope = (isNum(obvNow) && isNum(obvPrev)) ? (obvNow - obvPrev) : null;

    const relVolNow = relVolArr[i];

    const confidence = scoreConfidence({
      zNow,
      adxNow,
      relVolNow,
      obvSlope,
      aligned
    });

    // Confidence-collapse gate: als HIGH => niet flippen
    const flipBlockedByConfidence = (confidence === "high");

    // Extreme detectie via percentiel-banden
    const p20Z = bandsNow?.p20Z;
    const p80Z = bandsNow?.p80Z;
    const extreme = (
      isNum(zNow) && (
        (isNum(p80Z) && zNow >= p80Z && zNow >= 1.8) ||
        (isNum(p20Z) && zNow <= p20Z && zNow <= -1.8)
      )
    );

    // confirm bars: traag (B) + extra traag in range
    let confirmBars = 4;        // standaard daily/weekly
    let fastConfirmBars = 2;    // bij extreme

    if (tf === "1w") {
      confirmBars = 2;
      fastConfirmBars = 1;
    }

    // Range = nóg strenger
    if (!trending) {
      confirmBars += (tf === "1w") ? 1 : 2;
      fastConfirmBars += 1;
    }

    // Freeze blokkeert flips volledig
    const flipBlocked = freezeNow || flipBlockedByConfidence || (aligned === false);

    // Lock logic
    if (desire === cur || desire == null) {
      pending = null;
      pendingCount = 0;
      locked[i] = cur;
      continue;
    }

    // als flip geblokkeerd: negeer pending en blijf
    if (flipBlocked) {
      pending = null;
      pendingCount = 0;
      locked[i] = cur;
      continue;
    }

    // nieuwe pending of voortzetten
    if (pending !== desire) {
      pending = desire;
      pendingCount = 1;
    } else {
      pendingCount++;
    }

    const need = extreme ? fastConfirmBars : confirmBars;
    if (pendingCount >= need) {
      cur = pending;
      pending = null;
      pendingCount = 0;
    }

    locked[i] = cur;
  }

  return { locked, weeklyReg };
}

function buildForwardWave({ candlesTruth, baseArr, atrArr, zArr, horizonBars, tf, regimeNow }) {
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

  // base slope (KAMA) gemiddeld laatste 10 bars
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

  // period schatting uit z-extrema (alleen voor "mooier pad", niet als waarheid)
  const ex = findLastExtrema(zArr, 220);
  let period = Math.min(horizonBars, Math.max(14, Math.round(horizonBars / 2)));
  if (ex.length >= 2) {
    const p = Math.abs(ex[0].i - ex[1].i);
    if (p >= 10 && p <= 1200) period = p;
  }

  // amplitude: in trend (BULL/BEAR) minder “wavy”, meer richting
  const trendBias = (regimeNow === "BULL") ? 0.35 : (regimeNow === "BEAR") ? -0.35 : 0;
  const ampBase = clamp(Math.abs(zNow), 0.4, 2.0);
  const horizonDamp = clamp(120 / Math.max(30, horizonBars), 0.25, 1.0);
  const amp = ampBase * horizonDamp;

  // mean-revert snelheid: in trend langzamer, in neutral sneller
  const mr = (regimeNow === "NEUTRAL") ? 0.97 : 0.985;
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

    // z center dempt terug + bias duwt licht richting regime
    zCenter = (zCenter * mr) + (trendBias * (1 - mr));

    // wave (klein), vooral voor “pad”, niet als garantie
    const w = (2 * Math.PI * k) / Math.max(10, period);
    const zWave = (regimeNow === "NEUTRAL") ? (amp * Math.sin(w + phase)) : (0.45 * amp * Math.sin(w + phase));

    const zMid = clamp(zCenter + zWave, -2.8, 2.8);

    // fan band groeit naar voren
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
} = {}) {
  // -------- TRUTH core --------
  const t = computeCore(candlesTruth, { zWin: 208 });
  const lastIdxT = lastValidIndex(t.z);

  // bands/freeze per index (voor lock)
  const bandsPerIdx = Array(candlesTruth.length).fill(null).map((_, i) => {
    if (i < 30) return { bandsNow: {}, freezeNow: false };
    return computeBands(t.z, t.a, i, 208);
  });

  // -------- LOCKED regime series (B) --------
  const { locked: lockedRegimes, weeklyReg } = computeLockedRegimeSeries({
    zArr: t.z,
    atrArr: t.a,
    adxArr: t.adxArr,
    relVolArr: t.relVol,
    obvArr: t.obvArr,
    bandsPerIdx,
    tf,
    weeklyTruthCandles
  });

  const regNow = (lastIdxT >= 0) ? lockedRegimes[lastIdxT] : "NEUTRAL";

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? bandsPerIdx[lastIdxT]
    : { bandsNow: {}, freezeNow: false };

  const zNow = (lastIdxT >= 0) ? t.z[lastIdxT] : null;

  // confidence nu (voor info / gating)
  const adxNow = (lastIdxT >= 0) ? t.adxArr[lastIdxT] : null;
  const relVolNow = (lastIdxT >= 0) ? t.relVol[lastIdxT] : null;
  const obvNow = (lastIdxT >= 0) ? t.obvArr[lastIdxT] : null;
  const obvPrev = (lastIdxT >= 0) ? t.obvArr[Math.max(0, lastIdxT - 5)] : null;
  const obvSlope = (isNum(obvNow) && isNum(obvPrev)) ? (obvNow - obvPrev) : null;

  let aligned = true;
  if (tf === "1d" && weeklyReg) {
    const raw = rawRegimeFromZ(zNow, bandsNow);
    if (weeklyReg === "BULL" && raw === "BEAR") aligned = false;
    if (weeklyReg === "BEAR" && raw === "BULL") aligned = false;
  }

  const confidence = scoreConfidence({
    zNow,
    adxNow,
    relVolNow,
    obvSlope,
    aligned
  });

  const regimeLabel = `${strengthLabel(zNow)}${regNow} (${isNum(zNow) ? zNow.toFixed(2) : "n/a"})`;

  // series
  const forestOverlayTruth = overlaySeries(candlesTruth, t.base, t.a, t.z);
  const forestZTruth = zSeries(candlesTruth, t.z);

  // LIVE (optioneel)
  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeCore(candlesWithLive, { zWin: 208 });
    forestOverlayLive = overlaySeries(candlesWithLive, l.base, l.a, l.z);
    forestZLive = zSeries(candlesWithLive, l.z);
  }

  // Forward: in freeze -> korter
  const safeH = freezeNow ? Math.min(20, horizonBars) : horizonBars;

  const fwd = buildForwardWave({
    candlesTruth,
    baseArr: t.base,
    atrArr: t.a,
    zArr: t.z,
    horizonBars: safeH,
    tf,
    regimeNow: regNow
  });

  const nowTime = candlesTruth[lastIdxT]?.time ?? null;
  const nowPrice = candlesTruth[lastIdxT]?.close ?? null;

  const nowPoint = {
    time: isNum(nowTime) ? nowTime : null,
    price: isNum(nowPrice) ? nowPrice : null,
    overlay: forestOverlayTruth.length ? forestOverlayTruth[forestOverlayTruth.length - 1].value : null,
    z: isNum(zNow) ? zNow : null,
    regimeNow: regNow,
    confidence,
    weeklyReg
  };

  return {
    regimeLabel,
    regimeNow: regNow,
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