/* EOF: /api/_lib/forestEngine.js */
const kraken = require("./kraken");
const features = require("./features");
const regime = require("./regime");
const forest = require("../forest"); // ✅ /api/forest.js
const logger = require("./logger");

const INTERVAL = 1440;

async function predict() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 420 * 86400; // ~420 dagen

  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  if (!Array.isArray(ohlc) || ohlc.length < 260) {
    throw new Error(`Te weinig candles (${Array.isArray(ohlc) ? ohlc.length : 0})`);
  }

  const reg = regime.determineRegime(ohlc);

  // ✅ Als 1 van de 2 modellen ontbreekt: fallback naar bull (dan heb je altijd prediction)
  let model = await forest.loadModel(reg);
  if (!model) {
    logger.warn(`Model ontbreekt voor ${reg}, fallback naar bull`);
    model = await forest.loadModel("bull");
  }
  if (!model) throw new Error("Geen models gevonden (run train workflow)");

  const feat = features.buildFeatureArray(ohlc);
  const predictedLogReturn = model.predict([feat])[0];

  const currentPrice = ohlc[ohlc.length - 1].close;
  const predictedPrice = currentPrice * Math.exp(predictedLogReturn);

  return {
    timeframe: "1D",
    regime: reg,
    currentPrice,
    predictedLogReturn,
    predictedPrice
  };
}

module.exports = { predict };