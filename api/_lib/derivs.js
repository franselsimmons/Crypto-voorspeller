// api/_lib/derivs.js
// Derivatives layer: funding / OI / ETF / liquidations
// Primary: CoinGlass (als je plan dit toestaat)
// Fallback: Bitget public endpoints (geen key nodig)

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

async function fetchText(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const txt = await r.text();
    return { ok: r.ok, status: r.status, text: txt };
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url, opts = {}) {
  const { ok, status, text } = await fetchText(url, opts);
  let j = null;
  try { j = JSON.parse(text); } catch {}
  return { ok, status, json: j, text };
}

// --------------------
// CoinGlass (optioneel)
// --------------------
const CG_BASE = "https://open-api-v4.coinglass.com";
const CG_KEY = process.env.COINGLASS_KEY || "";

function cgDenied(j) {
  // jouw health laat zien: cgCode "400" + msg "Upgrade plan"
  const code = String(j?.code ?? j?.cgCode ?? "");
  const msg = String(j?.msg ?? j?.cgMsg ?? "");
  return code === "400" && /upgrade/i.test(msg);
}

function cgUnwrap(j) {
  if (!j) return null;
  return j.data ?? j.result ?? j;
}

async function cgFetch(url) {
  if (!CG_KEY) return { ok: false, status: 0, data: null, denied: false };
  const r = await fetchJson(url, {
    headers: { coinglassSecret: CG_KEY }
  });
  const denied = cgDenied(r.json);
  const data = cgUnwrap(r.json);
  return { ok: r.ok, status: r.status, data, denied };
}

// --------------------
// Bitget funding (fallback, NO KEY)
// Docs: Current Funding Rate + Historical Funding Rates  [oai_citation:1‡Bitget](https://www.bitget.com/api-doc/contract/market/Get-Current-Funding-Rate)
//
// We gebruiken:
// - https://api.bitget.com/api/v2/mix/market/current-fund-rate
// - https://api.bitget.com/api/v2/mix/market/history-fund-rate
//
// Belangrijk: productType is bij Bitget een string (in docs). We gebruiken "usdt-futures".
const BG_BASE = "https://api.bitget.com";
const BG_SYMBOL = "BTCUSDT";
const BG_PRODUCT = "usdt-futures"; // volgens Bitget docs

function bgUnwrap(j) {
  // Bitget responses zijn vaak: { code:"00000", msg:"success", data: ... }
  if (!j) return null;
  return j.data ?? j;
}

async function bgFetchCurrentFunding() {
  const url = `${BG_BASE}/api/v2/mix/market/current-fund-rate?symbol=${encodeURIComponent(BG_SYMBOL)}&productType=${encodeURIComponent(BG_PRODUCT)}`;
  const r = await fetchJson(url);
  if (!r.ok) return null;
  const data = bgUnwrap(r.json);
  if (!data) return null;

  // In docs is fundingRate een string/number veld in data.
  const rate = Number(data?.fundingRate ?? data?.fundingRateRate ?? data?.fundRate ?? data?.rate);
  return isNum(rate) ? rate : null;
}

async function bgFetchFundingHistory({ want = 360, pageSize = 100, maxPages = 10 } = {}) {
  // History endpoint ondersteunt paging (pageNo/pageSize) in docs.
  const out = [];
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const url =
      `${BG_BASE}/api/v2/mix/market/history-fund-rate` +
      `?symbol=${encodeURIComponent(BG_SYMBOL)}` +
      `&productType=${encodeURIComponent(BG_PRODUCT)}` +
      `&pageSize=${encodeURIComponent(pageSize)}` +
      `&pageNo=${encodeURIComponent(pageNo)}`;

    const r = await fetchJson(url);
    if (!r.ok) break;

    const data = bgUnwrap(r.json);
    const list = Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : null);
    if (!Array.isArray(list) || !list.length) break;

    for (const it of list) {
      const rate = Number(it?.fundingRate ?? it?.rate ?? it?.fundRate);
      if (isNum(rate)) out.push(rate);
    }

    if (out.length >= want) break;
    if (list.length < pageSize) break;
  }
  return out;
}

