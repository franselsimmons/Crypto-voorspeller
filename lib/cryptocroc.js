    // NIEUW: SAFE-MODE TP & SL BEREKENING (ATR Methode)
    let sl = 0;
    let tp1 = 0; // Veiligheidsdoel (Zet hierna SL op instap!)
    let tp2 = 0; // Hoofddoel
    
    // Stop Loss = 1.5x ATR. TP1 = 1x ATR (veiligheid). TP2 = 3x ATR.
    if (type === 'long') {
        sl = currentPrice - (currentAtr * 1.5);
        tp1 = currentPrice + (currentAtr * 1.0);
        tp2 = currentPrice + (currentAtr * 3.0);
    } else if (type === 'short') {
        sl = currentPrice + (currentAtr * 1.5);
        tp1 = currentPrice - (currentAtr * 1.0);
        tp2 = currentPrice - (currentAtr * 3.0);
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
