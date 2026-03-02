/* EOF: /api/forest-backtest.js */
const ti = require("technicalindicators");
const kraken = require("./_lib/kraken");
const features = require("./_lib/features");
const regime = require("./_lib/regime");
const forest = require("./forest");
const logger = require("./_lib/logger");

const INTERVAL = 1440;

// zelfde drempels als engine
const MIN_ABS_LOGRETURN = 0.0025;
const MIN_CONFIDENCE = 0.60;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}
function stdev(arr) {
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}
function predictWithConfidence(model, feat) {
  const trees = model?.estimators || model?.trees || null;
  if (!Array.isArray(trees) || trees.length < 10) {
    const p = model.predict([feat])[0];
    return { pred: p, sigma: null, confidence: 0.55 };
  }

  const preds = trees
    .map((t) => (typeof t.predict === "function" ? t.predict([feat])[0] : null))
    .filter((x) => typeof x === "number" && Number.isFinite(x));

  if (preds.length < 10) {
    const p = model.predict([feat])[0];
    return { pred: p, sigma: null, confidence: 0.55 };
  }

  const p = mean(preds);
  const s = stdev(preds);
  const confidence = clamp(1 - (s / 0.02), 0, 1);
  return { pred: p, sigma: s, confidence };
}

function getTrendState(ohlc) {
  if (!Array.isArray(ohlc) || ohlc.length < 220) {
    return { lastClose: null, sma200: null, adx: null, isTrending: false, aboveSma200: false };
  }

  const closes = ohlc.map((c) => c.close);
  const high = ohlc.map((c) => c.high);
  const low = ohlc.map((c) => c.low);

  const lastClose = closes[closes.length - 1];
  const sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
  const aboveSma200 = lastClose >= sma200;

  const adxArr = ti.ADX.calculate({ high, low, close: closes, period: 14 });
  const lastADX = adxArr.length ? adxArr[adxArr.length - 1].adx : 0;
  const isTrending = lastADX >= 25;

  return { lastClose, sma200, adx: lastADX, isTrending, aboveSma200 };
}

// exact dezelfde trend-only bias beslissing
function decideBias({ reg, trend, predictedLogReturn, confidence }) {
  const tooSmallMove = Math.abs(predictedLogReturn) < MIN_ABS_LOGRETURN;
  const lowConf = confidence < MIN_CONFIDENCE;

  if (tooSmallMove) return { bias: "NEUTRAL", reason: "move too small" };
  if (lowConf) return { bias: "NEUTRAL", reason: "confidence too low" };
  if (!trend.isTrending) return { bias: "NEUTRAL", reason: "not trending" };

  const mlUp = predictedLogReturn > 0;
  const mlDown = predictedLogReturn < 0;

  if (reg === "bull" && trend.aboveSma200 && mlUp) return { bias: "BULL", reason: "trend-only bull confirmed" };
  if (reg === "bear" && !trend.aboveSma200 && mlDown) return { bias: "BEAR", reason: "trend-only bear confirmed" };

  return { bias: "NEUTRAL", reason: "trend-only not aligned" };
}

async function runBacktest() {
  // we backtesten met dezelfde dataflow als live (Kraken public)
  const now = Math.floor(Date.now() / 1000);
  const from = now - 6 * 365 * 86400; // 6 jaar halen is meestal genoeg (200MA + ruimte)
  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  if (!Array.isArray(ohlc) || ohlc.length < 600) {
    throw new Error(`Te weinig candles voor backtest (${Array.isArray(ohlc) ? ohlc.length : 0})`);
  }

  // modellen moeten bestaan (offline getraind + aanwezig in repo)
  const bullModel = await forest.loadModel("bull");
  const bearModel = await forest.loadModel("bear");
  if (!bullModel && !bearModel) {
    throw new Error("Geen modellen gevonden. Train offline en commit models/ naar GitHub.");
  }

  let signals = 0;
  let correct = 0;

  let bullSignals = 0, bullCorrect = 0;
  let bearSignals = 0, bearCorrect = 0;

  let neutrals = 0;

  // loop per dag: gebruik slice tot dag i als “context”, voorspel dag i->i+1
  // start pas als warmup echt ok is
  const startAt = 260;

  for (let i = startAt; i < ohlc.length - 1; i++) {
    const slice = ohlc.slice(0, i + 1);
    const reg = regime.determineRegime(slice);
    const trend = getTrendState(slice);

    let model = reg === "bull" ? bullModel : bearModel;
    if (!model) model = bullModel || bearModel;
    if (!model) continue;

    let feat;
    try {
      feat = features.buildFeatureArray(slice);
    } catch {
      continue;
    }

    const { pred: predictedLogReturn, confidence } = predictWithConfidence(model, feat);

    const d = decideBias({ reg, trend, predictedLogReturn, confidence });
    if (d.bias === "NEUTRAL") {
      neutrals++;
      continue;
    }

    // we hebben een “bias-signaal”
    signals++;

    const today = ohlc[i].close;
    const tomorrow = ohlc[i + 1].close;
    const realUp = tomorrow > today;

    const isCorrect =
      (d.bias === "BULL" && realUp) ||
      (d.bias === "BEAR" && !realUp);

    if (isCorrect) correct++;

    if (d.bias === "BULL") {
      bullSignals++;
      if (isCorrect) bullCorrect++;
    } else if (d.bias === "BEAR") {
      bearSignals++;
      if (isCorrect) bearCorrect++;
    }
  }

  const totalDays = (ohlc.length - 1) - startAt;
  const neutralRate = totalDays > 0 ? (neutrals / totalDays) * 100 : 0;
  const hitRate = signals > 0 ? (correct / signals) * 100 : 0;

  const bullHit = bullSignals > 0 ? (bullCorrect / bullSignals) * 100 : 0;
  const bearHit = bearSignals > 0 ? (bearCorrect / bearSignals) * 100 : 0;

  logger.info("========== BACKTEST (TREND-ONLY) ==========");
  logger.info(`Dagen getest: ${totalDays}`);
  logger.info(`NEUTRAL dagen: ${neutrals} (${neutralRate.toFixed(1)}%)`);
  logger.info(`Signals: ${signals}`);
  logger.info(`Hit-rate totaal: ${hitRate.toFixed(2)}%`);

  logger.info(`BULL signals: ${bullSignals}, hit: ${bullHit.toFixed(2)}%`);
  logger.info(`BEAR signals: ${bearSignals}, hit: ${bearHit.toFixed(2)}%`);

  // Jip-en-Janneke interpretatie:
  // - Als neutralRate hoog is => hij is streng (goed voor betrouwbaarheid)
  // - Als hitRate > ~60% => sterke bias-filter
  // - Als hitRate ~52-56% => oké maar nog tunen (drempels / features)
}

module.exports = { runBacktest };