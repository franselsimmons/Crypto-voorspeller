const { predict } = require("./_lib/forestEngine");

module.exports = async function handler(req, res) {
  try {
    // Sta zowel GET als POST toe
    if (req.method !== "GET" && req.method !== "POST") {
      res.statusCode = 405;
      return res.json({ error: "Method not allowed" });
    }

    const result = await predict();
    res.statusCode = 200;
    return res.json(result);
  } catch (err) {
    res.statusCode = 500;
    return res.json({
      error: "Prediction failed",
      detail: err?.message || String(err)
    });
  }
};