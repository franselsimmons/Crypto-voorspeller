// api/_lib/derivs.js

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

// ------------------------------
// OPTIONAL KV (nooit crashen)
// ------------------------------
let kv = null;

// Deze functie probeert KV te laden, maar faalt NOOIT hard.
async function getKv() {
  if (kv) return kv;
  try {
    // Dynamische import: als package/vars ontbreken -> catch -> kv blijft null
    const mod = await import("@vercel/kv");
    if (mod?.kv) kv = mod.kv;
  } catch {}
  return kv;
}

async function kvGet(key) {
  try {
    const k = await getKv();
    if (!k) return null;
    return await k.get(key);
  } catch {
    return null;
  }
}

async function kvSet(key, value, exSeconds) {
  try {
    const k = await getKv();
    if (!k) return;
    // ex is TTL in seconden
    await k.set(key, value, { ex: exSeconds });
  } catch {}
}

// ------------------------------
// fetchJson met timeout
// ------------------------------
async function fetchJson(url, opts = {}) {
  const timeoutMs = Number(opts?.timeoutMs ?? 9000);
  const headers = opts?.headers ?? {};

  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      ...opts,
      headers: { accept: "application/json", ...headers },
      signal: ctrl.signal
    });

    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch {}

    if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${t.slice(0, 180)}`);
    return j;
  } finally {
    clearTimeout(id);
  }
}

async function tryMany(urls, opts = {}) {
  let lastErr = null;
  for (const u of urls) {
    try {
      const j = await fetchJson(u, opts);
      return { ok: true, url: u, data: j };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr || "unknown") };
}

// ------------------------------
// CoinGlass helper (OPTIONEEL)
// ------------------------------
function getCoinglassKey() {
  const k = process.env.COINGLASS_KEY;
  return (typeof k === "string" && k.trim()) ? k.trim() : null;
}

async function fetchCoinglass(url) {
  const key = getCoinglassKey();
  if (!key) return { ok: false, denied: true, code: "NO_KEY", msg: "No key" };

  const j = await fetchJson(url, {
    headers: { coinglassSecret: key },
    timeoutMs: 12000
  });

  const code = String(j?.code ?? "");
  const msg = String(j?.msg ?? "");
  if (code !== "0") return { ok: false, denied: true, code, msg };
  return { ok: true, data: j?.data ?? null };
}

// ------------------------------
// BINANCE funding (gratis)
// ------------------------------
async function fetchBinanceFundingHistory({ symbol = "BTCUSDT", limit = 200 } = {}) {
  const urls = [
    `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`
  ];
  const r = await tryMany(urls, { timeoutMs: 9000 });
  if (!r.ok) return { ok: false, hist: [], err: r.error };

  const arr = r.data;
  if (!Array.isArray(arr) || !arr.length) return { ok: true, hist: [], err: null };

  const hist = arr
    .map(x => ({
      time: Math.floor(Number(x?.fundingTime) / 1000),
      rate: Number(x?.fundingRate)
    }))
    .filter(x => isNum(x.time) && isNum(x.rate));

  return { ok: true, hist, err: null };
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
  const p = pct;

  if (p >= 0.995) extreme = "EXTREME_POS";
  else if (p >= 0.97) extreme = "HIGH_POS";

  if (p <= 0.005) extreme = "EXTREME_NEG";
  else if (p <= 0.03) extreme = "HIGH_NEG";

  const flip = !!extreme;

  let bias = 0;
  if (extreme === "HIGH_POS") bias = -0.0007;
  if (extreme === "EXTREME_POS") bias = -0.0012; // zwaarder
  if (extreme === "HIGH_NEG") bias = +0.0007;
  if (extreme === "EXTREME_NEG") bias = +0.0012; // zwaarder

  return {
    fundingRate: lastRate,
    fundingPercentile: pct,
    fundingExtreme: extreme,
    fundingFlip: flip,
    fundingBias: bias,
    source: "binance"
  };
}

// ------------------------------
// BINANCE OI (gratis)
// ------------------------------
async function fetchBinanceOiHistory({ symbol = "BTCUSDT", limit = 15 } = {}) {
  const urls = [
    `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=1d&limit=${limit}`
  ];
  const r = await tryMany(urls, { timeoutMs: 9000 });
  if (!r.ok) return { ok: false, hist: [], err: r.error };

  const arr = r.data;
  if (!Array.isArray(arr) || !arr.length) return { ok: true, hist: [], err: null };

  const hist = arr
    .map(x => ({
      time: Math.floor(Number(x?.timestamp) / 1000),
      oi: Number(x?.sumOpenInterestValue)
    }))
    .filter(x => isNum(x.time) && isNum(x.oi));

  return { ok: true, hist, err: null };
}

// ------------------------------
// EXPORTS (forest.js verwacht deze namen)
// ------------------------------
export async function fetchBtcFundingStats({ symbol = "BTCUSDT" } = {}) {
  // 1) CoinGlass (bij jou meestal denied)
  const cg = await fetchCoinglass(
    `https://open-api-v4.coinglass.com/api/futures/funding-rate/history?exchange=Binance&symbol=${encodeURIComponent(symbol)}&interval=8h&limit=200`
  );
  if (cg.ok && Array.isArray(cg.data) && cg.data.length) {
    // als je ooit upgrade: hier mappen
  }

  // 2) Binance (gratis)
  const b = await fetchBinanceFundingHistory({ symbol, limit: 200 });
  if (b.ok && b.hist.length) {
    const out = fundingStatsFromHistory(b.hist);
    await kvSet("derivs:funding:last", out, 60 * 20);
    return out;
  }

  // 3) cache fallback
  const cached = await kvGet("derivs:funding:last");
  if (cached && typeof cached === "object") return { ...cached, source: "cache" };

  return {
    fundingRate: null,
    fundingPercentile: null,
    fundingExtreme: null,
    fundingFlip: false,
    fundingBias: 0,
    source: b.ok ? "binance-empty" : `binance-error:${String(b.err || "")}`
  };
}

