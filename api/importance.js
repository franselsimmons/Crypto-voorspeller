const kraken = require("./_lib/kraken");
const features = require("./_lib/features");
const regime = require("./_lib/regime");
const forest = require("./forest");
const logger = require("./_lib/logger");

const INTERVAL = 1440;

async function compute(regimeType) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 8 * 365 * 86400;
  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  const X = [];
  const y = [];
  const minLength = 260;

  for (let i = minLength; i < ohlc.length - 1; i++) {
    const slice = ohlc.slice(0, i + 1);
    const reg = regime.determineRegime(slice);
    if (reg !== regimeType) continue;

    try {
      const feat = features.buildFeatureArray(slice);
      const lr = Math.log(ohlc[i + 1].close / ohlc[i].close);
      X.push(feat);
      y.push(lr);
    } catch {}
  }

  if (X.length < 250) throw new Error(`Te weinig samples: ${X.length}`);

  const model = forest.trainRF(X, y);
  const imp = forest.permutationImportance(model, X, y);
  const names = features.getFeatureNames();

  logger.info(`--- Feature importance (${regimeType}) ---`);
  names.forEach((n, i) => logger.info(`${n}: ${imp[i].toFixed(6)}`));
}

(async () => {
  await compute("bear");
  await compute("bull");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});