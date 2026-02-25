// api/_lib/derivs.js

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${t.slice(0, 180)}`);
  return j;
}

// ------------------------------
// BINANCE (gratis) funding + OI
// ------------------------------
async function fetchBinanceFundingHistory({ symbol = "BTCUSDT", limit = 200 } = {}) {
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const arr = await fetchJson(url, { headers: { accept: "application/json" } });
  if (!Array.isArray(arr) || !arr.length) return [];
  return arr
    .map(x => ({
      time: Math.floor(Number(x?.fundingTime) / 1000),
      rate: Number(x?.fundingRate)
    }))
    .filter(x => isNum(x.time) && isNum(x.rate));
}

function fundingStatsFromHistory(hist) {
  if (!hist.length) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source: "binance-empty"
    };
  }

  const lastRate = hist[hist.length - 1].rate;

  const sorted = hist.map(x => x.rate).slice().sort((a,b)=>a-b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= lastRate) idx++;
  const pct = sorted.length > 1 ? (idx - 1) / (sorted.length - 1) : 0.5;

  let extreme = null;
  if (pct >= 0.995) extreme = "EXTREME_POS";
  else if (pct >= 0.97) extreme = "HIGH_POS";

  if (pct <= 0.005) extreme = "EXTREME_NEG";
  else if (pct <= 0.03) extreme = "HIGH_NEG";

  const flip = !!extreme;

  // zwaarder bij >97%
  let bias = 0;
  if (extreme === "HIGH_POS") bias = -0.0007;
  if (extreme === "EXTREME_POS") bias = -0.0014;
  if (extreme === "HIGH_NEG") bias = +0.0007;
  if (extreme === "EXTREME_NEG") bias = +0.0014;

  return {
    fundingRate: lastRate,
    fundingPercentile: pct,
    fundingExtreme: extreme,
    fundingFlip: flip,
    fundingBias: bias,
    source: "binance"
  };
}

async function fetchBinanceOiHistory({ symbol = "BTCUSDT", limit = 15 } = {}) {
  const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=1d&limit=${limit}`;
  const arr = await fetchJson(url, { headers: { accept: "application/json" } });
  if (!Array.isArray(arr) || !arr.length) return [];
  return arr
    .map(x => ({
      time: Math.floor(Number(x?.timestamp) / 1000),
      oi: Number(x?.sumOpenInterestValue)
    }))
    .filter(x => isNum(x.time) && isNum(x.oi));
}

// ------------------------------
// Exports (forest.js gebruikt deze namen)
// -> Funding en OI: ALTIJD Binance, NOOIT CoinGlass
// ------------------------------
export async function fetchBtcFundingStats({ symbol = "BTCUSDT" } = {}) {
  try {
    const hist = await fetchBinanceFundingHistory({ symbol, limit: 200 });
    return fundingStatsFromHistory(hist);
  } catch (e) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source: `binance-error:${String(e?.message || e).slice(0, 80)}`
    };
  }
}

export async function fetchBtcOpenInterestChange({ symbol = "BTCUSDT" } = {}) {
  try {
    const hist = await fetchBinanceOiHistory({ symbol, limit: 15 });
    if (hist.length < 2) {
      return { oiNow: null, oiChange1: null, oiChange7: null, source: "binance-empty" };
    }
    const last = hist[hist.length - 1];
    const prev1 = hist[hist.length - 2] || null;
    const prev7 = hist.length >= 8 ? hist[hist.length - 8] : null;

    const oiNow = last.oi;
    const oiChange1 = (prev1 && prev1.oi > 0) ? ((oiNow - prev1.oi) / prev1.oi) : null;
    const oiChange7 = (prev7 && prev7.oi > 0) ? ((oiNow - prev7.oi) / prev7.oi) : null;

    return {
      oiNow,
      oiChange1: isNum(oiChange1) ? oiChange1 : null,
      oiChange7: isNum(oiChange7) ? oiChange7 : null,
      source: "binance"
    };
  } catch (e) {
    return { oiNow: null, oiChange1: null, oiChange7: null, source: `binance-error:${String(e?.message || e).slice(0, 80)}` };
  }
}

// ETF: zonder werkende provider blijft dit n/a (maar nooit crashen)
export async function fetchBtcEtfFlows() {
  return {
    etfNetFlow: null,
    etfFlow7: null,
    etfPercentile: null,
    etfFlip: false,
    etfBias: 0,
    source: "no-etf-provider"
  };
}

// Liq heatmap: CoinGlass werkt niet bij jou -> leeg -> forest.js maakt synthetic
export async function fetchBtcLiqHeatmapLevels() {
  return [];
}

// ------------------------------
// Synthetic liq levels (fallback)
// ------------------------------
export function buildSyntheticLiqLevels(candlesTruth, { lookback = 220, bins = 64, topN = 12 } = {}) {
  if (!Array.isArray(candlesTruth) || candlesTruth.length < 50) return [];
  const closes = candlesTruth.map(c => Number(c?.close)).filter(isNum);
  const n = closes.length;
  const start = Math.max(0, n - lookback);
  const win = closes.slice(start);

  let lo = Math.min(...win);
  let hi = Math.max(...win);
  if (!isNum(lo) || !isNum(hi) || hi <= lo) return [];

  const step = (hi - lo) / Math.max(1, bins);
  const counts = new Array(bins).fill(0);

  for (const p of win) {
    const idx = clamp(Math.floor((p - lo) / step), 0, bins - 1);
    counts[idx] += 1;
  }

  const ranked = counts
    .map((c, i) => ({ i, c }))
    .sort((a, b) => b.c - a.c)
    .slice(0, topN);

  const maxC = ranked.length ? ranked[0].c : 1;

  return ranked.map(r => ({
    price: lo + (r.i + 0.5) * step,
    weight: clamp(r.c / Math.max(1, maxC), 0, 1)
  }));
}

// ------------------------------
// Parsing helpers (liq query)
// ------------------------------
export function parseLiqLevelsFromQuery(q) {
  const s = String(q || "").trim();
  if (!s) return [];
  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const [a, b] = p.split(":").map(x => x.trim());
    const price = Number(a);
    const weight = (b == null || b === "") ? 1 : Number(b);
    if (!isNum(price)) continue;
    out.push({ price, weight: isNum(weight) ? clamp(weight, 0, 1) : 1 });
  }
  return out;
}

export function parseLiqLevelsB64(b64) {
  const s = String(b64 || "").trim();
  if (!s) return [];
  try {
    const json = Buffer.from(s, "base64").toString("utf8");
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