export async function fetchBtcOpenInterestChange({ symbol = "BTCUSDT" } = {}) {
  // 1) CoinGlass (denied bij jou)
  const cg = await fetchCoinglass(
    `https://open-api-v4.coinglass.com/api/futures/open-interest/history?exchange=Binance&symbol=${encodeURIComponent(symbol)}&interval=1d&limit=120`
  );
  if (cg.ok && Array.isArray(cg.data) && cg.data.length) {
    // als je ooit upgrade: hier mappen
  }

  // 2) Binance (gratis)
  const b = await fetchBinanceOiHistory({ symbol, limit: 15 });
  if (b.ok && b.hist.length >= 2) {
    const hist = b.hist;
    const last = hist[hist.length - 1];
    const prev1 = hist[hist.length - 2] || null;
    const prev7 = hist.length >= 8 ? hist[hist.length - 8] : null;

    const oiNow = last.oi;
    const oiChange1 = (prev1 && prev1.oi > 0) ? ((oiNow - prev1.oi) / prev1.oi) : null;
    const oiChange7 = (prev7 && prev7.oi > 0) ? ((oiNow - prev7.oi) / prev7.oi) : null;

    const out = {
      oiNow,
      oiChange1: isNum(oiChange1) ? oiChange1 : null,
      oiChange7: isNum(oiChange7) ? oiChange7 : null,
      source: "binance"
    };

    await kvSet("derivs:oi:last", out, 60 * 30);
    return out;
  }

  // 3) cache fallback
  const cached = await kvGet("derivs:oi:last");
  if (cached && typeof cached === "object") return { ...cached, source: "cache" };

  return {
    oiNow: null,
    oiChange1: null,
    oiChange7: null,
    source: b.ok ? "binance-empty" : `binance-error:${String(b.err || "")}`
  };
}

export async function fetchBtcEtfFlows({ lookbackDays = 120 } = {}) {
  const cg = await fetchCoinglass("https://open-api-v4.coinglass.com/api/etf/bitcoin/flow-history?limit=180");
  if (!cg.ok) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0,
      source: "coinglass-denied"
    };
  }
  return {
    etfNetFlow: null,
    etfFlow7: null,
    etfPercentile: null,
    etfFlip: false,
    etfBias: 0,
    source: "coinglass"
  };
}

export async function fetchBtcLiqHeatmapLevels({ symbol = "BTCUSDT", topN = 12 } = {}) {
  const cg = await fetchCoinglass(
    `https://open-api-v4.coinglass.com/api/futures/liquidation/heatmap?exchange=Binance&symbol=${encodeURIComponent(symbol)}`
  );
  if (!cg.ok) return [];
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