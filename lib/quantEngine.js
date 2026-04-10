// 1. REGIME CLASSIFIER (De Kameleon)
export function classifyRegime(btcKlines) {
    if (!btcKlines || btcKlines.length < 50) return { regime: "INITIALIZING", confidence: 0 };
    
    const closes = btcKlines.map(k => parseFloat(k[1]));
    let returns =;
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
    if (length === 0) return { zScore: 0, currentSpread: 0, meanSpread: 0, stdSpread: 0 };
    
    let spread =;
    for (let i = 0; i < length; i++) {
        const priceA = parseFloat(klinesA[i][1]);
        const priceB = parseFloat(klinesB[i][1]);
        if (priceA > 0 && priceB > 0) {
            spread.push(Math.log(priceA) - (hedgeRatio * Math.log(priceB)));
        }
    }

    const currentSpread = spread[spread.length - 1];
    const meanSpread = spread.reduce((a, b) => a + b, 0) / spread.length;
    const stdSpread = Math.sqrt(spread.reduce((sum, s) => sum + Math.pow(s - meanSpread, 2), 0) / spread.length) || 1e-9;
    
    const zScore = (currentSpread - meanSpread) / stdSpread;
    
    return { zScore: zScore.toFixed(3), currentSpread, meanSpread, stdSpread };
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
    
    const totalVol = (bidVol + askVol) || 1;
    const imbalance = (bidVol - askVol) / totalVol;
    
    let confirmation = 0.5; 
    if (imbalance > 0.3) confirmation = 1.5; // Sterke Orderbook bevestiging
    if (imbalance < -0.3) confirmation = 1.5; 
    if (Math.abs(imbalance) < 0.1) confirmation = 0.5; // Onzekere/gebalanceerde markt

    return { 
        imbalanceStr: (imbalance * 100).toFixed(1) + '%', 
        imbalanceValue: imbalance,
        confirmation 
    };
}

// 4. SYNTHETISCHE EVALUATIEFUNCTIE
export function evaluateTrade(zScore, regimeConfidence, ofiA, ofiB) {
    const estimatedTotalCost = 0.0004; // Taker fees
    const z = parseFloat(zScore);
    
    // We willen dat het orderboek (OFI) onze arbitrage trade ondersteunt
    let bookConfirmation = 0.5; 
    if (z < -1.5 && ofiA.imbalanceValue > 0.1 && ofiB.imbalanceValue < -0.1) bookConfirmation = 1.5; // Koop A, Verkoop B
    if (z > 1.5 && ofiA.imbalanceValue < -0.1 && ofiB.imbalanceValue > 0.1) bookConfirmation = 1.5; // Verkoop A, Koop B
    
    const rawScore = (Math.abs(z) * regimeConfidence * bookConfirmation) / (estimatedTotalCost * 10000);
    const finalScore = Math.min(99.9, Math.max(0, rawScore * 10));
    
    let action = "FLAT";
    
    // Als Z-score extreem is (>1.5 of <-1.5), mag hij op de Watchlist.
    // Als de OFI de trade OOK bevestigt én de score hoog genoeg is, wordt hij Actief.
    if (Math.abs(z) >= 1.5) {
        action = "WATCH"; 
        if (finalScore > 50 && bookConfirmation > 1.0) {
            action = z < 0? "LONG_SPREAD" : "SHORT_SPREAD";
        }
    }

    return { finalScore: finalScore.toFixed(1), action };
}
