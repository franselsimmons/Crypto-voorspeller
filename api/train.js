const kraken = require("./_lib/kraken");
const features = require("./_lib/features");
const regime = require("./_lib/regime");
const forest = require("./forest");
const logger = require("./_lib/logger");

const INTERVAL = 1440;

async function trainFor(regimeType) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 8 * 365 * 86400; // 8 jaar data als het kan
  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  const X = [];
  const y = [];

  // warm-up
  const minLength = 260;

  for (let i = minLength; i < ohlc.length - 1; i++) {
    const slice = ohlc.slice(0, i + 1);
    const reg = regime.determineRegime(slice);
    if (reg !== regimeType) continue;

    try {
      const feat = features.buildFeatureArray(slice);
      const c0 = ohlc[i].close;
      const c1 = ohlc[i + 1].close;
      const lr = Math.log(c1 / c0);
      X.push(feat);
      y.push(lr);
    } catch {
      // skip
    }
  }

  if (X.length < 250) {
    throw new Error(`Te weinig training samples voor ${regimeType}: ${X.length}`);
  }

  logger.info(`Train ${regimeType}: samples=${X.length}`);
  const model = forest.trainRF(X, y);
  await forest.saveModel(model, regimeType);
}

async function main() {
  await trainFor("bear");
  await trainFor("bull");
  logger.info("Training klaar. Commit nu models/*.json naar GitHub.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});