/* EOF: /api/predict.js */
const { predict } = require("../api/lib/forestEngine");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST" });
      return;
    }

    const prediction = await predict();

    // BELANGRIJK: frontend zoekt "prediction"
    res.status(200).json({ prediction });
  } catch (e) {
    res.status(500).json({
      error: "Prediction failed",
      detail: e?.message || String(e)
    });
  }
};