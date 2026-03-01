/* EOF: /api/_lib/forestEngine.js */
const kraken = require("./kraken");
const features = require("./features");
const regime = require("./regime");
const logger = require("./logger");

// We proberen forest te laden vanaf meerdere plekken (zodat jij niet hoeft te gokken).
function loadForestModule() {
  const tries = [
    "../../forest",   // root/forest.js (bijv. /forest.js)
    "../forest",      // /api/forest.js (als forest.js in /api staat)
    "../../api/forest"// /api/forest.js (als forestEngine vanuit _lib komt)
  ];
  for (const p of tries) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(p);
    } catch {}
  }
  throw new Error(
    "Kan forest module niet vinden. Zet forest.js in /api/forest.js of /forest.js (root)."
  );
}

const forest = loadForestModule();

const INTERVAL = 1440; // 1D
const MIN_ABS_LOGRETURN = 0.003; // ~0.3% no-trade zone (tune met backtest)
const MIN_CONFIDENCE = 0.6;

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function stdev(arr) {
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

/**
 * Confidence via spreiding van tree predictions (als beschikbaar).
 * Werkt alleen als ml-random-forest de trees/estimators expose't.
 */
function predictWithConfidence(model, feat) {
  try {
    const trees = model?.estimators || model?.trees || null;

    // Fallback: geen trees -> geen sigma
    if (!Array.isArray(trees) || trees.length < 10) {
      const p = model.predict([feat])[0];
      return { pred: p, sigma: null, confidence: 0.5 };
    }

    const preds = trees
      .map((t) => {
        if (typeof t?.predict === "function") {
          const v = t.predict([feat])?.[0];
          return Number.isFinite(v) ? v : null;
        }
        return null;
      })
      .filter((x) => typeof x === "number" && Number.isFinite(x));

    if (preds.length < 10) {
      const p = model.predict([feat])[0];
      return { pred: p, sigma: null, confidence: 0.5 };
    }

    const p = mean(preds);
    const s = stdev(preds);

    // Simpel: hoe kleiner sigma, hoe hoger confidence
    // 0.02 is "ruis-band" voor logreturns (tune later met backtest)
    const confidence = Math.max(0, Math.min(1, 1 - s / 0.02));

    return { pred: p, sigma: s, confidence };
  } catch (e) {
    const p = model.predict([feat])[0];
    return { pred: p, sigma: null, confidence: 0.5 };
  }
}

async function predict() {
  const now = Math.floor(Date.now() / 1000);

  // 420 dagen: genoeg voor 200MA + indicators warm-up + features
  const from = now - 420 * 86400;

  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  if (!Array.isArray(ohlc) || ohlc.length < 260) {
    throw new Error(`Te weinig candles (${Array.isArray(ohlc) ? ohlc.length : 0})`);
  }

  const reg = regime.determineRegime(ohlc);

  // forest.loadModel(regime) moet bestaan in jouw forest.js
  const model = await forest.loadModel(reg);
  if (!model) throw new Error(`Geen model voor regime ${reg} (train eerst)`);

  const feat = features.buildFeatureArray(ohlc);

  const { pred: predictedLogReturn, sigma, confidence } = predictWithConfidence(model, feat);

  const currentPrice = ohlc[ohlc.length - 1].close;
  const predictedPrice = currentPrice * Math.exp(predictedLogReturn);

  // Trade decision: alleen als beweging groot genoeg is + confidence oké
  const shouldTrade =
    Math.abs(predictedLogReturn) >= MIN_ABS_LOGRETURN && confidence >= MIN_CONFIDENCE;

  // Interval: sigma (als we die hebben), anders vaste 2%
  // sigma is logreturn-schaal -> prijsfactor ~ exp(sigma)
  const width = sigma
    ? currentPrice * (Math.exp(Math.abs(sigma)) - 1)
    : predictedPrice * 0.02;

  const lower = Math.max(0, predictedPrice - width);
  const upper = predictedPrice + width;

  logger.info(
    `predict 1D reg=${reg} logRet=${predictedLogReturn.toFixed(6)} conf=${confidence.toFixed(2)} trade=${shouldTrade}`
  );

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