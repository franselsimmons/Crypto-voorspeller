// api/_lib/forestEngine.js
// Doel:
// - overlay (truth/live) op prijs
// - forward voorspeller: mid + upper/lower fan (altijd zichtbaar)
// - z-score (truth/live)
// - nowPoint + direction/confidence

import { ema, std, atr, percentileFromWindow, clamp } from "./indicators.js";

function stepSec(tf) {
  return tf === "1w" ? 7 * 24 * 60 * 60 : 24 * 60 * 60;
}

function safeZWindow(n, desired) {
  // Kraken 1d kan ~720 candles geven. We willen nooit leeg lopen door te grote windows.
  const maxOk = Math.max(30, Math.floor(n * 0.5));      // nooit groter dan helft van data
  return Math.min(desired, maxOk);
}

function computeCore(candles, tf) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const n = candles.length;
  const emaLen = tf === "1w" ? 50 : 55;                 // daily iets trager (minder ruis)
  const zWinWanted = tf === "1w" ? 208 : 180;           // daily iets korter
  const zWin = safeZWindow(n, zWinWanted);

  const emaArr = ema(closes, emaLen);
  const resid  = closes.map((c, i) => (emaArr[i] == null ? null : (c - emaArr[i])));
  const sdArr  = std(resid, zWin);
  const atrArr = atr(highs, lows, closes, tf === "1w" ? 14 : 21);

  const zArr = resid.map((r, i) => {
    const sd = sdArr[i];
    if (r == null || sd == null || sd === 0) return null;
    return r / sd;
  });

  return { closes, emaArr, atrArr, zArr, zWin };
}

function bands(zArr, atrArr, i, lookback) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const aWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35   = percentileFromWindow(zWin, 35);
  const p65   = percentileFromWindow(zWin, 65);
  const p20Z  = percentileFromWindow(zWin, 20);
  const p80Z  = percentileFromWindow(zWin, 80);

  const p20ATR = percentileFromWindow(aWin, 20);
  const atrNow = atrArr[i];
  const freeze = (p20ATR != null && atrNow != null) ? (atrNow < p20ATR) : false;

  return { bandsNow: { p35, p65, p20Z, p80Z, p20ATR }, freezeNow: freeze };
}

function regimeFromZ(zNow, b) {
  if (zNow == null || b.p35 == null || b.p65 == null) return "NEUTRAL";
  if (zNow > b.p65) return "BULL";
  if (zNow < b.p35) return "BEAR";
  return "NEUTRAL";
}

function strengthLabel(zNow) {
  if (zNow == null) return "";
  const a = Math.abs(zNow);
  if (a >= 2.2) return "EXTREME ";
  if (a >= 1.5) return "STRONG ";
  return "";
}

function overlayPoints(candles, emaArr, atrArr, zArr, tf) {
  const zCap = tf === "1w" ? 2.5 : 2.2;
  const mult = tf === "1w" ? 1.0 : 0.85; // daily: iets minder “heftig”

  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const base = emaArr[i], a = atrArr[i], z = zArr[i];
    if (base == null || a == null || z == null) continue;
    const v = base + clamp(z, -zCap, zCap) * a * mult;
    out.push({ time: candles[i].time, value: v });
  }
  return out;
}

function zSeries(candles, zArr) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const z = zArr[i];
    if (z == null) continue;
    out.push({ time: candles[i].time, value: z });
  }
  return out;
}

function lastValidIndex(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i;
  return -1;
}

function slopeFromLastZ(zArr, idx) {
  // simpele, stabiele slope op de laatste 5 geldige punten
  const pts = [];
  for (let i = idx; i >= 0 && pts.length < 5; i--) if (zArr[i] != null) pts.push(zArr[i]);
  if (pts.length < 3) return 0;

  // gemiddelde “trend” (laatste - oudste) / (n-1)
  const raw = (pts[0] - pts[pts.length - 1]) / (pts.length - 1);
  return clamp(raw, -0.25, 0.25); // daily/week: cap zodat het niet gek wordt
}

function confidenceBucket(tf, zNow, freezeNow) {
  if (freezeNow) return "low";
  const a = Math.abs(zNow ?? 0);

  // daily strenger (meer ruis) -> sneller low/medium
  if (tf === "1d") {
    if (a >= 2.0) return "high";
    if (a >= 1.2) return "medium";
    return "low";
  }

  // weekly
  if (a >= 1.8) return "high";
  if (a >= 1.1) return "medium";
  return "low";
}

