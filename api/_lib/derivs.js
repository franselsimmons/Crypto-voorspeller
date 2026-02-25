// api/_lib/derivs.js
function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

async function fetchText(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${t.slice(0, 180)}`);
  return t;
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${t.slice(0, 180)}`);
  return j;
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
    headers: { accept: "application/json", coinglassSecret: key }
  });

  const code = String(j?.code ?? "");
  const msg = String(j?.msg ?? "");
  if (code !== "0") return { ok: false, denied: true, code, msg };

  return { ok: true, data: j?.data ?? null };
}

// ------------------------------
// BINANCE (gratis) Funding + OI
// ------------------------------
async function fetchBinancePremiumIndex({ symbol = "BTCUSDT" } = {}) {
  // geeft o.a. lastFundingRate (meestal string)
  const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`;
  const j = await fetchJson(url, { headers: { accept: "application/json" } });

  // Binance geeft soms {code, msg} met 200. Dat wil je zien.
  if (j && typeof j === "object" && !Array.isArray(j) && "code" in j && "msg" in j) {
    throw new Error(`Binance premiumIndex error: ${j.code} ${j.msg}`);
  }

  const rate = Number(j?.lastFundingRate);
  return isNum(rate) ? rate : null;
}

async function fetchBinanceFundingHistory({ symbol = "BTCUSDT", limit = 200 } = {}) {
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const arr = await fetchJson(url, { headers: { accept: "application/json" } });

  // Binance kan ook error-object teruggeven met 200
  if (arr && typeof arr === "object" && !Array.isArray(arr) && "code" in arr && "msg" in arr) {
    throw new Error(`Binance fundingRate error: ${arr.code} ${arr.msg}`);
  }

  if (!Array.isArray(arr) || !arr.length) return [];
  return arr
    .map(x => ({
      time: Math.floor(Number(x?.fundingTime) / 1000),
      rate: Number(x?.fundingRate)
    }))
    .filter(x => isNum(x.time) && isNum(x.rate));
}

function fundingStatsFromHistoryOrRate(hist, fallbackRate) {
  const lastRate = (hist.length && isNum(hist[hist.length - 1]?.rate))
    ? hist[hist.length - 1].rate
    : (isNum(fallbackRate) ? fallbackRate : null);

  // Zonder rate kunnen we niks
  if (!isNum(lastRate)) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source: "binance-empty"
    };
  }

  let pct = null;

  // Als we historie hebben, percentile bepalen
  if (hist.length >= 20) {
    const sorted = hist.map(x => x.rate).slice().sort((a,b)=>a-b);
    let idx = 0;
    while (idx < sorted.length && sorted[idx] <= lastRate) idx++;
    pct = sorted.length > 1 ? (idx - 1) / (sorted.length - 1) : 0.5;
  }

  // Extreme labels:
  // - Als percentile bekend is: jouw regels (>97% zwaarder, >99.5% extreem)
  // - Als percentile NIET bekend is: fallback op absolute funding rate
  let extreme = null;
  if (isNum(pct)) {
    if (pct >= 0.995) extreme = "EXTREME_POS";
    else if (pct >= 0.97) extreme = "HIGH_POS";

    if (pct <= 0.005) extreme = "EXTREME_NEG";
    else if (pct <= 0.03) extreme = "HIGH_NEG";
  } else {
    // fallback (ruwe drempels, werkt altijd)
    if (lastRate >= 0.0020) extreme = "EXTREME_POS";
    else if (lastRate >= 0.0012) extreme = "HIGH_POS";
    if (lastRate <= -0.0020) extreme = "EXTREME_NEG";
    else if (lastRate <= -0.0012) extreme = "HIGH_NEG";
  }

  const flip = !!extreme;

  // bias klein; EXTREME sterker dan HIGH
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

// ✅ Dit is de functie die forest.js gebruikt
export async function fetchBtcFundingStats({ symbol = "BTCUSDT", lookbackDays = 120 } = {}) {
  try {
    // 1) (optioneel) CoinGlass – bij jou denied, maar laten staan
    const cg = await fetchCoinglass(
      "https://open-api-v4.coinglass.com/api/futures/funding-rate/history?exchange=Binance&symbol=BTCUSDT&interval=8h&limit=200"
    );
    if (cg.ok && Array.isArray(cg.data) && cg.data.length) {
      // Als CoinGlass ooit werkt: hier parse je cg.data naar {time, rate} en stats
      // Voor nu: we gaan altijd Binance gebruiken.
    }

    // 2) Binance: altijd proberen (gratis)
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
      source: `binance-error:${String(e?.message || e).slice(0, 80)}`
    };
  }
}

async function fetchBinanceOpenInterestNow({ symbol = "BTCUSDT" } = {}) {
  // current OI (contracts) – niet perfect USD, maar geeft “nu”
  const url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`;
  const j = await fetchJson(url, { headers: { accept: "application/json" } });
  if (j && typeof j === "object" && !Array.isArray(j) && "code" in j && "msg" in j) {
    throw new Error(`Binance openInterest error: ${j.code} ${j.msg}`);
  }
  const oi = Number(j?.openInterest);
  return isNum(oi) ? oi : null;
}

