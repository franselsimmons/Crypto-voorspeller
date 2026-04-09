// lib/quantEngine.js

// 1. REGIME CLASSIFIER (De Kameleon)
// Classificeert de markt in 4 staten op basis van macro-volatiliteit en trendstructuur.
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
    let confidence = 0.8; // Base confidence

    if (vol > 0.05) { // Hoge volatiliteit (Panic/High Vol)
        regime = "PANIC_LIQUIDITY_VACUUM";
        confidence = 0.2; // Extreem lage confidence voor StatArb
    } else if (currentPrice > sma50 * 1.02) {
        regime = "TREND_BULL";
        confidence = 0.6; // Gevaarlijker voor mean-reversion, trend-following heeft voorkeur
    } else if (currentPrice < sma50 * 0.98) {
        regime = "TREND_BEAR";
        confidence = 0.6;
    } else {
        regime = "CALM_MEAN_REVERSION";
        confidence = 1.0; // Perfecte omgeving voor StatArb
    }

    return { regime, confidence, volatility: vol.toFixed(4) };
}

// 2. SPREAD DISLOCATION (StatArb Kern)
// Berekent de Z-score van de spread tussen twee gecorreleerde activa.
export function calculateSpreadZScore(klinesA, klinesB, hedgeRatio = 1.0) {
    const length = Math.min(klinesA.length, klinesB.length);
    const spread =;
    
    for (let i = 0; i < length; i++) {
        const priceA = parseFloat(klinesA[i][1]);
        const priceB = parseFloat(klinesB[i][1]);
        // Formule: S_t = ln(P_A) - beta * ln(P_B)
        spread.push(Math.log(priceA) - (hedgeRatio * Math.log(priceB)));
    }

    const currentSpread = spread[spread.length - 1];
    const meanSpread = spread.reduce((a, b) => a + b, 0) / spread.length;
    const stdSpread = Math.sqrt(spread.reduce((sum, s) => sum + Math.pow(s - meanSpread, 2), 0) / spread.length);
    
    const zScore = (currentSpread - meanSpread) / stdSpread;
    
    return { zScore, currentSpread, meanSpread, stdSpread };
}

// 3. ORDER BOOK IMBALANCE (De Trekker / Execution Filter)
// Berekent de asymmetrie in de top van het orderboek om spoofing te omzeilen.
export function calculateOFI(depthData) {
    let bidVol = 0;
    let askVol = 0;
    const depthLevels = 10; // We kijken naar de top 10 levels voor microstructure pressure
    
    for (let i = 0; i < depthLevels; i++) {
        if (depthData.bids[i]) bidVol += parseFloat(depthData.bids[i][2]); // Quantity is absolute value op MEXC
        if (depthData.asks[i]) askVol += parseFloat(depthData.asks[i][2]);
    }
    
    // OBI Formule: (Bids - Asks) / (Bids + Asks)
    const imbalance = (bidVol - askVol) / (bidVol + askVol);
    
    let confirmation = 0.5; // Neutraal
    if (imbalance > 0.3) confirmation = 1.2; // Sterke koopdruk in het boek
    if (imbalance < -0.3) confirmation = 1.2; // Sterke verkoopdruk in het boek
    if (Math.abs(imbalance) < 0.1) confirmation = 0.8; // Geen duidelijke imbalance (gevaarlijk voor execution)

    return { imbalance, confirmation, bidVol, askVol };
}

// 4. SYNTHETISCHE EVALUATIEFUNCTIE
// Combineert C -> A -> B tot één harde score.
export function evaluateTrade(zScore, regimeConfidence, bookConfirmation) {
    const estimatedTotalCost = 0.0004; // MEXC Futures Taker Fee (2x 0.020% voor open/close)
    
    // De score formule: (Dislocation * Regime * Orderbook) / Costs
    const rawScore = (Math.abs(zScore) * regimeConfidence * bookConfirmation) / (estimatedTotalCost * 10000);
    
    // Normaliseer naar een 0-100 schaal
    const finalScore = Math.min(99.9, Math.max(0, rawScore * 10));
    
    let action = "FLAT";
    if (finalScore > 75) {
        if (zScore < -2.0) action = "LONG_SPREAD";
        if (zScore > 2.0) action = "SHORT_SPREAD";
    }

    return { finalScore, action };
}
