/* EOF: /api/_lib/forestEngine.js */
const ti = require("technicalindicators");
const kraken = require("./kraken");
const features = require("./features");
const regime = require("./regime");
const forest = require("../forest"); // als jouw forest.js elders staat: pas dit pad aan
const logger = require("./logger");

const INTERVAL = 1440; // 1D

// Strenge filters (tune later)
const MIN_ABS_LOGRETURN = 0.0025; // ~0.25% -> anders NEUTRAL
const MIN_CONFIDENCE = 0.60;      // onder dit -> NEUTRAL

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

// Tree-spreiding => confidence (fallback als library geen trees expose)
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
  const confidence = clamp(1 - (s / 0.02), 0, 1); // 0.02 ~ 2% log-return spreiding
  return { pred: p, sigma: s, confidence };
}

// Trend flags die we voor "trend-only" nodig hebben
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

async function predict() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 520 * 86400; // ~520 dagen

  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);
  if (!Array.isArray(ohlc) || ohlc.length < 260) {
    throw new Error(`Te weinig candles (${Array.isArray(ohlc) ? ohlc.length : 0})`);
  }

  // Regime + trend state
  const reg = regime.determineRegime(ohlc); // bull/bear
  const trend = getTrendState(ohlc);

  // Modellen laden (bear/bull)
  const bullModel = await forest.loadModel("bull");
  const bearModel = await forest.loadModel("bear");
  const chosenModel = (reg === "bull" ? bullModel : bearModel) || bullModel || bearModel;

  if (!chosenModel) {
    throw new Error("Geen model beschikbaar (train offline en commit models/ in GitHub)");
  }

  // Features + prediction
  const feat = features.buildFeatureArray(ohlc);
  const { pred: predictedLogReturn, sigma, confidence } = predictWithConfidence(chosenModel, feat);

  const currentPrice = ohlc[ohlc.length - 1].close;
  const predictedPrice = currentPrice * Math.exp(predictedLogReturn);
  const movePct = (Math.exp(predictedLogReturn) - 1) * 100;

  // ==========================
  // TREND-ONLY DECISION (SUPER STRENG)
  // ==========================
  // Alleen BULL als:
  // - trend sterk (ADX>=25)
  // - prijs boven SMA200
  // - regime bull
  // - ML voorspelt > 0
  //
  // Alleen BEAR als:
  // - trend sterk
  // - prijs onder SMA200
  // - regime bear
  // - ML voorspelt < 0
  //
  // Anders: NEUTRAL
  const tooSmallMove = Math.abs(predictedLogReturn) < MIN_ABS_LOGRETURN;
  const lowConf = confidence < MIN_CONFIDENCE;

  let bias = "NEUTRAL";
  let reason = "neutral";

  if (!tooSmallMove && !lowConf && trend.isTrending) {
    const mlUp = predictedLogReturn > 0;
    const mlDown = predictedLogReturn < 0;

    if (reg === "bull" && trend.aboveSma200 && mlUp) {
      bias = "BULL";
      reason = "trend-only bull confirmed";
    } else if (reg === "bear" && !trend.aboveSma200 && mlDown) {
      bias = "BEAR";
      reason = "trend-only bear confirmed";
    } else {
      bias = "NEUTRAL";
      reason = "trend-only not aligned";
    }
  } else {
    bias = "NEUTRAL";
    reason = tooSmallMove ? "move too small" : lowConf ? "confidence too low" : "not trending";
  }

  // interval band (sigma als die er is)
  const widthPct = sigma ? (Math.exp(Math.abs(sigma)) - 1) * 100 : 2;
  const lower = predictedPrice * (1 - widthPct / 100);
  const upper = predictedPrice * (1 + widthPct / 100);

  return {
    timeframe: "1D",

    // trend + regime
    regime: reg,
    sma200: trend.sma200,
    adx14: trend.adx,
    isTrending: trend.isTrending,

    // ML
    predictedLogReturn,
    predictedPrice,
    currentPrice,
    movePct,

    sigma,
    confidence,
    interval: [lower, upper],

    // indicator output
    bias,    // BULL / BEAR / NEUTRAL
    reason,  // uitleg waarom
    modelUsed: chosenModel === bullModel ? "bull" : "bear"
  };
}

module.exports = { predict };