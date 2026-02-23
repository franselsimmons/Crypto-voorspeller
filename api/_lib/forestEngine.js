// api/_lib/forestEngine.js
import { kama, atr, madSigma, percentileFromWindow, clamp, adx } from "./indicators.js";

function computeCore(candles, { kamaER = 10, kamaFast = 2, kamaSlow = 30, zWin = 208 } = {}) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const kamaArr = kama(closes, kamaER, kamaFast, kamaSlow);
  const resid = closes.map((c, i) => (kamaArr[i] == null ? null : (c - kamaArr[i])));

  // robuuste schaal (MAD) i.p.v. gewone std
  const sigArr = madSigma(resid, zWin);

  const atrArr = atr(highs, lows, closes, 14);
  const adxArr = adx(highs, lows, closes, 14);

  const z = resid.map((r, i) => {
    const s = sigArr[i];
    if (r == null || s == null || s === 0) return null;
    return r / s;
  });

  return { closes, highs, lows, kamaArr, atrArr, adxArr, resid, sigArr, z };
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

function confidenceLabel({ reg, zNow, adxNow, freezeNow }) {
  // super simpel en voorspelbaar (geen magie):
  // - trendsterkte (ADX) + duidelijke z = higher confidence
  // - freeze of neutral = lager
  if (freezeNow) return "low";
  if (reg === "NEUTRAL") return "low";
  const zAbs = zNow == null ? 0 : Math.abs(zNow);
  const a = adxNow == null ? 0 : adxNow;

  if (a >= 25 && zAbs >= 1.2) return "high";
  if (a >= 18 && zAbs >= 0.9) return "med";
  return "low";
}

function buildOverlayPoints(candles, baseArr, atrArr, zArr, { zCap = 2.8, mult = 1.0 } = {}) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const base = baseArr[i];
    const a = atrArr[i];
    const z = zArr[i];
    if (base == null || a == null || z == null) continue;
    const v = base + clamp(z, -zCap, zCap) * a * mult;
    out.push({ time: candles[i].time, value: v });
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

// ✅ Forward: geen rechte lijn meer.
// - gebruikt kama-slope (basis drift)
// - z-slope (momentum)
// - mean-reversion (z trekt terug richting 0)
// - fan: onzekerheid groeit met sqrt(k) * ATR
function buildForwardFan({ candlesTruth, baseArr, atrArr, zArr, tf, horizonBars }) {
  const n = candlesTruth.length;
  if (n < 30) return null;

  const lastIdx = n - 1;
  const lastTime = candlesTruth[lastIdx].time;

  const baseNow = baseArr[lastIdx];
  const atrNow = atrArr[lastIdx];
  const zNow = zArr[lastIdx];

  if (baseNow == null || atrNow == null || zNow == null) return null;

  const stepSec = tf === "1w" ? (7 * 24 * 60 * 60) : (24 * 60 * 60);

  // base slope (KAMA drift)
  let basePrev = null;
  for (let i = lastIdx - 1; i >= 0; i--) {
    if (baseArr[i] != null) { basePrev = baseArr[i]; break; }
  }
  const baseSlope = (basePrev == null) ? 0 : (baseNow - basePrev); // per bar

  // z slope (laatste 5 geldige punten)
  const zs = [];
  for (let i = lastIdx; i >= 0 && zs.length < 5; i--) {
    if (zArr[i] != null) zs.push(zArr[i]);
  }
  const zSlopeRaw = (zs.length >= 5) ? ((zs[0] - zs[4]) / 4) : 0;
  const zSlope = clamp(zSlopeRaw, -0.25, 0.25);

  // parameters (simpel, stabiel)
  const meanRevert = 0.06;        // trekt z langzaam naar 0
  const momentum = 0.55;          // hoeveel van slope we meenemen
  const zCap = 2.8;

  const fanMult = tf === "1w" ? 1.8 : 1.2;

  const mid = [];
  const upper = [];
  const lower = [];

  // startpunt
  const startOverlay = baseNow + clamp(zNow, -zCap, zCap) * atrNow;
  mid.push({ time: lastTime, value: startOverlay });
  upper.push({ time: lastTime, value: startOverlay });
  lower.push({ time: lastTime, value: startOverlay });

  let z = zNow;

  for (let k = 1; k <= horizonBars; k++) {
    // z update: momentum + mean reversion (deterministisch, geen random)
    z = z + (momentum * zSlope) - (meanRevert * z);
    z = clamp(z, -zCap, zCap);

    // base drift
    const baseF = baseNow + baseSlope * k;

    const midV = baseF + z * atrNow;

    // onzekerheid groeit met sqrt(k)
    const band = atrNow * fanMult * Math.sqrt(k / 10);
    const upV = midV + band;
    const loV = midV - band;

    const t = lastTime + stepSec * k;

    mid.push({ time: t, value: midV });
    upper.push({ time: t, value: upV });
    lower.push({ time: t, value: loV });
  }

  return { mid, upper, lower, stepSec };
}

