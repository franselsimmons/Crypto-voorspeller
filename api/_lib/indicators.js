const ti = require("technicalindicators");

function calculateAll(ohlc) {
  const close = ohlc.map((c) => c.close);
  const high = ohlc.map((c) => c.high);
  const low = ohlc.map((c) => c.low);
  const volume = ohlc.map((c) => c.volume);

  if (close.length < 60) {
    throw new Error("Niet genoeg candles voor indicatoren (min 60)");
  }

  const rsiArr = ti.RSI.calculate({ values: close, period: 14 });
  if (!rsiArr.length) throw new Error("RSI niet berekend");

  const macdArr = ti.MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  if (!macdArr.length) throw new Error("MACD niet berekend");

  const sma20 = ti.SMA.calculate({ values: close, period: 20 });
  const sma50 = ti.SMA.calculate({ values: close, period: 50 });

  const bbArr = ti.BollingerBands.calculate({
    values: close,
    period: 20,
    stdDev: 2
  });
  if (!bbArr.length) throw new Error("BB niet berekend");

  return {
    rsi: rsiArr[rsiArr.length - 1],
    macd: macdArr[macdArr.length - 1],
    sma20: sma20[sma20.length - 1],
    sma50: sma50[sma50.length - 1],
    bb: bbArr[bbArr.length - 1],
    volume: volume[volume.length - 1]
  };
}

module.exports = { calculateAll };