import { cfg } from "../config.js";
import { getCandles, closedOnly } from "../market/bitgetClient.js";
import { getHtfSeries } from "../market/htfContext.js";
import { analyzeWindow } from "../indicator/arsEngine.js";

/**
 * Analyse van één symbool: pass A (triggers, HTF-vrij) → alleen bij een
 * kandidaat op de laatste gesloten candle volgt de 4H-fetch en pass B.
 * Candles verlaten deze functie niet: alleen compacte kandidaat-output.
 */
export async function analyzeSymbol(symbol, cycleId, tick) {
  const c = cfg();
  const raw = await getCandles(symbol, "15m", c.candleLimit);
  const candles = closedOnly(raw, c.tfMs).filter((x) => x.ts < cycleId);
  if (!candles.length || candles[candles.length - 1].ts !== cycleId - c.tfMs) {
    return { symbol, status: "STALE_DATA" };
  }

  const passA = analyzeWindow(candles, { mode: "triggers" });
  if (!passA.ok) return { symbol, status: passA.reason };
  if (!passA.candidateLong && !passA.candidateShort) return { symbol, status: "NO_CANDIDATE" };

  const htfMap = await getHtfSeries(symbol);
  const passB = analyzeWindow(candles, { mode: "full", htfMap, tick });
  if (!passB.ok) return { symbol, status: passB.reason };

  const out = [];
  for (const sig of [passB.signalLong, passB.signalShort]) {
    if (!sig || sig.score.cls === "B") continue;
    out.push({
      symbol,
      direction: sig.side,
      setupType: sig.setupType,
      class: sig.score.cls,
      score: Math.round(sig.score.total),
      scoreParts: sig.score.parts,
      plan: sig.plan,
      fingerprintBase: sig.fingerprintBase,
      entryOpenTime: passB.entryOpenTime,
      context: passB.context,
      tick,
    });
  }
  return { symbol, status: out.length ? "CANDIDATE" : "NO_SIGNAL", candidates: out, blocked: passB.blockedInfo };
}
