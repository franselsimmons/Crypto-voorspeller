/* EOF: /api/forest.js */
const fs = require("fs");
const path = require("path");
const { RandomForestRegression } = require("ml-random-forest");

const MODEL_DIR = path.join(process.cwd(), "models");

function ensureModelDir() {
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR);
  }
}

function trainRF(X, y) {
  const options = {
    seed: 42,
    maxFeatures: Math.sqrt(X[0].length), // BELANGRIJK
    replacement: true,
    nEstimators: 100
  };

  const rf = new RandomForestRegression(options);
  rf.train(X, y);

  return rf;
}

async function saveModel(model, name) {
  ensureModelDir();
  const filePath = path.join(MODEL_DIR, `rf_${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(model.toJSON()));
}

async function loadModel(name) {
  const filePath = path.join(MODEL_DIR, `rf_${name}.json`);
  if (!fs.existsSync(filePath)) return null;

  const raw = JSON.parse(fs.readFileSync(filePath));
  return RandomForestRegression.load(raw);
}

module.exports = { trainRF, saveModel, loadModel };