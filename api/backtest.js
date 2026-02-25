// api/backtest.js
import { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken } from "./_lib/kraken.js";
import {
  kama, std, mad, atr, sma, obv,
  adxDi,
  percentileFromWindow, percentileRank, clamp
} from "./_lib/indicators.js";

export const config = { runtime: "nodejs" };

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }

function toInt(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}
function toFloat(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function toBool(v) {
  return String(v || "0") === "1";
}

// ------------------------------
// Adaptive zWin: ATR-percentile => zWinUsed
// ------------------------------
function adaptiveZWinFromAtr(atrArr, idx) {
  const r = percentileRank(atrArr, idx, 520); // 0..1
  if (!isNum(r)) return 208;
  if (r >= 0.80) return 120;
  if (r >= 0.55) return 160;
  return 220;
}

function computeCore(candles, {
  kamaEr = 10, kamaFast = 2, kamaSlow = 30,
  adxLen = 14,
  zWin = 208
} = {}) {
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
  return {
    closes, highs, lows, vols,
    base, resid, a,
    z, relVol, obvArr,
    adxArr: di.adx,
    diPlusArr: di.diPlus,
    diMinusArr: di.diMinus
  };
}

function computeBands(zArr, atrArr, i, lookback = 208) {
  const zWin = zArr.slice(Math.max(0, i - lookback + 1), i + 1);
  const atrWin = atrArr.slice(Math.max(0, i - lookback + 1), i + 1);

  const p35 = percentileFromWindow(zWin, 35);
  const p65 = percentileFromWindow(zWin, 65);

  const p20ATR = percentileFromWindow(atrWin, 20);
  const atrNow = atrArr[i];

  const freeze = (isNum(p20ATR) && isNum(atrNow)) ? (atrNow < p20ATR) : false;
  return { bandsNow: { p35, p65, p20ATR }, freezeNow: freeze };
}

function regimeFromZ(zNow, bandsNow) {
  const { p35, p65 } = bandsNow || {};
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
    const tf = String(req.query?.tf || "1d").toLowerCase();
    const years = clamp(toInt(req.query?.years, 2), 1, 8);

    // horizonBars (jij wil per dag, dus default 1)
    const horizonBars = clamp(toInt(req.query?.horizonBars, 1), 1, 14);

    // ---- nieuwe filters (defaults = “strakker”) ----
    const minAdx = toFloat(req.query?.minAdx, 25);        // alleen trend
    const minAbsZ = toFloat(req.query?.minAbsZ, 1.5);     // alleen sterke z
    const noFreeze = toBool(req.query?.noFreeze || "1");  // default: freeze = NIET meetellen
    const requireDi = toBool(req.query?.requireDi || "1");// default: DI bevestiging verplicht

    // candles
    let candlesTruth, intervalLabel;
    if (tf === "1w") {
      ({ candlesTruth } = await getWeeklyBtcCandlesKraken());
      intervalLabel = "1w";
    } else {
      ({ candlesTruth } = await getDailyBtcCandlesKraken());
      intervalLabel = "1d";
    }

    const n = candlesTruth.length;
    if (n < 200) {
      res.status(400).json({ error: "Not enough candles for backtest" });
      return;
    }

    // hoeveel candles terug (ongeveer)
    const barsPerYear = (intervalLabel === "1w") ? 52 : 360;
    const want = years * barsPerYear;
    const startIdx = Math.max(0, n - want);

    // 1) bepaal zWinUsed zoals je “nu” ook doet (op laatste index)
    const t0 = computeCore(candlesTruth, { zWin: 208 });
    const lastIdxBase = lastValidIndex(t0.base);
    const idxForZWin = lastIdxBase >= 0 ? lastIdxBase : lastValidIndex(t0.closes);
    const zWinUsed = idxForZWin >= 0 ? adaptiveZWinFromAtr(t0.a, idxForZWin) : 208;

    // 2) core met vaste zWinUsed (dit is: “huidige filters op verleden”)
    const t = computeCore(candlesTruth, { zWin: zWinUsed });

    // stats
    let totalSignalsRaw = 0;
    let winsRaw = 0;

    let totalSignalsFiltered = 0;
    let winsFiltered = 0;

    let bullRawUsed = 0, bullRawWins = 0;
    let bearRawUsed = 0, bearRawWins = 0;

    let bullUsed = 0, bullWins = 0;
    let bearUsed = 0, bearWins = 0;

    const mistakes = [];
    const mistakesMax = 60;

    // loop door test-range, maar zorg dat i+horizonBars bestaat
    const endIdx = n - 1 - horizonBars;

    for (let i = startIdx; i <= endIdx; i++) {
      const zNow = t.z[i];
      const adxNow = t.adxArr[i];
      const diPlusNow = t.diPlusArr[i];
      const diMinusNow = t.diMinusArr[i];

      if (!isNum(zNow)) continue;

      const { bandsNow, freezeNow } = computeBands(t.z, t.a, i, zWinUsed);
      let reg = regimeFromZ(zNow, bandsNow);

      // zelfde trend/range sanity als forestEngine
      const trending = (isNum(adxNow) && adxNow >= 25);
      if (!trending && reg !== "NEUTRAL" && isNum(zNow)) {
        if (Math.abs(zNow) < 1.2) reg = "NEUTRAL";
      }

      if (reg === "NEUTRAL") continue;

      const close0 = candlesTruth[i].close;
      const close1 = candlesTruth[i + horizonBars].close;
      if (!isNum(close0) || !isNum(close1)) continue;

      // win check (per dag / per horizon)
      const win =
        (reg === "BULL" && close1 > close0) ||
        (reg === "BEAR" && close1 < close0);

      // ---- RAW (zoals jouw oude) ----
      totalSignalsRaw++;
      if (reg === "BULL") { bullRawUsed++; if (win) bullRawWins++; }
      if (reg === "BEAR") { bearRawUsed++; if (win) bearRawWins++; }
      if (win) winsRaw++;

      // ---- FILTERED (wat jij echt wil) ----
      let ok = true;

      if (noFreeze && freezeNow) ok = false;
      if (ok && isNum(adxNow) && adxNow < minAdx) ok = false;
      if (ok && Math.abs(zNow) < minAbsZ) ok = false;

      if (ok && requireDi && isNum(diPlusNow) && isNum(diMinusNow)) {
        if (reg === "BULL" && !(diPlusNow > diMinusNow)) ok = false;
        if (reg === "BEAR" && !(diMinusNow > diPlusNow)) ok = false;
      }

      if (ok) {
        totalSignalsFiltered++;
        if (reg === "BULL") { bullUsed++; if (win) bullWins++; }
        if (reg === "BEAR") { bearUsed++; if (win) bearWins++; }
        if (win) winsFiltered++;
      } else {
        // bewaar “waarom fout/ruis” sample (ook handig om te tunen)
        if (mistakes.length < mistakesMax) {
          mistakes.push({
            time: candlesTruth[i].time,
            reg,
            z: isNum(zNow) ? Number(zNow.toFixed(2)) : null,
            adx: isNum(adxNow) ? Number(adxNow.toFixed(2)) : null,
            diPlus: isNum(diPlusNow) ? Number(diPlusNow.toFixed(2)) : null,
            diMinus: isNum(diMinusNow) ? Number(diMinusNow.toFixed(2)) : null,
            freeze: !!freezeNow,
            close0,
            close1
          });
        }
      }
    }

    const winrateRaw = totalSignalsRaw ? (winsRaw / totalSignalsRaw) : null;
    const winrateFiltered = totalSignalsFiltered ? (winsFiltered / totalSignalsFiltered) : null;

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      tf: intervalLabel,
      years,
      horizonBars,
      zWinUsed,
      totalCandles: n,
      range: { startIdx, endIdx },

      // filters used
      filters: {
        minAdx,
        minAbsZ,
        noFreeze,
        requireDi
      },

      // RAW
      raw: {
        signalsUsed: totalSignalsRaw,
        winrate: winrateRaw,
        bull: { used: bullRawUsed, winrate: bullRawUsed ? (bullRawWins / bullRawUsed) : null },
        bear: { used: bearRawUsed, winrate: bearRawUsed ? (bearRawWins / bearRawUsed) : null }
      },

      // FILTERED
      filtered: {
        signalsUsed: totalSignalsFiltered,
        winrate: winrateFiltered,
        bull: { used: bullUsed, winrate: bullUsed ? (bullWins / bullUsed) : null },
        bear: { used: bearUsed, winrate: bearUsed ? (bearWins / bearUsed) : null }
      },

      // “gevallen die we hebben weggefilterd” (super handig voor tuning)
      filteredOutSamples: mistakes
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}