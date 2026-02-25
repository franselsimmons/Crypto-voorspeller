// api/_lib/derivs.js
// CoinGlass v4 derivs: funding, open interest, ETF flows, liquidation heatmap.
// Env var: COINGLASS_KEY

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

const BASE = "https://open-api-v4.coinglass.com";
const KEY = process.env.COINGLASS_KEY || "";

// ---- fetch helpers ----
async function fetchJson(path, params = {}) {
  if (!KEY) return null;

  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }

  const r = await fetch(u.toString(), {
    headers: {
      accept: "application/json",
      // ✅ juiste header voor CoinGlass v4
      "CG-API-KEY": KEY,
      // ✅ extra compat, sommige accounts/voorbeelden gebruiken dit
      "coinglassSecret": KEY
    }
  });

  if (!r.ok) {
    // 401/403/429 => graceful fallback
    return null;
  }
  return await r.json().catch(() => null);
}

function unwrap(j) {
  if (!j) return null;
  return j.data ?? j.result ?? j;
}

// Probeer meerdere varianten totdat eentje werkt
async function tryMany(calls) {
  for (const fn of calls) {
    try {
      const j = await fn();
      const d = unwrap(j);
      if (d != null) return d;
    } catch {}
  }
  return null;
}

// --------------------
// Funding (percentile + extremes + flip)
// --------------------
export async function fetchBtcFundingStats({
  lookbackDays = 120,
  exchange = "Binance",
  symbol = "BTCUSDT",
  interval = "8h"
} = {}) {
  // CoinGlass v4 funding history endpoint + params (exchange/symbol/interval/limit)
  // (docs/quickstart laten CG-API-KEY en v4 endpoints zien)  [oai_citation:2‡coinglass](https://www.coinglass.com/id/learn/coinglass-api-quick-start-zh?utm_source=chatgpt.com)

  const limit = clamp(Math.floor(lookbackDays * 3), 30, 2000);

  const raw = await tryMany([
    () => fetchJson("/api/futures/funding-rate/history", { exchange, symbol, interval, limit }),
    // fallback symbol zonder USDT (soms)
    () => fetchJson("/api/futures/funding-rate/history", { exchange, symbol: "BTC", interval, limit })
  ]);

  if (!raw || !Array.isArray(raw)) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0
    };
  }

  // items kunnen fundingRate/rate/close heten (afhankelijk van variant)
  const rates = raw
    .map(x => Number(x?.fundingRate ?? x?.rate ?? x?.close ?? x?.value))
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

  // bias (klein): positief funding = crowded longs => bearish drift (contrarian)
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

// Backwards compatible: jouw forest.js kan deze gebruiken
export async function fetchBtcFundingBias() {
  return fetchBtcFundingStats({});
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
  // CoinGlass v4 OI history endpoint (quickstart voorbeeld)  [oai_citation:3‡coinglass](https://www.coinglass.com/id/learn/coinglass-api-quick-start-zh?utm_source=chatgpt.com)

  const raw = await tryMany([
    () => fetchJson("/api/futures/open-interest/history", { exchange, symbol, interval, limit: lookback }),
    () => fetchJson("/api/futures/open-interest/history", { exchange, symbol: "BTC", interval, limit: lookback })
  ]);

  if (!raw || !Array.isArray(raw) || raw.length < 8) {
    return { oiNow: null, oiChange1: null, oiChange7: null };
  }

  const vals = raw
    .map(x => Number(x?.openInterest ?? x?.oi ?? x?.close ?? x?.value))
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
  lookbackDays = 120,
  interval = "1d"
} = {}) {
  // CoinGlass v4 BTC ETF flow history endpoint  [oai_citation:4‡coinglass](https://www.coinglass.com/learn/CoinGlass-API-Full-Guide-zh?utm_source=chatgpt.com)
  const limit = clamp(Math.floor(lookbackDays), 20, 2000);

  const raw = await tryMany([
    () => fetchJson("/api/bitcoin/etf/flow-history", { interval, limit })
  ]);

  if (!raw || !Array.isArray(raw) || raw.length < 20) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0
    };
  }

  const flows = raw
    .map(x => Number(x?.netFlow ?? x?.flow ?? x?.value ?? x?.close))
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

  // bias klein (schaal)
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
  topN = 12
} = {}) {
  // Endpoint kan per plan verschillen; daarom: best-effort.
  const raw = await tryMany([
    () => fetchJson("/api/futures/liquidation/heatmap", { exchange, symbol }),
    () => fetchJson("/api/futures/liquidation/heatmap", { symbol }),
    () => fetchJson("/api/futures/liquidation/heatmap", { coin: "BTC" })
  ]);

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
// Synthetic liq (fallback)
// --------------------
export function buildSyntheticLiqLevels(candlesTruth, {
  lookback = 220,
  bins = 64,
  topN = 12
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

  return levels.sort((a, b) => b.weight - a.weight).slice(0, topN);
}

// --------------------
// Parsing helpers (query + base64) voor liqLevels
// --------------------

// liq query: "65000:0.8,64000:0.5"
export function parseLiqLevelsFromQuery(s) {
  if (!s || typeof s !== "string") return [];
  const out = [];
  for (const part of s.split(",")) {
    const [p, w] = part.split(":");
    const price = Number(p);
    const weight = Number(w);
    if (isNum(price) && isNum(weight)) out.push({ price, weight: clamp(weight, 0, 1) });
  }
  return out;
}

// liqB64: base64 van JSON array [{price,weight},...]
export function parseLiqLevelsB64(b64) {
  if (!b64 || typeof b64 !== "string") return [];
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .map(x => ({ price: Number(x?.price), weight: Number(x?.weight) }))
      .filter(x => isNum(x.price) && isNum(x.weight))
      .map(x => ({ price: x.price, weight: clamp(x.weight, 0, 1) }));
  } catch {
    return [];
  }
}