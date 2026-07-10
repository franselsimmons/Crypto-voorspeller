import { cfg } from "../config.js";

/** Exacte poort van Pine secties 20–21. */
export function buildPlan(side, isPullback, x) {
  const P = x.P;
  const tick = x.tick > 0 ? x.tick : 1e-8;
  let anchor, distance, stop, tp1, tp2, structureLevel = null, potentialRR = P.fallbackRoomRR;

  if (side === "LONG") {
    const pbAnchor = Math.min(x.lastSwingLow ?? x.low, x.loZone);
    const boAnchor = Math.min(x.low, x.rangeHi ?? x.low);
    anchor = isPullback ? pbAnchor : boAnchor;
    distance = Math.max(x.close - (anchor - x.atr * P.bufMult), x.atr * P.minStopATR);
    stop = x.close - distance;
    tp1 = x.close + distance * P.tp1R;
    tp2 = x.close + distance * P.tp2R;
    if (x.lastSwingHigh != null && !x.swingHighTaken && x.lastSwingHigh > x.close) {
      structureLevel = x.lastSwingHigh;
      potentialRR = (structureLevel - x.close) / Math.max(distance, tick);
    }
  } else {
    const pbAnchor = Math.max(x.lastSwingHigh ?? x.high, x.hiZone);
    const boAnchor = Math.max(x.high, x.rangeLo ?? x.high);
    anchor = isPullback ? pbAnchor : boAnchor;
    distance = Math.max(anchor + x.atr * P.bufMult - x.close, x.atr * P.minStopATR);
    stop = x.close + distance;
    tp1 = x.close - distance * P.tp1R;
    tp2 = x.close - distance * P.tp2R;
    if (x.lastSwingLow != null && !x.swingLowTaken && x.lastSwingLow < x.close) {
      structureLevel = x.lastSwingLow;
      potentialRR = (x.close - structureLevel) / Math.max(distance, tick);
    }
  }

  return {
    entry: x.close, stop, tp1, tp2, distance,
    stopAtr: x.atr > 0 ? distance / x.atr : null,
    rrToTp1: P.tp1R, rrToTp2: P.tp2R,
    roomToStructureR: potentialRR,
    costR: cfg().costR,
  };
}
