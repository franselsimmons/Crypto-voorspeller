import { ARS_PARAMS as P, cfg } from "../config.js";
import {
  atrArr, emaPine, rsiArr, erArr, percentRankArr, smaArr,
  highestArr, lowestArr, crossArrFn,
} from "./indicators.js";
import { createStructure } from "./marketStructure.js";
import { buildPlan } from "./riskModel.js";
import { scoreSide } from "./scoreEngine.js";
import { htfBiasFor } from "../market/htfContext.js";

/**
 * Stateless window-recompute (D1). mode "triggers": alleen ruwe kandidaat op de
 * laatste gesloten bar (HTF-vrij → exacte prefilter, D2). mode "full": volledige
 * pipeline; signaal = qualified[laatste] && !qualified[voorlaatste].
 * Afwijkingen van Pine (D3/D4) staan in INDICATOR_PARITY.md.
 */
export function analyzeWindow(candles, { mode, htfMap = null, tick = 1e-8 }) {
  const n = candles.length;
  const c = cfg();
  if (n < c.warmupBars) return { ok: false, reason: "INSUFFICIENT_HISTORY", bars: n };

  const ts = candles.map((x) => x.ts);
  const open = candles.map((x) => x.open);
  const high = candles.map((x) => x.high);
  const low = candles.map((x) => x.low);
  const close = candles.map((x) => x.close);
  const vol = candles.map((x) => x.volume);

  const atr = atrArr(candles, P.atrLen);
  const atrPct = atr.map((a, i) => (a == null || close[i] <= 0 ? null : (a / close[i]) * 100));
  const volRank = percentRankArr(atrPct, P.volWin);
  const er = erArr(close, P.erLen);
  const erRank = percentRankArr(er, P.volWin);
  const emaF = emaPine(close, P.emaFastLen);
  const emaS = emaPine(close, P.emaSlowLen);
  const rsi = rsiArr(close, P.rsiLen);
  const avgVol = smaArr(vol, P.volLen);
  const signedVol = vol.map((v, i) => Math.sign(close[i] - open[i]) * v);
  const flow = emaPine(signedVol, P.flowLen);
  const hiZone = highestArr(high, P.zoneWin);
  const loZone = lowestArr(low, P.zoneWin);
  const rsiLo = lowestArr(rsi.map((v) => (v == null ? null : v)), P.resetWin);
  const rsiHi = highestArr(rsi.map((v) => (v == null ? null : v)), P.resetWin);
  const range20Hi = highestArr(high, P.rangeLen);
  const range20Lo = lowestArr(low, P.rangeLen);
  const volRankFilled = volRank.map((v) => (v == null ? 50 : v));
  const loVolRank = lowestArr(volRankFilled, P.compMem + 2);
  const emaCross = crossArrFn(emaF, emaS);

  const ms = createStructure(P);
  let lastCompressedIdx = null;
  let compStartTs = null;
  let prevCompressed = false;
  let prevQ = { L: false, S: false };
  let final = null;

  const ok = (...vals) => vals.every((v) => v != null && Number.isFinite(v));

  for (let i = 0; i < n; i++) {
    const st = ms.step(i, high, low, close, ts);

    const compressed = volRank[i] != null && volRank[i] <= P.compRankTh;
    if (compressed && !prevCompressed) compStartTs = ts[i];
    if (compressed) lastCompressedIdx = i;
    prevCompressed = compressed;

    const dataOK =
      i > P.volWin &&
      ok(volRank[i], erRank[i], rsi[i], atr[i], emaS[i], avgVol[i]) &&
      atr[i] > 0 && avgVol[i] >= 0;

    let qL = false, qS = false;
    let evalResult = null;

    if (dataOK) {
      const relVol = vol[i] / Math.max(avgVol[i], 1e-10);
      const dirUp = emaF[i] > emaS[i];
      const dirDown = emaF[i] < emaS[i];
      const slopeUp = i >= P.slopeBars && emaS[i] > emaS[i - P.slopeBars];
      const slopeDown = i >= P.slopeBars && emaS[i] < emaS[i - P.slopeBars];
      const trending = erRank[i] >= P.trendERrank;
      const isExtreme = volRank[i] >= P.extremeTh;
      const bullRegime = trending && dirUp && slopeUp;
      const bearRegime = trending && dirDown && slopeDown;

      const overbought = 70 + ((volRank[i] ?? 50) - 50) * 0.12;
      const oversold = 100 - overbought;
      const rsiUp = rsi[i - 1] != null && rsi[i] > rsi[i - 1];
      const rsiDown = rsi[i - 1] != null && rsi[i] < rsi[i - 1];
      const momPbL = rsiLo[i] != null && rsiLo[i] <= P.resetLvl && rsiUp && rsi[i] < overbought;
      const momPbS = rsiHi[i] != null && rsiHi[i] >= 100 - P.resetLvl && rsiDown && rsi[i] > oversold;
      const momBoL = rsi[i] > 55 && rsiUp && rsi[i] < 82;
      const momBoS = rsi[i] < 45 && rsiDown && rsi[i] > 18;

      const ext = (close[i] - emaF[i]) / atr[i];
      const overextL = ext > P.maxExtATR;
      const overextS = -ext > P.maxExtATR;

      const pbDirL = dirUp && slopeUp && erRank[i] >= Math.max(0, P.trendERrank - 15);
      const pbDirS = dirDown && slopeDown && erRank[i] >= Math.max(0, P.trendERrank - 15);
      const reclaimL = close[i] > emaF[i] && (low[i] <= emaF[i] || close[i - 1] <= emaF[i - 1]);
      const reclaimS = close[i] < emaF[i] && (high[i] >= emaF[i] || close[i - 1] >= emaF[i - 1]);
      const trigPbL = pbDirL && loZone[i] != null && loZone[i] <= emaF[i] && reclaimL &&
        close[i] > open[i] && momPbL && close[i] > emaS[i] && st.structureBias >= 0;
      const trigPbS = pbDirS && hiZone[i] != null && hiZone[i] >= emaF[i] && reclaimS &&
        close[i] < open[i] && momPbS && close[i] < emaS[i] && st.structureBias <= 0;

      const compRecent = lastCompressedIdx != null && i - lastCompressedIdx <= P.compMem;
      const volExp = relVol >= P.boVolMult;
      const rangeExp = high[i] - low[i] >= atr[i] * 1.1;
      const rh = i >= 1 ? range20Hi[i - 1] : null;
      const rhPrev = i >= 2 ? range20Hi[i - 2] : null;
      const rl = i >= 1 ? range20Lo[i - 1] : null;
      const rlPrev = i >= 2 ? range20Lo[i - 2] : null;
      const crossHi = rh != null && rhPrev != null && close[i] > rh && close[i - 1] <= rhPrev;
      const crossLo = rl != null && rlPrev != null && close[i] < rl && close[i - 1] >= rlPrev;
      const trigBoL = compRecent && crossHi && volExp && rangeExp && close[i] > open[i] && momBoL;
      const trigBoS = compRecent && crossLo && volExp && rangeExp && close[i] < open[i] && momBoS;

      const candL = trigPbL || trigBoL;
      const candS = trigPbS || trigBoS;

      if (mode === "triggers") {
        if (i === n - 1) final = { ok: true, mode, candidateLong: candL, candidateShort: candS };
      } else if (candL || candS) {
        const htfBias = htfBiasFor(htfMap, ts[i], c.htfMs);
        const evalOne = (side, isPullback) => {
          const plan = buildPlan(side, isPullback, {
            P, tick, close: close[i], low: low[i], high: high[i], atr: atr[i],
            lastSwingLow: st.lastSwingLow, lastSwingHigh: st.lastSwingHigh,
            swingLowTaken: st.swingLowTaken, swingHighTaken: st.swingHighTaken,
            loZone: loZone[i], hiZone: hiZone[i], rangeHi: rh, rangeLo: rl,
          });
          let blocked = null;
          if (isExtreme) blocked = "EXTREME VOL";
          else if (htfBias === (side === "LONG" ? -1 : 1)) blocked = "HTF CONFLICT";
          else if (side === "LONG" ? overextL : overextS) blocked = "OVEREXTENDED";
          else if (candL && candS) blocked = "L/S CONFLICT";
          else if (plan.distance > atr[i] * P.maxStopATR) blocked = "STOP TOO WIDE";
          else if (plan.roomToStructureR < P.minRR) blocked = "NO ROOM RR";

          const entryRef = isPullback ? emaF[i] : side === "LONG" ? (rh ?? close[i]) : (rl ?? close[i]);
          const entryDistATR = Math.abs(close[i] - entryRef) / atr[i];
          const score = blocked ? null : scoreSide(side, isPullback, {
            P, bullRegime, bearRegime, loVolRank: loVolRank[i] ?? 50, htfBias,
            structureUp: st.structureUp, structureDown: st.structureDown,
            structureBias: st.structureBias,
            recentBreakUp: st.recentBreakUp, recentBreakDown: st.recentBreakDown,
            lastSwingLow: st.lastSwingLow, lastSwingHigh: st.lastSwingHigh,
            close: close[i], relVol, flow: flow[i] ?? 0, rsi: rsi[i],
            overbought, oversold, entryDistATR, potentialRR: plan.roomToStructureR,
          });
          const qualified = !blocked && score != null && score.total >= P.thA;
          return {
            side, isPullback, setupType: isPullback ? "PULLBACK" : "BREAKOUT",
            blocked, score, qualified, plan,
            fingerprintBase: isPullback
              ? `PB:${side}:${side === "LONG" ? st.lastSwingLowTs : st.lastSwingHighTs}`
              : `BO:${side}:${compStartTs}`,
          };
        };

        const L = candL ? evalOne("LONG", trigPbL) : null;
        const S = candS ? evalOne("SHORT", trigPbS) : null;
        qL = L?.qualified || false;
        qS = S?.qualified || false;

        if (i === n - 1) {
          final = {
            ok: true, mode,
            entryOpenTime: ts[i],
            signalLong: qL && !prevQ.L ? L : null,
            signalShort: qS && !prevQ.S ? S : null,
            blockedInfo: [L, S].filter((x) => x && x.blocked).map((x) => `${x.side} · ${x.blocked}`),
            context: {
              regime: isExtreme ? "EXTREME VOL" : bullRegime ? "BULL TREND" : bearRegime ? "BEAR TREND" : compressed ? "COMPRESSION" : "RANGE",
              htfBias, structureBias: st.structureBias,
              volRank: Math.round(volRank[i]), erRank: Math.round(erRank[i]),
              relVol: Number(relVol.toFixed(2)),
            },
          };
        }
      } else if (i === n - 1) {
        final = { ok: true, mode, signalLong: null, signalShort: null, blockedInfo: [], context: null };
      }
    } else if (i === n - 1) {
      final = mode === "triggers"
        ? { ok: true, mode, candidateLong: false, candidateShort: false }
        : { ok: true, mode, signalLong: null, signalShort: null, blockedInfo: [], context: null };
    }

    prevQ = { L: qL, S: qS };
  }

  return final ?? { ok: false, reason: "NO_EVAL" };
}
