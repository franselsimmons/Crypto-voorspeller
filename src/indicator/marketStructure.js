/**
 * Stateful poort van Pine secties 14–15 met exacte executievolgorde:
 * (1) pivotbevestiging + swing-update, (2) events op pre-mutatie structureBias
 * (CHoCH), (3) failed-break onderhoud, (4) BOS-mutaties, (5) recentheid.
 * Pivotregel: strikt groter/kleiner aan beide zijden (auditpunt A2).
 */
export function createStructure(P) {
  const s = {
    lastSwingHigh: null, prevSwingHigh: null, lastSwingHighTs: null,
    lastSwingLow: null, prevSwingLow: null, lastSwingLowTs: null,
    lastHighType: 0, lastLowType: 0,
    swingHighTaken: false, swingLowTaken: false,
    structureBias: 0,
    upBreakLevel: null, upBreakBar: null, downBreakLevel: null, downBreakBar: null,
    sweepLowBar: null, sweepHighBar: null, failedUpBar: null, failedDownBar: null,
    breakUpBar: null, breakDownBar: null, chochBar: null,
  };

  function confirmedPivot(arr, i, pl, isHigh) {
    const j = i - pl;
    if (j < pl) return null;
    const v = arr[j];
    for (let k = 1; k <= pl; k++) {
      if (isHigh ? arr[j - k] >= v || arr[j + k] >= v : arr[j - k] <= v || arr[j + k] <= v) return null;
    }
    return { value: v, idx: j };
  }

  function step(i, highs, lows, closes, ts) {
    const ph = confirmedPivot(highs, i, P.pivLen, true);
    if (ph) {
      s.prevSwingHigh = s.lastSwingHigh;
      s.lastSwingHigh = ph.value;
      s.lastSwingHighTs = ts[ph.idx];
      s.lastHighType = s.prevSwingHigh == null ? 0 : ph.value > s.prevSwingHigh ? 1 : -1;
      s.swingHighTaken = false;
    }
    const pl = confirmedPivot(lows, i, P.pivLen, false);
    if (pl) {
      s.prevSwingLow = s.lastSwingLow;
      s.lastSwingLow = pl.value;
      s.lastSwingLowTs = ts[pl.idx];
      s.lastLowType = s.prevSwingLow == null ? 0 : pl.value > s.prevSwingLow ? 1 : -1;
      s.swingLowTaken = false;
    }

    const c = closes[i], h = highs[i], l = lows[i];
    const bosUpRaw = !s.swingHighTaken && s.lastSwingHigh != null && c > s.lastSwingHigh;
    const bosDownRaw = !s.swingLowTaken && s.lastSwingLow != null && c < s.lastSwingLow;
    const choch = (bosUpRaw && s.structureBias === -1) || (bosDownRaw && s.structureBias === 1);
    const sweepLow = !s.swingLowTaken && s.lastSwingLow != null && l < s.lastSwingLow && c > s.lastSwingLow;
    const sweepHigh = !s.swingHighTaken && s.lastSwingHigh != null && h > s.lastSwingHigh && c < s.lastSwingHigh;

    const failedUp = s.upBreakLevel != null && c < s.upBreakLevel;
    const failedDown = s.downBreakLevel != null && c > s.downBreakLevel;
    if (failedUp) { s.upBreakLevel = null; s.upBreakBar = null; }
    else if (s.upBreakBar != null && i - s.upBreakBar > P.failWin) { s.upBreakLevel = null; s.upBreakBar = null; }
    if (failedDown) { s.downBreakLevel = null; s.downBreakBar = null; }
    else if (s.downBreakBar != null && i - s.downBreakBar > P.failWin) { s.downBreakLevel = null; s.downBreakBar = null; }

    if (bosUpRaw) {
      s.upBreakLevel = s.lastSwingHigh; s.upBreakBar = i;
      s.swingHighTaken = true; s.structureBias = 1;
    }
    if (bosDownRaw) {
      s.downBreakLevel = s.lastSwingLow; s.downBreakBar = i;
      s.swingLowTaken = true; s.structureBias = -1;
    }

    if (sweepLow) s.sweepLowBar = i;
    if (sweepHigh) s.sweepHighBar = i;
    if (failedUp) s.failedUpBar = i;
    if (failedDown) s.failedDownBar = i;
    if (bosUpRaw) s.breakUpBar = i;
    if (bosDownRaw) s.breakDownBar = i;
    if (choch) s.chochBar = i;

    const rec = (bar, mem) => bar != null && i - bar <= mem;
    return {
      structureUp: s.lastHighType === 1 && s.lastLowType === 1,
      structureDown: s.lastHighType === -1 && s.lastLowType === -1,
      structureBias: s.structureBias,
      lastSwingHigh: s.lastSwingHigh, lastSwingLow: s.lastSwingLow,
      lastSwingHighTs: s.lastSwingHighTs, lastSwingLowTs: s.lastSwingLowTs,
      swingHighTaken: s.swingHighTaken, swingLowTaken: s.swingLowTaken,
      recentSweepLow: rec(s.sweepLowBar, P.sweepMem),
      recentSweepHigh: rec(s.sweepHighBar, P.sweepMem),
      recentFailedUp: rec(s.failedUpBar, P.sweepMem),
      recentFailedDown: rec(s.failedDownBar, P.sweepMem),
      recentBreakUp: rec(s.breakUpBar, P.breakMem),
      recentBreakDown: rec(s.breakDownBar, P.breakMem),
      chochBar: s.chochBar,
    };
  }

  return { step, state: s };
}
