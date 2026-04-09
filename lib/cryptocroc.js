import { RSI, EMA, SMA, ATR } from 'technicalindicators';

function formatPrice(price) {
    if (!price) return "0";
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toPrecision(5); 
}

export function calculateCryptoCroc(klines, btcTrend = 'neutral', fundingRate = 0) {
    const closes = klines.map(k => parseFloat(k[4]));
    const opens = klines.map(k => parseFloat(k[1]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    
    const currentPrice = closes[closes.length - 1];
    const previousPrice = closes[closes.length - 2];
    const currentOpen = opens[opens.length - 1];

    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    const currentRsi = smoothedRsi[smoothedRsi.length - 1];
    const previousRsi = smoothedRsi[smoothedRsi.length - 2];

    const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const currentAtr = atrValues[atrValues.length - 1];
    
    let type = "neutral";
    let score = 0;
    let isSqueeze = false;
    
    // --- LONG SETUP (Zoeken naar de Short Squeeze) ---
    const isRsiHookUp = previousRsi <= 35 && currentRsi > previousRsi;
    const isGreenCandle = currentPrice > currentOpen;
    
    if (btcTrend === 'long' && isRsiHookUp && isGreenCandle) {
        type = "long";
        score = 80 + (40 - currentRsi); 
        if (fundingRate < 0) {
            isSqueeze = true; // Negatieve funding = Shorters zitten in de val
            score += 15; // Extreem hoge prioriteit
        }
    }
    
    // --- SHORT SETUP (Zoeken naar de Long Squeeze) ---
    const isRsiHookDown = previousRsi >= 65 && currentRsi < previousRsi;
    const isRedCandle = currentPrice < currentOpen;
    
    if (btcTrend === 'short' && isRsiHookDown && isRedCandle) {
        type = "short";
        score = 80 + (currentRsi - 60); 
        // Een normale funding rate is 0.0001 (0.01%). Alles daarboven betekent extreme FOMO.
        if (fundingRate > 0.00015) {
            isSqueeze = true; // Extreme funding = Longs zitten in de val
            score += 15; // Extreem hoge prioriteit
        }
    }

    if (type === "neutral") return { type: "neutral", score: 0 };

    const finalScore = Math.min(99, Math.max(1, score));

    // Professionele ATR Stop Loss
    let sl, tp1, tp2;
    if (type === 'long') {
        sl = currentPrice - (currentAtr * 2);
        const risk = currentPrice - sl;
        tp2 = currentPrice + (risk * 2);
    } else {
        sl = currentPrice + (currentAtr * 2);
        const risk = sl - currentPrice;
        tp2 = currentPrice - (risk * 2);
    }

    // Format funding rate to percentage for display
    const fundingPct = (fundingRate * 100).toFixed(4) + "%";

    return {
        rsi: currentRsi.toFixed(2),
        type,
        score: finalScore,
        isSqueeze,
        fundingRate: fundingPct,
        entry: formatPrice(currentPrice),
        tp2: formatPrice(tp2),
        sl: formatPrice(sl)
    };
}
