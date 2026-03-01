const forestEngine = require("./_lib/forestEngine");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST" });
      return;
    }
    const out = await forestEngine.predict();
    res.status(200).json({ model: "forest", prediction: out });
  } catch (e) {
    res.status(500).json({ error: "predict failed", detail: String(e.message || e) });
  }
};