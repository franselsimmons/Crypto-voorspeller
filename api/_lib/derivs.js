// api/_lib/derivs.js
// Derivs layer:
// - Funding: Bitget public (always works)
// - Open Interest NOW: Bitget public
// - OI change 1d/7d: stored in Vercel KV (optional; if no KV configured => null)
// - ETF flows: CoinGlass (paid sometimes) -> graceful null
// - Liq heatmap: CoinGlass (often paid) -> graceful null; fallback synthetic in forest.js

function isNum(x) { return typeof x === "number" && Number.isFinite(x); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

const COINGLASS_BASE = "https://open-api-v4.coinglass.com";
const COINGLASS_KEY = process.env.COINGLASS_KEY || "";

// -------------------------
// Safe optional KV import
// -------------------------
async function getKv() {
  try {
    const mod = await import("@vercel/kv");
    return mod?.kv || null;
  } catch {
    return null;
  }
}

// -------------------------
// Bitget public endpoints
// Docs:
// - Funding history: /api/v2/mix/market/history-fund-rate
// - Open interest:  /api/v2/mix/market/open-interest
// -------------------------
const BITGET_BASE = "https://api.bitget.com";

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${t.slice(0, 180)}`);
  return j;
}

async function fetchBitgetFundingHistory({
  symbol = "BTCUSDT",
  productType = "usdt-futures",
  limit = 240 // 240 * 8h = 80 days (approx)
} = {}) {
  const pageSize = 100;
  let pageNo = 1;
  let out = [];

  while (out.length < limit) {
    const url = `${BITGET_BASE}/api/v2/mix/market/history-fund-rate?symbol=${encodeURIComponent(symbol)}&productType=${encodeURIComponent(productType)}&pageSize=${pageSize}&pageNo=${pageNo}`;
    const j = await fetchJson(url);
    if (j?.code !== "00000" || !Array.isArray(j?.data)) break;

    const rows = j.data
      .map(x => ({
        fundingRate: Number(x?.fundingRate),
        fundingTime: Number(x?.fundingTime)
      }))
      .filter(x => isNum(x.fundingRate) && isNum(x.fundingTime));

    if (!rows.length) break;

    out = out.concat(rows);

    if (rows.length < pageSize) break;
    pageNo += 1;
    if (pageNo > 20) break; // safety
  }

  // Bitget returns newest-first; normalize oldest->newest
  out.sort((a, b) => a.fundingTime - b.fundingTime);
  return out.slice(-limit);
}

async function fetchBitgetOpenInterestNow({
  symbol = "BTCUSDT",
  productType = "usdt-futures"
} = {}) {
  const url = `${BITGET_BASE}/api/v2/mix/market/open-interest?symbol=${encodeURIComponent(symbol)}&productType=${encodeURIComponent(productType)}`;
  const j = await fetchJson(url);
  if (j?.code !== "00000") return { oiNow: null, ts: null };

  const list = j?.data?.openInterestList;
  const ts = Number(j?.data?.ts);
  if (!Array.isArray(list) || !list.length) return { oiNow: null, ts: isNum(ts) ? ts : null };

  // size is a string
  const size = Number(list[0]?.size);
  return { oiNow: isNum(size) ? size : null, ts: isNum(ts) ? ts : null };
}

// -------------------------
// CoinGlass helpers (optional)
// -------------------------
async function fetchCoinGlass(url) {
  if (!COINGLASS_KEY) return { ok: false, denied: false, data: null };

  const r = await fetch(url, {
    headers: {
      // CoinGlass uses this header name in many accounts
      "coinglassSecret": COINGLASS_KEY
    }
  });

  const status = r.status;
  let j = null;
  try { j = await r.json(); } catch {}

  // Typical format: { code, msg, data }
  const cgCode = String(j?.code ?? "");
  const cgMsg = String(j?.msg ?? "");

  const denied = (cgCode === "400" && /upgrade plan/i.test(cgMsg));
  const ok = r.ok && (cgCode === "0" || cgCode === "00000" || cgCode === "");

  return {
    ok,
    denied,
    status,
    cgCode,
    cgMsg,
    data: j?.data ?? null
  };
}

// --------------------
// Funding stats (Bitget)
// --------------------
export async function fetchBtcFundingStats({
  lookbackDays = 120,
  symbol = "BTCUSDT",
  productType = "usdt-futures"
} = {}) {
  const need = clamp(lookbackDays * 3, 60, 360); // 8h snapshots
  const rows = await fetchBitgetFundingHistory({ symbol, productType, limit: need });

  const rates = rows.map(x => x.fundingRate).filter(isNum);
  if (rates.length < 30) {
    return {
      fundingRate: null,
      fundingPercentile: null,
      fundingExtreme: null,
      fundingFlip: false,
      fundingBias: 0,
      source: "bitget"
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

  // contrarian drift (crowding)
  let bias = 0;
  if (extreme === "EXTREME_POS") bias = -0.0022;
  else if (extreme === "HIGH_POS") bias = -0.0012;
  else if (extreme === "EXTREME_NEG") bias = +0.0022;
  else if (extreme === "HIGH_NEG") bias = +0.0012;

  return {
    fundingRate: last,
    fundingPercentile: rank,
    fundingExtreme: extreme,
    fundingFlip: !!flip,
    fundingBias: bias,
    source: "bitget"
  };
}

// --------------------
// Open Interest change (1d/7d) via KV snapshots
// --------------------
export async function fetchBtcOpenInterestChange({
  symbol = "BTCUSDT",
  productType = "usdt-futures"
} = {}) {
  // 1) get oiNow from Bitget
  const now = await fetchBitgetOpenInterestNow({ symbol, productType });
  const oiNow = now?.oiNow ?? null;

  // 2) if no KV available, return just oiNow (no change calc)
  const kv = await getKv();
  if (!kv || !isNum(oiNow)) {
    return { oiNow: isNum(oiNow) ? oiNow : null, oiChange1: null, oiChange7: null, source: "bitget-no-kv" };
  }

  // 3) store one snapshot per day (UTC date key)
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `derivs:oi:${symbol}:${day}`;

  // set if not exists
  const exists = await kv.get(key);
  if (exists == null) {
    await kv.set(key, { day, oi: oiNow, ts: now?.ts ?? Date.now() });
    // keep ~40 days
    await kv.expire(key, 60 * 60 * 24 * 40);
  }

  // 4) read D-1 and D-7
  function dayShift(daysAgo) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  const d1 = await kv.get(`derivs:oi:${symbol}:${dayShift(1)}`);
  const d7 = await kv.get(`derivs:oi:${symbol}:${dayShift(7)}`);

  const oi1 = Number(d1?.oi);
  const oi7 = Number(d7?.oi);

  const oiChange1 = (isNum(oi1) && oi1 !== 0) ? ((oiNow - oi1) / oi1) : null;
  const oiChange7 = (isNum(oi7) && oi7 !== 0) ? ((oiNow - oi7) / oi7) : null;

  return {
    oiNow,
    oiChange1: isNum(oiChange1) ? oiChange1 : null,
    oiChange7: isNum(oiChange7) ? oiChange7 : null,
    source: "bitget+kv"
  };
}

// --------------------
// ETF flows (CoinGlass paid often) -> graceful null
// --------------------
export async function fetchBtcEtfFlows({ lookbackDays = 120 } = {}) {
  // This endpoint is often plan-gated; we keep it but tolerate denial.
  const url = `${COINGLASS_BASE}/api/etf/bitcoin/flow-history?limit=${Math.max(20, lookbackDays)}`;
  const cg = await fetchCoinGlass(url);

  if (!cg.ok) {
    return {
      etfNetFlow: null,
      etfFlow7: null,
      etfPercentile: null,
      etfFlip: false,
      etfBias: 0,
      source: cg.denied ? "coinglass-denied" : "coinglass-unavailable"
    };
  }

  const raw = cg.data;
  if (!Array.isArray(raw) || raw.length < 20) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0, source: "coinglass-empty" };
  }

  const flows = raw.map(x => Number(x?.netFlow ?? x?.flow)).filter(isNum);
  if (flows.length < 20) {
    return { etfNetFlow: null, etfFlow7: null, etfPercentile: null, etfFlip: false, etfBias: 0, source: "coinglass-bad-data" };
  }

  const last = flows[flows.length - 1];
  const prev = flows[flows.length - 2];
  const flow7 = flows.slice(-7).reduce((a, b) => a + b, 0);

  const sorted = flows.slice().sort((a, b) => a - b);
  let cnt = 0;
  for (const v of sorted) if (v <= last) cnt++;
  const rank = cnt / sorted.length;

  const flip = (Math.sign(last) !== Math.sign(prev)) && (Math.abs(last) > 0);
  const bias = clamp(last / 1_000_000_000, -0.0015, 0.0015);

  return {
    etfNetFlow: last,
    etfFlow7: flow7,
    etfPercentile: rank,
    etfFlip: !!flip,
    etfBias: bias,
    source: "coinglass"
  };
}

// --------------------
// Liq heatmap (CoinGlass often gated) -> return [] if denied
// --------------------
export async function fetchBtcLiqHeatmapLevels({ symbol = "BTCUSDT", topN = 10 } = {}) {
  const url = `${COINGLASS_BASE}/api/futures/liquidation/heatmap?symbol=${encodeURIComponent(symbol)}`;
  const cg = await fetchCoinGlass(url);
  if (!cg.ok) return [];

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

// --------------------
// Synthetic liq fallback
// --------------------
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

  const max = Math.max(...hist);
  const levels = hist.map((h, i) => ({
    price: lo + (i + 0.5) * step,
    weight: max ? h / max : 0
  }));

  return levels
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);
}

// --------------------
// Liq query parsers
// --------------------
export function parseLiqLevelsFromQuery(q) {
  // format: "90000:0.8,91000:0.6"
  const s = String(q || "").trim();
  if (!s) return [];
  const out = [];

  for (const part of s.split(",")) {
    const [p, w] = part.split(":");
    const price = Number(p);
    const weight = Number(w);
    if (!isNum(price) || !isNum(weight)) continue;
    out.push({ price, weight: clamp(weight, 0, 1) });
  }
  return out;
}

export function parseLiqLevelsB64(b64) {
  // base64 of JSON array: [{price, weight}, ...]
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