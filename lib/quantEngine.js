function getCloseFromKline(kline) {
  return parseFloat(kline?.[4]);
}

function getDepthVolume(level) {
  if (!level) return 0;
  const raw = level[1] ?? level[2] ?? 0;
  return parseFloat(raw) || 0;
}

// 1. REGIME CLASSIFIER
export function classifyRegime(btcKlines = []) {
  const closes = btcKlines
    .map(getCloseFromKline)
    .filter((value) => Number.isFinite(value));

  if (closes.length < 2) {
    return {
      regime: "CALM_MEAN_REVERSION",
      confidence: 0,
      volatility: "0.0000",
    };
  }

  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }

  const recentReturns = returns.slice(-20);
  const vol =
    recentReturns.length > 0
      ? Math.sqrt(
          recentReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) /
            recentReturns.length
        ) * Math.sqrt(24)
      : 0;

  const currentPrice = closes[closes.length - 1];
  const smaWindow = closes.slice(-Math.min(50, closes.length));
  const sma50 =
    smaWindow.reduce((sum, value) => sum + value, 0) / smaWindow.length;

  let regime = "CALM_MEAN_REVERSION";
  let confidence = 0.8;

  if (vol > 0.05) {
    regime = "PANIC_LIQUIDITY_VACUUM";
    confidence = 0.2;
  } else if (currentPrice > sma50 * 1.02) {
    regime = "TREND_BULL";
    confidence = 0.6;
  } else if (currentPrice < sma50 * 0.98) {
    regime = "TREND_BEAR";
    confidence = 0.6;
  } else {
    regime = "CALM_MEAN_REVERSION";
    confidence = 1.0;
  }

  return { regime, confidence, volatility: vol.toFixed(4) };
}

// 2. SPREAD DISLOCATION
export function calculateSpreadZScore(klinesA = [], klinesB = [], hedgeRatio = 1.0) {
  const length = Math.min(klinesA.length, klinesB.length);
  const spread = [];

  for (let i = 0; i < length; i++) {
    const priceA = getCloseFromKline(klinesA[i]);
    const priceB = getCloseFromKline(klinesB[i]);

    if (!Number.isFinite(priceA) || !Number.isFinite(priceB) || priceA <= 0 || priceB <= 0) {
      continue;
    }

    spread.push(Math.log(priceA) - hedgeRatio * Math.log(priceB));
  }

  if (spread.length === 0) {
    return { zScore: 0, currentSpread: 0, meanSpread: 0, stdSpread: 0 };
  }

  const currentSpread = spread[spread.length - 1];
  const meanSpread = spread.reduce((a, b) => a + b, 0) / spread.length;
  const rawStdSpread = Math.sqrt(
    spread.reduce((sum, s) => sum + Math.pow(s - meanSpread, 2), 0) / spread.length
  );

  const stdSpread = rawStdSpread || 1e-9;
  const zScore = (currentSpread - meanSpread) / stdSpread;

  return { zScore, currentSpread, meanSpread, stdSpread };
}

// 3. ORDER FLOW IMBALANCE
export function calculateOFI(depthData = {}) {
  let bidVol = 0;
  let askVol = 0;
  const depthLevels = 10;

  for (let i = 0; i < depthLevels; i++) {
    if (depthData.bids && depthData.bids[i]) {
      bidVol += getDepthVolume(depthData.bids[i]);
    }
    if (depthData.asks && depthData.asks[i]) {
      askVol += getDepthVolume(depthData.asks[i]);
    }
  }

  const totalVol = (bidVol + askVol) || 1;
  const imbalance = (bidVol - askVol) / totalVol;

  let confirmation = 0.5;
  if (imbalance > 0.3) confirmation = 1.2;
  if (imbalance < -0.3) confirmation = 1.2;
  if (Math.abs(imbalance) < 0.1) confirmation = 0.8;

  return { imbalance, confirmation, bidVol, askVol };
}

// 4. SYNTHETISCHE EVALUATIEFUNCTIE
export function evaluateTrade(zScore, regimeConfidence, bookConfirmation) {
  const estimatedTotalCost = 0.0004;

  const rawScore =
    (Math.abs(zScore) * regimeConfidence * bookConfirmation) /
    (estimatedTotalCost * 10000);

  const finalScore = Math.min(99.9, Math.max(0, rawScore * 10));

  let action = "FLAT";
  if (finalScore > 60) {
    if (zScore < -2.0) action = "LONG_SPREAD";
    if (zScore > 2.0) action = "SHORT_SPREAD";
  }

  return { finalScore, action };
}