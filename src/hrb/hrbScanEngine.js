import { hrbCfg } from "./config.js";
import { getCandles, closedOnly } from "../market/bitgetClient.js";
import { analyzeHrbWindow } from "./hrbEngine.js";

const TF_MS = 15 * 60 * 1000;

/**
 * Analyse van één symbool voor HRB. Pass A (Band-only prefilter, HPE-vrij) →
 * alleen bij een Band-trigger op de laatste gesloten candle volgt de dure
 * volledige analyse (Band + HPE + exits). Candles verlaten deze functie niet.
 */
export async function analyzeHrbSymbol(symbol, cycleId, tick) {
  const c = hrbCfg();
  const raw = await getCandles(symbol, "15m", c.candleLimit);
  const candles = closedOnly(raw, TF_MS).filter((x) => x.ts < cycleId);
  if (!candles.length || candles[candles.length - 1].ts !== cycleId - TF_MS) {
    return { symbol, status: "STALE_DATA" };
  }

  const passA = analyzeHrbWindow(candles, { mode: "triggers" });
  if (!passA.ok) return { symbol, status: passA.reason };
  if (!passA.candidateLong && !passA.candidateShort) return { symbol, status: "NO_CANDIDATE" };

  const passB = analyzeHrbWindow(candles, { mode: "full", tick });
  if (!passB.ok) return { symbol, status: passB.reason };

  const out = [];
  for (const sig of [passB.signalLong, passB.signalShort]) {
    if (!sig) continue;
    out.push({
      symbol, direction: sig.side, class: sig.class,
      pressure: sig.pressure, plan: sig.plan,
      fingerprintBase: sig.fingerprintBase,
      entryOpenTime: passB.entryOpenTime, context: sig.context, tick,
    });
  }
  return { symbol, status: out.length ? "CANDIDATE" : "NO_SIGNAL", candidates: out, blocked: passB.blockedInfo };
}
