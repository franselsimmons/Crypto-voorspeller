    // 7. STRUCTURAL TP & SL Berekening (Gebaseerd op echte Bodems en Toppen!)
    let sl = 0;
    let tp1 = 0; 
    let tp2 = 0; 
    
    // Kijk naar de grafiek van de afgelopen 24 uur (24 kaarsen)
    const lookback = 24;
    const recentLowsForSL = lows.slice(-lookback);
    const recentHighsForSL = highs.slice(-lookback);
    
    const swingLow = Math.min(...recentLowsForSL);
    const swingHigh = Math.max(...recentHighsForSL);

    if (type === 'long') {
        // Stop Loss onder de daadwerkelijke recente bodem. 
        // (Met een kleine fail-safe: als de bodem absurd dichtbij is, gebruik dan minimaal 1.5x ATR als ademruimte)
        const structuralRisk = currentPrice - swingLow;
        const actualRisk = Math.max(structuralRisk, currentAtr * 1.5); 
        
        sl = currentPrice - actualRisk;
        tp1 = currentPrice + (actualRisk * 1.0); // 1:1 R/R (Veiligheid)
        tp2 = currentPrice + (actualRisk * 2.0); // 1:2 R/R (Hoofddoel)
        
    } else if (type === 'short') {
        // Stop Loss boven de daadwerkelijke recente top.
        const structuralRisk = swingHigh - currentPrice;
        const actualRisk = Math.max(structuralRisk, currentAtr * 1.5);
        
        sl = currentPrice + actualRisk;
        tp1 = currentPrice - (actualRisk * 1.0);
        tp2 = currentPrice - (actualRisk * 2.0);
    }

    return {
        rsi: currentRsi.toFixed(2),
        signal: signal,
        type: type,
        tags: tags,
        scoreMultiplier: multiplier,
        entry: formatPrice(currentPrice),
        tp1: formatPrice(tp1),
        tp2: formatPrice(tp2),
        sl: formatPrice(sl)
    };
}
