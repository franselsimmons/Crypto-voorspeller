/* EOF: /api/forest-backtest.js
   Vercel API route: snelle direction-winrate backtest (1D)
   Meet: klopt de richting van de voorspelling voor "volgende dag"?
*/

const kraken = require("./_lib/kraken");
const features = require("./_lib/features");
const regime = require("./_lib/regime");
const forest = require("./forest");
const logger = require("./_lib/logger");

const INTERVAL = 1440;

// helper
function pct(a, b) {
  return b === 0 ? 0 : (a / b) * 100;
}

async function runDirectionBacktest({
  days = 365,
  warmupDays = 260, // genoeg voor indicators + 200MA + feature lookback
  thresholds = [0, 0.0015, 0.003, 0.005] // logreturn drempels (filter op "sterke" signalen)
} = {}) {
  const now = Math.floor(Date.now() / 1000);

  // we hebben warmup + test + 1 nodig (voor next-day actual)
  const totalNeeded = warmupDays + days + 1;

  // haal iets ruimer op (Kraken max 720 candles per call)
  const from = now - (totalNeeded + 10) * 86400;

  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  if (!Array.isArray(ohlc) || ohlc.length < totalNeeded) {
    throw new Error(`Te weinig candles (${Array.isArray(ohlc) ? ohlc.length : 0}), nodig ~${totalNeeded}`);
  }

  // pak alleen de laatste totalNeeded candles
  const data = ohlc.slice(-totalNeeded);

  // models 1x laden
  const bullModel = await forest.loadModel("bull");
  const bearModel = await forest.loadModel("bear");
  if (!bullModel || !bearModel) {
    throw new Error("Models ontbreken. Train via GitHub Action zodat /models/rf_bull.json en /models/rf_bear.json bestaan.");
  }

  // stats per threshold
  const stats = {};
  for (const th of thresholds) {
    stats[th] = {
      total: 0,
      correct: 0,
      bull: { total: 0, correct: 0 },
      bear: { total: 0, correct: 0 }
    };
  }

  // loop over testperiode
  // i is "vandaag index" binnen data, we voorspellen close(i+1) vs close(i)
  for (let i = warmupDays; i < warmupDays + days; i++) {
    const slice = data.slice(0, i + 1); // alles tot vandaag
    const reg = regime.determineRegime(slice);
    const model = reg === "bear" ? bearModel : bullModel;

    let feat;
    try {
      feat = features.buildFeatureArray(slice);
    } catch {
      continue;
    }

    const predLog = model.predict([feat])[0];
    const actualLog = Math.log(data[i + 1].close / data[i].close);

    const predDir = predLog > 0 ? 1 : -1;
    const actualDir = actualLog > 0 ? 1 : -1;
    const isCorrect = predDir === actualDir;

    for (const th of thresholds) {
      if (Math.abs(predLog) < th) continue; // filter: “te klein signaal”
      stats[th].total++;
      if (isCorrect) stats[th].correct++;

      stats[th][reg].total++;
      if (isCorrect) stats[th][reg].correct++;
    }
  }

  // bouw response
  const startTs = data[warmupDays].time;
  const endTs = data[warmupDays + days].time;

  const report = {
    timeframe: "1D",
    daysTested: days,
    start: new Date(startTs * 1000).toISOString(),
    end: new Date(endTs * 1000).toISOString(),
    thresholds: thresholds.map((th) => ({
      minAbsPredictedLogReturn: th,
      totalSignals: stats[th].total,
      winRate: pct(stats[th].correct, stats[th].total).toFixed(2) + "%",
      bull: {
        total: stats[th].bull.total,
        winRate: pct(stats[th].bull.correct, stats[th].bull.total).toFixed(2) + "%"
      },
      bear: {
        total: stats[th].bear.total,
        winRate: pct(stats[th].bear.correct, stats[th].bear.total).toFixed(2) + "%"
      }
    }))
  };

  return report;
}

// ✅ Vercel API handler
module.exports = async (req, res) => {
  try {
    // alleen GET
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Use GET" });
    }

    const days = Math.max(60, Math.min(900, Number(req.query.days || 365)));
    const warmupDays = Math.max(220, Math.min(500, Number(req.query.warmup || 260)));

    logger.info(`Backtest API: days=${days}, warmup=${warmupDays}`);

    const report = await runDirectionBacktest({ days, warmupDays });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(report);
  } catch (err) {
    const msg = err?.message || String(err);
    logger.error(`Backtest API failed: ${msg}`);
    return res.status(500).json({ error: "Backtest failed", detail: msg });
  }
};