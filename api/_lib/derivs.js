// api/_lib/derivs.js

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12_000);

  try {
    const r = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        // Binance/CORS is server-side, maar soms wil Binance een UA zien
        "user-agent": "Mozilla/5.0 (Vercel; CryptoVoorspeller)",
        ...(opts.headers || {})
      }
    });

    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch {}

    if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${t.slice(0, 180)}`);
    return j;
  } finally {
    clearTimeout(to);
  }
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
    headers: { coinglassSecret: key }
  });

  const code = String(j?.code ?? "");
  const msg = String(j?.msg ?? "");
  if (code !== "0") return { ok: false, denied: true, code, msg };
  return { ok: true, data: j?.data ?? null };
}

// ------------------------------
// BINANCE (gratis) FUNDING
// ------------------------------
async function fetchBinanceFundingHistory({ symbol = "BTCUSDT", limit = 200 } = {}) {
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const arr = await fetchJson(url);
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

  // percentile van laatste funding tov historie
  const sorted = hist.map(x => x.rate).slice().sort((a,b)=>a-b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= lastRate) idx++;
  const pct = sorted.length > 1 ? (idx - 1) / (sorted.length - 1) : 0.5;

  // labels
  let extreme = null;
  if (pct >= 0.995) extreme = "EXTREME_POS";
  else if (pct >= 0.97) extreme = "HIGH_POS"; // ✅ jouw wens: >97% zwaarder

  if (pct <= 0.005) extreme = "EXTREME_NEG";
  else if (pct <= 0.03) extreme = "HIGH_NEG";

  const flip = !!extreme;

  // bias (kleine drift per bar)
  let bias = 0;
  if (extreme === "HIGH_POS") bias = -0.0007;
  if (extreme === "EXTREME_POS") bias = -0.0014; // ✅ extra zwaar
  if (extreme === "HIGH_NEG") bias = +0.0007;
  if (extreme === "EXTREME_NEG") bias = +0.0014; // ✅ extra zwaar

  return {
    fundingRate: lastRate,
    fundingPercentile: pct,
    fundingExtreme: extreme,
    fundingFlip: flip,
    fundingBias: bias,
    source: "binance"
  };
}

// Exporteer exact wat forest.js gebruikt:
export async function fetchBtcFundingStats({ symbol = "BTCUSDT", lookbackDays = 120 } = {}) {
  // CoinGlass probeer je nog, maar bij jou is die “Upgrade plan”
  // dus Binance is de echte bron.
  // (lookbackDays gebruiken we om limit te kiezen)
  const limit = clamp(Math.floor((lookbackDays * 24) / 8), 50, 1000); // funding elke 8h
  const hist = await fetchBinanceFundingHistory({ symbol, limit });
  return fundingStatsFromHistory(hist);
}

// ------------------------------
// BINANCE (gratis) OPEN INTEREST (1d + 7d)
// ------------------------------
async function fetchBinanceOiHistory({ symbol = "BTCUSDT", limit = 15 } = {}) {
  const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=1d&limit=${limit}`;
  const arr = await fetchJson(url);
  if (!Array.isArray(arr) || !arr.length) return [];

  // Binance geeft meestal sumOpenInterestValue (USD) of sumOpenInterest (contracts)
  return arr
    .map(x => ({
      time: Math.floor(Number(x?.timestamp) / 1000),
      oiUsd: Number(x?.sumOpenInterestValue),
      oiContracts: Number(x?.sumOpenInterest)
    }))
    .filter(x => isNum(x.time) && (isNum(x.oiUsd) || isNum(x.oiContracts)));
}

export async function fetchBtcOpenInterestChange({ symbol = "BTCUSDT" } = {}) {
  const hist = await fetchBinanceOiHistory({ symbol, limit: 15 });
  if (hist.length < 2) {
    return { oiNow: null, oiChange1: null, oiChange7: null, source: "binance-empty" };
  }

  // voorkeur: USD value, anders contracts
  const pickOi = (row) => (isNum(row?.oiUsd) ? row.oiUsd : (isNum(row?.oiContracts) ? row.oiContracts : null));

  const last = hist[hist.length - 1];
  const prev1 = hist[hist.length - 2] || null;
  const prev7 = hist.length >= 8 ? hist[hist.length - 8] : null;

  const oiNow = pickOi(last);
  const oi1 = pickOi(prev1);
  const oi7 = pickOi(prev7);

  const oiChange1 = (isNum(oiNow) && isNum(oi1) && oi1 > 0) ? ((oiNow - oi1) / oi1) : null;
  const oiChange7 = (isNum(oiNow) && isNum(oi7) && oi7 > 0) ? ((oiNow - oi7) / oi7) : null;

  return {
    oiNow: isNum(oiNow) ? oiNow : null,
    oiChange1: isNum(oiChange1) ? oiChange1 : null,
    oiChange7: isNum(oiChange7) ? oiChange7 : null,
    source: "binance"
  };
}

// ------------------------------
// ETF FLOWS (alternatief)
// ------------------------------
// Eerlijk: zonder CoinGlass heb je bijna altijd óf scraping óf een andere provider met key.
// Daarom: we maken ETF “best effort”. Als het faalt -> null + source label.
export async function fetchBtcEtfFlows({ lookbackDays = 120 } = {}) {
  // TIP: als jij een bron kiest (SoSoValue/Kaiko/Coinalyze/Glassnode etc),
  // dan pluggen we die hier in.
  // Voor nu: netjes "unavailable" teruggeven zodat jouw engine
  // het NIET doet alsof ETF data bestaat.

  return {
    etfNetFlow: null,
    etfFlow7: null,
    etfPercentile: null,
    etfFlip: false,
    etfBias: 0,
    source: "etf-unavailable"
  };
}

// ------------------------------
// Liq heatmap (CoinGlass denied => leeg, forest.js maakt synthetic)
// ------------------------------
export async function fetchBtcLiqHeatmapLevels({ symbol = "BTCUSDT", topN = 12 } = {}) {
  // CoinGlass endpoint is bij jou 404/denied. We laten hem staan maar fail-soft.
  const cg = await fetchCoinglass(
    `https://open-api-v4.coinglass.com/api/futures/liquidation/heatmap?exchange=Binance&symbol=${encodeURIComponent(symbol)}`
  );
  if (!cg.ok) return [];

  // Als het ooit werkt: hier mappen naar [{price, weight}]
  const data = cg.data;
  if (!data) return [];

  // onbekend format -> safe empty
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