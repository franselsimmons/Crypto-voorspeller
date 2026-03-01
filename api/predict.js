const { predict } = require("./_lib/forestEngine");

module.exports = async (req, res) => {
  try {
    // tijdelijk GET toestaan
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const prediction = await predict();

    res.status(200).json({
      ok: true,
      prediction
    });

  } catch (e) {
    res.status(500).json({
      error: "Prediction failed",
      detail: e.message
    });
  }
};