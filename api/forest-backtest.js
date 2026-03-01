const kraken = require("./_lib/kraken");
const features = require("./_lib/features");
const regime = require("./_lib/regime");
const forest = require("./forest");
const logger = require("./_lib/logger");

const COST_PER_TRADE = 0.0016;
const INTERVAL = 1440;

// trade only bij duidelijke edge
const MIN_ABS_LOGRETURN = 0.003;

async function runBacktest(trainSize = 1000, testSize = 120) {
  logger.info("===== Backtest (Daily) =====");
  const now = Math.floor(Date.now() / 1000);
  const from = now - 10 * 365 * 86400;
  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  if (ohlc.length < trainSize + testSize * 2) {
    logger.error(`Te weinig data: ${ohlc.length}`);
    return;
  }

  let capital = 10000;
  const trades = [];
  const steps = Math.floor((ohlc.length - trainSize) / testSize);

  for (let step = 0; step < steps; step++) {
    const trainEnd = trainSize + step * testSize;
    const testStart = trainEnd;
    const testEnd = Math.min(testStart + testSize, ohlc.length);

    const trainData = ohlc.slice(0, trainEnd);
    const testData = ohlc.slice(testStart, testEnd);

    logger.info(`Step ${step + 1}/${steps} train=${trainEnd} test=[${testStart}..${testEnd})`);

    const bearX = [], bearY = [];
    const bullX = [], bullY = [];
    const minLength = 260;

    for (let i = minLength; i < trainData.length - 1; i++) {
      const slice = trainData.slice(0, i + 1);
      const reg = regime.determineRegime(slice);
      try {
        const feat = features.buildFeatureArray(slice);
        const lr = Math.log(trainData[i + 1].close / trainData[i].close);
        if (reg === "bear") { bearX.push(feat); bearY.push(lr); }
        else { bullX.push(feat); bullY.push(lr); }
      } catch {}
    }

    const bearModel = bearX.length >= 250 ? forest.trainRF(bearX, bearY) : null;
    const bullModel = bullX.length >= 250 ? forest.trainRF(bullX, bullY) : null;

    for (let i = 0; i < testData.length - 1; i++) {
      const slice = trainData.concat(testData.slice(0, i + 1));
      try {
        const feat = features.buildFeatureArray(slice);
        const reg = regime.determineRegime(slice);
        const model = reg === "bear" ? bearModel : bullModel;
        if (!model) continue;

        const predLR = model.predict([feat])[0];
        if (Math.abs(predLR) < MIN_ABS_LOGRETURN) continue; // no-trade zone

        const entry = testData[i].close;
        const exit = testData[i + 1].close;

        const dir = predLR > 0 ? "long" : "short";
        let pnlPct = 0;

        if (dir === "long") pnlPct = (exit / entry - 1) * 100;
        else pnlPct = (entry / exit - 1) * 100;

        pnlPct -= COST_PER_TRADE * 100 * 2;

        const pnlUsd = capital * (pnlPct / 100);
        capital += pnlUsd;

        const reasons = [];
        const rsi = feat[7];
        if (pnlPct <= 0) {
          if (rsi > 70) reasons.push("rsi>70");
          if (rsi < 30) reasons.push("rsi<30");
        }

        trades.push({
          time: testData[i + 1].time,
          regime: reg,
          dir,
          entry,
          exit,
          predLR,
          pnlPct,
          pnlUsd,
          capital,
          reasons: reasons.join(",")
        });
      } catch {}
    }
  }

  if (!trades.length) {
    logger.info("Geen trades (drempel te streng?).");
    return;
  }

  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);

  const winRate = (wins.length / trades.length) * 100;
  const grossProfit = wins.reduce((s, t) => s + t.pnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;

  let peak = 10000, maxDD = 0;
  for (const t of trades) {
    if (t.capital > peak) peak = t.capital;
    const dd = ((peak - t.capital) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  logger.info("===== RESULT =====");
  logger.info(`Trades: ${trades.length}`);
  logger.info(`Winrate: ${winRate.toFixed(2)}%`);
  logger.info(`ProfitFactor: ${profitFactor.toFixed(2)}`);
  logger.info(`EndCapital: $${trades[trades.length - 1].capital.toFixed(2)}`);
  logger.info(`MaxDD: ${maxDD.toFixed(2)}%`);
}

module.exports = { runBacktest };