// api/backtest.js
import { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken } from "./_lib/kraken.js";
import {
  kama, std, mad, atr, sma, obv, adxDi,
  percentileFromWindow, percentileRank, clamp
} from "./_lib/indicators.js";

export const config = { runtime: "nodejs" };

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }

// ---- zelfde adaptive zWin idee als forestEngine ----
function adaptiveZWinFromAtr(atrArr, idx) {
  const r = percentileRank(atrArr, idx, 520); // 0..1
  if (!isNum(r)) return 208;
  if (r >= 0.80) return 120;
  if (r >= 0.55) return 160;
  return 220;
}

// ---- core (zelfde als in forestEngine) ----
function computeCore(candles, { kamaEr = 10, kamaFast = 2, kamaSlow = 30, adxLen = 14, zWin = 208 } = {}) {
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

  const z = zStd.map((_, i) => (isNum(zRobust[i]) ? zRobust[i] : zStd[i]));

  const volSma = sma(vols, 20);
  const relVol = vols.map((v, i) => (isNum(volSma[i]) && volSma[i] !== 0) ? (v / volSma[i]) : null);

  const obvArr = obv(closes, vols);
  const di = adxDi(highs, lows, closes, adxLen);

  return { closes, highs, lows, vols, base, resid, a, z, relVol, obvArr, adxArr: di.adx, diPlusArr: di.diPlus, diMinusArr: di.diMinus };
}

function computeBands(zArr, atrArr, i, lookback = 208) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);

  const p20ATR = percentileFromWindow(atrWin, 20);
  const atrNow = atrArr[i];
  const freeze = (isNum(p20ATR) && isNum(atrNow)) ? (atrNow < p20ATR) : false;

  return { p35, p65, freeze };
}

function regimeFromZ(zNow, p35, p65) {
  if (!isNum(zNow) || !isNum(p35) || !isNum(p65)) return "NEUTRAL";
  if (zNow > p65) return "BULL";
  if (zNow < p35) return "BEAR";
  return "NEUTRAL";
}

function lastValidIndex(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) return i;
  return -1;
}

export default async function handler(req, res) {
  try {
    const tf = String(req.query?.tf || "1d").toLowerCase(); // "1d" of "1w"
    const yearsRaw = Number(req.query?.years || 2);
    const years = Number.isFinite(yearsRaw) ? Math.max(0.1, Math.min(yearsRaw, 5)) : 2;

    // per dag = horizon 1 bar (vast)
    const horizonBars = 1;

    let candlesTruth;
    let intervalLabel;
    let weeklyTruthCandles = null;

    if (tf === "1w") {
      ({ candlesTruth } = await getWeeklyBtcCandlesKraken());
      intervalLabel = "1w";
    } else {
      ({ candlesTruth } = await getDailyBtcCandlesKraken());
      intervalLabel = "1d";
      const w = await getWeeklyBtcCandlesKraken();
      weeklyTruthCandles = w?.candlesTruth ?? null;
    }

    if (!Array.isArray(candlesTruth) || candlesTruth.length < 50) {
      return res.status(500).json({ error: "Not enough candles for backtest" });
    }

    // ---- 1) bepaal zWinUsed zoals jouw engine nu doet (op laatste ATR) ----
    const t0 = computeCore(candlesTruth, { zWin: 208 });
    const idxBase = lastValidIndex(t0.base);
    const idx = idxBase >= 0 ? idxBase : lastValidIndex(t0.closes);

    const zWinUsed = idx >= 0 ? adaptiveZWinFromAtr(t0.a, idx) : 208;

    // ---- 2) recompute met zWinUsed (dit is “huidige filters” op het verleden) ----
    const t = computeCore(candlesTruth, { zWin: zWinUsed });

    const closes = t.closes;
    const n = closes.length;

    // “2 jaar” = 730 dagen (bij weekly: 104 weken)
    const barsBack = intervalLabel === "1d"
      ? Math.floor(365 * years)
      : Math.floor(52 * years);

    const start = Math.max(0, n - barsBack);
    const end = n - 1; // we need i+1, dus tot n-2 testen

    let used = 0, hit = 0;
    let bullUsed = 0, bullHit = 0;
    let bearUsed = 0, bearHit = 0;

    const mistakes = []; // klein lijstje, max 50

    for (let i = start; i < end; i++) {
      const zNow = t.z[i];
      if (!isNum(zNow)) continue;

      const { p35, p65, freeze } = computeBands(t.z, t.a, i, zWinUsed);

      let reg = regimeFromZ(zNow, p35, p65);

      // zelfde “trend check” idee (ADX) als je engine:
      const adxNow = t.adxArr[i];
      const trending = (isNum(adxNow) && adxNow >= 25);
      if (!trending && reg !== "NEUTRAL" && isNum(zNow)) {
        if (Math.abs(zNow) < 1.2) reg = "NEUTRAL";
      }

      if (reg === "NEUTRAL") continue;

      const c0 = closes[i];
      const c1 = closes[i + horizonBars];
      if (!isNum(c0) || !isNum(c1)) continue;

      const wentUp = c1 > c0;
      const predUp = (reg === "BULL");

      const ok = (wentUp === predUp);

      used++;
      if (ok) hit++;

      if (reg === "BULL") { bullUsed++; if (ok) bullHit++; }
      if (reg === "BEAR") { bearUsed++; if (ok) bearHit++; }

      if (!ok && mistakes.length < 50) {
        mistakes.push({
          time: candlesTruth[i].time,
          reg,
          z: Number(zNow.toFixed(2)),
          adx: isNum(adxNow) ? Number(adxNow.toFixed(2)) : null,
          diPlus: isNum(t.diPlusArr[i]) ? Number(t.diPlusArr[i].toFixed(2)) : null,
          diMinus: isNum(t.diMinusArr[i]) ? Number(t.diMinusArr[i].toFixed(2)) : null,
          freeze,
          close0: c0,
          close1: c1
        });
      }
    }

    const winrate = used ? (hit / used) : null;

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      tf: intervalLabel,
      years,
      horizonBars,          // 1 = per dag/per candle
      zWinUsed,
      totalCandles: n,
      signalsUsed: used,
      winrate,
      bull: { used: bullUsed, winrate: bullUsed ? (bullHit / bullUsed) : null },
      bear: { used: bearUsed, winrate: bearUsed ? (bearHit / bearUsed) : null },
      mistakes // max 50 voorbeelden waar hij fout zat
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}