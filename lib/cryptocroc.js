import { RSI, EMA, SMA, ATR } from 'technicalindicators';

const clamp01 = (val) => Math.min(1.0, Math.max(0.0, val));
const lerp = (a, b, t) => a + (b - a) * t;

function formatPrice(price) {
    if (!price) return "0";
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toPrecision(4); 
}

export function calculateCryptoCroc(klines) {
    const closes = klines.map(k => parseFloat(k[4]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const volumes = klines.map(k => parseFloat(k[5])); 

    const currentPrice = closes[closes.length - 1];

    // 1. RSI
    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    const currentRsi = smoothedRsi[smoothedRsi.length - 1];

    // 2. Trend Filter (Aangepast van 200 EMA naar 50 EMA voor veel betere 1H signalen!)
    const ema50 = EMA.calculate({ period: 50, values: closes });
    const currentEma50 = ema50.length > 0 ? ema50[ema50.length - 1] : currentPrice;
    const isUptrend = currentPrice > currentEma50;
    const isDowntrend = currentPrice < currentEma50;

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

    // 5. CryptoCroc Banden
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

    // 6. Signaal Genereren
    let signal = "NEUTRAAL";
    let type = "none";
    let tags = [];
    let multiplier = 1.0;

    if (currentRsi <= L3) { signal = "STRONG LONG"; type = "long"; }
    else if (currentRsi <= L2) { signal = "LONG"; type = "long"; }
    else if (currentRsi <= L1) { signal = "PREP LONG"; type = "long"; }
    else if (currentRsi >= U3) { signal = "STRONG SHORT"; type = "short"; }
    else if (currentRsi >= U2) { signal = "SHORT"; type = "short"; }
    else if (currentRsi >= U1) { signal = "PREP SHORT"; type = "short"; }

    if (type === 'long') {
        if (isUptrend) { tags.push("Trend OK"); multiplier += 0.5; } 
        if (hasHighVolume) { tags.push("High Vol"); multiplier += 0.3; } 
        if (bullishDiv) { tags.push("Bull Div"); multiplier += 0.8; } 
    } else if (type === 'short') {
        if (isDowntrend) { tags.push("Trend OK"); multiplier += 0.5; }
        if (hasHighVolume) { tags.push("High Vol"); multiplier += 0.3; }
        if (bearishDiv) { tags.push("Bear Div"); multiplier += 0.8; }
    }

    // 7. TP en SL Berekening via ATR
    let sl = 0;
    let tp1 = 0; 
    let tp2 = 0; 
    
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
