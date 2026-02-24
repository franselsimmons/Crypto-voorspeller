// api/forest-backtest.js
import { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";
import { fetchBtcFundingBias, buildSyntheticLiqLevels } from "./_lib/derivs.js";

export const config = { runtime: "nodejs" };

function isNum(x){ return typeof x === "number" && Number.isFinite(x); }

export default async function handler(req, res) {
  try {
    const tf = String(req.query?.tf || "1d").toLowerCase();
    const horizon = Math.max(1, Math.min(Number(req.query?.h || 30), 180));

    let candlesTruth, intervalLabel;
    let weeklyTruthCandles = null;

    if (tf === "1w") {
      const w = await getWeeklyBtcCandlesKraken();
      candlesTruth = w.candlesTruth;
      intervalLabel = "1w";
    } else {
      const d = await getDailyBtcCandlesKraken();
      candlesTruth = d.candlesTruth;
      intervalLabel = "1d";

      const w = await getWeeklyBtcCandlesKraken();
      weeklyTruthCandles = w.candlesTruth;
    }

    // funding/liq gebruiken we in backtest als “constant snapshot”.
    // (Echte walk-forward funding/liq per dag is een volgende stap.)
    const funding = await fetchBtcFundingBias();
    const liqLevels = buildSyntheticLiqLevels(candlesTruth, { lookback: 220, bins: 64, topN: 12 });

    const buckets = {
      high: { n: 0, win: 0 },
      mid:  { n: 0, win: 0 },
      low:  { n: 0, win: 0 }
    };

    let total = 0;
    let used = 0;

    // loop over history: op elke i maken we “alsof i nu is”
    for (let i = 260; i < candlesTruth.length - horizon; i++) {
      total++;

      const slice = candlesTruth.slice(0, i + 1);

      const out = buildForestOverlay({
        candlesTruth: slice,
        candlesWithLive: slice,
        hasLive: false,
        tf: intervalLabel,
        horizonBars: horizon,
        weeklyTruthCandles,
        funding,
        liqLevels
      });

      const now = out.nowPoint;
      const reg = now?.regimeNow;
      const conf = now?.confidence;

      if (!conf || !buckets[conf]) continue;
      if (reg !== "BULL" && reg !== "BEAR") continue; // we “testen” alleen duidelijke regimes

      const entry = slice[slice.length - 1]?.close;
      const future = candlesTruth[i + horizon]?.close;
      if (!isNum(entry) || !isNum(future)) continue;

      const ret = (future - entry) / entry;
      const win = (reg === "BULL") ? (ret > 0) : (ret < 0);

      buckets[conf].n++;
      if (win) buckets[conf].win++;

      used++;
    }

    const result = {};
    for (const k of Object.keys(buckets)) {
      const b = buckets[k];
      result[k] = {
        n: b.n,
        win: b.win,
        winrate: b.n ? (b.win / b.n) : null
      };
    }

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      interval: intervalLabel,
      horizonBars: horizon,
      totalBarsChecked: total,
      signalsUsed: used,
      buckets: result,
      note: "Dit is een simpele calibratie (directioneel). Volgende stap: echte walk-forward funding/liq per bar."
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}