// api/_lib/derivs.js
function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

const UA = "Mozilla/5.0 (compatible; CryptoVoorspeller/1.0; +https://crypto-voorspeller.vercel.app)";

async function fetchText(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { "accept": "*/*", "user-agent": UA, ...(opts.headers || {}) }
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${t.slice(0, 180)}`);
  return t;
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { "accept": "application/json", "user-agent": UA, ...(opts.headers || {}) }
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${t.slice(0, 180)}`);
  return j;
}

// ------------------------------
// BINANCE (gratis) Funding + OI
// ------------------------------
async function fetchBinancePremiumIndex({ symbol = "BTCUSDT" } = {}) {
  const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`;
  const j = await fetchJson(url);
  if (j && typeof j === "object" && !Array.isArray(j) && "code" in j && "msg" in j) {
    throw new Error(`Binance premiumIndex error: ${j.code} ${j.msg}`);
  }
  const rate = Number(j?.lastFundingRate);
  return isNum(rate) ? rate : null;
}

async function fetchBinanceFundingHistory({ symbol = "BTCUSDT", limit = 200 } = {}) {
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const arr = await fetchJson(url);

  if (arr && typeof arr === "object" && !Array.isArray(arr) && "code" in arr && "msg" in arr) {
    throw new Error(`Binance fundingRate error: ${arr.code} ${arr.msg}`);
  }

  if (!Array.isArray(arr) || !arr.length) return [];
  return arr
    .map(x => ({ time: Math.floor(Number(x?.fundingTime) / 1000), rate: Number(x?.fundingRate) }))
    .filter(x => isNum(x.time) && isNum(x.rate));
}

function fundingStatsFromHistoryOrRate(hist, fallbackRate) {
  const lastRate =
    (hist.length && isNum(hist[hist.length - 1]?.rate)) ? hist[hist.length - 1].rate :
    (isNum(fallbackRate) ? fallbackRate : null);

  if (!isNum(lastRate)) {
    return { fundingRate: null, fundingPercentile: null, fundingExtreme: null, fundingFlip: false, fundingBias: 0, source: "binance-empty" };
  }

  let pct = null;
  if (hist.length >= 20) {
    const sorted = hist.map(x => x.rate).slice().sort((a,b)=>a-b);
    let idx = 0;
    while (idx < sorted.length && sorted[idx] <= lastRate) idx++;
    pct = sorted.length > 1 ? (idx - 1) / (sorted.length - 1) : 0.5;
  }

  let extreme = null;

  // percentile-based (jouw wens: >97% zwaarder)
  if (isNum(pct)) {
    if (pct >= 0.995) extreme = "EXTREME_POS";
    else if (pct >= 0.97) extreme = "HIGH_POS";

    if (pct <= 0.005) extreme = "EXTREME_NEG";
    else if (pct <= 0.03) extreme = "HIGH_NEG";
  } else {
    // fallback absolute
    if (lastRate >= 0.0020) extreme = "EXTREME_POS";
    else if (lastRate >= 0.0012) extreme = "HIGH_POS";
    if (lastRate <= -0.0020) extreme = "EXTREME_NEG";
    else if (lastRate <= -0.0012) extreme = "HIGH_NEG";
  }

  const flip = !!extreme;

  let bias = 0;
  if (extreme === "HIGH_POS") bias = -0.0007;
  if (extreme === "EXTREME_POS") bias = -0.0012;
  if (extreme === "HIGH_NEG") bias = +0.0007;
  if (extreme === "EXTREME_NEG") bias = +0.0012;

  return {
    fundingRate: lastRate,
    fundingPercentile: isNum(pct) ? pct : null,
    fundingExtreme: extreme,
    fundingFlip: flip,
    fundingBias: bias,
    source: "binance"
  };
}

// ✅ forest.js gebruikt deze naam
export async function fetchBtcFundingStats({ symbol = "BTCUSDT" } = {}) {
  try {
    const fallbackRate = await fetchBinancePremiumIndex({ symbol });
    const hist = await fetchBinanceFundingHistory({ symbol, limit: 200 });
    return fundingStatsFromHistoryOrRate(hist, fallbackRate);
  } catch (e) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source: `binance-error:${String(e?.message || e).slice(0, 90)}`
    };
  }
}

async function fetchBinanceOpenInterestNow({ symbol = "BTCUSDT" } = {}) {
  const url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`;
  const j = await fetchJson(url);
  if (j && typeof j === "object" && !Array.isArray(j) && "code" in j && "msg" in j) {
    throw new Error(`Binance openInterest error: ${j.code} ${j.msg}`);
  }
  const oi = Number(j?.openInterest);
  return isNum(oi) ? oi : null;
}

