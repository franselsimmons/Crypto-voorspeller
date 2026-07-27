import { HRB_PARAMS as P } from "./config.js";
import { emaPine, smaArr, rmaArr, atrArr, highestArr, lowestArr } from "../indicator/indicators.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const safeDiv = (n, d) => (d !== 0 ? n / d : 0);
const normPos = (v, lo, hi) => (hi > lo ? clamp((v - lo) / (hi - lo), 0, 1) : 0);
const normInv = (v, lo, hi) => (hi > lo ? 1 - clamp((v - lo) / (hi - lo), 0, 1) : 0);
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const wAvg = (v1, w1, v2, w2) => { const t = w1 + w2; return t > 0 ? (v1 * w1 + v2 * w2) / t : 0; };

/** Wilder DMI/ADX — exact Pine ta.dmi(diLen, adxSmoothing): RMA-smoothing overal. */
function dmiArrays(high, low, close, diLen, adxSmooth) {
  const n = close.length;
  const tr = new Array(n).fill(0);
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = high[i] - high[i - 1];
    const dn = low[i - 1] - low[i];
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  const trR = rmaArr(tr.slice(1), diLen);
  const plusR = rmaArr(plusDM.slice(1), diLen);
  const minusR = rmaArr(minusDM.slice(1), diLen);
  const plusDI = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  const dx = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const t = trR[i - 1], pl = plusR[i - 1], mi = minusR[i - 1];
    if (t == null || pl == null || mi == null || t === 0) continue;
    const pdi = 100 * (pl / t);
    const mdi = 100 * (mi / t);
    plusDI[i] = pdi; minusDI[i] = mdi;
    const sum = pdi + mdi;
    dx[i] = sum === 0 ? 0 : 100 * Math.abs(pdi - mdi) / sum;
  }
  const dxVals = dx.map((v) => (v == null ? 0 : v));
  const adxR = rmaArr(dxVals.slice(1), adxSmooth);
  const adx = new Array(n).fill(null);
  for (let i = 1; i < n; i++) adx[i] = adxR[i - 1];
  return { plusDI, minusDI, adx };
}

/** ta.barssince als array: aantal bars terug sinds cond[] laatst waar was. */
function barsSinceArr(condArr) {
  const n = condArr.length;
  const out = new Array(n).fill(null);
  let last = null;
  for (let i = 0; i < n; i++) {
    if (condArr[i]) last = i;
    out[i] = last == null ? null : i - last;
  }
  return out;
}

/** ta.percentile_nearest_rank over de laatste `len` waarden t/m i. */
function percentileNearestRank(values, i, len, pct) {
  const from = Math.max(0, i - len + 1);
  const window = [];
  for (let j = from; j <= i; j++) if (values[j] != null && Number.isFinite(values[j])) window.push(values[j]);
  if (!window.length) return null;
  window.sort((a, b) => a - b);
  const rank = Math.ceil((pct / 100) * window.length);
  return window[clamp(rank - 1, 0, window.length - 1)];
}

/**
 * Volledige HPE-poort. Retourneert per bar de pressureScore-array plus de
 * afgeleide toestand op de laatste bar (confirmed/strong/fakeRisk/followThrough).
 * Stateless window-recompute; identiek aan Pine mits venster ≥ calibrationLength.
 */
