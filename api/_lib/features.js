const indicators = require("./indicators");

const FEATURE_NAMES = [
  "price",
  "priceChange1d",
  "priceChange6d",
  "priceChange24d",
  "volumeRatio",
  "highLast20",
  "lowLast20",
  "rsi",
  "macd",
  "macdSignal",
  "macdHistogram",
  "sma20",
  "sma50",
  "bbUpper",
  "bbLower",
  "bbMiddle",
  "atr"
];

function getFeatureNames() {
  return [...FEATURE_NAMES];
}

function buildFeatureArray(ohlc, lookback = 20) {
  // daily: we willen minimaal 200 (regime) + 60 (indicators) marge
  if (ohlc.length < lookback + 60) throw new Error("Niet genoeg data voor features");

  const last = ohlc[ohlc.length - 1];
  const prev = ohlc[ohlc.length - 2];

  // Namen zijn nu eerlijk: 1d/6d/24d
  const priceChange1d = (last.close - prev.close) / prev.close;
  const priceChange6d = (last.close - ohlc[ohlc.length - 7].close) / ohlc[ohlc.length - 7].close;
  const priceChange24d = (last.close - ohlc[ohlc.length - 25].close) / ohlc[ohlc.length - 25].close;

  const volumeAvg = ohlc.slice(-lookback).reduce((s, c) => s + c.volume, 0) / lookback;
  const volumeRatio = volumeAvg > 0 ? last.volume / volumeAvg : 1;

  const highLast20 = Math.max(...ohlc.slice(-20).map((c) => c.high));
  const lowLast20 = Math.min(...ohlc.slice(-20).map((c) => c.low));
  const atr = (highLast20 - lowLast20) / last.close;

  const ind = indicators.calculateAll(ohlc);

  return [
    last.close,
    priceChange1d,
    priceChange6d,
    priceChange24d,
    volumeRatio,
    highLast20,
    lowLast20,
    ind.rsi,
    ind.macd.MACD,
    ind.macd.signal,
    ind.macd.histogram,
    ind.sma20,
    ind.sma50,
    ind.bb.upper,
    ind.bb.lower,
    ind.bb.middle,
    atr
  ];
}

module.exports = { getFeatureNames, buildFeatureArray };