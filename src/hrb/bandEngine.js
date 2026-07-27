import { HRB_PARAMS as P } from "./config.js";
import { emaPine, smaArr, rsiArr, atrArr } from "../indicator/indicators.js";

/**
 * Volledige poort van de Hybrid RSI Price Band (ffgbs).
 * Berekent de hybride lijnen + alle richtings-/breakout-/breedte-/candlefilters,
 * en reconstrueert cooldown + rearm deterministisch over het venster (geen
 * persistente state, identiek aan het Pine-gedrag met var longArmed/shortArmed).
 *
 * Retourneert per-bar arrays plus een helper die op elke bar-index vertelt of
 * daar een LONG- of SHORT-signaal geldig zou zijn (na cooldown/rearm).
 */
export function computeBand(candles) {
  const n = candles.length;
  const open = candles.map((c) => c.open);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);

  const priceEma = emaPine(close, P.emaPriceLen);
  const priceSma = smaArr(close, P.smaPriceLen);
  const atr = atrArr(candles, P.atrLen);
  const rsiRaw = rsiArr(close, P.rsiLen);
  const rsiEma = emaPine(rsiRaw.map((v) => (v == null ? 50 : v)), P.rsiEmaLen);
  const rsiSma = smaArr(rsiRaw.map((v) => (v == null ? 50 : v)), P.rsiSmaLen);
  const ema200 = P.useEma200Filter ? emaPine(close, P.ema200Len) : null;

  const normRange = Math.max(P.rsiNeutral, 100 - P.rsiNeutral);

  const emaRsiLine = new Array(n).fill(null);
  const smaRsiLine = new Array(n).fill(null);
  const upperBand = new Array(n).fill(null);
  const lowerBand = new Array(n).fill(null);
  const bandMiddle = new Array(n).fill(null);
  const bandWidthAtr = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (priceEma[i] == null || priceSma[i] == null || atr[i] == null || rsiEma[i] == null || rsiSma[i] == null) continue;
    const a = atr[i];
    const rsiEmaNorm = normRange > 0 ? (rsiEma[i] - P.rsiNeutral) / normRange : 0;
    const rsiSmaNorm = normRange > 0 ? (rsiSma[i] - P.rsiNeutral) / normRange : 0;
    const maxOffset = a * P.maxRsiOffsetAtr;
    const emaOffset = Math.max(-maxOffset, Math.min(maxOffset, rsiEmaNorm * a * P.emaRsiStrength));
    const smaOffset = Math.max(-maxOffset, Math.min(maxOffset, rsiSmaNorm * a * P.smaRsiStrength));
    const eLine = priceEma[i] + emaOffset;
    const sLine = priceSma[i] + smaOffset;
    emaRsiLine[i] = eLine;
    smaRsiLine[i] = sLine;
    upperBand[i] = Math.max(eLine, sLine);
    lowerBand[i] = Math.min(eLine, sLine);
    bandMiddle[i] = (eLine + sLine) / 2;
    bandWidthAtr[i] = a > 0 ? Math.abs(eLine - sLine) / a : 0;
  }

  // Per-bar: zijn alle LONG- resp. SHORT-filters geldig? (nog zonder cooldown/rearm)
  const longFilters = new Array(n).fill(false);
  const shortFilters = new Array(n).fill(false);
  const insideBand = new Array(n).fill(false);
  const aboveBand = new Array(n).fill(false);
  const belowBand = new Array(n).fill(false);

  for (let i = 0; i < n; i++) {
    if (emaRsiLine[i] == null || atr[i] == null || i < P.bandSlopeLookback || i < P.rsiSlopeLookback) continue;
    const a = atr[i];
    const c = close[i];
    const above = c > upperBand[i];
    const below = c < lowerBand[i];
    aboveBand[i] = above;
    belowBand[i] = below;
    insideBand[i] = c <= upperBand[i] && c >= lowerBand[i];

    // richtingsfilters
    const bandSlopeAtr = a > 0 ? (bandMiddle[i] - bandMiddle[i - P.bandSlopeLookback]) / a : 0;
    const rsiEmaSlope = rsiEma[i] - rsiEma[i - P.rsiSlopeLookback];
    const rsiSmaSlope = rsiSma[i] - rsiSma[i - P.rsiSlopeLookback];

    const longHybrid = emaRsiLine[i] > smaRsiLine[i];
    const shortHybrid = emaRsiLine[i] < smaRsiLine[i];
    const longRsiOrder = rsiEma[i] > rsiSma[i];
    const shortRsiOrder = rsiEma[i] < rsiSma[i];
    const longNeutral = rsiEma[i] > P.rsiNeutral && rsiSma[i] > P.rsiNeutral;
    const shortNeutral = rsiEma[i] < P.rsiNeutral && rsiSma[i] < P.rsiNeutral;
    const longRsiSlope = rsiEmaSlope >= P.minRsiSlope && rsiSmaSlope >= P.minRsiSlope;
    const shortRsiSlope = rsiEmaSlope <= -P.minRsiSlope && rsiSmaSlope <= -P.minRsiSlope;
    const longBandSlope = bandSlopeAtr >= P.minBandSlopeAtr;
    const shortBandSlope = bandSlopeAtr <= -P.minBandSlopeAtr;

    const longDir =
      (!P.requireHybridOrder || longHybrid) &&
      (!P.requireRsiOrder || longRsiOrder) &&
      (!P.requireRsiNeutralSide || longNeutral) &&
      longRsiSlope && longBandSlope;
    const shortDir =
      (!P.requireHybridOrder || shortHybrid) &&
      (!P.requireRsiOrder || shortRsiOrder) &&
      (!P.requireRsiNeutralSide || shortNeutral) &&
      shortRsiSlope && shortBandSlope;

    // bandbreedte
    const bwValid = bandWidthAtr[i] >= P.minBandWidthAtr && bandWidthAtr[i] <= P.maxBandWidthAtr;

    // breakout-afstand
    const longBoAtr = a > 0 ? (c - upperBand[i]) / a : 0;
    const shortBoAtr = a > 0 ? (lowerBand[i] - c) / a : 0;
    const longBoValid = longBoAtr >= P.minBreakoutAtr && longBoAtr <= P.maxBreakoutAtr;
    const shortBoValid = shortBoAtr >= P.minBreakoutAtr && shortBoAtr <= P.maxBreakoutAtr;

    // candlekwaliteit
    const range = high[i] - low[i];
    const bodyRatio = range > 0 ? Math.abs(c - open[i]) / range : 0;
    const closePos = range > 0 ? (c - low[i]) / range : 0.5;
    const bull = c > open[i];
    const bear = c < open[i];
    const bodyAbove = Math.min(open[i], c) > upperBand[i];
    const bodyBelow = Math.max(open[i], c) < lowerBand[i];
    const longCandle = !P.useCandleQuality || (
      bodyRatio >= P.minBodyRatio && closePos >= P.minLongClosePos &&
      (!P.requireDirectionalCandle || bull) && (!P.requireFullBodyOutside || bodyAbove)
    );
    const shortCandle = !P.useCandleQuality || (
      bodyRatio >= P.minBodyRatio && closePos <= P.maxShortClosePos &&
      (!P.requireDirectionalCandle || bear) && (!P.requireFullBodyOutside || bodyBelow)
    );

    // EMA200-trend
    const longEma = !P.useEma200Filter || (ema200[i] != null && c > ema200[i]);
    const shortEma = !P.useEma200Filter || (ema200[i] != null && c < ema200[i]);

    longFilters[i] = above && longDir && bwValid && longBoValid && longCandle && longEma;
    shortFilters[i] = below && shortDir && bwValid && shortBoValid && shortCandle && shortEma;
  }

  // Cooldown + rearm deterministisch reconstrueren (Pine var-logica).
  const longSignalArr = new Array(n).fill(false);
  const shortSignalArr = new Array(n).fill(false);
  let longArmed = true, shortArmed = true, lastSignalBar = null;

  for (let i = 0; i < n; i++) {
    // rearm: default alleen in-band; optioneel ook bij tegenovergestelde uitbraak
    if (insideBand[i]) { longArmed = true; shortArmed = true; }
    if (!P.rearmOnlyInsideBand) {
      if (belowBand[i]) longArmed = true;
      if (aboveBand[i]) shortArmed = true;
    }
    const cooldownFinished = lastSignalBar == null || i - lastSignalBar > P.cooldownBars;

    const longSig = longArmed && cooldownFinished && longFilters[i];
    const shortSig = shortArmed && cooldownFinished && shortFilters[i];
    longSignalArr[i] = longSig;
    shortSignalArr[i] = shortSig;
    if (longSig) { lastSignalBar = i; longArmed = false; }
    if (shortSig) { lastSignalBar = i; shortArmed = false; }
  }

  return {
    ok: true,
    upperBand, lowerBand, bandMiddle,
    longSignalAt: (i) => longSignalArr[i] === true,
    shortSignalAt: (i) => shortSignalArr[i] === true,
    // meta van de laatste bar, handig voor de diagnose
    lastBarLongFilters: longFilters[n - 1] === true,
    lastBarShortFilters: shortFilters[n - 1] === true,
  };
}