async function fetchBinanceOiHistory({ symbol = "BTCUSDT", limit = 15 } = {}) {
  const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=1d&limit=${limit}`;
  const arr = await fetchJson(url);

  if (arr && typeof arr === "object" && !Array.isArray(arr) && "code" in arr && "msg" in arr) {
    throw new Error(`Binance openInterestHist error: ${arr.code} ${arr.msg}`);
  }

  if (!Array.isArray(arr) || !arr.length) return [];
  return arr
    .map(x => ({ time: Math.floor(Number(x?.timestamp) / 1000), oi: Number(x?.sumOpenInterestValue) }))
    .filter(x => isNum(x.time) && isNum(x.oi));
}

// ✅ forest.js gebruikt deze naam
export async function fetchBtcOpenInterestChange({ symbol = "BTCUSDT" } = {}) {
  try {
    const [oiNowFallback, hist] = await Promise.all([
      fetchBinanceOpenInterestNow({ symbol }).catch(() => null),
      fetchBinanceOiHistory({ symbol, limit: 15 })
    ]);

    if (hist.length < 2) {
      return { oiNow: isNum(oiNowFallback) ? oiNowFallback : null, oiChange1: null, oiChange7: null, source: "binance-empty" };
    }

    const last = hist[hist.length - 1];
    const prev1 = hist[hist.length - 2] || null;
    const prev7 = hist.length >= 8 ? hist[hist.length - 8] : null;

    const oiNow = isNum(last?.oi) ? last.oi : (isNum(oiNowFallback) ? oiNowFallback : null);
    const c1 = (prev1 && prev1.oi > 0 && isNum(oiNow)) ? ((oiNow - prev1.oi) / prev1.oi) : null;
    const c7 = (prev7 && prev7.oi > 0 && isNum(oiNow)) ? ((oiNow - prev7.oi) / prev7.oi) : null;

    return {
      oiNow: isNum(oiNow) ? oiNow : null,
      oiChange1: isNum(c1) ? c1 : null,
      oiChange7: isNum(c7) ? c7 : null,
      source: "binance"
    };
  } catch (e) {
    return { oiNow: null, oiChange1: null, oiChange7: null, source: `binance-error:${String(e?.message || e).slice(0, 90)}` };
  }
}

// ------------------------------
// ETF flows via Bitbo (best effort)
// ------------------------------
function parseBitboTotals(html) {
  const text = String(html || "");
  // pak alle getallen die eruit zien als "Totals" in US$m (Bitbo gebruikt vaak US$m)
  // We pakken een paar laatste matches, newest-first.
  const matches = [];
  const re = /Totals<\/[^>]*>\s*<\/[^>]*>\s*<[^>]*>\s*(-?\d+(?:\.\d+)?)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1]);
    if (isNum(v)) matches.push(v);
    if (matches.length >= 10) break;
  }
  return matches; // in US$m
}

export async function fetchBtcEtfFlows() {
  try {
    const html = await fetchText("https://bitbo.io/treasuries/etf-flows/");
    const totalsM = parseBitboTotals(html);

    if (!totalsM.length) {
      return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0, source: "bitbo-empty" };
    }

    const latest = totalsM[0] * 1_000_000;
    const sum7 = totalsM.slice(0, 7).reduce((a, x) => a + x * 1_000_000, 0);

    const prev = totalsM[1];
    const etfFlip = isNum(prev) ? (Math.sign(prev) !== Math.sign(totalsM[0]) && totalsM[0] !== 0) : false;
    const etfBias = totalsM[0] > 0 ? +0.0004 : totalsM[0] < 0 ? -0.0004 : 0;

    return { etfNetFlow: latest, etfFlow7: sum7, etfPercentile: null, etfFlip, etfBias, source: "bitbo" };
  } catch (e) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0, source: `bitbo-error:${String(e?.message || e).slice(0, 90)}` };
  }
}

// ------------------------------
// Liq heatmap: we doen GEEN CoinGlass meer (scheelt errors + tijd)
// -> forest.js valt dan automatisch terug op synthetic
// ------------------------------
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