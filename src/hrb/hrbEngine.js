import { HRB_PARAMS as P, hrbCfg } from "./config.js";
import { atrArr } from "../indicator/indicators.js";
import { createStructure } from "../indicator/marketStructure.js";
import { computeBand } from "./bandEngine.js";
import { computeHpe } from "./hpeEngine.js";

/**
 * Exit-model — identiek aan ARS-U (Optie A). Swing-anker ± 0,35 ATR, begrensd
 * 0,5–3,0 ATR; TP1 = 1R, TP2 = 2R. Zo is het verschil in resultaat tussen ARS-U
 * en HRB puur het verschil tussen de indicatoren, niet tussen de exits.
 */
function buildPlan(side, close, atr, lastSwingHigh, lastSwingLow, swingHighTaken, swingLowTaken, tick) {
  const t = tick > 0 ? tick : 1e-8;
  let anchor, distance, stop, tp1, tp2, structureLevel = null, roomR = P.tp2R;

  if (side === "LONG") {
    anchor = lastSwingLow != null ? lastSwingLow : close - atr;
    distance = Math.max(close - (anchor - atr * P.bufMult), atr * P.minStopATR);
    distance = Math.min(distance, atr * P.maxStopATR);
    stop = close - distance;
    tp1 = close + distance * P.tp1R;
    tp2 = close + distance * P.tp2R;
    if (lastSwingHigh != null && !swingHighTaken && lastSwingHigh > close) {
      structureLevel = lastSwingHigh;
      roomR = (structureLevel - close) / Math.max(distance, t);
    }
  } else {
    anchor = lastSwingHigh != null ? lastSwingHigh : close + atr;
    distance = Math.max(anchor + atr * P.bufMult - close, atr * P.minStopATR);
    distance = Math.min(distance, atr * P.maxStopATR);
    stop = close + distance;
    tp1 = close - distance * P.tp1R;
    tp2 = close - distance * P.tp2R;
    if (lastSwingLow != null && !swingLowTaken && lastSwingLow < close) {
      structureLevel = lastSwingLow;
      roomR = (close - structureLevel) / Math.max(distance, t);
    }
  }

  return {
    entry: close, stop, tp1, tp2, distance,
    stopAtr: atr > 0 ? distance / atr : null,
    rrToTp1: P.tp1R, rrToTp2: P.tp2R,
    roomToStructureR: roomR,
    costR: hrbCfg().costR,
  };
}

function classOf(hpe, side) {
  if (side === "LONG") return hpe.bullStrong ? "STRONG" : "CONFIRMED";
  return hpe.bearStrong ? "STRONG" : "CONFIRMED";
}

/**
 * Volledige HRB-analyse van één symbool-venster (stateless window-recompute).
 * mode "triggers": snelle Band-only prefilter op de laatste bar (HPE-vrij) →
 *   bepaalt of een dure HPE-berekening nodig is.
 * mode "full": Band + HPE + combinatieregel + exits op de laatste gesloten bar.
 *
 * Combinatieregel (Pine ffgbs, 1-op-1):
 *   LONG  = Band longSignal  én HPE bullConfirmed én HPE bullFollowThrough én !bullFakeRisk
 *   SHORT = Band shortSignal én HPE bearConfirmed én HPE bearFollowThrough én !bearFakeRisk
 */
export function analyzeHrbWindow(candles, { mode, tick = 1e-8 }) {
  const c = hrbCfg();
  const n = candles.length;
  if (n < c.warmupBars) return { ok: false, reason: "INSUFFICIENT_HISTORY", bars: n };

  const band = computeBand(candles);
  if (!band.ok) return { ok: false, reason: "BAND_ERROR" };

  const last = n - 1;
  const bandLong = band.longSignalAt(last);
  const bandShort = band.shortSignalAt(last);

  if (mode === "triggers") {
    return { ok: true, mode, candidateLong: bandLong, candidateShort: bandShort };
  }

  // full: geen band-signaal ⇒ klaar
  if (!bandLong && !bandShort) {
    return { ok: true, mode, signalLong: null, signalShort: null, blockedInfo: [], context: null };
  }

  // HPE-toestand op de laatste bar
  const hpe = computeHpe(candles);
  if (!hpe.ok) return { ok: true, mode, signalLong: null, signalShort: null, blockedInfo: ["HPE_ERROR"], context: null };

  const atr = atrArr(candles, P.atrLen);
  const high = candles.map((x) => x.high);
  const low = candles.map((x) => x.low);
  const close = candles.map((x) => x.close);
  const ts = candles.map((x) => x.ts);

  // swing-structuur t/m de laatste bar (ARS-U's engine, ongewijzigd)
  const ms = createStructure({ pivLen: P.pivLen, sweepMem: 8, failWin: 6, breakMem: 10 });
  let st = null;
  for (let i = 0; i < n; i++) st = ms.step(i, high, low, close, ts);

  const a = atr[last];
  const px = close[last];
  const blocked = [];

  const evalSide = (side) => {
    const isLong = side === "LONG";
    const bandOk = isLong ? bandLong : bandShort;
    if (!bandOk) return null;

    const confirmed = isLong ? hpe.bullConfirmed : hpe.bearConfirmed;
    const followOk = isLong ? hpe.bullFollowThrough : hpe.bearFollowThrough;
    const fakeRisk = isLong ? hpe.bullFakeRisk : hpe.bearFakeRisk;

    if (!confirmed) { blocked.push(`${side} · HPE NOT CONFIRMED (${hpe.pressure.toFixed(0)} vs ${hpe.confirmed.toFixed(0)})`); return null; }
    if (fakeRisk) { blocked.push(`${side} · HPE FAKE RISK`); return null; }
    if (!followOk) { blocked.push(`${side} · NO FOLLOW-THROUGH`); return null; }
    if (a == null || a <= 0) { blocked.push(`${side} · NO ATR`); return null; }

    const plan = buildPlan(side, px, a, st.lastSwingHigh, st.lastSwingLow, st.swingHighTaken, st.swingLowTaken, tick);
    if (plan.distance > a * P.maxStopATR) { blocked.push(`${side} · STOP TOO WIDE`); return null; }

    const cls = classOf(hpe, side);
    return { side, class: cls, plan, pressure: hpe.pressure };
  };

  const L = bandLong ? evalSide("LONG") : null;
  const S = bandShort ? evalSide("SHORT") : null;

  // beide richtingen tegelijk geldig = conflict, geen van beide (kan bij Band niet vaak)
  if (L && S) {
    return { ok: true, mode, signalLong: null, signalShort: null, blockedInfo: ["L/S CONFLICT"], context: buildContext(hpe, st) };
  }

  const mk = (r) => r && {
    side: r.side, class: r.class, plan: r.plan, pressure: r.pressure,
    entryOpenTime: ts[last],
    fingerprintBase: `HRB:${r.side}:${ts[last]}`,
    context: buildContext(hpe, st),
  };

  return {
    ok: true, mode,
    entryOpenTime: ts[last],
    signalLong: mk(L),
    signalShort: mk(S),
    blockedInfo: blocked,
    context: buildContext(hpe, st),
  };
}

function buildContext(hpe, st) {
  return {
    pressure: Number(hpe.pressure.toFixed(1)),
    confirmedLevel: Number(hpe.confirmed.toFixed(1)),
    strongLevel: Number(hpe.strong.toFixed(1)),
    structureBias: st?.structureBias ?? 0,
  };
}