// --------------------
// Funding stats (percentile + extremes + flip + bias)
// --------------------
export async function fetchBtcFundingStats({ lookbackDays = 120 } = {}) {
  const want = Math.max(60, lookbackDays * 3); // 8h -> ~3 per day

  // 1) CoinGlass proberen (kan “Upgrade plan” geven)
  // We houden jouw style: funding history endpoint kán per account verschillen.
  // Jouw health laat zien dat deze route bestaat maar “Upgrade plan” teruggeeft.
  // Daarom: als denied -> fallback.
  let rates = [];
  let source = "none";

  if (CG_KEY) {
    const url = `${CG_BASE}/api/futures/funding-rate/history?exchange=Binance&symbol=BTCUSDT&interval=8h&limit=${Math.min(1000, want)}`;
    const cg = await cgFetch(url);
    if (cg.ok && Array.isArray(cg.data)) {
      rates = cg.data
        .map(x => Number(x?.fundingRate ?? x?.rate))
        .filter(isNum);
      if (rates.length) source = "coinglass";
    } else if (cg.denied) {
      source = "coinglass-denied";
    }
  }

  // 2) Fallback Bitget (geen key)
  if (rates.length < 30) {
    const hist = await bgFetchFundingHistory({ want });
    // Bitget history kan newest->oldest of andersom zijn; voor percentile maakt volgorde niet uit.
    rates = hist.filter(isNum);
    if (rates.length) source = "bitget";
  }

  // 3) Als we nog steeds niks hebben: geef nulls terug
  if (rates.length < 30) {
    const last = await bgFetchCurrentFunding(); // soms lukt current wel
    return {
      fundingRate: isNum(last) ? last : null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source
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

  // contrarian mini-bias (zoals jij had)
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
    source
  };
}

// --------------------
// Liquidation heatmap levels (CoinGlass only) + synthetic fallback
// --------------------
export async function fetchBtcLiqHeatmapLevels({ symbol = "BTCUSDT", topN = 10 } = {}) {
  if (!CG_KEY) return [];

  // jouw health liet zien dat heatmap endpoints 404’en op v4 voor jouw account.
  // Dus: proberen, maar als het faalt -> []
  const url = `${CG_BASE}/api/futures/liquidation/heatmap?symbol=${encodeURIComponent(symbol)}`;
  const cg = await cgFetch(url);
  if (!cg.ok || cg.denied) return [];

  const raw = cg.data;
  const levels = Array.isArray(raw?.levels) ? raw.levels : (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(levels)) return [];

  return levels
    .map(x => ({
      price: Number(x?.price),
      weight: Number(x?.weight ?? x?.score ?? x?.intensity)
    }))
    .filter(x => isNum(x.price) && isNum(x.weight))
    .map(x => ({ price: x.price, weight: clamp(x.weight, 0, 1) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);
}

export function buildSyntheticLiqLevels(candlesTruth, { lookback = 220, bins = 64, topN = 10 } = {}) {
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

  const mx = Math.max(...hist);
  const levels = hist.map((h, i) => ({
    price: lo + (i + 0.5) * step,
    weight: mx ? h / mx : 0
  }));

  return levels
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);
}

// --------------------
// Liq parsing helpers (zoals jij in forest.js gebruikt)
// --------------------
export function parseLiqLevelsFromQuery(q = "") {
  // formaat: "117500:1,90400:0.9"
  if (!q || typeof q !== "string") return [];
  const parts = q.split(",").map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const [a, b] = p.split(":").map(s => s.trim());
    const price = Number(a);
    const weight = (b == null || b === "") ? 1 : Number(b);
    if (isNum(price) && isNum(weight)) out.push({ price, weight: clamp(weight, 0, 1) });
  }
  return out;
}

export function parseLiqLevelsB64(b64 = "") {
  // base64(JSON) waar JSON = [{price,weight}, ...]
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