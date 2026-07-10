/**
 * Pure resolutielogica. Regels (gedocumenteerd, conservatief):
 * - Meting start op de candle ná de signaalcandle.
 * - SL en TP1 in dezelfde candle → AMBIGUOUS, geboekt als LOSS (−1R).
 * - TP1 en TP2 in dezelfde candle zonder SL-touch → FULL (+1.5R, feitelijk veilig).
 * - Na TP1: BE-stop en TP2 gelden vanaf de vólgende candle (Pine-gedrag).
 *   BE en TP2 in dezelfde candle → AMBIGUOUS, geboekt als BE (+0.5R).
 * - Timeout vóór TP1 → 0R; timeout ná TP1 → +0.5R (D5). netR = gross − costR.
 */
export function resolveOnCandles(pos, candles, costR, timeoutMs) {
  const long = pos.direction === "LONG";
  let { tp1Hit, tp1HitAt, highestPrice, lowestPrice } = pos;
  const startTs = pos.candleTime + pos.tfMs;
  const timeoutTs = pos.candleTime + timeoutMs;

  const finish = (grossR, exitReason, atTs, ambiguous = false) => ({
    closed: true, grossR, costR, netR: Number((grossR - costR).toFixed(4)),
    exitReason, ambiguousBar: ambiguous, closedAt: atTs,
    tp1Hit, tp1HitAt, highestPrice, lowestPrice,
    durationMinutes: Math.round((atTs - pos.candleTime) / 60000),
  });

  for (const c of candles) {
    if (c.ts < startTs) continue;
    if (c.ts >= timeoutTs) {
      return tp1Hit ? finish(0.5, "TIMEOUT_AFTER_TP1", c.ts) : finish(0.0, "TIMEOUT", c.ts);
    }
    highestPrice = highestPrice == null ? c.high : Math.max(highestPrice, c.high);
    lowestPrice = lowestPrice == null ? c.low : Math.min(lowestPrice, c.low);

    if (!tp1Hit) {
      const hitSL = long ? c.low <= pos.stopLoss : c.high >= pos.stopLoss;
      const hitTP1 = long ? c.high >= pos.tp1 : c.low <= pos.tp1;
      if (hitSL && hitTP1) return finish(-1.0, "SL", c.ts, true);
      if (hitSL) return finish(-1.0, "SL", c.ts);
      if (hitTP1) {
        tp1Hit = true; tp1HitAt = c.ts;
        const hitTP2 = long ? c.high >= pos.tp2 : c.low <= pos.tp2;
        if (hitTP2) return finish(1.5, "TP2", c.ts);
        continue;
      }
    } else {
      const hitBE = long ? c.low <= pos.entry : c.high >= pos.entry;
      const hitTP2 = long ? c.high >= pos.tp2 : c.low <= pos.tp2;
      if (hitBE && hitTP2) return finish(0.5, "BE", c.ts, true);
      if (hitTP2) return finish(1.5, "TP2", c.ts);
      if (hitBE) return finish(0.5, "BE", c.ts);
    }
  }

  return {
    closed: false, tp1Hit, tp1HitAt, highestPrice, lowestPrice,
    nextCheckTs: candles.length ? candles[candles.length - 1].ts + pos.tfMs : pos.nextCheckTs,
  };
}

export function categoryOf(exitReason) {
  if (exitReason === "SL") return "loss";
  if (exitReason === "TP2") return "full";
  if (exitReason === "TIMEOUT") return "timeout";
  return "be"; // BE en TIMEOUT_AFTER_TP1
}