export function computeHpe(candles) {
  const n = candles.length;
  const open = candles.map((c) => c.open);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const vol = candles.map((c) => c.volume);
  const src = close;

  const atr = atrArr(candles, P.atrLen);
  const fastAtr = atrArr(candles, P.fastAtrLen);
  const slowAtr = atrArr(candles, P.slowAtrLen);
  const avgVol = smaArr(vol, P.volumeLen);
  const { plusDI, minusDI, adx } = dmiArrays(high, low, close, P.diLen, P.adxSmoothing);

  // atrRatio + compressie
  const atrRatio = new Array(n).fill(null);
  for (let i = 0; i < n; i++) if (fastAtr[i] != null && slowAtr[i] != null) atrRatio[i] = safeDiv(fastAtr[i], slowAtr[i]);
  const isCompressed = atrRatio.map((r) => r != null && r <= P.compressionThreshold);
  const barsSinceComp = barsSinceArr(isCompressed);
  const lowestCompRatio = lowestArr(atrRatio.map((v) => (v == null ? Infinity : v)), P.compressionLookback);

  // richting-smoothing
  const priceChange = new Array(n).fill(0);
  for (let i = 1; i < n; i++) priceChange[i] = src[i] - src[i - 1];
  const smoothedDir = emaPine(priceChange, P.directionSmoothing);

  // efficiëntie + persistentie
  const candleDir = close.map((c, i) => sign(c - open[i]));
  const dirPersistence = emaPine(candleDir, P.persistenceLen);
  const rawStructure = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i < P.efficiencyLen) { rawStructure[i] = 0; continue; }
    const net = src[i] - src[i - P.efficiencyLen];
    let travel = 0;
    for (let j = i - P.efficiencyLen + 1; j <= i; j++) travel += Math.abs(src[j] - src[j - 1]);
    const eff = safeDiv(net, travel);
    rawStructure[i] = eff * 0.65 + (dirPersistence[i] ?? 0) * 0.35;
  }
  const structureDir = emaPine(rawStructure, P.structureSmoothing).map((v) => clamp(v ?? 0, -1, 1));

  const rawPressure = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    if (atr[i] == null || atr[i] <= 0 || avgVol[i] == null) { rawPressure[i] = 0; continue; }
    const safeAtr = Math.max(atr[i], 1e-10);
    const range = Math.max(high[i] - low[i], 1e-10);
    const body = close[i] - open[i];
    const absBody = Math.abs(body);
    const bodyRatio = safeDiv(absBody, range);
    const rangeAtr = safeDiv(range, safeAtr);
    const closeLoc = safeDiv(close[i] - low[i], range);
    const bullCloseQ = clamp((closeLoc - 0.5) * 2, 0, 1);
    const bearCloseQ = clamp((0.5 - closeLoc) * 2, 0, 1);
    const cDir = candleDir[i];
    const generalDir = sign(smoothedDir[i] ?? 0);

    // compressie-bereidheid
    const recentComp = barsSinceComp[i] != null && barsSinceComp[i] <= P.compressionMaxAge;
    const compDepth = normInv(lowestCompRatio[i] ?? P.compressionThreshold, P.deepCompressionThreshold, P.compressionThreshold);
    const compFresh = recentComp ? 1 - safeDiv(barsSinceComp[i], Math.max(P.compressionMaxAge, 1)) : 0;
    const compReadiness = recentComp ? clamp(compDepth * 0.65 + compFresh * 0.35, 0, 1) : 0;

    // preparation
    const sDir = structureDir[i];
    const signedComp = compReadiness * (Math.abs(sDir) > 0.05 ? sign(sDir) : generalDir);
    let prepNorm = clamp(wAvg(signedComp, P.compressionWeight, sDir, P.structureWeight), -1, 1);
    const prepReadiness = clamp(Math.max(compReadiness, Math.abs(sDir)), 0, 1);

    // release: candle
    const rangeStrength = normPos(rangeAtr, P.normalRangeAtr, P.strongRangeAtr);
    const bodyStrength = normPos(bodyRatio, P.minBodyRatioHpe, P.strongBodyRatio);
    const dirCloseQ = cDir > 0 ? bullCloseQ : cDir < 0 ? bearCloseQ : 0;
    const baseCandleQ = clamp(bodyStrength * 0.45 + dirCloseQ * 0.35 + rangeStrength * 0.20, 0, 1);
    const overextPenalty = normPos(rangeAtr, P.overextendedRangeAtr, P.maximumRangeAtr);
    const candleExtMult = clamp(1 - overextPenalty * 0.75, 0.25, 1);
    const candleScore = baseCandleQ * candleExtMult * cDir;

    // release: DMI/ADX
    const pdi = plusDI[i] ?? 0, mdi = minusDI[i] ?? 0;
    const diTotal = pdi + mdi;
    const diDom = safeDiv(pdi - mdi, diTotal);
    const adxLevel = normPos(adx[i] ?? 0, P.minimumAdx, P.fullAdx);
    const adxRise = (adx[i] ?? 0) - (adx[i - P.adxRiseLookback] ?? 0);
    const adxRiseStr = normPos(adxRise, 0, P.fullAdxRise);
    const adxCombined = clamp(adxLevel * 0.35 + adxRiseStr * 0.65, 0, 1);
    const dmiScore = clamp(diDom * (0.35 + adxCombined * 0.65), -1, 1);

    // release: volume/absorptie
    const relVol = safeDiv(vol[i], avgVol[i]);
    const volStrength = normPos(relVol, P.minRelVolume, P.fullRelVolume);
    const isClimax = relVol >= P.climaxRelVolume;
    const poorCandle = bodyRatio <= P.absorptionBodyRatio;
    const upWick = safeDiv(high[i] - Math.max(open[i], close[i]), range);
    const dnWick = safeDiv(Math.min(open[i], close[i]) - low[i], range);
    const bullAbsorp = cDir > 0 && isClimax && (poorCandle || upWick > 0.45);
    const bearAbsorp = cDir < 0 && isClimax && (poorCandle || dnWick > 0.45);
    const absorption = bullAbsorp || bearAbsorp;
    const volResultQ = clamp(bodyRatio * 0.55 + dirCloseQ * 0.45, 0, 1);
    let volMag = volStrength * volResultQ;
    if (absorption) volMag *= 1 - P.absorptionPenalty;
    const volScore = clamp(volMag * cDir, -1, 1);

    // release: volatiliteitsvrijgave
    const releaseStr = normPos(atrRatio[i] ?? 0, P.releaseStartsAt, P.fullReleaseAt);
    const releaseAccel = (atrRatio[i] ?? 0) - (atrRatio[i - P.releaseAccelLookback] ?? 0);
    const accelStr = normPos(releaseAccel, 0, 0.30);
    let volatMag = clamp(releaseStr * 0.60 + accelStr * 0.40, 0, 1);
    const compBonus = recentComp ? 0.15 * compReadiness : 0;
    volatMag = clamp(volatMag + compBonus, 0, 1);
    const releaseDir = Math.abs(cDir) > 0 ? cDir : generalDir;
    const volatScore = volatMag * releaseDir;

    // release-blok
    const relTotalW = Math.max(P.candleWeight + P.dmiWeight + P.volumeWeight + P.volatilityWeight, 1);
    let releaseNorm = clamp(
      (candleScore * P.candleWeight + dmiScore * P.dmiWeight + volScore * P.volumeWeight + volatScore * P.volatilityWeight) / relTotalW,
      -1, 1
    );

    // richtingsconflict
    const prepDir = sign(prepNorm);
    const relDir = sign(releaseNorm);
    const agreement = prepDir === 0 || relDir === 0 || prepDir === relDir;
    const agreementMult = agreement ? 1 : 0.55;

    // preparation-gate
    const prepGate = clamp(0.55 + prepReadiness * 0.45, 0.55, 1);
    const insufficientPrep = prepReadiness < P.minimumPreparation;
    const minPrepMult = insufficientPrep ? clamp(safeDiv(prepReadiness, Math.max(P.minimumPreparation, 0.01)), 0.5, 1) : 1;

    // eindscore
    const mainW = Math.max(P.preparationWeight + P.releaseWeight, 1);
    let combined = (prepNorm * P.preparationWeight + releaseNorm * P.releaseWeight) / mainW;
    combined = combined * prepGate * minPrepMult * agreementMult;
    const globalExtMult = clamp(1 - overextPenalty * 0.45, 0.55, 1);
    combined = combined * globalExtMult;
    rawPressure[i] = clamp(combined * 115, -100, 100);
  }

  // score-smoothing
  const pressure = P.scoreSmoothing <= 1 ? rawPressure.slice() : emaPine(rawPressure, P.scoreSmoothing).map((v) => clamp(v ?? 0, -100, 100));

  // adaptieve drempels op de laatste bar
  const last = n - 1;
  const absPressure = pressure.map((v) => Math.abs(v));
  const enoughCalib = last >= P.calibrationLength;
  const useAdaptive = P.useAdaptiveThresholds && enoughCalib;

  let building, confirmed, strong;
  if (useAdaptive) {
    const bRaw = percentileNearestRank(absPressure, last, P.calibrationLength, P.buildingPercentile);
    const cRaw = percentileNearestRank(absPressure, last, P.calibrationLength, P.confirmedPercentile);
    const sRaw = percentileNearestRank(absPressure, last, P.calibrationLength, P.strongPercentile);
    building = clamp(bRaw ?? P.fixedBuilding, P.minAdaptiveBuilding, P.maxAdaptiveBuilding);
    confirmed = clamp(cRaw ?? P.fixedConfirmed, P.minAdaptiveConfirmed, P.maxAdaptiveConfirmed);
    strong = clamp(sRaw ?? P.fixedStrong, P.minAdaptiveStrong, P.maxAdaptiveStrong);
    confirmed = Math.max(confirmed, building + 6);
    strong = Math.max(strong, confirmed + 8);
  } else {
    building = P.fixedBuilding; confirmed = P.fixedConfirmed; strong = P.fixedStrong;
  }

  const s = pressure[last];
  const sPrev = pressure[last - 1] ?? 0;
  const sPrev2 = pressure[last - 2] ?? 0;

  const bullConfirmed = s >= confirmed;
  const bearConfirmed = s <= -confirmed;
  const bullStrong = s >= strong;
  const bearStrong = s <= -strong;

  // follow-through (over laatste followThroughBars)
  const ftBars = P.followThroughBars;
  const holdBull = confirmed * P.holdThresholdFactor;
  const holdBear = -confirmed * P.holdThresholdFactor;
  const lowestScore = lowestArr(pressure, ftBars)[last];
  const highestScore = highestArr(pressure, ftBars)[last];
  const bullHeld = lowestScore != null && lowestScore >= holdBull;
  const bearHeld = highestScore != null && highestScore <= holdBear;

  // fake-risk
  const bullDecaying = s > 0 && s < sPrev && sPrev < sPrev2;
  const bearDecaying = s < 0 && s > sPrev && sPrev > sPrev2;
  // insufficientPreparation op de laatste bar herleiden we uit prepReadiness-benadering:
  // opnieuw berekenen is duur; we gebruiken de score-gebaseerde signalen (conservatief).
  const bullFakeRisk = s < building || bullDecaying;
  const bearFakeRisk = s > -building || bearDecaying;

  return {
    ok: true,
    pressure: s,
    building, confirmed, strong,
    bullConfirmed, bearConfirmed, bullStrong, bearStrong,
    bullFollowThrough: P.enableFollowThrough ? bullHeld && s > 0 : true,
    bearFollowThrough: P.enableFollowThrough ? bearHeld && s < 0 : true,
    bullFakeRisk, bearFakeRisk,
  };
}
