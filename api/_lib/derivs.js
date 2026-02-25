// api/_lib/derivs.js
// CoinGlass Open API v4 helpers: funding / OI / ETF flows / liquidation heatmap
// Env: COINGLASS_KEY

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

const BASE = "https://open-api-v4.coinglass.com";
const KEY = process.env.COINGLASS_KEY || "";

// v4 verwacht header: CG-API-KEY (NIET coinglassSecret)
async function fetchJson(url) {
  if (!KEY) return null;

  const r = await fetch(url, {
    headers: {
      "accept": "application/json",
      "CG-API-KEY": KEY
    }
  });

  // 401/403/429 => netjes terugvallen
  if (!r.ok) return null;

  return await r.json().catch(() => null);
}

// CoinGlass is vaak: { code, msg, data: ... }
function unwrap(j) {
  if (!j) return null;
  return j.data ?? j.result ?? j;
}

// --------------------
// Funding (percentile + extremes + flip)
// --------------------
export async function fetchBtcFundingStats({
  lookbackDays = 120,
  exchange = "Binance",
  symbol = "BTCUSDT", // CoinGlass v4 gebruikt vaak exchange-symbol (bv BTCUSDT)
  interval = "8h"
} = {}) {
  // Docs: /api/futures/funding-rate/history-ohlc
  //  [oai_citation:2‡CoinGlass-API](https://docs.coinglass.com/reference/fr-ohlc-histroy)
  const limit = Math.max(30, Math.min(2000, lookbackDays * 3));
  const url =
    `${BASE}/api/futures/funding-rate/history-ohlc` +
    `?exchange=${encodeURIComponent(exchange)}` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&limit=${encodeURIComponent(String(limit))}`;

  const raw = unwrap(await fetchJson(url));
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.list) ? raw.list : null);
  if (!Array.isArray(arr) || arr.length < 20) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0
    };
  }

  // items zijn meestal { fundingRate } of { close } of { value }
  const rates = arr
    .map(x => Number(x?.fundingRate ?? x?.close ?? x?.value ?? x?.rate))
    .filter(isNum);

  if (rates.length < 20) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0
    };
  }

  const last = rates[rates.length - 1];
  const prev = rates[rates.length - 2];

  const sorted = rates.slice().sort((a, b) => a - b);
  let cnt = 0;
  for (const v of sorted) if (v <= last) cnt++;
  const rank = cnt / sorted.length; // 0..1

  const extreme =
    rank >= 0.97 ? "EXTREME_POS" :
    rank <= 0.03 ? "EXTREME_NEG" :
    rank >= 0.90 ? "HIGH_POS" :
    rank <= 0.10 ? "HIGH_NEG" :
    null;

  const flip = (Math.sign(last) !== Math.sign(prev)) && (Math.abs(last) > 0);

  // bias (klein): pos funding = crowded longs => bearish drift
  let bias = 0;
  if (extreme === "EXTREME_POS") bias = -0.0018;
  else if (extreme === "HIGH_POS") bias = -0.0010;
  else if (extreme === "EXTREME_NEG") bias = +0.0018;
  else if (extreme === "HIGH_NEG") bias = +0.0010;

  return {
    fundingRate: last,
    fundingPercentile: rank,
    fundingExtreme: extreme,
    fundingFlip: !!flip,
    fundingBias: bias
  };
}

// --------------------
// Open Interest change (pct)
// --------------------
export async function fetchBtcOpenInterestChange({
  exchange = "Binance",
  symbol = "BTCUSDT",
  interval = "1d",
  lookback = 90
} = {}) {
  // Docs: /api/futures/open-interest/history-ohlc
  //  [oai_citation:3‡CoinGlass-API](https://docs.coinglass.com/reference/oi-ohlc-histroy)
  const limit = Math.max(20, Math.min(2000, lookback));
  const url =
    `${BASE}/api/futures/open-interest/history-ohlc` +
    `?exchange=${encodeURIComponent(exchange)}` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&limit=${encodeURIComponent(String(limit))}`;

  const raw = unwrap(await fetchJson(url));
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.list) ? raw.list : null);
  if (!Array.isArray(arr) || arr.length < 8) return { oiNow: null, oiChange1: null, oiChange7: null };

  const vals = arr
    .map(x => Number(x?.openInterest ?? x?.close ?? x?.value ?? x?.oi))
    .filter(isNum);

  if (vals.length < 8) return { oiNow: null, oiChange1: null, oiChange7: null };

  const oiNow = vals[vals.length - 1];
  const oiPrev1 = vals[vals.length - 2];
  const oiPrev7 = vals[vals.length - 8];

  const ch1 = (isNum(oiPrev1) && oiPrev1 !== 0) ? ((oiNow - oiPrev1) / oiPrev1) : null;
  const ch7 = (isNum(oiPrev7) && oiPrev7 !== 0) ? ((oiNow - oiPrev7) / oiPrev7) : null;

  return {
    oiNow,
    oiChange1: isNum(ch1) ? ch1 : null,
    oiChange7: isNum(ch7) ? ch7 : null
  };
}

