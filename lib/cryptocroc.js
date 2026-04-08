import { RSI, EMA, SMA, ATR } from 'technicalindicators';

const clamp01 = (val) => Math.min(1.0, Math.max(0.0, val));
const lerp = (a, b, t) => a + (b - a) * t;

function formatPrice(price) {
    if (!price) return "0";
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toPrecision(4); 
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

    const volSma = SMA.calculate({ period: 20, values: volumes });
    const hasHighVolume = volumes[volumes.length - 1] > volSma[volSma.length - 1];

    // Divergence detection
    let bullishDiv = false; let bearishDiv = false;
    const recentCloses = closes.slice(-16, -1);
    const recentRsis = smoothedRsi.slice(-16, -1);
    const minIdx = recentCloses.indexOf(Math.min(...recentCloses));
    const maxIdx = recentCloses.indexOf(Math.max(...recentCloses));
    if (currentPrice < recentCloses[minIdx] && currentRsi > recentRsis[minIdx]) bullishDiv = true;
    if (currentPrice > recentCloses[maxIdx] && currentRsi < recentRsis[maxIdx]) bearishDiv = true;

    const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const currentAtr = atrValues[atrValues.length - 1];
    
    let type = currentRsi < 50 ? "long" : "short";
    
    // --- ON-DEMAND SCORING HIERARCHY ---
    let score = 40; // De basis "vloer"
    let reasonTags = [];

    // 1. RSI Stretch (De kans) - max 25 pnt
    const rsiDist = Math.abs(currentRsi - 50);
    score += (rsiDist * 0.8);

    // 2. BTC Alignment (De veiligheid) - max 30 pnt
    if (btcTrend !== 'neutral') {
        if (type === btcTrend) { score += 30; reasonTags.push("👑 BTC Confirmed"); }
        else { score -= 20; reasonTags.push("⚠️ Tegen BTC"); }
    }

    // 3. Trend Alignment (De stroom) - max 15 pnt
    if ((type === "long" && emaDistancePct > 0) || (type === "short" && emaDistancePct < 0)) {
        score += 15; reasonTags.push("Trend OK");
    }

    // 4. Divergence (De bonus edge) - max 20 pnt
    if ((type === "long" && bullishDiv) || (type === "short" && bearishDiv)) {
        score += 20; reasonTags.push("Divergence");
    }

    // 5. Volume (Whales) - max 10 pnt
    if (hasHighVolume) { score += 10; reasonTags.push("Volume+"); }

    const finalScore = Math.min(99, Math.max(0, score));
    
    // Alleen tonen als het boven de kwaliteitsvloer van 60 zit
    const isActionable = finalScore >= 60;

    // Structural SL/TP
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
        isActionable,
        tags: reasonTags,
        entry: formatPrice(currentPrice),
        tp1: formatPrice(tp1),
        tp2: formatPrice(tp2),
        sl: formatPrice(sl)
    };
}
