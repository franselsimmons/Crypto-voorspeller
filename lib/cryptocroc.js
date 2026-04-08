import { RSI, EMA, SMA, ATR } from 'technicalindicators';

const clamp01 = (val) => Math.min(1.0, Math.max(0.0, val));
const lerp = (a, b, t) => a + (b - a) * t;

export function calculateCryptoCroc(klines) {
    const closes = klines.map(k => parseFloat(k[4]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const volumes = klines.map(k => parseFloat(k[5])); // Volume toegevoegd!

    const currentPrice = closes[closes.length - 1];

    // 1. Basis RSI & Smoothing
    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    const currentRsi = smoothedRsi[smoothedRsi.length - 1];

    // 2. Trend Filter (200 EMA)
    const ema200 = EMA.calculate({ period: 200, values: closes });
    const currentEma200 = ema200.length > 0 ? ema200[ema200.length - 1] : currentPrice;
    const isUptrend = currentPrice > currentEma200;
    const isDowntrend = currentPrice < currentEma200;

    // 3. Volume Bevestiging (Boven het 20-uurs gemiddelde?)
    const volSma = SMA.calculate({ period: 20, values: volumes });
    const currentVol = volumes[volumes.length - 1];
    const avgVol = volSma.length > 0 ? volSma[volSma.length - 1] : currentVol;
    const hasHighVolume = currentVol > avgVol;

    // 4. Divergentie Filter (Kijk 15 uur terug)
    let bullishDiv = false;
    let bearishDiv = false;
    
    // Pak de laatste 15 kaarsen (zonder de huidige)
    const recentCloses = closes.slice(-16, -1);
    const recentRsis = smoothedRsi.slice(-16, -1);
    
    const minClose = Math.min(...recentCloses);
    const maxClose = Math.max(...recentCloses);
    const minCloseIdx = recentCloses.indexOf(minClose);
    const maxCloseIdx = recentCloses.indexOf(maxClose);
    
    const rsiAtMinClose = recentRsis[minCloseIdx];
    const rsiAtMaxClose = recentRsis[maxCloseIdx];

    // Prijs is lager, maar RSI is HOGER (Bodemverzwakking)
    if (currentPrice < minClose && currentRsi > rsiAtMinClose) bullishDiv = true;
    // Prijs is hoger, maar RSI is LAGER (Topverzwakking)
    if (currentPrice > maxClose && currentRsi < rsiAtMaxClose) bearishDiv = true;

    // 5. Stress / Compressie & Banden (De originele code)
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

    // 6. Signaal Bepaling
    let signal = "NEUTRAAL";
    let type = "none";
    let tags = [];
    let multiplier = 1.0;

    if (currentRsi <= L3) { signal = "STRONG LONG (Z3)"; type = "long"; }
    else if (currentRsi <= L2) { signal = "LONG (Z2)"; type = "long"; }
    else if (currentRsi <= L1) { signal = "Klaarmaken Long (Z1)"; type = "long"; }
    else if (currentRsi >= U3) { signal = "STRONG SHORT (Z3)"; type = "short"; }
    else if (currentRsi >= U2) { signal = "SHORT (Z2)"; type = "short"; }
    else if (currentRsi >= U1) { signal = "Klaarmaken Short (Z1)"; type = "short"; }

    // 7. Beoordeel het Signaal met onze nieuwe filters
    if (type === 'long') {
        if (isUptrend) { tags.push("Trend OK"); multiplier += 0.5; } // Met de macro trend mee
        if (hasHighVolume) { tags.push("High Vol"); multiplier += 0.3; } // Whale activiteit
        if (bullishDiv) { tags.push("Bull Div"); multiplier += 0.8; } // Prijsommekeer bevestigd
    } else if (type === 'short') {
        if (isDowntrend) { tags.push("Trend OK"); multiplier += 0.5; }
        if (hasHighVolume) { tags.push("High Vol"); multiplier += 0.3; }
        if (bearishDiv) { tags.push("Bear Div"); multiplier += 0.8; }
    }

    return {
        rsi: currentRsi.toFixed(2),
        U1: U1.toFixed(2),
        L1: L1.toFixed(2),
        signal: signal,
        type: type,
        tags: tags,
        scoreMultiplier: multiplier
    };
}
