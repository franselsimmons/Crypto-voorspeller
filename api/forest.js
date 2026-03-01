const fs = require("fs").promises;
const path = require("path");
const { RandomForestRegression } = require("ml-random-forest");
const logger = require("./_lib/logger");

const MODEL_DIR = process.env.MODEL_PATH || path.join(__dirname, "../models");
const MODEL_BEAR = path.join(MODEL_DIR, "rf_bear.json");
const MODEL_BULL = path.join(MODEL_DIR, "rf_bull.json");

async function ensureModelDir() {
  await fs.mkdir(MODEL_DIR, { recursive: true });
}

function trainRF(X, y) {
  const options = {
    nEstimators: 300,
    maxDepth: 14,
    minSamplesSplit: 4,
    minSamplesLeaf: 2,
    selectionMethod: "sqrt",
    seed: 42
  };
  const model = new RandomForestRegression(options);
  model.train(X, y);
  return model;
}

async function saveModel(model, reg) {
  await ensureModelDir();
  const file = reg === "bear" ? MODEL_BEAR : MODEL_BULL;
  await fs.writeFile(file, JSON.stringify(model.toJSON()));
  logger.info(`Model opgeslagen: ${file}`);
}

async function loadModel(reg) {
  const file = reg === "bear" ? MODEL_BEAR : MODEL_BULL;
  try {
    const raw = await fs.readFile(file, "utf8");
    const json = JSON.parse(raw);
    return RandomForestRegression.load(json);
  } catch {
    return null;
  }
}

function permutationImportance(model, X, y) {
  const n = X.length;
  const m = X[0].length;

  const base = X.map((x) => model.predict([x])[0]);
  const baseMSE = y.reduce((s, tv, i) => s + (tv - base[i]) ** 2, 0) / n;

  const out = [];
  for (let f = 0; f < m; f++) {
    const Xp = X.map((r) => [...r]);
    const col = X.map((r) => r[f]);

    for (let i = col.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [col[i], col[j]] = [col[j], col[i]];
    }
    for (let i = 0; i < n; i++) Xp[i][f] = col[i];

    const pp = Xp.map((x) => model.predict([x])[0]);
    const mse = y.reduce((s, tv, i) => s + (tv - pp[i]) ** 2, 0) / n;
    out.push(mse - baseMSE);
  }
  return out;
}

module.exports = { trainRF, saveModel, loadModel, permutationImportance };