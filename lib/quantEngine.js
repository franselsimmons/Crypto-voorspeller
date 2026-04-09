// 1. REGIME CLASSIFIER (De Kameleon)
export function classifyRegime(btcKlines) {
    const closes = btcKlines.map(k => parseFloat(k[1]));
    const returns =;
    for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    
    const recentReturns = returns.slice(-20);
    const vol = Math.sqrt(recentReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / recentReturns.length) * Math.sqrt(24);
    
    const currentPrice = closes[closes.length - 1];
    const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;

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

// 2. SPREAD DISLOCATION (StatArb Kern)
export function calculateSpreadZScore(klinesA, klinesB, hedgeRatio = 1.0) {
    const length = Math.min(klinesA.length, klinesB.length);
    const spread =;
    
    for (let i = 0; i < length; i++) {
        const priceA = parseFloat(klinesA[i][1]);
        const priceB = parseFloat(klinesB[i][1]);
        spread.push(Math.log(priceA) - (hedgeRatio * Math.log(priceB)));
    }

    const currentSpread = spread[spread.length - 1];
    const meanSpread = spread.reduce((a, b) => a + b, 0) / spread.length;
    const stdSpread = Math.sqrt(spread.reduce((sum, s) => sum + Math.pow(s - meanSpread, 2), 0) / spread.length);
    
    const zScore = (currentSpread - meanSpread) / stdSpread;
    
    return { zScore, currentSpread, meanSpread, stdSpread };
}

// 3. ORDER FLOW IMBALANCE (Execution Filter)
export function calculateOFI(depthData) {
    let bidVol = 0;
    let askVol = 0;
    const depthLevels = 10; 
    
    for (let i = 0; i < depthLevels; i++) {
        if (depthData.bids && depthData.bids[i]) bidVol += parseFloat(depthData.bids[i][2]); 
        if (depthData.asks && depthData.asks[i]) askVol += parseFloat(depthData.asks[i][2]);
    }
    
    const totalVol = bidVol + askVol |

| 1;
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
    
    const rawScore = (Math.abs(zScore) * regimeConfidence * bookConfirmation) / (estimatedTotalCost * 10000);
    const finalScore = Math.min(99.9, Math.max(0, rawScore * 10));
    
    let action = "FLAT";
    if (finalScore > 60) { 
        if (zScore < -2.0) action = "LONG_SPREAD"; 
        if (zScore > 2.0) action = "SHORT_SPREAD"; 
    }

    return { finalScore, action };
}
