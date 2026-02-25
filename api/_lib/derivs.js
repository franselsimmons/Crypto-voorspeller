// api/_lib/derivs.js
// Funding + Open Interest: eerst CoinGlass (als plan het toelaat), anders Binance fallback.
// ETF: CoinGlass only (anders null).
// Liquidation heatmap: CoinGlass v4 route blijkt 404 in jouw health-check => we gebruiken synthetic fallback.

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

const CG_BASE = "https://open-api-v4.coinglass.com";
const CG_KEY = process.env.COINGLASS_KEY || "";

// Binance Futures public base
const BFX = "https://fapi.binance.com";

// --------------------
// Helpers
// --------------------
async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, json: j, text: t };
}

function cgAllowed(j) {
  // CoinGlass v4 responses vaak: { code:"0", msg:"success", data:... }
  // Jij krijgt: code:"400", msg:"Upgrade plan"
  const code = String(j?.code ?? j?.cgCode ?? "");
  if (!code) return false;
  return code === "0" || code === "200";
}

function cgData(j) {
  return j?.data ?? j?.result ?? null;
}

// --------------------
// BINANCE: Funding history -> percentile + extreme detectie
// --------------------
async function fetchBinanceFundingStats({
  symbol = "BTCUSDT",
  limit = 200
} = {}) {
  // Binance: /fapi/v1/fundingRate?symbol=BTCUSDT&limit=200
  const url = `${BFX}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${encodeURIComponent(limit)}`;
  const { ok, json } = await fetchJson(url);

  if (!ok || !Array.isArray(json) || json.length < 30) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source: "binance",
    };
  }

  const rates = json
    .map(x => Number(x?.fundingRate))
    .filter(isNum);

  if (rates.length < 30) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source: "binance",
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

  // crowding bias (klein): positief funding = crowded longs => bearish bias
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
    fundingBias: bias,
    source: "binance",
  };
}

// --------------------
// BINANCE: Open Interest history -> change 1 en 7
// --------------------
async function fetchBinanceOpenInterestChange({
  symbol = "BTCUSDT",
  period = "1d",
  limit = 120
} = {}) {
  // Binance: /futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=120
  const url = `${BFX}/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}&limit=${encodeURIComponent(limit)}`;
  const { ok, json } = await fetchJson(url);

  if (!ok || !Array.isArray(json) || json.length < 8) {
    return { oiNow: null, oiChange1: null, oiChange7: null, source: "binance" };
  }

  const vals = json
    .map(x => Number(x?.sumOpenInterest ?? x?.openInterest))
    .filter(isNum);

  if (vals.length < 8) {
    return { oiNow: null, oiChange1: null, oiChange7: null, source: "binance" };
  }

  const oiNow = vals[vals.length - 1];
  const oiPrev1 = vals[vals.length - 2];
  const oiPrev7 = vals[vals.length - 8];

  const ch1 = (isNum(oiPrev1) && oiPrev1 !== 0) ? ((oiNow - oiPrev1) / oiPrev1) : null;
  const ch7 = (isNum(oiPrev7) && oiPrev7 !== 0) ? ((oiNow - oiPrev7) / oiPrev7) : null;

  return {
    oiNow,
    oiChange1: isNum(ch1) ? ch1 : null,
    oiChange7: isNum(ch7) ? ch7 : null,
    source: "binance",
  };
}

// --------------------
// COINGLASS: ETF flows (alleen als plan toelaat)
// --------------------
async function fetchCoinGlassEtfFlows({ lookbackDays = 120 } = {}) {
  if (!CG_KEY) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0, source: null };
  }

  // jouw health-check: /api/etf/bitcoin/flow-history?limit=180 -> Upgrade plan
  const url = `${CG_BASE}/api/etf/bitcoin/flow-history?limit=${encodeURIComponent(lookbackDays)}`;
  const { ok, json } = await fetchJson(url, {
    headers: { "coinglassSecret": CG_KEY }
  });

  if (!ok || !json || !cgAllowed(json)) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0, source: "coinglass-denied" };
  }

  const raw = cgData(json);
  if (!Array.isArray(raw) || raw.length < 20) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0, source: "coinglass" };
  }

  const flows = raw
    .map(x => Number(x?.netFlow ?? x?.flow))
    .filter(isNum);

  if (flows.length < 20) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0, source: "coinglass" };
  }

  const last = flows[flows.length - 1];
  const flow7 = flows.slice(-7).reduce((a, b) => a + b, 0);

  const sorted = flows.slice().sort((a, b) => a - b);
  let cnt = 0;
  for (const v of sorted) if (v <= last) cnt++;
  const rank = cnt / sorted.length;

  const prev = flows[flows.length - 2];
  const flip = (Math.sign(last) !== Math.sign(prev)) && (Math.abs(last) > 0);

  const bias = clamp(last / 1_000_000_000, -0.0015, 0.0015);

  return {
    etfNetFlow: last,
    etfFlow7: flow7,
    etfPercentile: rank,
    etfFlip: !!flip,
    etfBias: bias,
    source: "coinglass",
  };
}

// --------------------
// Public API used by forest.js
// --------------------
export async function fetchBtcFundingStats({ symbol = "BTCUSDT", lookbackDays = 120 } = {}) {
  // CoinGlass funding is denied (upgrade plan) in jouw check -> we gaan direct Binance.
  // (Je kan later CoinGlass poging opnieuw toevoegen als je upgrade.)
  return fetchBinanceFundingStats({ symbol, limit: Math.min(1000, lookbackDays * 3) });
}

export async function fetchBtcOpenInterestChange({ symbol = "BTCUSDT", interval = "1d", lookback = 90 } = {}) {
  // Binance gebruikt period=1d/5m/1h etc. Wij mappen simpel:
  const period = interval === "1w" ? "1d" : "1d"; // weekly OI hist is niet overal consistent -> daily werkt betrouwbaar
  return fetchBinanceOpenInterestChange({ symbol, period, limit: Math.min(500, lookback) });
}

export async function fetchBtcEtfFlows({ lookbackDays = 120 } = {}) {
  // CoinGlass only, waarschijnlijk denied -> blijft null
  return fetchCoinGlassEtfFlows({ lookbackDays });
}

// CoinGlass heatmap routes bij jou 404 -> altijd leeg => forest.js valt terug op synthetic.
export async function fetchBtcLiqHeatmapLevels() {
  return [];
}

// --------------------
// Synthetic liq (jouw bestaande)
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

// (compat) deze twee bestaan nog in jouw forest.js variant, maar we gebruiken ze niet meer.
// Als je ze wél in je code hebt: laat ze bestaan als "no-op".
export function parseLiqLevelsFromQuery() { return []; }
export function parseLiqLevelsB64() { return []; }
export async function fetchBtcFundingBias() {
  // backward compat voor jouw oude forest.js
  return fetchBtcFundingStats({ symbol: "BTCUSDT", lookbackDays: 120 });
}