function buildForwardFan({ tf, horizonBars, lastTime, lastOverlay, lastAtr, zNow, slope, conf }) {
  const sec = stepSec(tf);

  // forward mid: we laten z langzaam “doorrollen” met slope + demping
  // en zetten dat om naar overlay-ruimte door ATR.
  const zCap = tf === "1w" ? 2.5 : 2.2;

  // demping: bij extreme z minder doorduwen
  const damp = 1 - Math.min(Math.abs(zNow) / 3, 1); // |z|=3 => 0
  const step = slope * (0.35 + 0.65 * damp);

  // band breedte: bij low confidence breder (eerlijker)
  const baseBand = conf === "high" ? 1.2 : conf === "medium" ? 1.8 : 2.4; // * ATR
  const fanTighten = conf === "high" ? 0.65 : conf === "medium" ? 0.85 : 1.0;

  const mid = [];
  const upper = [];
  const lower = [];

  // startpunt (nu)
  mid.push({ time: lastTime, value: lastOverlay });
  upper.push({ time: lastTime, value: lastOverlay + baseBand * lastAtr });
  lower.push({ time: lastTime, value: lastOverlay - baseBand * lastAtr });

  for (let k = 1; k <= horizonBars; k++) {
    const zF = clamp(zNow + step * k, -zCap, zCap);
    const v = lastOverlay + (zF - zNow) * lastAtr; // delta in z * ATR

    const widen = 1 + (k / horizonBars) * 0.9 * fanTighten; // loopt langzaam breder naar de toekomst
    const band = baseBand * lastAtr * widen;

    const t = lastTime + sec * k;
    mid.push({ time: t, value: v });
    upper.push({ time: t, value: v + band });
    lower.push({ time: t, value: v - band });
  }

  return { mid, upper, lower };
}

export function buildForestOverlay({ candlesTruth, candlesWithLive, hasLive, tf = "1w", horizonBars = 90 }) {
  // -------- TRUTH CORE --------
  const t = computeCore(candlesTruth, tf);
  const li = lastValidIndex(t.zArr);
  if (li < 0) {
    // ultra-fallback: stuur iets terug zodat UI niet leeg is
    return {
      regimeLabel: "NO DATA",
      forestOverlayTruth: [],
      forestOverlayLive: [],
      forestOverlayForwardMid: [],
      forestOverlayForwardUpper: [],
      forestOverlayForwardLower: [],
      forestZTruth: [],
      forestZLive: [],
      nowPoint: null,
      directionNow: "NEUTRAL",
      confidenceNow: "low",
      reasonNow: "Insufficient data",
      bandsNow: {},
      freezeNow: false
    };
  }

  const lookback = Math.max(60, Math.min(208, candlesTruth.length - 1));
  const { bandsNow, freezeNow } = bands(t.zArr, t.atrArr, li, lookback);

  const reg = regimeFromZ(t.zArr[li], bandsNow);
  const zNow = t.zArr[li];
  const conf = confidenceBucket(tf, zNow, freezeNow);

  // overlay truth + z truth
  const forestOverlayTruth = overlayPoints(candlesTruth, t.emaArr, t.atrArr, t.zArr, tf);
  const forestZTruth = zSeries(candlesTruth, t.zArr);

  // -------- LIVE (optioneel) --------
  let forestOverlayLive = [];
  let forestZLive = [];

  if (hasLive && candlesWithLive?.length) {
    const l = computeCore(candlesWithLive, tf);
    forestOverlayLive = overlayPoints(candlesWithLive, l.emaArr, l.atrArr, l.zArr, tf);
    forestZLive = zSeries(candlesWithLive, l.zArr);
  }

  // -------- NOW POINT --------
  const lastCandle = candlesTruth[li];
  const lastTime = lastCandle.time;

  // Pak overlay “nu” uit de truth overlay (laatste punt)
  const lastOverlayPoint = forestOverlayTruth[forestOverlayTruth.length - 1];
  const lastOverlay = lastOverlayPoint?.value ?? lastCandle.close;

  const lastAtr = t.atrArr[li] ?? 0;
  const slope = slopeFromLastZ(t.zArr, li);

  // Richting = sign van slope (maar bij freeze -> neutral)
  let directionNow = "NEUTRAL";
  if (!freezeNow) {
    if (slope > 0.02) directionNow = "UP";
    else if (slope < -0.02) directionNow = "DOWN";
    else directionNow = "NEUTRAL";
  }

  // Forward fan altijd bouwen (ook in neutral), anders zie je “niks”
  const fan = buildForwardFan({
    tf,
    horizonBars,
    lastTime,
    lastOverlay,
    lastAtr: lastAtr || Math.max(1, lastCandle.close * 0.01), // fallback band
    zNow: zNow ?? 0,
    slope,
    conf
  });

  const regimeLabel = `${strengthLabel(zNow)}${reg} (${zNow != null ? zNow.toFixed(2) : "n/a"})`;

  const nowPoint = {
    time: lastTime,
    price: lastCandle.close,
    z: zNow
  };

  const reasonNow =
    freezeNow
      ? "Low volatility (freeze)"
      : `Slope=${slope.toFixed(3)} • z=${(zNow ?? 0).toFixed(2)}`;

  return {
    regimeLabel,

    forestOverlayTruth,
    forestOverlayLive,

    forestOverlayForwardMid: fan.mid,
    forestOverlayForwardUpper: fan.upper,
    forestOverlayForwardLower: fan.lower,

    forestZTruth,
    forestZLive,

    nowPoint,
    directionNow,
    confidenceNow: conf,
    reasonNow,

    bandsNow,
    freezeNow
  };
}