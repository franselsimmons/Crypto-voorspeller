// api/_lib/derivs.js
// Haalt derivaten-data (funding, OI, ETF flows, liquidation heatmap) op.
// CoinGlass API v4
// Zet env var: COINGLASS_KEY

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

const BASE = "https://open-api-v4.coinglass.com";
const KEY = process.env.COINGLASS_KEY || "";

// Sommige CoinGlass accounts gebruiken net andere headernaam.
// We sturen er 2 mee. (De server pakt de juiste.)
function authHeaders() {
  if (!KEY) return {};
  return {
    coinglassSecret: KEY,
    "CG-API-KEY": KEY
  };
}

async function fetchJson(url) {
  if (!KEY) return null;

  const r = await fetch(url, { headers: authHeaders() });

  if (!r.ok) {
    // 401/403/429/etc -> netjes terugvallen
    return null;
  }

  const j = await r.json().catch(() => null);
  return j;
}

// CoinGlass responses zijn vaak: { code, msg, data: ... }
function unwrap(j) {
  if (!j) return null;
  return j.data ?? j.result ?? j;
}

// probeer uit allerlei vormen een "array history" te halen
function pickArray(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;

  // vaak: { list: [...] } of { data: [...] } of { history: [...] }
  const candidates = [
    raw.list,
    raw.data,
    raw.history,
    raw.records,
    raw.items,
    raw.result
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  // soms: { ... , [symbol]: [...] }
  for (const k of Object.keys(raw)) {
    if (Array.isArray(raw[k])) return raw[k];
  }

  return null;
}

// --------------------
// Funding (percentile + extremes + flip)
// --------------------
export async function fetchBtcFundingStats({
  lookbackDays = 120,
  symbol = "BTC",
  interval = "8h"
} = {}) {
  // ✅ JUISTE endpoint naam: funding-rate (niet fundingRate)
  // Docs: /api/futures/funding-rate/history  [oai_citation:3‡CoinGlass-API](https://docs.coinglass.com/reference/fr-ohlc-histroy)
  const limit = Math.max(30, Math.min(2000, lookbackDays * (interval === "8h" ? 3 : 1)));
  const url =
    `${BASE}/api/futures/funding-rate/history` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&limit=${encodeURIComponent(limit)}`;

  const raw = unwrap(await fetchJson(url));
  const arr = pickArray(raw);

  if (!arr || arr.length < 30) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0
    };
  }

  // Verwacht items zoals: { time, fundingRate } (soms 'rate')
  const rates = arr
    .map(x => Number(x?.fundingRate ?? x?.rate ?? x?.value))
    .filter(isNum);

  if (rates.length < 30) {
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

  // bias: contrarian bij crowded funding
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
  symbol = "BTC",
  interval = "1d",
  lookback = 90
} = {}) {
  // In v4 bestaat o.a. aggregated-stablecoin-history
  // (werkt voor BTC en geeft OI time series)
  const url =
    `${BASE}/api/futures/open-interest/aggregated-stablecoin-history` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&limit=${encodeURIComponent(Math.max(20, Math.min(2000, lookback)))}`;

  const raw = unwrap(await fetchJson(url));
  const arr = pickArray(raw);

  if (!arr || arr.length < 8) {
    return { oiNow: null, oiChange1: null, oiChange7: null };
  }

  // Sommige endpoints geven {openInterest} / {oi} / {value}
  const vals = arr
    .map(x => Number(x?.openInterest ?? x?.oi ?? x?.value ?? x?.close))
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
export async function fetchBtcEtfFlows({ lookbackDays = 120 } = {}) {
  // ✅ Endpoint volgens docs  [oai_citation:4‡CoinGlass-API](https://docs.coinglass.com/reference/etf-flows-history)
  const url = `${BASE}/api/etf/bitcoin/flow-history?limit=${encodeURIComponent(lookbackDays)}`;

  const raw = unwrap(await fetchJson(url));
  const arr = pickArray(raw);

  if (!arr || arr.length < 20) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0
    };
  }

  // Verwacht: { netFlow } of { flow }
  const flows = arr
    .map(x => Number(x?.netFlow ?? x?.flow ?? x?.value))
    .filter(isNum);

  if (flows.length < 20) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0
    };
  }

  const last = flows[flows.length - 1];
  const prev = flows[flows.length - 2];
  const flow7 = flows.slice(-7).reduce((a, b) => a + b, 0);

  const sorted = flows.slice().sort((a, b) => a - b);
  let cnt = 0;
  for (const v of sorted) if (v <= last) cnt++;
  const rank = cnt / sorted.length;

  const flip = (Math.sign(last) !== Math.sign(prev)) && (Math.abs(last) > 0);

  // schaal naar klein effect
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
export async function fetchBtcLiqHeatmapLevels({ symbol = "BTC", topN = 10 } = {}) {
  // ✅ Endpoint volgens docs  [oai_citation:5‡CoinGlass-API](https://docs.coinglass.com/reference/liquidation-aggregate-heatmap)
  const url =
    `${BASE}/api/futures/liquidation/aggregated-heatmap/model1` +
    `?symbol=${encodeURIComponent(symbol)}`;

  const raw = unwrap(await fetchJson(url));

  // Model1 responses verschillen: soms {levels:[...]} soms {data:[...]} etc.
  const levels =
    (Array.isArray(raw?.levels) ? raw.levels :
     Array.isArray(raw?.data) ? raw.data :
     Array.isArray(raw) ? raw :
     null);

  if (!Array.isArray(levels)) return [];

  const out = levels
    .map(x => ({
      price: Number(x?.price ?? x?.p),
      weight: Number(x?.weight ?? x?.w ?? x?.score ?? x?.intensity)
    }))
    .filter(x => isNum(x.price) && isNum(x.weight))
    .map(x => ({ price: x.price, weight: clamp(x.weight, 0, 1) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);

  return out;
}

// --------------------
// Fallback: “synthetic liq” (als je geen API key hebt)
// --------------------
export function buildSyntheticLiqLevels(candlesTruth, { lookback = 220, bins = 64, topN = 10 } = {}) {
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