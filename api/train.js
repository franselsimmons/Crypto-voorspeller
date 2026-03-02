/* EOF: /api/train.js */
const path = require("path");
const fs = require("fs");
const kraken = require("./_lib/kraken");
const features = require("./_lib/features");
const regime = require("./_lib/regime");
const forest = require("./forest");

const INTERVAL = 1440;
const MIN_TRAIN_SAMPLES = 50; // lager maken zodat hij niet faalt

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 5 * 365 * 86400; // 5 jaar

  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);

  if (!ohlc.length || ohlc.length < 300) {
    throw new Error("Te weinig candles voor training");
  }

  const bullX = [];
  const bullY = [];
  const bearX = [];
  const bearY = [];

  for (let i = 200; i < ohlc.length - 1; i++) {
    const slice = ohlc.slice(0, i + 1);
    const reg = regime.determineRegime(slice);

    try {
      const feat = features.buildFeatureArray(slice);

      const currentClose = ohlc[i].close;
      const nextClose = ohlc[i + 1].close;
      const logReturn = Math.log(nextClose / currentClose);

      if (reg === "bear") {
        bearX.push(feat);
        bearY.push(logReturn);
      } else {
        bullX.push(feat);
        bullY.push(logReturn);
      }
    } catch (e) {
      // skip
    }
  }

  console.log("Bull samples:", bullX.length);
  console.log("Bear samples:", bearX.length);

  // 🔥 BELANGRIJK: nooit meer crashen

  let bullModel;
  let bearModel;

  if (bullX.length >= MIN_TRAIN_SAMPLES) {
    bullModel = forest.trainRF(bullX, bullY);
  } else {
    console.log("⚠️ Te weinig bull samples, gebruik bear als fallback");
    bullModel = forest.trainRF(bearX, bearY);
  }

  if (bearX.length >= MIN_TRAIN_SAMPLES) {
    bearModel = forest.trainRF(bearX, bearY);
  } else {
    console.log("⚠️ Te weinig bear samples, gebruik bull als fallback");
    bearModel = forest.trainRF(bullX, bullY);
  }

  const modelsDir = path.join(process.cwd(), "models");
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir);
  }

  await forest.saveModel(bullModel, "bull");
  await forest.saveModel(bearModel, "bear");

  console.log("✅ Models opgeslagen");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});