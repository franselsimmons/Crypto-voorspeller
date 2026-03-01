const ti = require("technicalindicators");

function determineRegime(ohlc) {
  if (ohlc.length < 200) return "bull";

  const closes = ohlc.map((c) => c.close);
  const sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
  const lastClose = closes[closes.length - 1];

  const high = ohlc.map((c) => c.high);
  const low = ohlc.map((c) => c.low);

  const adxArr = ti.ADX.calculate({ high, low, close: closes, period: 14 });
  const lastADX = adxArr.length ? adxArr[adxArr.length - 1].adx : 25;
  const isTrending = lastADX > 25;

  if (lastClose < sma200 && isTrending) return "bear";
  if (lastClose > sma200 && isTrending) return "bull";

  const returns = closes.slice(-10).map((c, i, arr) => (i ? (c - arr[i - 1]) / arr[i - 1] : 0));
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  return avg > 0 ? "bull" : "bear";
}

module.exports = { determineRegime };