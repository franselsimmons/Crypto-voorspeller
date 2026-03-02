// /api/forest-backtest-cli.js
const fs = require("fs");
const path = require("path");

const kraken = require("./_lib/kraken");
const features = require("./_lib/features");
const regime = require("./_lib/regime");
const forest = require("./forest");

const INTERVAL = 1440;

// Jij gebruikt dit als indicator (bull/bear + richting). Dus meten we:
// “Had het model de richting van morgen goed?” = direction winrate.
function sign(x) {
  if (!Number.isFinite(x) || x === 0) return 0;
  return x > 0 ? 1 : -1;
}

async function run() {
  const now = Math.floor(Date.now() / 1000);

  // Hou het haalbaar voor GitHub Actions: laatste ~3 jaar
  const from = now - 3 * 365 * 86400;

  const ohlc = await kraken.getOHLCRange("XBTUSD", INTERVAL, from, now);
  if (!Array.isArray(ohlc) || ohlc.length < 600) {
    throw new Error(`Te weinig candles (${Array.isArray(ohlc) ? ohlc.length : 0})`);
  }

  // Walk-forward settings (redelijk snel + realistisch)
  const trainSize = 420; // ~14 maanden
  const testSize = 60;   // ~2 maanden per stap
  const minLength = 260; // genoeg voor indicators

  const steps = Math.floor((ohlc.length - trainSize) / testSize);
  if (steps < 3) throw new Error(`Te weinig stappen (${steps})`);

  let total = 0;
  let correct = 0;

  let byRegime = {
    bull: { total: 0, correct: 0 },
    bear: { total: 0, correct: 0 }
  };

  for (let step = 0; step < steps; step++) {
    const trainEnd = trainSize + step * testSize;
    const testStart = trainEnd;
    const testEnd = Math.min(testStart + testSize, ohlc.length);

    const trainData = ohlc.slice(0, trainEnd);
    const testData = ohlc.slice(testStart, testEnd);

    // Build train sets per regime (log return target)
    const bearX = [], bearY = [];
    const bullX = [], bullY = [];

    for (let i = minLength; i < trainData.length - 1; i++) {
      const slice = trainData.slice(0, i + 1);
      const reg = regime.determineRegime(slice);

      try {
        const feat = features.buildFeatureArray(slice);
        const cur = trainData[i].close;
        const nxt = trainData[i + 1].close;
        const y = Math.log(nxt / cur);

        if (reg === "bear") {
          bearX.push(feat); bearY.push(y);
        } else {
          bullX.push(feat); bullY.push(y);
        }
      } catch {
        // skip
      }
    }

    // Train modellen (altijd trainen in backtest, anders wordt het “cheaten”)
    const bullModel = bullX.length >= 100 ? forest.trainRF(bullX, bullY) : null;
    const bearModel = bearX.length >= 100 ? forest.trainRF(bearX, bearY) : null;

    // Test
    for (let i = 0; i < testData.length - 1; i++) {
      const slice = trainData.concat(testData.slice(0, i + 1));
      if (slice.length < minLength + 1) continue;

      const reg = regime.determineRegime(slice);
      const model = reg === "bear" ? bearModel : bullModel;
      if (!model) continue;

      try {
        const feat = features.buildFeatureArray(slice);
        const pred = model.predict([feat])[0];

        const cur = testData[i].close;
        const nxt = testData[i + 1].close;
        const actual = Math.log(nxt / cur);

        const ok = sign(pred) === sign(actual) && sign(actual) !== 0;

        total++;
        byRegime[reg].total++;

        if (ok) {
          correct++;
          byRegime[reg].correct++;
        }
      } catch {
        // skip
      }
    }
  }

  const winrate = total ? (correct / total) * 100 : 0;
  const bullWR = byRegime.bull.total ? (byRegime.bull.correct / byRegime.bull.total) * 100 : 0;
  const bearWR = byRegime.bear.total ? (byRegime.bear.correct / byRegime.bear.total) * 100 : 0;

  const result = {
    updatedAt: new Date().toISOString(),
    timeframe: "1D",
    metric: "direction_winrate_next_day",
    totalSamples: total,
    correctSamples: correct,
    winratePercent: Number(winrate.toFixed(2)),
    byRegime: {
      bull: {
        total: byRegime.bull.total,
        correct: byRegime.bull.correct,
        winratePercent: Number(bullWR.toFixed(2))
      },
      bear: {
        total: byRegime.bear.total,
        correct: byRegime.bear.correct,
        winratePercent: Number(bearWR.toFixed(2))
      }
    },
    note:
      "Dit meet alleen of de richting (up/down) van de volgende dag klopt. Precies wat je wil als bevestigings-indicator."
  };

  const outPath = path.join(process.cwd(), "public", "backtest.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  console.log("Wrote:", outPath);
  console.log(result);
}

run().catch((e) => {
  console.error("Backtest failed:", e);
  process.exit(1);
});