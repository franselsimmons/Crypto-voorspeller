import { cfg } from "../config.js";
import { getAllTickers } from "../market/bitgetClient.js";
import { jset } from "../storage/redis.js";
import { K, TTL } from "../storage/keys.js";

const STABLE = new Set(["USDCUSDT", "FDUSDUSDT", "DAIUSDT", "TUSDUSDT", "USDPUSDT", "USDEUSDT"]);

export async function refreshUniverse() {
  const c = cfg();
  const tickers = await getAllTickers();
  const selected = tickers
    .filter((t) => t.symbol.endsWith("USDT") && !STABLE.has(t.symbol))
    .filter((t) => Number.isFinite(t.last) && t.last > 0 && t.usdtVolume24h >= c.minDailyVolumeUsd)
    .sort((a, b) => b.usdtVolume24h - a.usdtVolume24h)
    .slice(0, c.maxUniverse)
    .map((t) => ({ s: t.symbol, v: Math.round(t.usdtVolume24h), f: t.fundingRate, oi: t.openInterest, p: t.last }));
  const snapshot = { ts: Date.now(), count: selected.length, symbols: selected };
  await jset(K.universe(), snapshot, TTL.universe);
  return snapshot;
}
