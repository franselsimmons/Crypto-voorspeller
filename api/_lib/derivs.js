// api/_lib/derivs.js
// Haalt derivaten-data (funding, OI, ETF flows, liquidation heatmap) op.
// Default: CoinGlass API v4.
// Zet env var: COINGLASS_KEY

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

const BASE = "https://open-api-v4.coinglass.com";
const KEY = process.env.COINGLASS_KEY || "";

async function fetchJson(url) {
  if (!KEY) return null;

  const r = await fetch(url, {
    headers: {
      // CoinGlass gebruikt een secret header; bij sommige accounts heet dit exact zo.
      // Als jouw key niet werkt: check CoinGlass dashboard "API" pagina voor headernaam.
      "coinglassSecret": KEY
    }
  });

  if (!r.ok) {
    // 401/403/429 etc => graceful fallback
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

// --------------------
// Funding (percentile + extremes + flip)
// --------------------
export async function fetchBtcFundingStats({
  lookbackDays = 120,
  symbol = "BTC"
} = {}) {
  // Endpoint naam kan per CoinGlass variant verschillen.
  // We proberen een “avg funding history”/funding history-achtig endpoint.
  // Als CoinGlass jouw account een andere route geeft, pas hier alleen de url aan.

  // Veel accounts ondersteunen: /api/futures/fundingRate/history?symbol=BTC
  const url = `${BASE}/api/futures/fundingRate/history?symbol=${encodeURIComponent(symbol)}&interval=8h&limit=${lookbackDays * 3}`;
  const raw = unwrap(await fetchJson(url));
  if (!raw || !Array.isArray(raw)) return {
    fundingRate: null,
    fundingPercentile: null,
    fundingExtreme: null,
    fundingFlip: false,
    fundingBias: 0
  };

  // Verwacht items zoals: { time, fundingRate } (soms 'rate')
  const rates = raw
    .map(x => Number(x?.fundingRate ?? x?.rate))
    .filter(isNum);

  if (rates.length < 30) return {
    fundingRate: null,
    fundingPercentile: null,
    fundingExtreme: null,
    fundingFlip: false,
    fundingBias: 0
  };

  const last = rates[rates.length - 1];

  const sorted = rates.slice().sort((a, b) => a - b);
  const rank = (() => {
    let cnt = 0;
    for (const v of sorted) if (v <= last) cnt++;
    return cnt / sorted.length; // 0..1
  })();

  const extreme =
    rank >= 0.97 ? "EXTREME_POS" :
    rank <= 0.03 ? "EXTREME_NEG" :
    rank >= 0.90 ? "HIGH_POS" :
    rank <= 0.10 ? "HIGH_NEG" :
    null;

  // flip: teken veranderd t.o.v. vorige
  const prev = rates[rates.length - 2];
  const flip = (Math.sign(last) !== Math.sign(prev)) && (Math.abs(last) > 0);

  // bias: kleine drift (contrarian bij extreme)
  // positief funding = crowded longs => bearish bias
  let bias = 0;
  if (extreme === "EXTREME_POS") bias = -0.0018;
  else if (extreme === "HIGH_POS") bias = -0.0010;
  else if (extreme === "EXTREME_NEG") bias = +0.0018;
  else if (extreme === "HIGH_NEG") bias = +0.0010;

  return {
    fundingRate: last,
    fundingPercentile: rank,        // 0..1
    fundingExtreme: extreme,        // label
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
  lookback = 60
} = {}) {
  const url = `${BASE}/api/futures/openInterest/history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${lookback}`;
  const raw = unwrap(await fetchJson(url));
  if (!raw || !Array.isArray(raw) || raw.length < 5) {
    return {
      oiNow: null,
      oiChange1: null,
      oiChange7: null
    };
  }

  const vals = raw
    .map(x => Number(x?.openInterest ?? x?.oi))
    .filter(isNum);

  if (vals.length < 8) return { oiNow: null, oiChange1: null, oiChange7: null };

  const oiNow = vals[vals.length - 1];
  const oiPrev1 = vals[vals.length - 2];
  const oiPrev7 = vals[vals.length - 8];

  const ch1 = (isNum(oiPrev1) && oiPrev1 !== 0) ? ((oiNow - oiPrev1) / oiPrev1) : null;
  const ch7 = (isNum(oiPrev7) && oiPrev7 !== 0) ? ((oiNow - oiPrev7) / oiPrev7) : null;

  return {
    oiNow,
    oiChange1: isNum(ch1) ? ch1 : null, // fraction (0.05 = +5%)
    oiChange7: isNum(ch7) ? ch7 : null
  };
}

// --------------------
// ETF flows (net flow + percentile)
// --------------------
export async function fetchBtcEtfFlows({
  lookbackDays = 120
} = {}) {
  // CoinGlass heeft ETF endpoints (per account verschillend).
  // We proberen: /api/etf/bitcoin/flow-history
  const url = `${BASE}/api/etf/bitcoin/flow-history?limit=${lookbackDays}`;
  const raw = unwrap(await fetchJson(url));
  if (!raw || !Array.isArray(raw) || raw.length < 20) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0
    };
  }

  // Verwacht: { time, netFlow } (of 'flow')
  const flows = raw
    .map(x => Number(x?.netFlow ?? x?.flow))
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
  const flow7 = flows.slice(-7).reduce((a, b) => a + b, 0);

  const sorted = flows.slice().sort((a, b) => a - b);
  const rank = (() => {
    let cnt = 0;
    for (const v of sorted) if (v <= last) cnt++;
    return cnt / sorted.length;
  })();

  const prev = flows[flows.length - 2];
  const flip = (Math.sign(last) !== Math.sign(prev)) && (Math.abs(last) > 0);

  // bias: flow positief = bullish drift, negatief = bearish drift (klein!)
  const bias = clamp(last / 1_000_000_000, -0.0015, 0.0015); // schaal naar “klein effect”

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
  symbol = "BTC",
  topN = 10
} = {}) {
  // Proberen aggregate heatmap endpoint
  const url = `${BASE}/api/futures/liquidation/heatmap?symbol=${encodeURIComponent(symbol)}`;
  const raw = unwrap(await fetchJson(url));
  if (!raw) return [];

  // Sommige responses: { levels: [{price, weight}] } of arrays
  const levels = Array.isArray(raw?.levels) ? raw.levels : (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(levels)) return [];

  const out = levels
    .map(x => ({
      price: Number(x?.price),
      weight: Number(x?.weight ?? x?.score ?? x?.intensity)
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

  // simpele cluster: hoe vaak prijs in bin zit
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