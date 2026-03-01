const kraken = require("./_lib/kraken");

module.exports = async (req, res) => {
  try {
    const price = await kraken.getTicker("XBTUSD");
    res.status(200).json({ price });
  } catch (e) {
    res.status(500).json({ error: "price failed", detail: String(e.message || e) });
  }
};