import { RSI, EMA, SMA, ATR } from 'technicalindicators';

// Hulpfunctie om waardes tussen 0 en 1 te houden (f_clamp01 uit je Pine Script)
const clamp01 = (val) => Math.min(1.0, Math.max(0.0, val));
// Lineaire interpolatie (f_lerp)
const lerp = (a, b, t) => a + (b - a) * t;

export function calculateCryptoCroc(klines) {
    // klines is een array van [open, high, low, close, volume] van oud naar nieuw
    const closes = klines.map(k => parseFloat(k[4])); // Index 4 is close prijs Binance
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));

    // 1. Basis RSI (Lengte 14)
    const rsiRaw = RSI.calculate({ period: 14, values: closes });
    
    // 2. Smoothed RSI (EMA 30) - We pakken de smoothing uit jouw screenshot/vraag
    const smoothedRsi = EMA.calculate({ period: 30, values: rsiRaw });
    const currentRsi = smoothedRsi[smoothedRsi.length - 1]; // Meest recente waarde

    // 3. ATR Compressie (Stress)
    const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const atrAvg = SMA.calculate({ period: 50, values: atrValues });
    
    const currentAtr = atrValues[atrValues.length - 1];
    const currentAtrAvg = atrAvg[atrAvg.length - 1];
    
    const ratio = currentAtrAvg === 0 ? 1.0 : currentAtr / currentAtrAvg;
    const sATR = clamp01(1.0 - ratio);

    // 4. RSI Compressie
    // Voor het gemak in dit voorbeeld pakken we de simpelste vorm: we gebruiken sATR als hoofd-stress. 
    // In een volledige productie-versie voeg je hier de `ta.highest` en `ta.lowest` RSI range aan toe.
    const stress = sATR; 
    const tComp = Math.pow(stress, 1.0); // compressPower is 1.0 in je script

    // 5. Bereken Dynamische Zones
    // Base afstanden
    const baseD1 = 20.0, baseD2 = 30.0, baseD3 = 40.0;
    // Minimum afstanden (als markt compleet gecomprimeerd is)
    const minD1 = 12.0, minD2 = 18.0, minD3 = 24.0;

    const d1 = lerp(baseD1, minD1, tComp);
    const d2 = lerp(baseD2, minD2, tComp);
    const d3 = lerp(baseD3, minD3, tComp);

    const U1 = 50 + d1, L1 = 50 - d1;
    const U2 = 50 + d2, L2 = 50 - d2;
    const U3 = 50 + d3, L3 = 50 - d3;

    // 6. Genereer Signaal
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
