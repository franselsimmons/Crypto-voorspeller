const kraken = require("./kraken");
const features = require("./features");
const regime = require("./regime");
const forest = require("../forest");

const INTERVAL = 1440;

// “No-trade zone” drempel (log return). Startpunt, tune met backtest.
const MIN_ABS_LOGRETURN = 0.003; // ~0.3% beweging

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function stdev(arr) {
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

// We schatten confidence via spreiding van tree predictions (werkt goed in praktijk)
function predictWithConfidence(model, feat) {
  // ml-random-forest heeft intern trees; we gebruiken wat er beschikbaar is.
  // Fallback: normale predict (confidence=0.5)
  const trees = model?.estimators || model?.trees || null;
  if (!Array.isArray(trees) || trees.length < 10) {
    const p = model.predict([feat])[0];
    return { pred: p, sigma: null, confidence: 0.5 };
  }

  const preds = trees.map((t) => {
    // sommige implementaties: t.predict([feat])[0]
    if (typeof t.predict === "function") return t.predict([feat])[0];
    return null;
  }).filter((x) => typeof x === "number" && Number.isFinite(x));

  if (preds.length < 10) {
    const p = model.predict([feat])[0];
    return { pred: p, sigma: null, confidence: 0.5 };
  }

  const p = mean(preds);
  const s = stdev(preds);

  // Hoe kleiner sigma, hoe hoger confidence (simpel, effectief)
  // Je tuned dit later op basis van backtest.
  const confidence = Math.max(0, Math.min(1, 1 - (s / 0.02))); // 0.02 ~ 2% logreturn spreiding

  return { pred: p, sigma: s, confidence };
}

async function predict() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 420 * 86400; // ~420 dagen zodat 200MA + indicators altijd kunnen
  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  if (ohlc.length < 260) {
    throw new Error(`Te weinig candles (${ohlc.length})`);
  }

  const reg = regime.determineRegime(ohlc);
  const model = await forest.loadModel(reg);
  if (!model) throw new Error(`Geen model voor regime ${reg} (train eerst)`);

  const feat = features.buildFeatureArray(ohlc);
  const { pred: predictedLogReturn, sigma, confidence } = predictWithConfidence(model, feat);

  const currentPrice = ohlc[ohlc.length - 1].close;
  const predictedPrice = currentPrice * Math.exp(predictedLogReturn);

  // No-trade zone:
  const shouldTrade = Math.abs(predictedLogReturn) >= MIN_ABS_LOGRETURN && confidence >= 0.6;

  // interval: gebaseerd op sigma als die er is, anders 2%
  const width = sigma ? currentPrice * Math.exp(sigma) - currentPrice : predictedPrice * 0.02;
  const lower = Math.max(0, predictedPrice - Math.abs(width));
  const upper = predictedPrice + Math.abs(width);

  return {
    timeframe: "1D",
    regime: reg,
    currentPrice,
    predictedLogReturn,
    predictedPrice,
    interval: [lower, upper],
    sigma,
    confidence,
    shouldTrade
  };
}

module.exports = { predict };