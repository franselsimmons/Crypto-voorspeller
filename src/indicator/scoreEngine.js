import { clamp } from "../utils/math.js";

/** Exacte poort van Pine secties 25–26. Retourneert delen + totaal + klasse. */
export function scoreSide(side, isPullback, x) {
  const P = x.P;
  const long = side === "LONG";

  let regime = 8;
  if (isPullback) regime = (long ? x.bullRegime : x.bearRegime) ? 15 : 10;
  else if (x.loVolRank <= 15) regime = 15;
  else if (x.loVolRank <= P.compRankTh) regime = 12;

  const htf = x.htfBias === (long ? 1 : -1) ? 10 : 5;

  let baseStruct = 4;
  if (long ? x.structureUp : x.structureDown) baseStruct = 12;
  else if (x.structureBias === (long ? 1 : -1)) baseStruct = 8;
  const breakPts = (long ? x.recentBreakUp : x.recentBreakDown) ? 5 : 0;
  const swing = long ? x.lastSwingLow : x.lastSwingHigh;
  const locPts = swing != null && (long ? x.close > swing : x.close < swing) ? 3 : 0;
  const structure = Math.min(20, baseStruct + breakPts + locPts);

  let momentum;
  if (isPullback) {
    const headroom = long
      ? clamp((x.overbought - x.rsi) / Math.max(x.overbought - 50, 1), 0, 1)
      : clamp((x.rsi - x.oversold) / Math.max(50 - x.oversold, 1), 0, 1);
    momentum = 8 + 7 * headroom;
  } else {
    const thrust = long ? clamp((x.rsi - 55) / 15, 0, 1) : clamp((45 - x.rsi) / 15, 0, 1);
    momentum = 8 + 7 * thrust;
  }

  let volumeScore;
  if (isPullback) {
    const base = x.relVol >= 0.7 ? 6 : 2;
    const flow = (long ? x.flow > 0 : x.flow < 0) ? 5 : 0;
    const bonus = x.relVol >= 1.1 ? 4 : 0;
    volumeScore = Math.min(15, base + flow + bonus);
  } else {
    volumeScore = 15 * clamp((x.relVol - 1.0) / 1.5, 0, 1);
  }

  let liquidity = 4;
  if (long ? x.recentSweepLow : x.recentSweepHigh) liquidity = 10;
  else if (long ? x.recentFailedUp : x.recentFailedDown) liquidity = 0;

  const entryScore = 10 * clamp(1 - Math.max(0, x.entryDistATR - 0.25) / 1.25, 0, 1);
  const room = 5 * clamp((Math.min(x.potentialRR, 6) - P.minRR) / Math.max(3 - P.minRR, 0.5), 0, 1);

  const total = regime + htf + structure + momentum + volumeScore + liquidity + entryScore + room;
  const cls = total >= P.thElite ? "ELITE" : total >= P.thA ? "A" : "B";
  return { total, cls, parts: { regime, htf, structure, momentum, volume: volumeScore, liquidity, entry: entryScore, room } };
}
