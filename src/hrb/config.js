import { sha256Hex, stableStringify } from "../utils/hash.js";

/**
 * HPE + Hybrid RSI Band parameters — 1-op-1 met de Pine-defaults van ffgbs.
 * Nooit elders hardcoden. Wijziging hier ⇒ nieuwe parameterHash ⇒ nieuwe namespace.
 */
export const HRB_PARAMS = Object.freeze({
  // Band — prijs & RSI
  emaPriceLen: 34, smaPriceLen: 21,
  rsiLen: 14, rsiEmaLen: 3, rsiSmaLen: 21, rsiNeutral: 50,
  atrLen: 14, emaRsiStrength: 1.0, smaRsiStrength: 1.0, maxRsiOffsetAtr: 1.5,
  // Band — richtingsfilters
  bandSlopeLookback: 3, minBandSlopeAtr: 0.0,
  rsiSlopeLookback: 3, minRsiSlope: 0.0,
  requireHybridOrder: true, requireRsiOrder: true, requireRsiNeutralSide: true,
  // Band — breedte / breakout / candle
  minBandWidthAtr: 0.0, maxBandWidthAtr: 2.0,
  minBreakoutAtr: 0.0, maxBreakoutAtr: 1.5,
  useCandleQuality: true, minBodyRatio: 0.35,
  minLongClosePos: 0.60, maxShortClosePos: 0.40,
  requireDirectionalCandle: true, requireFullBodyOutside: false,
  useEma200Filter: false, ema200Len: 200,
  cooldownBars: 8, rearmOnlyInsideBand: true,

  // HPE — algemeen
  scoreSmoothing: 3, directionSmoothing: 3,
  // HPE — compressie
  fastAtrLen: 5, slowAtrLen: 40, compressionLookback: 12,
  compressionThreshold: 0.80, deepCompressionThreshold: 0.62, compressionMaxAge: 8,
  // HPE — structuur
  efficiencyLen: 10, persistenceLen: 6, structureSmoothing: 3, minimumPreparation: 0.18,
  // HPE — candle
  normalRangeAtr: 0.80, strongRangeAtr: 1.60, overextendedRangeAtr: 2.20,
  maximumRangeAtr: 3.50, minBodyRatioHpe: 0.45, strongBodyRatio: 0.75,
  // HPE — DMI/ADX
  diLen: 14, adxSmoothing: 14, adxRiseLookback: 3,
  minimumAdx: 12.0, fullAdx: 32.0, fullAdxRise: 4.0,
  // HPE — volume
  volumeLen: 30, minRelVolume: 0.90, fullRelVolume: 1.80, climaxRelVolume: 3.00,
  absorptionBodyRatio: 0.35, absorptionPenalty: 0.55,
  // HPE — volatiliteitsvrijgave
  releaseStartsAt: 0.95, fullReleaseAt: 1.35, releaseAccelLookback: 3,
  // HPE — gewichten
  preparationWeight: 42.0, releaseWeight: 58.0,
  compressionWeight: 40.0, structureWeight: 60.0,
  candleWeight: 32.0, dmiWeight: 26.0, volumeWeight: 16.0, volatilityWeight: 26.0,
  // HPE — adaptieve grenzen
  useAdaptiveThresholds: true, calibrationLength: 300,
  buildingPercentile: 60, confirmedPercentile: 75, strongPercentile: 90,
  fixedBuilding: 20.0, fixedConfirmed: 35.0, fixedStrong: 52.0,
  minAdaptiveBuilding: 16.0, minAdaptiveConfirmed: 28.0, minAdaptiveStrong: 42.0,
  maxAdaptiveBuilding: 35.0, maxAdaptiveConfirmed: 52.0, maxAdaptiveStrong: 72.0,
  // HPE — follow-through
  enableFollowThrough: true, followThroughBars: 2,
  holdThresholdFactor: 0.72, maximumScoreDecay: 18.0,

  // Exits (Optie A — identiek aan ARS-U)
  bufMult: 0.35, minStopATR: 0.5, maxStopATR: 3.0,
  pivLen: 4, tp1R: 1.0, tp2R: 2.0,
});

let memo = null;
export function hrbCfg() {
  if (memo) return memo;
  const parameterHash = sha256Hex(stableStringify(HRB_PARAMS)).slice(0, 12);
  memo = Object.freeze({
    indicatorVersion: "HRB-1.0",
    parameterHash,
    namespace: `HRB-1.0:${parameterHash}`,
    engineVersion: "1.0.0",
    warmupBars: 320,        // kalibratie 300 + marge voor barssince/percentile
    candleLimit: 360,       // iets ruimer dan ARS-U (340) i.v.m. 300-venster
    costR: 0.15,
    minTotalPerFamily: 30,
    kPrior: 10,
    bootstrapB: 4000,
    bhAlpha: 0.10,
  });
  return memo;
}

export const HRB_FAMILY_IDS = Object.freeze(
  ["LONG", "SHORT"].flatMap((d) => ["CONFIRMED", "STRONG"].map((k) => `${d}:${k}`))
);

export const hrbFamilyId = (direction, cls) => `${direction}:${cls}`;