function splitInto4(series) {
  // split de forward in 4 stukken zodat jij “week 1/2/3/4” (of blok 1/2/3/4) ziet
  if (!series?.length) return { a: [], b: [], c: [], d: [] };
  const pts = series.slice(1); // zonder startpunt (nu)
  const seg = Math.ceil(pts.length / 4);
  const a = pts.slice(0, seg);
  const b = pts.slice(seg, seg * 2);
  const c = pts.slice(seg * 2, seg * 3);
  const d = pts.slice(seg * 3);
  return { a, b, c, d };
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive, tf = "1d", horizonBars = 90 }) {
  // TRUTH
  const t = computeCore(candlesTruth);
  const lastIdxT = candlesTruth.length - 1;

  const { bandsNow, freezeNow } = (lastIdxT >= 0)
    ? computeBands(t.z, t.atrArr, lastIdxT, 208)
    : { bandsNow: {}, freezeNow: false };

  const reg = regimeFromZ(t.z[lastIdxT], bandsNow);
  const conf = confidenceLabel({ reg, zNow: t.z[lastIdxT], adxNow: t.adxArr[lastIdxT], freezeNow });

  const label = `${strengthLabel(t.z[lastIdxT])}${reg} (${t.z[lastIdxT] != null ? t.z[lastIdxT].toFixed(2) : "n/a"})`;

  const forestOverlayTruth = buildOverlayPoints(candlesTruth, t.kamaArr, t.atrArr, t.z);
  const forestZTruth = buildZSeries(candlesTruth, t.z);

  // LIVE (optioneel)
  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeCore(candlesWithLive);
    forestOverlayLive = buildOverlayPoints(candlesWithLive, l.kamaArr, l.atrArr, l.z);
    forestZLive = buildZSeries(candlesWithLive, l.z);
  }

  // NOW point (marker)
  const priceNow = candlesWithLive?.length ? candlesWithLive[candlesWithLive.length - 1].close : candlesTruth[lastIdxT].close;
  const overlayNow = forestOverlayTruth.length ? forestOverlayTruth[forestOverlayTruth.length - 1].value : null;

  const nowPoint = {
    time: candlesWithLive?.length ? candlesWithLive[candlesWithLive.length - 1].time : candlesTruth[lastIdxT].time,
    price: priceNow,
    overlay: overlayNow,
    z: t.z[lastIdxT]
  };

  // FORWARD fan (altijd: “grootste kans” = reg + conf)
  const fan = buildForwardFan({
    candlesTruth,
    baseArr: t.kamaArr,
    atrArr: t.atrArr,
    zArr: t.z,
    tf,
    horizonBars
  });

  let forestOverlayForwardMid = [];
  let forestOverlayForwardUpper = [];
  let forestOverlayForwardLower = [];

  let fwd4 = { a: [], b: [], c: [], d: [] };

  if (fan) {
    forestOverlayForwardMid = fan.mid;
    forestOverlayForwardUpper = fan.upper;
    forestOverlayForwardLower = fan.lower;
    fwd4 = splitInto4(fan.mid);
  }

  return {
    regimeNow: reg,
    confidence: conf,

    regimeLabel: label,

    forestOverlayTruth,
    forestOverlayLive,

    forestOverlayForwardMid,
    forestOverlayForwardUpper,
    forestOverlayForwardLower,

    forestForward4: fwd4, // 4 kleuren

    forestZTruth,
    forestZLive,

    nowPoint,

    bandsNow,
    freezeNow
  };
}