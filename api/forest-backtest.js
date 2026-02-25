// api/forest-backtest.js
import { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";

export const config = { runtime: "nodejs" };

function isNum(x){ return typeof x === "number" && Number.isFinite(x); }

function matchDirection(regime, ret) {
  if (!isNum(ret)) return null;
  if (regime === "BULL") return ret > 0;
  if (regime === "BEAR") return ret < 0;
  return null; // NEUTRAL niet scoren
}

export default async function handler(req, res) {
  try {
    const tf = String(req.query?.tf || "1d").toLowerCase();
    const hRaw = Number(req.query?.h || 30);
    const horizonBars = Number.isFinite(hRaw) ? Math.max(5, Math.min(hRaw, 180)) : 30;

    let candlesTruth, candlesWithLive, hasLive, intervalLabel;
    let weeklyTruthCandles = null;

    if (tf === "1w") {
      ({ candlesTruth, candlesWithLive, hasLive } = await getWeeklyBtcCandlesKraken());
      intervalLabel = "1w";
    } else {
      ({ candlesTruth, candlesWithLive, hasLive } = await getDailyBtcCandlesKraken());
      intervalLabel = "1d";
      const w = await getWeeklyBtcCandlesKraken();
      weeklyTruthCandles = w?.candlesTruth ?? null;
    }

    // We backtesten alleen op truth candles (dus gesloten candles)
    const c = candlesTruth;

    // loop door tijd: op elke i doen alsof “nu” = i, en kijken horizonBars later.
    const buckets = {
      high: { n: 0, win: 0 },
      mid:  { n: 0, win: 0 },
      low:  { n: 0, win: 0 }
    };

    let total = 0, totalWin = 0;

    // start pas als er genoeg data is
    const start = 260;
    const end = c.length - horizonBars - 1;

    for (let i = start; i <= end; i++) {
      const slice = c.slice(0, i + 1);

      const out = buildForestOverlay({
        candlesTruth: slice,
        candlesWithLive: slice,
        hasLive: false,
        tf: intervalLabel,
        horizonBars,
        weeklyTruthCandles
      });

      const now = out?.nowPoint;
      const reg = now?.regimeNow;
      const conf = now?.confidence;

      if (!reg || reg === "NEUTRAL") continue;
      if (!conf || !buckets[conf]) continue;

      const pNow = slice[i]?.close;
      const pFut = slice[i + horizonBars]?.close;
      if (!isNum(pNow) || !isNum(pFut)) continue;

      const ret = (pFut - pNow) / pNow;
      const ok = matchDirection(reg, ret);
      if (ok == null) continue;

      buckets[conf].n += 1;
      if (ok) buckets[conf].win += 1;

      total += 1;
      if (ok) totalWin += 1;
    }

    const summary = {
      tf: intervalLabel,
      horizonBars,
      total,
      totalWin,
      totalWinrate: total ? (totalWin / total) : null,
      byConfidence: Object.fromEntries(Object.entries(buckets).map(([k, v]) => {
        return [k, {
          n: v.n,
          win: v.win,
          winrate: v.n ? (v.win / v.n) : null
        }];
      }))
    };

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify(summary));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}