import { RSI, EMA, SMA, ATR } from 'technicalindicators';

const clamp01 = (val) => Math.min(1.0, Math.max(0.0, val));
const lerp = (a, b, t) => a + (b - a) * t;

export function calculateCryptoCroc(klines) {
    // klines = [openTime, open, high, low, close, volume, ...]
    const closes = klines.map(k => parseFloat(k[4]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));

    // 1. Basis RSI (Lengte 14)
    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    
    // 2. Smoothed RSI (EMA 30)
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    const currentRsi = smoothedRsi[smoothedRsi.length - 1];

    // 3. ATR Compressie (Stress)
    const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const atrAvg = SMA.calculate({ period: 50, values: atrValues });
    
    const currentAtr = atrValues[atrValues.length - 1];
    const currentAtrAvg = atrAvg[atrAvg.length - 1];
    
    const ratio = currentAtrAvg === 0 ? 1.0 : currentAtr / currentAtrAvg;
    const sATR = clamp01(1.0 - ratio);

    // 4. RSI Compressie (Voor dit voorbeeld gelijkgesteld aan ATR compressie)
    const stress = sATR; 
    const tComp = Math.pow(stress, 1.0); // compressPower is 1.0

    // 5. Dynamische Zones berekenen
    const baseD1 = 20.0, baseD2 = 30.0, baseD3 = 40.0;
    const minD1 = 12.0, minD2 = 18.0, minD3 = 24.0;

    const d1 = lerp(baseD1, minD1, tComp);
    const d2 = lerp(baseD2, minD2, tComp);
    const d3 = lerp(baseD3, minD3, tComp);

    const U1 = 50 + d1, U2 = 50 + d2, U3 = 50 + d3;
    const L1 = 50 - d1, L2 = 50 - d2, L3 = 50 - d3;

    // 6. Signaal genereren
    let signal = "NEUTRAAL";
    let type = "none";

    if (currentRsi <= L3) { signal = "STRONG LONG (Z3)"; type = "long"; }
    else if (currentRsi <= L2) { signal = "LONG (Z2)"; type = "long"; }
    else if (currentRsi <= L1) { signal = "Klaarmaken Long (Z1)"; type = "long"; }
    else if (currentRsi >= U3) { signal = "STRONG SHORT (Z3)"; type = "short"; }
    else if (currentRsi >= U2) { signal = "SHORT (Z2)"; type = "short"; }
    else if (currentRsi >= U1) { signal = "Klaarmaken Short (Z1)"; type = "short"; }

    return {
        rsi: currentRsi.toFixed(2),
        U1: U1.toFixed(2),
        L1: L1.toFixed(2),
        signal: signal,
        type: type
    };
}
