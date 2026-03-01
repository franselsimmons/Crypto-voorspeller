/* EOF: /api/predict.js */
const { predict } = require("./_lib/forestEngine");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    const prediction = await predict();
    return res.status(200).json({ ok: true, prediction });
  } catch (e) {
    return res.status(500).json({
      error: "Prediction failed",
      detail: e?.message || String(e)
    });
  }
};