// /api/forest-backtest.js
const fs = require("fs");
const path = require("path");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Use GET" });
      return;
    }

    const filePath = path.join(process.cwd(), "public", "backtest.json");

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: "No backtest file yet",
        hint: "Run the GitHub Action 'Backtest and commit' first"
      });
      return;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: "Backtest read failed", detail: String(e?.message || e) });
  }
};