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
    const volumes = klines.map(k => parseFloat(k[5])); 
    
    const currentPrice = closes[closes.length - 1];
    const previousPrice = closes[closes.length - 2];
    const currentOpen = opens[opens.length - 1];
    const currentVolume = volumes[volumes.length - 1];

    // Relatief Volume (RVOL) Berekening
    const volSma = SMA.calculate({ period: 20, values: volumes });
    const currentVolSma = volSma[volSma.length - 1] || 1;
    const rvol = currentVolume / currentVolSma;

    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    const currentRsi = smoothedRsi[smoothedRsi.length - 1];
    const previousRsi = smoothedRsi[smoothedRsi.length - 2];

    const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const currentAtr = atrValues[atrValues.length - 1];
    
    let type = "neutral";
    let status = "none"; // 'watch' (in de dip) of 'trigger' (haak + groen)
    let score = 0;
    let isSqueeze = false;
    
    // --- LONG LOGICA ---
    if (btcTrend === 'long') {
        if (currentRsi <= 35) {
            type = "long";
            status = "watch"; // Hij zit in de dip, dus mag op de watchlist
            score = 40 + (35 - currentRsi); 
            
            const isRsiHookUp = previousRsi <= 35 && currentRsi > previousRsi;
            const isGreenCandle = currentPrice > currentOpen;
            
            if (isRsiHookUp && isGreenCandle) {
                status = "trigger"; // De sloten zijn opengebroken!
                score = 80 + (40 - currentRsi); 
                if (fundingRate < 0) { isSqueeze = true; score += 15; }
                if (rvol > 2.0) score += 10; // Bonus voor onnatuurlijk hoog volume
            }
        }
    }
    
    // --- SHORT LOGICA ---
    else if (btcTrend === 'short') {
        if (currentRsi >= 65) {
            type = "short";
            status = "watch"; 
            score = 40 + (currentRsi - 65);
            
            const isRsiHookDown = previousRsi >= 65 && currentRsi < previousRsi;
            const isRedCandle = currentPrice < currentOpen;
            
            if (isRsiHookDown && isRedCandle) {
                status = "trigger"; 
                score = 80 + (currentRsi - 60); 
                if (fundingRate > 0.00015) { isSqueeze = true; score += 15; }
                if (rvol > 2.0) score += 10; 
            }
        }
    }

    if (status === "none") return { status: "none", score: 0 };

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

    return {
        rsi: currentRsi.toFixed(2),
        type,
        status,
        score: Math.min(99, Math.max(1, score)),
        isSqueeze,
        fundingRate: (fundingRate * 100).toFixed(4) + "%",
        rvol: rvol.toFixed(1),
        entry: formatPrice(currentPrice),
        tp2: formatPrice(tp2),
        sl: formatPrice(sl)
    };
}
