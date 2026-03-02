// api/backtest-json.js

const fs = require("fs");
const path = require("path");
const kraken = require("./_lib/kraken");
const features = require("./_lib/features");
const regime = require("./_lib/regime");
const forest = require("./forest");

const INTERVAL = 1440;
const TEST_DAYS = 365;
const MIN_ABS_LOGRETURN = 0.003; // filter voor hogere accuracy

function sign(x) {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 5 * 365 * 86400;

  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);
  if (!ohlc || ohlc.length < 400) {
    throw new Error("Te weinig candles voor backtest");
  }

  const modelBear = await forest.loadModel("bear");
  const modelBull = await forest.loadModel("bull");

  if (!modelBear || !modelBull) {
    throw new Error("Models ontbreken. Train eerst.");
  }

  const end = ohlc.length - 1;
  const start = Math.max(260, end - TEST_DAYS);

  let total = 0;
  let correct = 0;
  let filteredTotal = 0;
  let filteredCorrect = 0;

  for (let i = start; i < end; i++) {
    const slice = ohlc.slice(0, i + 1);

    let feat;
    try {
      feat = features.buildFeatureArray(slice);
    } catch {
      continue;
    }

    const reg = regime.determineRegime(slice);
    const model = reg === "bear" ? modelBear : modelBull;

    const pred = model.predict([feat])[0];
    const actual = Math.log(
      ohlc[i + 1].close / ohlc[i].close
    );

    const isCorrect = sign(pred) === sign(actual);

    total++;
    if (isCorrect) correct++;

    if (Math.abs(pred) >= MIN_ABS_LOGRETURN) {
      filteredTotal++;
      if (isCorrect) filteredCorrect++;
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    timeframe: "1D",
    periodDays: TEST_DAYS,
    allSignals: {
      total,
      correct,
      accuracyPct: total ? Number(((correct / total) * 100).toFixed(2)) : 0
    },
    filteredSignals: {
      total: filteredTotal,
      correct: filteredCorrect,
      accuracyPct: filteredTotal
        ? Number(((filteredCorrect / filteredTotal) * 100).toFixed(2))
        : 0
    }
  };

  const publicDir = path.join(process.cwd(), "public");
  fs.mkdirSync(publicDir, { recursive: true });

  const outPath = path.join(publicDir, "backtest.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log("Backtest succesvol geschreven:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});