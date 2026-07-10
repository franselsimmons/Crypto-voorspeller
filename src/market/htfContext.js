import { cfg } from "../config.js";
import { getCandles, closedOnly } from "./bitgetClient.js";
import { emaPine } from "../indicator/indicators.js";

const MIN_HTF_BARS = 60; // EMA(50)-transient voldoende gedempt; anders bias 0

/**
 * Pine-equivalent van request.security(..., [ema[1], ema[1], close[1]], lookahead_on):
 * voor een 15m-bar met openTime t geldt de 4H-bar met openTime floor4h(t) − 4h
 * (de laatst volledig gesloten 4H-candle). Geen future leak.
 */
export async function getHtfSeries(symbol) {
  const c = cfg();
  const candles = closedOnly(await getCandles(symbol, "4H", c.htfCandleLimit), c.htfMs);
  if (candles.length < MIN_HTF_BARS) return null;
  const closes = candles.map((x) => x.close);
  const emaF = emaPine(closes, 21);
  const emaS = emaPine(closes, 50);
  const map = new Map();
  for (let i = 0; i < candles.length; i++) {
    map.set(candles[i].ts, { emaF: emaF[i], emaS: emaS[i], close: closes[i] });
  }
  return map;
}

export function htfBiasFor(map, ts15, htfMs) {
  if (!map) return 0;
  const target = Math.floor(ts15 / htfMs) * htfMs - htfMs;
  const bar = map.get(target);
  if (!bar || bar.emaF == null || bar.emaS == null) return 0;
  if (bar.emaF > bar.emaS && bar.close > bar.emaS) return 1;
  if (bar.emaF < bar.emaS && bar.close < bar.emaS) return -1;
  return 0;
}
