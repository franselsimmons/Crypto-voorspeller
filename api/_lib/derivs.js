// api/_lib/derivs.js

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

// ------------------------------
// Safe fetchJson (met timeout)
// - Gooi GEEN error naar buiten tenzij jij dat wil
// ------------------------------
async function fetchJson(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { j = null; }
    return { ok: r.ok, status: r.status, json: j, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
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
  if (!key) return { ok: false, denied: true, code: "NO_KEY", msg: "No key", data: null };

  const r = await fetchJson(url, {
    headers: { accept: "application/json", coinglassSecret: key }
  });

  // CoinGlass geeft vaak 200 met {code,msg}
  const code = String(r?.json?.code ?? "");
  const msg = String(r?.json?.msg ?? "");

  if (!r.ok) return { ok: false, denied: true, code: String(r.status), msg: r.text, data: null };
  if (code !== "0") return { ok: false, denied: true, code, msg, data: null };

  return { ok: true, denied: false, code, msg, data: r?.json?.data ?? null };
}

// ------------------------------
// BINANCE funding (gratis)
// ------------------------------
async function fetchBinanceFundingHistory({ symbol = "BTCUSDT", limit = 200 } = {}) {
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const r = await fetchJson(url, { headers: { accept: "application/json" } });

  if (!r.ok) {
    return { hist: [], source: "binance-http-fail", error: `${r.status}: ${r.text?.slice(0, 160)}` };
  }

  // Binance kan 200 teruggeven met {code,msg} in plaats van array
  if (!Array.isArray(r.json)) {
    const code = r?.json?.code;
    const msg = r?.json?.msg;
    return { hist: [], source: "binance-non-array", error: `Non-array response: ${code ?? ""} ${msg ?? ""}` };
  }

  const hist = r.json
    .map(x => ({
      time: Math.floor(Number(x?.fundingTime) / 1000),
      rate: Number(x?.fundingRate)
    }))
    .filter(x => isNum(x.time) && isNum(x.rate));

  return { hist, source: "binance", error: null };
}

function fundingStatsFromHistory(hist, source = "binance") {
  if (!Array.isArray(hist) || hist.length === 0) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source
    };
  }

  const lastRate = hist[hist.length - 1].rate;

  const sorted = hist.map(x => x.rate).slice().sort((a, b) => a - b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= lastRate) idx++;
  const pct = sorted.length > 1 ? (idx - 1) / (sorted.length - 1) : 0.5;

  let extreme = null;

  if (pct >= 0.995) extreme = "EXTREME_POS";
  else if (pct >= 0.97) extreme = "HIGH_POS";

  if (pct <= 0.005) extreme = "EXTREME_NEG";
  else if (pct <= 0.03) extreme = "HIGH_NEG";

  const flip = !!extreme;

  // ✅ jouw wens: >97% percentile zwaarder
  let bias = 0;
  if (extreme === "HIGH_POS") bias = -0.0007;
  if (extreme === "EXTREME_POS") bias = -0.0012;
  if (extreme === "HIGH_NEG") bias = +0.0007;
  if (extreme === "EXTREME_NEG") bias = +0.0012;

  return {
    fundingRate: lastRate,
    fundingPercentile: pct,
    fundingExtreme: extreme,
    fundingFlip: flip,
    fundingBias: bias,
    source
  };
}

// ------------------------------
// BINANCE OI history (gratis)
// ------------------------------
async function fetchBinanceOiHistory({ symbol = "BTCUSDT", limit = 15 } = {}) {
  const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=1d&limit=${limit}`;
  const r = await fetchJson(url, { headers: { accept: "application/json" } });

  if (!r.ok) {
    return { hist: [], source: "binance-http-fail", error: `${r.status}: ${r.text?.slice(0, 160)}` };
  }

  if (!Array.isArray(r.json)) {
    const code = r?.json?.code;
    const msg = r?.json?.msg;
    return { hist: [], source: "binance-non-array", error: `Non-array response: ${code ?? ""} ${msg ?? ""}` };
  }

  const hist = r.json
    .map(x => ({
      time: Math.floor(Number(x?.timestamp) / 1000),
      oi: Number(x?.sumOpenInterestValue) // USD value
    }))
    .filter(x => isNum(x.time) && isNum(x.oi));

  return { hist, source: "binance", error: null };
}

function oiChangeFromHistory(hist, source = "binance") {
  if (!Array.isArray(hist) || hist.length < 2) {
    return { oiNow: null, oiChange1: null, oiChange7: null, source };
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
    source
  };
}

// ------------------------------
// Public exports (wat forest.js gebruikt)
// - Deze gooien NOOIT errors naar buiten
// ------------------------------
export async function fetchBtcFundingStats({ lookbackDays = 120, symbol = "BTCUSDT" } = {}) {
  // CoinGlass is bij jou denied -> we laten hem hier optioneel, maar hij mag NOOIT blokkeren
  // (Je kunt dit later weer aanzetten als je plan upgraded)
  // const cg = await fetchCoinglass("...");
  // if (cg.ok) ...

  const limit = clamp(Math.floor((lookbackDays * 24) / 8), 50, 1000);
  const b = await fetchBinanceFundingHistory({ symbol, limit });

  const stats = fundingStatsFromHistory(b.hist, b.source);
  // als Binance faalt, label dat netjes
  if (!b.hist.length && b.error) {
    return { ...stats, source: `${b.source}`, error: b.error };
  }
  return stats;
}

export async function fetchBtcOpenInterestChange({ symbol = "BTCUSDT" } = {}) {
  const b = await fetchBinanceOiHistory({ symbol, limit: 15 });
  const out = oiChangeFromHistory(b.hist, b.source);

  if (!b.hist.length && b.error) {
    return { ...out, source: `${b.source}`, error: b.error };
  }
  return out;
}

export async function fetchBtcEtfFlows({ lookbackDays = 180 } = {}) {
  // Jij krijgt "Upgrade plan" => dus altijd denied
  const cg = await fetchCoinglass(`https://open-api-v4.coinglass.com/api/etf/bitcoin/flow-history?limit=${clamp(lookbackDays, 30, 400)}`);
  if (!cg.ok) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0,
      source: "coinglass-denied",
      error: `${cg.code}: ${cg.msg}`
    };
  }

  // Als je ooit wél data hebt: hier parsen.
  return {
    etfNetFlow: null,
    etfFlow7: null,
    etfPercentile: null,
    etfFlip: false,
    etfBias: 0,
    source: "coinglass"
  };
}

// ------------------------------
// Liq heatmap (CoinGlass denied/404 -> [])
// forest.js pakt dan synthetic fallback
// ------------------------------
export async function fetchBtcLiqHeatmapLevels({ symbol = "BTCUSDT", topN = 12 } = {}) {
  const cg = await fetchCoinglass(`https://open-api-v4.coinglass.com/api/futures/liquidation/heatmap?exchange=Binance&symbol=${encodeURIComponent(symbol)}`);
  if (!cg.ok) return [];
  // Als het ooit werkt: map cg.data => [{price, weight}, ...]
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