import { RSI, EMA, SMA, ATR } from 'technicalindicators';

function formatPrice(price) {
    if (!price) return "0";
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toPrecision(5); 
}

export function calculateCryptoCroc(klines, btcTrend = 'neutral') {
    const closes = klines.map(k => parseFloat(k[4]));
    const opens = klines.map(k => parseFloat(k[1]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const volumes = klines.map(k => parseFloat(k[5])); 
    
    const currentPrice = closes[closes.length - 1];
    const previousPrice = closes[closes.length - 2];
    const currentOpen = opens[opens.length - 1];

    // RSI Berekening
    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    
    const currentRsi = smoothedRsi[smoothedRsi.length - 1];
    const previousRsi = smoothedRsi[smoothedRsi.length - 2];

    const ema50 = EMA.calculate({ period: 50, values: closes });
    const currentEma50 = ema50.length > 0 ? ema50[ema50.length - 1] : currentPrice;
    
    const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const currentAtr = atrValues[atrValues.length - 1];
    
    // =========================================================
    // DE "BOSS" LOGICA: CONFIRMATION REQUIRED
    // =========================================================
    let type = "neutral";
    let score = 0;
    
    // LONG SETUP: RSI was oversold, haakt nu omhoog, EN we hebben een groene kaars
    const isRsiHookUp = previousRsi <= 35 && currentRsi > previousRsi;
    const isGreenCandle = currentPrice > currentOpen;
    
    if (btcTrend === 'long' && isRsiHookUp && isGreenCandle) {
        type = "long";
        score = 80 + (40 - currentRsi); // Bonus voor hoe diep de bodem was
    }
    
    // SHORT SETUP: RSI was overbought, haakt nu omlaag, EN we hebben een rode kaars
    const isRsiHookDown = previousRsi >= 65 && currentRsi < previousRsi;
    const isRedCandle = currentPrice < currentOpen;
    
    if (btcTrend === 'short' && isRsiHookDown && isRedCandle) {
        type = "short";
        score = 80 + (currentRsi - 60); 
    }

    // Als de baas geen setup ziet, geven we een nutteloze score terug zodat de scanner hem negeert
    if (type === "neutral") {
        return { type: "neutral", score: 0 };
    }

    const finalScore = Math.min(99, Math.max(1, score));

    // Professionele Stop Loss gebaseerd op Volatiliteit (ATR) in plaats van vaste percentages
    let sl, tp1, tp2;
    if (type === 'long') {
        sl = currentPrice - (currentAtr * 2); // Stop loss ligt veilig onder de marktruis
        const risk = currentPrice - sl;
        tp1 = currentPrice + risk;
        tp2 = currentPrice + (risk * 2); // 1:2 Risk Reward
    } else {
        sl = currentPrice + (currentAtr * 2);
        const risk = sl - currentPrice;
        tp1 = currentPrice - risk;
        tp2 = currentPrice - (risk * 2);
    }

    return {
        rsi: currentRsi.toFixed(2),
        type,
        score: finalScore,
        entry: formatPrice(currentPrice),
        tp1: formatPrice(tp1),
        tp2: formatPrice(tp2),
        sl: formatPrice(sl)
    };
}
