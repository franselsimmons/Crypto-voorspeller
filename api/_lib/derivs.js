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
// CoinGlass helper (optioneel)
// ------------------------------
function getCoinglassKey() {
  const k = process.env.COINGLASS_KEY;
  return (typeof k === "string" && k.trim()) ? k.trim() : null;
}

async function fetchCoinglass(url) {
  const key = getCoinglassKey();
  if (!key) return { ok: false, denied: true, code: "NO_KEY", msg: "No key" };

  const j = await fetchJson(url, {
    headers: {
      accept: "application/json",
      coinglassSecret: key
    }
  });

  const code = String(j?.code ?? "");
  const msg = String(j?.msg ?? "");

  // Bij jou: code "400" + "Upgrade plan"
  if (code !== "0") return { ok: false, denied: true, code, msg };

  return { ok: true, data: j?.data ?? null };
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

  // percentile van lastRate in historie
  const sorted = hist.map(x => x.rate).slice().sort((a,b)=>a-b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= lastRate) idx++;
  const pct = sorted.length > 1 ? (idx - 1) / (sorted.length - 1) : 0.5;

  let extreme = null;
  const p = pct;

  // Positief extreem (crowded longs)
  if (p >= 0.995) extreme = "EXTREME_POS";
  else if (p >= 0.97) extreme = "HIGH_POS";

  // Negatief extreem (crowded shorts)
  if (p <= 0.005) extreme = "EXTREME_NEG";
  else if (p <= 0.03) extreme = "HIGH_NEG";

  const flip = !!extreme;

  // ✅ zwaarder gewicht bij >97% (zoals je vroeg)
  let bias = 0;
  if (extreme === "HIGH_POS") bias = -0.0007;
  if (extreme === "EXTREME_POS") bias = -0.0014; // zwaarder
  if (extreme === "HIGH_NEG") bias = +0.0007;
  if (extreme === "EXTREME_NEG") bias = +0.0014; // zwaarder

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
      oi: Number(x?.sumOpenInterestValue) // USD value
    }))
    .filter(x => isNum(x.time) && isNum(x.oi));
}

// ------------------------------
// Exports die forest.js gebruikt
// ------------------------------
export async function fetchBtcFundingStats({ symbol = "BTCUSDT", lookbackDays = 120 } = {}) {
  // CoinGlass proberen (maar bij jou denied) -> dan Binance
  try {
    const cg = await fetchCoinglass(
      `https://open-api-v4.coinglass.com/api/futures/funding-rate/history?exchange=Binance&symbol=${encodeURIComponent(symbol)}&interval=8h&limit=200`
    );
    if (cg.ok && Array.isArray(cg.data) && cg.data.length) {
      // Als je ooit upgrade: hier kun je CoinGlass mappen.
      // Voor nu bewust niet, want bij jou denied.
    }
  } catch {
    // negeren, we vallen terug op Binance
  }

  // Binance is “echt” en gratis
  try {
    const hist = await fetchBinanceFundingHistory({ symbol, limit: 200 });
    const out = fundingStatsFromHistory(hist);

    // lookbackDays is niet super nodig voor Binance funding (we pakken 200 points),
    // maar houden hem in de signature zodat forest.js altijd klopt.
    void lookbackDays;

    return out;
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
  // CoinGlass proberen (maar bij jou denied) -> dan Binance
  try {
    const cg = await fetchCoinglass(
      `https://open-api-v4.coinglass.com/api/futures/open-interest/history?exchange=Binance&symbol=${encodeURIComponent(symbol)}&interval=1d&limit=120`
    );
    if (cg.ok && Array.isArray(cg.data) && cg.data.length) {
      // Als je ooit upgrade: hier kun je CoinGlass mappen.
    }
  } catch {
    // negeren
  }

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

export async function fetchBtcEtfFlows({ lookbackDays = 120 } = {}) {
  // ETF is bij jou “Upgrade plan” bij CoinGlass -> dus blijft n/a.
  // Maar: we geven altijd een NET object terug zodat je UI nooit crasht.
  try {
    const cg = await fetchCoinglass("https://open-api-v4.coinglass.com/api/etf/bitcoin/flow-history?limit=180");
    if (!cg.ok) {
      void lookbackDays;
      return {
        etfNetFlow: null,
        etfFlow7: null,
        etfPercentile: null,
        etfFlip: false,
        etfBias: 0,
        source: "coinglass-denied"
      };
    }

    // Als je ooit upgrade: parse hier cg.data.
    void lookbackDays;
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0,
      source: "coinglass"
    };
  } catch (e) {
    void lookbackDays;
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0,
      source: `etf-error:${String(e?.message || e).slice(0, 80)}`
    };
  }
}

// ------------------------------
// Liq heatmap (CoinGlass denied => leeg)
// forest.js valt dan terug op synthetic
// ------------------------------
export async function fetchBtcLiqHeatmapLevels({ symbol = "BTCUSDT", topN = 12 } = {}) {
  try {
    const cg = await fetchCoinglass(
      `https://open-api-v4.coinglass.com/api/futures/liquidation/heatmap?exchange=Binance&symbol=${encodeURIComponent(symbol)}`
    );
    if (!cg.ok) return [];
    // Als het ooit werkt: return [{price, weight}, ...]
    void topN;
    return [];
  } catch {
    void topN;
    return [];
  }
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