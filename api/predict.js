/* EOF: /api/predict.js */
const { predict } = require("./_lib/forestEngine"); // _lib, niet lib

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const prediction = await predict();
    return res.status(200).json({ prediction });
  } catch (e) {
    return res.status(500).json({
      error: "Prediction failed",
      detail: e?.message || String(e)
    });
  }
};