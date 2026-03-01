const kraken = require("./_lib/kraken");
const indicators = require("./_lib/indicators");

module.exports = async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 420 * 86400;
    const ohlc = await kraken.getOHLCRange("XBTUSD", 1440, from, now);
    const ind = indicators.calculateAll(ohlc);
    res.status(200).json(ind);
  } catch (e) {
    res.status(500).json({ error: "indicators failed", detail: String(e.message || e) });
  }
};