// --------------------
// ETF flows (net flow + percentile)
// --------------------
export async function fetchBtcEtfFlows({
  interval = "1w",
  lookback = 120
} = {}) {
  // Veel accounts: /api/bitcoin/etf/flow-history
  // (CoinGlass geeft dit ook zo in voorbeelden met CG-API-KEY)
  //  [oai_citation:4‡coinglass](https://www.coinglass.com/learn/CoinGlass-API-Full-Guide-zh?utm_source=chatgpt.com)
  const limit = Math.max(20, Math.min(2000, lookback));
  const url =
    `${BASE}/api/bitcoin/etf/flow-history` +
    `?interval=${encodeURIComponent(interval)}` +
    `&limit=${encodeURIComponent(String(limit))}`;

  const raw = unwrap(await fetchJson(url));
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.list) ? raw.list : null);
  if (!Array.isArray(arr) || arr.length < 20) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0 };
  }

  const flows = arr
    .map(x => Number(x?.netFlow ?? x?.flow ?? x?.value ?? x?.close))
    .filter(isNum);

  if (flows.length < 20) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0 };
  }

  const last = flows[flows.length - 1];
  const prev = flows[flows.length - 2];
  const flow7 = flows.slice(-7).reduce((a, b) => a + b, 0);

  const sorted = flows.slice().sort((a, b) => a - b);
  let cnt = 0;
  for (const v of sorted) if (v <= last) cnt++;
  const rank = cnt / sorted.length;

  const flip = (Math.sign(last) !== Math.sign(prev)) && (Math.abs(last) > 0);
  const bias = clamp(last / 1_000_000_000, -0.0015, 0.0015);

  return {
    etfNetFlow: last,
    etfFlow7: flow7,
    etfPercentile: rank,
    etfFlip: !!flip,
    etfBias: bias
  };
}

// --------------------
// Liquidation heatmap => levels [{price, weight}]
// --------------------
export async function fetchBtcLiqHeatmapLevels({
  exchange = "Binance",
  symbol = "BTCUSDT",
  topN = 10
} = {}) {
  // Docs: /api/futures/liquidation/model1/aggregated-heatmap
  //  [oai_citation:5‡CoinGlass-API](https://docs.coinglass.com/reference/liquidation-aggregate-heatmap)
  const url =
    `${BASE}/api/futures/liquidation/model1/aggregated-heatmap` +
    `?exchange=${encodeURIComponent(exchange)}` +
    `&symbol=${encodeURIComponent(symbol)}`;

  const raw = unwrap(await fetchJson(url));
  if (!raw) return [];

  const levels = Array.isArray(raw?.levels) ? raw.levels : (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(levels)) return [];

  return levels
    .map(x => ({
      price: Number(x?.price),
      weight: Number(x?.weight ?? x?.score ?? x?.intensity ?? x?.value)
    }))
    .filter(x => isNum(x.price) && isNum(x.weight))
    .map(x => ({ price: x.price, weight: clamp(x.weight, 0, 1) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);
}

// --------------------
// Fallback: “synthetic liq” (als je geen API key hebt)
// --------------------
export function buildSyntheticLiqLevels(candlesTruth, {
  lookback = 220,
  bins = 64,
  topN = 10
} = {}) {
  if (!Array.isArray(candlesTruth) || candlesTruth.length < 50) return [];
  const closes = candlesTruth.map(c => Number(c?.close)).filter(isNum);
  if (closes.length < 50) return [];

  const start = Math.max(0, closes.length - lookback);
  const win = closes.slice(start);

  let lo = Infinity, hi = -Infinity;
  for (const v of win) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!isNum(lo) || !isNum(hi) || hi <= lo) return [];

  const step = (hi - lo) / bins;
  const hist = Array(bins).fill(0);

  for (const v of win) {
    const idx = clamp(Math.floor((v - lo) / step), 0, bins - 1);
    hist[idx] += 1;
  }

  const max = Math.max(...hist);
  const levels = hist.map((h, i) => ({
    price: lo + (i + 0.5) * step,
    weight: max ? h / max : 0
  }));

  return levels
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);
}