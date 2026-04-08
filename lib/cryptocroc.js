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

    // 1. RSI
    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    const currentRsi = smoothedRsi[smoothedRsi.length - 1];

    // 2. LOKALE TREND (50 EMA)
    const ema50 = EMA.calculate({ period: 50, values: closes });
    const currentEma50 = ema50.length > 0 ? ema50[ema50.length - 1] : currentPrice;
    
    const emaDistancePct = ((currentPrice - currentEma50) / currentEma50) * 100;
    
    let trendScore = 0;
    let trendTag = "";
    if (emaDistancePct > 2) { trendScore = 0.6; trendTag = "Sterke Uptrend"; }
    else if (emaDistancePct > 0.5) { trendScore = 0.3; trendTag = "Lichte Uptrend"; }
    else if (emaDistancePct >= -0.5) { trendScore = 0; trendTag = "Zijwaarts"; }
    else if (emaDistancePct >= -2) { trendScore = -0.2; trendTag = "Lichte Downtrend"; }
    else { trendScore = -0.5; trendTag = "Sterke Downtrend"; }

    // 3. Volume Check
    const volSma = SMA.calculate({ period: 20, values: volumes });
    const currentVol = volumes[volumes.length - 1];
    const avgVol = volSma.length > 0 ? volSma[volSma.length - 1] : currentVol;
    const hasHighVolume = currentVol > avgVol;

    // 4. Divergentie Check
    let bullishDiv = false;
    let bearishDiv = false;
    const recentCloses = closes.slice(-16, -1);
    const recentRsis = smoothedRsi.slice(-16, -1);
    const minClose = Math.min(...recentCloses);
    const maxClose = Math.max(...recentCloses);
    const minCloseIdx = recentCloses.indexOf(minClose);
    const maxCloseIdx = recentCloses.indexOf(maxClose);
    const rsiAtMinClose = recentRsis[minCloseIdx];
    const rsiAtMaxClose = recentRsis[maxCloseIdx];

    if (currentPrice < minClose && currentRsi > rsiAtMinClose) bullishDiv = true;
    if (currentPrice > maxClose && currentRsi < rsiAtMaxClose) bearishDiv = true;

    // 5. CryptoCroc Dynamische Banden
    const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const atrAvg = SMA.calculate({ period: 50, values: atrValues });
    const currentAtr = atrValues[atrValues.length - 1];
    const currentAtrAvg = atrAvg[atrAvg.length - 1];
    const ratio = currentAtrAvg === 0 ? 1.0 : currentAtr / currentAtrAvg;
    
    const recentRsiValues = smoothedRsi.slice(-50);
    const rRange = Math.max(...recentRsiValues) - Math.min(...recentRsiValues);
    
    const stress = (clamp01(1.0 - ratio) + clamp01((40.0 - rRange) / 30.0)) / 2.0; 
    const tComp = Math.pow(stress, 1.0); 

    const d1 = lerp(20.0, 12.0, tComp), d2 = lerp(30.0, 18.0, tComp), d3 = lerp(40.0, 24.0, tComp);
    const U1 = 50 + d1, U2 = 50 + d2, U3 = 50 + d3;
    const L1 = 50 - d1, L2 = 50 - d2, L3 = 50 - d3;

    // 6. ACTIONABILITY & TYPE
    let actionability = "WATCHLIST"; 
    let type = currentRsi < 50 ? "long" : "short"; 
    let tags = [];
    
    if (currentRsi <= L2) { actionability = "TRADE_NOW"; type = "long"; }
    else if (currentRsi <= L1) { actionability = "EARLY"; type = "long"; }
    else if (currentRsi >= U2) { actionability = "TRADE_NOW"; type = "short"; }
    else if (currentRsi >= U1) { actionability = "EARLY"; type = "short"; }

    // =========================================================
    // 7. RANKING SCORE (DE NIEUWE ZWAARTE HIËRARCHIE)
    // =========================================================
    let baseScore = Math.abs(currentRsi - 50) * 2; 
    let scoreMultiplier = 1.0;

    // A. ZWAARSTE WEGING: BTC Macro Trend (Koning)
    if (btcTrend !== 'neutral') {
        if (type === btcTrend) {
            tags.push("👑 Met BTC Mee");
            scoreMultiplier += 0.8; // Zware Bonus
        } else {
            tags.push("⚡ Tegen BTC In");
            scoreMultiplier -= 0.6; // Zware Straf
        }
    }

    // B. TWEEDE WEGING: Lokale 50 EMA Trend
    tags.push(trendTag);
    if (type === 'long') { scoreMultiplier += trendScore; } 
    else { scoreMultiplier -= trendScore; } 

    // C. DERDE WEGING: Divergentie (Omkeer signaal)
    if (type === 'long' && bullishDiv) { tags.push("Bull Div"); scoreMultiplier += 0.5; }
    if (type === 'short' && bearishDiv) { tags.push("Bear Div"); scoreMultiplier += 0.5; }

    // D. VIERDE WEGING: Volume (Whale Check)
    if (hasHighVolume) { tags.push("Volume+"); scoreMultiplier += 0.2; }

    // Eindscore berekenen en limiteren tussen 1 en 99
    let finalRankScore = Math.min(99, Math.max(1, baseScore * scoreMultiplier));

    // 8. SETUP CLASSIFICATIE
    let setupClass = "C";
    if (finalRankScore > 75) setupClass = "A";
    else if (finalRankScore > 50) setupClass = "B";

    // 9. STRUCTURAL TP & SL
    let sl = 0, tp1 = 0, tp2 = 0; 
    const lookback = 24;
    const recentLowsForSL = lows.slice(-lookback);
    const recentHighsForSL = highs.slice(-lookback);
    const swingLow = Math.min(...recentLowsForSL);
    const swingHigh = Math.max(...recentHighsForSL);

    if (type === 'long') {
        const structuralRisk = currentPrice - swingLow;
        const actualRisk = Math.max(structuralRisk, currentAtr * 1.5); 
        sl = currentPrice - actualRisk;
        tp1 = currentPrice + (actualRisk * 1.0); 
        tp2 = currentPrice + (actualRisk * 2.0); 
    } else {
        const structuralRisk = swingHigh - currentPrice;
        const actualRisk = Math.max(structuralRisk, currentAtr * 1.5);
        sl = currentPrice + actualRisk;
        tp1 = currentPrice - (actualRisk * 1.0);
        tp2 = currentPrice - (actualRisk * 2.0);
    }

    return {
        rsi: currentRsi.toFixed(2),
        actionability: actionability,
        setupClass: setupClass,
        rankScore: finalRankScore,
        type: type,
        tags: tags,
        entry: formatPrice(currentPrice),
        tp1: formatPrice(tp1),
        tp2: formatPrice(tp2),
        sl: formatPrice(sl)
    };
}
