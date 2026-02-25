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
    headers: {
      accept: "application/json",
      coinglassSecret: key
    }
  });

  const code = String(j?.code ?? "");
  const msg = String(j?.msg ?? "");
  // bij jou: code "400" + "Upgrade plan"
  if (code !== "0") return { ok: false, denied: true, code, msg };

  return { ok: true, data: j?.data ?? null };
}

// ------------------------------
// BINANCE (gratis) funding + OI
// ------------------------------
async function fetchBinanceFundingHistory({ symbol = "BTCUSDT", limit = 200 } = {}) {
  // funding elke 8 uur
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

  const last = hist[hist.length - 1];
  const lastRate = last.rate;

  // percentile: laatste rate vs historie
  const sorted = hist.map(x => x.rate).slice().sort((a,b)=>a-b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= lastRate) idx++;
  const pct = sorted.length > 1 ? (idx - 1) / (sorted.length - 1) : 0.5;

  let extreme = null;

  // pos extreem
  if (pct >= 0.995) extreme = "EXTREME_POS";
  else if (pct >= 0.97) extreme = "HIGH_POS";

  // neg extreem
  if (pct <= 0.005) extreme = "EXTREME_NEG";
  else if (pct <= 0.03) extreme = "HIGH_NEG";

  const flip = !!extreme;

  // bias: klein drift per bar
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

// ✅ export NAAM die forest.js verwacht:
export async function fetchBtcFundingStats({ symbol = "BTCUSDT", lookbackDays = 120 } = {}) {
  // 1) probeer CoinGlass (maar bij jou is het denied)
  // We laten het staan, maar we FALLBACKEN altijd.
  try {
    const cg = await fetchCoinglass(
      `https://open-api-v4.coinglass.com/api/futures/funding-rate/history?exchange=Binance&symbol=${encodeURIComponent(symbol)}&interval=8h&limit=200`
    );
    if (cg.ok && Array.isArray(cg.data) && cg.data.length) {
      // als CoinGlass ooit wél werkt kun je hier netjes mappen
      // voor nu: fallback Binance is jouw echte bron.
    }
  } catch {}

  // 2) Binance fallback (echt, gratis)
  const hist = await fetchBinanceFundingHistory({ symbol, limit: 200 });
  const out = fundingStatsFromHistory(hist);
  // label: we hebben lookbackDays niet nodig, maar we houden parameter compatibel
  return out;
}

async function fetchBinanceOiHistory({ symbol = "BTCUSDT", limit = 15 } = {}) {
  // OI history (USD value)
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

// ✅ export NAAM die forest.js verwacht:
export async function fetchBtcOpenInterestChange({ symbol = "BTCUSDT" } = {}) {
  // CoinGlass denied → direct Binance
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
}

// ------------------------------
// ETF flows: Farside (echt, publiek)
// ------------------------------
function parseFarsideNumber(s) {
  // "(73.4)" => -73.4, "-" => null, "231.6" => 231.6
  const t = String(s || "").trim();
  if (!t || t === "-") return null;
  const neg = t.startsWith("(") && t.endsWith(")");
  const core = neg ? t.slice(1, -1) : t;
  const v = Number(core.replace(/,/g, ""));
  if (!isNum(v)) return null;
  return neg ? -v : v;
}

async function fetchFarsideBtcTableHtml() {
  // openbare tabel Bitcoin ETF Flow (US$m)
  return fetchText("https://farside.co.uk/btc/", { headers: { accept: "text/html" } });
}

function extractFarsideTotals(html, limitRows = 220) {
  // Super simpele parser:
  // - Zoek alle datums "dd Mon yyyy"
  // - Neem de eerstvolgende number als "Total"
  const dateRe = /\b(\d{2}\s+[A-Za-z]{3}\s+\d{4})\b/g;
  const numRe = /(\(\s*\d+(?:\.\d+)?\s*\)|-|\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b)/g;

  const hits = [];
  let m;
  while ((m = dateRe.exec(html)) !== null) {
    const dateStr = m[1];
    const from = m.index;
    const slice = html.slice(from, from + 2000); // genoeg om het totaal daarna te vinden
    const nm = slice.match(numRe);
    if (!nm || !nm.length) continue;

    // nm[0] is meestal de eerste number NA de datum = Total (US$m)
    const total = parseFarsideNumber(nm[0]);
    if (!isNum(total)) continue;

    hits.push({ dateStr, total });
    if (hits.length >= limitRows) break;
  }
  return hits;
}

function computePercentileFromSeries(series, lastVal) {
  const sorted = series.slice().sort((a,b)=>a-b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= lastVal) idx++;
  return sorted.length > 1 ? (idx - 1) / (sorted.length - 1) : 0.5;
}

export async function fetchBtcEtfFlows({ lookbackDays = 120 } = {}) {
  try {
    const html = await fetchFarsideBtcTableHtml();
    const rows = extractFarsideTotals(html);

    if (!rows.length) {
      return {
        etfNetFlow: null,
        etfFlow7: null,
        etfPercentile: null,
        etfFlip: false,
        etfBias: 0,
        source: "farside-empty"
      };
    }

    // rows staan in volgorde zoals pagina (meestal oud->nieuw of nieuw->oud).
    // We pakken de LAATSTE met number als “laatste dag”.
    const last = rows[rows.length - 1];
    const lastFlowM = last.total; // US$m

    // 7d som: laatste 7 beschikbare rows
    const tail = rows.slice(Math.max(0, rows.length - 7));
    const sum7M = tail.reduce((a, r) => a + (isNum(r.total) ? r.total : 0), 0);

    // percentile op basis van historie
    const series = rows.map(r => r.total).filter(isNum);
    const pct = computePercentileFromSeries(series, lastFlowM);

    // etfFlip: teken verandert t.o.v. vorige (simpel)
    const prev = rows.length >= 2 ? rows[rows.length - 2].total : null;
    const flip = isNum(prev) ? (Math.sign(prev) !== Math.sign(lastFlowM) && Math.sign(prev) !== 0) : false;

    // etfBias: klein driftje, instroom => positief bias, uitstroom => negatief
    const bias = clamp(lastFlowM / 500, -1, 1) * 0.0006; // 500m = “sterk”

    return {
      // we geven dollars terug (niet miljoenen)
      etfNetFlow: lastFlowM * 1_000_000,
      etfFlow7: sum7M * 1_000_000,
      etfPercentile: pct,
      etfFlip: flip,
      etfBias: bias,
      source: "farside"
    };
  } catch (e) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0,
      source: "farside-error",
      error: String(e?.message || e)
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
  // format: "90000:1,95000:0.6"
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