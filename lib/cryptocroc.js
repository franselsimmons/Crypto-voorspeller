import { RSI, EMA, SMA, ATR } from 'technicalindicators';

function formatPrice(price) {
    if (!price) return "0";
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toPrecision(5); 
}

export function calculateCryptoCroc(klines, btcTrend = 'neutral') {
    const closes = klines.map(k => parseFloat(k[4]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const volumes = klines.map(k => parseFloat(k[5])); 
    const currentPrice = closes[closes.length - 1];

    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    const currentRsi = smoothedRsi[smoothedRsi.length - 1];

    const ema50 = EMA.calculate({ period: 50, values: closes });
    const currentEma50 = ema50.length > 0 ? ema50[ema50.length - 1] : currentPrice;
    const emaDistancePct = ((currentPrice - currentEma50) / currentEma50) * 100;

    const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const currentAtr = atrValues[atrValues.length - 1];
    
    let type = currentRsi < 50 ? "long" : "short";
    
    let score = 0;
    let reasonTags = [];

    const rsiDist = Math.abs(currentRsi - 50);
    score += (rsiDist * 1.2); 

    const agreement = (btcTrend === 'long' && type === 'long') || (btcTrend === 'short' && type === 'short');

    if (agreement) {
        score += 40; 
        reasonTags.push("AGREEMENT_CONFIRMED");
    } else {
        score -= 40; 
        reasonTags.push("NO_CONFLUENCE");
    }

    if (agreement && Math.abs(emaDistancePct) > 0.5) { score += 10; reasonTags.push("TREND_BOOST"); }

    const finalScore = Math.min(99, Math.max(1, score));

    const lookback = 24;
    const swingLow = Math.min(...lows.slice(-lookback));
    const swingHigh = Math.max(...highs.slice(-lookback));
    let sl, tp1, tp2;

    if (type === 'long') {
        const risk = Math.max(currentPrice - swingLow, currentAtr * 1.5);
        sl = currentPrice - risk;
        tp1 = currentPrice + risk;
        tp2 = currentPrice + (risk * 2);
    } else {
        const risk = Math.max(swingHigh - currentPrice, currentAtr * 1.5);
        sl = currentPrice + risk;
        tp1 = currentPrice - risk;
        tp2 = currentPrice - (risk * 2);
    }

    return {
        rsi: currentRsi.toFixed(2),
        type,
        score: finalScore,
        tags: reasonTags,
        entry: formatPrice(currentPrice),
        tp1: formatPrice(tp1),
        tp2: formatPrice(tp2),
        sl: formatPrice(sl)
    };
}
