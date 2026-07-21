import { cfg } from "../config.js";
import { log } from "../observability/log.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let apiCalls = 0;
export const getApiCallCount = () => apiCalls;
export const resetApiCallCount = () => { apiCalls = 0; };

async function apiGet(path, params = {}) {
  const url = `${cfg().bitgetBase}${path}?${new URLSearchParams(params)}`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      apiCalls++;
      // F8: cache "no-store" — Next.js cachet identieke GET-fetches standaard in een
      // persistente Data Cache (overleeft requests én deploys). Daardoor draaide de
      // scanner 9 dagen op bevroren candles van de allereerste fetch (12 juli).
      // Marktdata mag NOOIT uit een cache komen.
      const res = await fetch(url, { signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} op ${path}`);
        await sleep(300 * attempt + Math.random() * 200);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} op ${path}`);
      const json = await res.json();
      if (json.code !== "00000") throw new Error(`Bitget ${json.code}: ${json.msg}`);
      return json.data;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await sleep(250 * attempt + Math.random() * 150);
    }
  }
  log("error", "bitget", "api_failed", { path, error: String(lastErr?.message || lastErr) });
  throw lastErr;
}

export async function getAllTickers() {
  const data = await apiGet("/api/v2/mix/market/tickers", { productType: "USDT-FUTURES" });
  return data.map((t) => ({
    symbol: t.symbol,
    last: Number(t.lastPr),
    usdtVolume24h: Number(t.usdtVolume),
    fundingRate: Number(t.fundingRate),
    openInterest: Number(t.holdingAmount),
  }));
}

export async function getContractsRaw() {
  return apiGet("/api/v2/mix/market/contracts", { productType: "USDT-FUTURES" });
}

/** Candles oplopend op ts. granularity: "15m" | "4H". Alleen publieke marktdata — nooit orders. */
export async function getCandles(symbol, granularity, limit) {
  const data = await apiGet("/api/v2/mix/market/candles", {
    symbol, productType: "USDT-FUTURES", granularity, limit: String(limit),
  });
  return data
    .map((c) => ({ ts: Number(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5]) }))
    .filter((c) => Number.isFinite(c.close))
    .sort((a, b) => a.ts - b.ts);
}

export function closedOnly(candles, granularityMs, nowMs = Date.now()) {
  return candles.filter((c) => c.ts + granularityMs <= nowMs);
}
