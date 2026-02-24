// api/_lib/forestEngine.js
import {
  kama, std, atr, sma, obv, adx, ema,
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
  const opens  = candles.map(c => c.open);
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

  // CVD-proxy (zonder trades): “richting-volume” op candle basis
  // hoe dichter close bij high = meer koopdruk, bij low = meer verkoopdruk
  const cvdProxy = [];
  let cvd = 0;
  for (let i = 0; i < candles.length; i++) {
    const hi = highs[i], lo = lows[i], cl = closes[i], op = opens[i], vol = vols[i];
    if (!isNum(hi) || !isNum(lo) || !isNum(cl) || !isNum(op) || !isNum(vol) || hi === lo) {
      cvdProxy.push(null);
      continue;
    }
    const body = (cl - op);
    const pos = (cl - lo) / (hi - lo); // 0..1
    const signed = (pos - 0.5) * 2;    // -1..+1
    const impulse = (signed * vol) + (body >= 0 ? 0.15 * vol : -0.15 * vol);
    cvd += impulse;
    cvdProxy.push(cvd);
  }

  return { closes, highs, lows, opens, vols, base, a, z, relVol, obvArr, adxArr, cvdProxy };
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

// ---------- S/R + “liq magnet” proxy ----------
function pivots(candles, left = 3, right = 3) {
  const highs = candles.map(c => c.high);
  const lows  = candles.map(c => c.low);

  const levels = [];
  for (let i = left; i < candles.length - right; i++) {
    const h = highs[i], l = lows[i];
    if (!isNum(h) || !isNum(l)) continue;

    let isPH = true;
    for (let k = 1; k <= left; k++) if (!(highs[i] > highs[i - k])) isPH = false;
    for (let k = 1; k <= right; k++) if (!(highs[i] >= highs[i + k])) isPH = false;

    let isPL = true;
    for (let k = 1; k <= left; k++) if (!(lows[i] < lows[i - k])) isPL = false;
    for (let k = 1; k <= right; k++) if (!(lows[i] <= lows[i + k])) isPL = false;

    if (isPH) levels.push({ time: candles[i].time, price: h, type: "R" });
    if (isPL) levels.push({ time: candles[i].time, price: l, type: "S" });
  }
  return levels;
}

function mergeLevels(levels, priceNow, bucketPct = 0.006) {
  // levels clusteren zodat je niet 100 lijnen krijgt
  const bucket = Math.max(50, priceNow * bucketPct);
  const sorted = levels
    .filter(x => isNum(x.price))
    .sort((a, b) => a.price - b.price);

  const out = [];
  for (const lv of sorted) {
    const last = out[out.length - 1];
    if (!last || Math.abs(lv.price - last.price) > bucket) {
      out.push({ price: lv.price, type: lv.type, strength: 1 });
    } else {
      last.price = (last.price * last.strength + lv.price) / (last.strength + 1);
      last.strength += 1;
      if (lv.type !== last.type) last.type = "SR";
    }
  }

  // sorteer op “sterkte” en pak top
  out.sort((a, b) => b.strength - a.strength);
  return out.slice(0, 10).sort((a, b) => a.price - b.price);
}

function roundMagnets(priceNow) {
  // round numbers als “liq/psych magnet”
  const step = priceNow >= 100000 ? 5000 : 2500;
  const base = Math.round(priceNow / step) * step;
  const out = [];
  for (let k = -3; k <= 3; k++) out.push({ price: base + k * step, type: "ROUND", strength: 1 });
  return out.filter(x => x.price > 0);
}

function nearestMagnet(magnets, price) {
  let best = null;
  let bestD = Infinity;
  for (const m of magnets) {
    const d = Math.abs(m.price - price);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best ? { magnet: best, dist: bestD } : null;
}

// ---------- confidence kalibratie (backtest) ----------
function calibrationScore(candles, regSeries, tf) {
  // simpele “richting” hitrate:
  // BULL => over next N bars return > 0, BEAR => return < 0
  const closes = candles.map(c => c.close);
  const N = (tf === "1w") ? 2 : 5;
  const start = Math.max(0, closes.length - 320);

  let wins = 0, total = 0;

  for (let i = start; i < closes.length - N; i++) {
    const reg = regSeries[i];
    const c0 = closes[i];
    const c1 = closes[i + N];
    if (!isNum(c0) || !isNum(c1)) continue;
    if (reg !== "BULL" && reg !== "BEAR") continue;

    const ret = c1 - c0;
    total++;
    if (reg === "BULL" && ret > 0) wins++;
    if (reg === "BEAR" && ret < 0) wins++;
  }

  const winrate = total ? (wins / total) : null;
  return { winrate, samples: total, horizonBarsTest: N };
}

function scoreConfidence({ zNow, adxNow, relVolNow, obvSlope, cvdSlope, aligned, winrate }) {
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
  if (isNum(cvdSlope) && Math.abs(cvdSlope) > 0) s += 1;

  if (aligned) s += 2;
  else s -= 2;

  // kalibratie “matcht dit historisch?”
  if (isNum(winrate)) {
    if (winrate >= 0.62) s += 2;
    else if (winrate >= 0.56) s += 1;
    else if (winrate < 0.50) s -= 1;
  }

  if (s >= 8) return "high";
  if (s >= 5) return "mid";
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

function buildForwardWave({ candlesTruth, baseArr, atrArr, zArr, horizonBars, tf, magnets, confidence }) {
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

  // base slope
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

  // periode zoeken uit laatste extrema
  const ex = findLastExtrema(zArr, 220);
  let period = Math.min(horizonBars, Math.max(14, Math.round(horizonBars / 2)));
  if (ex.length >= 2) {
    const p = Math.abs(ex[0].i - ex[1].i);
    if (p >= 10 && p <= 1200) period = p;
  }

  // amplitude dempen bij lange horizon
  const ampBase = clamp(Math.abs(zNow), 0.6, 2.4);
  const horizonDamp = clamp(90 / Math.max(30, horizonBars), 0.35, 1.0);
  const amp = ampBase * horizonDamp;

  // mean reversion
  const mr = clamp(0.985, 0.96, 0.995);
  let zCenter = zNow;

  let phase = 0;
  if (ex.length >= 1) phase = (ex[0].type === "peak") ? Math.PI : 0;

  // magnet weight: hoger bij high confidence
  const magnetW =
    confidence === "high" ? 0.35 :
    confidence === "mid"  ? 0.22 : 0.12;

  const mid = [];
  const upper = [];
  const lower = [];

  for (let k = 0; k <= horizonBars; k++) {
    const t = lastTime + stepSec * k;
    if (!isNum(t)) continue;

    const baseF = baseNow + baseSlopePerBar * k;

    zCenter = zCenter * mr;

    const w = (2 * Math.PI * k) / Math.max(10, period);
    const zWave = amp * Math.sin(w + phase);

    const zMid = clamp(zCenter + zWave, -2.8, 2.8);

    const widen = clamp(0.35 + (k / Math.max(1, horizonBars)) * 0.65, 0.35, 1.0);
    const band = 0.55 * widen;

    const zUp = clamp(zMid + band, -3.0, 3.0);
    const zLo = clamp(zMid - band, -3.0, 3.0);

    let vMid = baseF + zMid * atrNow;
    let vUp  = baseF + zUp  * atrNow;
    let vLo  = baseF + zLo  * atrNow;

    // “liq / SR magnet” trekken naar dichtstbijzijnde level (proxy)
    if (Array.isArray(magnets) && magnets.length && isNum(vMid)) {
      const nm = nearestMagnet(magnets, vMid);
      if (nm && isNum(nm.magnet?.price) && isNum(nm.dist)) {
        // hoe dichterbij, hoe sterker de trek
        const distNorm = clamp(nm.dist / Math.max(1, atrNow * 6), 0, 1);
        const pull = magnetW * (1 - distNorm) * widen;
        vMid = vMid + (nm.magnet.price - vMid) * pull;
        vUp  = vUp  + (nm.magnet.price - vUp)  * (pull * 0.65);
        vLo  = vLo  + (nm.magnet.price - vLo)  * (pull * 0.65);
      }
    }

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

  const zNow = t.z[lastIdxT];
  const adxNow = t.adxArr[lastIdxT];

  // 1) HARD regime: Trend vs Range
  const trendState =
    (isNum(adxNow) && adxNow >= 25) ? "TREND" :
    (isNum(adxNow) && adxNow <= 18) ? "RANGE" : "MIXED";

  // 2) Weekly EMA200 bias (alleen bij daily)
  let ema200Weekly = null;
  let weeklyBias = "NEUTRAL";
  let weeklyReg = null;
  let aligned = true;

  if (tf === "1d" && Array.isArray(weeklyTruthCandles) && weeklyTruthCandles.length > 220) {
    const wCloses = weeklyTruthCandles.map(c => c.close);
    const wEma200 = ema(wCloses, 200);
    const wIdx = lastValidIndex(wEma200);
    ema200Weekly = isNum(wEma200[wIdx]) ? wEma200[wIdx] : null;

    const wCloseNow = weeklyTruthCandles[wIdx]?.close ?? null;
    if (isNum(wCloseNow) && isNum(ema200Weekly)) {
      weeklyBias = (wCloseNow >= ema200Weekly) ? "BULL" : "BEAR";
    }

    // weekly z-regime ook meenemen
    const w = computeCore(weeklyTruthCandles, { zWin: 208 });
    const wzIdx = lastValidIndex(w.z);
    const wBands = computeBands(w.z, w.a, wzIdx, 208).bandsNow;
    weeklyReg = regimeFromZ(w.z[wzIdx], wBands);
  }

  // 3) Baseline regime uit z-bands
  let reg = regimeFromZ(zNow, bandsNow);

  // 4) Range filter: in range minder snel bull/bear tenzij z echt duidelijk
  if (trendState === "RANGE" && reg !== "NEUTRAL" && isNum(zNow)) {
    if (Math.abs(zNow) < 1.35) reg = "NEUTRAL";
  }

  // 5) Weekly bias “harde” voorkeur (maar niet blind)
  if (tf === "1d" && weeklyBias !== "NEUTRAL") {
    if (weeklyBias === "BULL" && reg === "BEAR") aligned = false;
    if (weeklyBias === "BEAR" && reg === "BULL") aligned = false;

    // als weekly extreem is, weekly wint
    if (weeklyReg && weeklyReg !== "NEUTRAL") {
      // escalatie: weekly regime zwaarder bij extreme weekly z
      // (we hebben hier geen wZ terug, maar weeklyReg is al “sterk” filter)
      if (weeklyBias === weeklyReg) reg = weeklyReg;
    }
  }

  // 6) Volume/orderflow confirms
  const relVolNow = t.relVol[lastIdxT];
  const obvNow = t.obvArr[lastIdxT];
  const obvPrev = t.obvArr[Math.max(0, lastIdxT - 5)];
  const obvSlope = (isNum(obvNow) && isNum(obvPrev)) ? (obvNow - obvPrev) : null;

  const cvdNow = t.cvdProxy[lastIdxT];
  const cvdPrev = t.cvdProxy[Math.max(0, lastIdxT - 5)];
  const cvdSlope = (isNum(cvdNow) && isNum(cvdPrev)) ? (cvdNow - cvdPrev) : null;

  const volConfirm =
    (reg === "BULL" && (isNum(obvSlope) ? obvSlope > 0 : false) && (isNum(relVolNow) ? relVolNow >= 1.0 : false)) ||
    (reg === "BEAR" && (isNum(obvSlope) ? obvSlope < 0 : false) && (isNum(relVolNow) ? relVolNow >= 1.0 : false));

  const flowConfirm =
    (reg === "BULL" && (isNum(cvdSlope) ? cvdSlope > 0 : false)) ||
    (reg === "BEAR" && (isNum(cvdSlope) ? cvdSlope < 0 : false));

  const confirmations = {
    volConfirm: !!volConfirm,
    flowConfirm: !!flowConfirm,
    relVolNow: isNum(relVolNow) ? relVolNow : null,
    obvSlope: isNum(obvSlope) ? obvSlope : null,
    cvdSlope: isNum(cvdSlope) ? cvdSlope : null
  };

  // 7) Regime hard label (dit is wat jij “blind” wil zien)
  const regimeHard = (() => {
    // als trendState RANGE en confirmations zwak -> neutral push
    if (trendState === "RANGE" && !volConfirm && !flowConfirm) return "NEUTRAL";
    return reg;
  })();

  // 8) Reg series voor kalibratie/backtest
  const regSeries = t.z.map((zv, i) => {
    const b = computeBands(t.z, t.a, i, 208).bandsNow;
    let r = regimeFromZ(zv, b);
    const adxI = t.adxArr[i];
    const ts =
      (isNum(adxI) && adxI >= 25) ? "TREND" :
      (isNum(adxI) && adxI <= 18) ? "RANGE" : "MIXED";
    if (ts === "RANGE" && r !== "NEUTRAL" && isNum(zv) && Math.abs(zv) < 1.35) r = "NEUTRAL";
    return r;
  });

  const calibration = calibrationScore(candlesTruth, regSeries, tf);

  // 9) Confidence (met kalibratie)
  const confidence = scoreConfidence({
    zNow,
    adxNow,
    relVolNow,
    obvSlope,
    cvdSlope,
    aligned,
    winrate: calibration.winrate
  });

  const regimeLabel = `${strengthLabel(zNow)}${regimeHard} (${isNum(zNow) ? zNow.toFixed(2) : "n/a"})`;

  // 10) S/R + magnets
  const nowPrice = candlesTruth[lastIdxT]?.close ?? null;
  const rawLevels = pivots(candlesTruth, 3, 3);
  const srLevels = isNum(nowPrice) ? mergeLevels(rawLevels, nowPrice, 0.006) : [];
  const magnets = isNum(nowPrice) ? [...srLevels, ...roundMagnets(nowPrice)] : [];

  // overlay
  const forestOverlayTruth = overlaySeries(candlesTruth, t.base, t.a, t.z);
  const forestZTruth = zSeries(candlesTruth, t.z);

  let forestOverlayLive = [];
  let forestZLive = [];
  if (hasLive && candlesWithLive?.length) {
    const l = computeCore(candlesWithLive, { zWin: 208 });
    forestOverlayLive = overlaySeries(candlesWithLive, l.base, l.a, l.z);
    forestZLive = zSeries(candlesWithLive, l.z);
  }

  // freeze => kortere horizon
  const safeH = freezeNow ? Math.min(20, horizonBars) : horizonBars;

  const fwd = buildForwardWave({
    candlesTruth,
    baseArr: t.base,
    atrArr: t.a,
    zArr: t.z,
    horizonBars: safeH,
    tf,
    magnets,
    confidence
  });

  const nowTime = candlesTruth[lastIdxT]?.time ?? null;

  const nowPoint = {
    time: isNum(nowTime) ? nowTime : null,
    price: isNum(nowPrice) ? nowPrice : null,
    overlay: forestOverlayTruth.length ? forestOverlayTruth[forestOverlayTruth.length - 1].value : null,
    z: isNum(zNow) ? zNow : null,

    // jouw “blind” velden
    regimeNow: regimeHard,
    confidence,
    weeklyBias,
    weeklyReg,
    trendState,

    // confirm details
    confirmations,
    calibration
  };

  return {
    regimeLabel,
    regimeNow: regimeHard,
    confidence,

    // extra info
    regimeHard,
    trendState,
    ema200Weekly,
    confirmations,
    srLevels,
    magnets,
    calibration,

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