async function fetchBinanceOiHistory({ symbol = "BTCUSDT", limit = 15 } = {}) {
  // 1d OI history (USD value)
  const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=1d&limit=${limit}`;
  const arr = await fetchJson(url, { headers: { accept: "application/json" } });

  if (arr && typeof arr === "object" && !Array.isArray(arr) && "code" in arr && "msg" in arr) {
    throw new Error(`Binance openInterestHist error: ${arr.code} ${arr.msg}`);
  }

  if (!Array.isArray(arr) || !arr.length) return [];
  return arr
    .map(x => ({
      time: Math.floor(Number(x?.timestamp) / 1000),
      oi: Number(x?.sumOpenInterestValue) // USD value
    }))
    .filter(x => isNum(x.time) && isNum(x.oi));
}

// ✅ Dit is de functie die forest.js gebruikt
export async function fetchBtcOpenInterestChange({ symbol = "BTCUSDT" } = {}) {
  try {
    const [oiNowFallback, hist] = await Promise.all([
      fetchBinanceOpenInterestNow({ symbol }).catch(() => null),
      fetchBinanceOiHistory({ symbol, limit: 15 })
    ]);

    if (hist.length < 2) {
      return {
        oiNow: isNum(oiNowFallback) ? oiNowFallback : null,
        oiChange1: null,
        oiChange7: null,
        source: "binance-empty"
      };
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
    return {
      oiNow: null,
      oiChange1: null,
      oiChange7: null,
      source: `binance-error:${String(e?.message || e).slice(0, 80)}`
    };
  }
}

// ------------------------------
// ETF flows (gratis) via Bitbo HTML
// ------------------------------
// Bitbo zet “Totals” per dag in de HTML (zoals jij in je browser ziet).
// We pakken de laatste ~10 dagen en maken:
// - etfNetFlow = laatst bekende "Totals" (USD)
// - etfFlow7 = som van laatste 7 dagen (USD)
// Percentile/flip/bias houden we simpel (maar wél echte data).
function parseBitboTotals(html) {
  const lines = String(html || "").split("\n").map(s => s.trim()).filter(Boolean);

  // Voorbeeldregel in HTML tekst:
  // "Feb 23, 2026 ... -202.1"
  // We pakken: datum + laatste getal op de regel = Totals (US$m)
  const rows = [];
  const re = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\s+.*?(-?\d+(?:\.\d+)?)\s*$/;

  for (const ln of lines) {
    const m = ln.match(re);
    if (!m) continue;
    const totalM = Number(m[2]);
    if (!isNum(totalM)) continue;
    rows.push({ totalM });
  }

  // rows is newest-first in de Bitbo snippet (meestal).
  return rows;
}

export async function fetchBtcEtfFlows({ lookbackDays = 120 } = {}) {
  try {
    const html = await fetchText("https://bitbo.io/treasuries/etf-flows/", {
      headers: { accept: "text/html" }
    });

    const rows = parseBitboTotals(html);
    if (!rows.length) {
      return {
        etfNetFlow: null,
        etfFlow7: null,
        etfPercentile: null,
        etfFlip: false,
        etfBias: 0,
        source: "bitbo-empty"
      };
    }

    // Bitbo toont meestal laatste ~10 dagen → genoeg voor “nu” en “7d”
    const latest = rows[0].totalM * 1_000_000;
    const sum7 = rows.slice(0, 7).reduce((a, r) => a + (r.totalM * 1_000_000), 0);

    // simpele flip: als vandaag negatief is na reeks positief (of omgekeerd)
    const prev = rows[1]?.totalM ?? null;
    const etfFlip = isNum(prev) ? (Math.sign(prev) !== Math.sign(rows[0].totalM) && rows[0].totalM !== 0) : false;

    // kleine bias (heel klein, alleen richting)
    const etfBias = rows[0].totalM > 0 ? +0.0004 : rows[0].totalM < 0 ? -0.0004 : 0;

    return {
      etfNetFlow: isNum(latest) ? latest : null,
      etfFlow7: isNum(sum7) ? sum7 : null,
      etfPercentile: null,
      etfFlip,
      etfBias,
      source: "bitbo"
    };
  } catch (e) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0,
      source: `bitbo-error:${String(e?.message || e).slice(0, 80)}`
    };
  }
}

// ------------------------------
// Liq heatmap (CoinGlass denied => leeg, dan pakt forest.js synthetic)
// ------------------------------
export async function fetchBtcLiqHeatmapLevels({ symbol = "BTCUSDT", topN = 12 } = {}) {
  const cg = await fetchCoinglass(
    `https://open-api-v4.coinglass.com/api/futures/liquidation/heatmap?exchange=Binance&symbol=${encodeURIComponent(symbol)}`
  );
  if (!cg.ok) return [];
  // als het ooit werkt: return [{price, weight}, ...]
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