// api/_lib/derivs.js
import { clamp } from "./indicators.js";

const COINGLASS_KEY = process.env.COINGLASS_KEY || "";

async function safeJson(r) {
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt }; }
}

async function coinglassFetch(url) {
  if (!COINGLASS_KEY) return null;

  const r = await fetch(url, {
    headers: {
      accept: "application/json",
      "coinglassSecret": COINGLASS_KEY
    }
  });

  if (!r.ok) {
    // 401/403/429/etc -> netjes terugvallen
    return null;
  }

  const j = await safeJson(r);
  return j;
}

// -------- FUNDING --------
// We proberen “iets bruikbaars” te halen.
// Als CoinGlass structuur anders is: we falen zacht en pakken fallback.
export async function fetchBtcFundingBias() {
  // CoinGlass heeft verschillende endpoints per versie.
  // Deze URL is bewust “best-effort”.
  const url = "https://open-api.coinglass.com/public/v2/funding_rate?symbol=BTC";
  const j = await coinglassFetch(url);

  if (!j) return { fundingRate: null, fundingBias: 0, fundingFlip: false, source: "fallback" };

  // probeer funding rate uit mogelijke velden te halen
  const data = j?.data || j?.result || j;
  let rate = null;

  if (Array.isArray(data)) {
    // pak gemiddelde als array met exchanges
    const vals = data.map(x => Number(x?.fundingRate ?? x?.funding_rate)).filter(Number.isFinite);
    if (vals.length) rate = vals.reduce((a, b) => a + b, 0) / vals.length;
  } else if (data && typeof data === "object") {
    const v = Number(data?.fundingRate ?? data?.funding_rate ?? data?.rate);
    if (Number.isFinite(v)) rate = v;
  }

  // simpele bias: extreem positief = contrarian bearish, extreem negatief = contrarian bullish
  // (bias is klein, het is een “duwtje”, geen stuur)
  let fundingBias = 0;
  let fundingFlip = false;

  if (Number.isFinite(rate)) {
    const abs = Math.abs(rate);

    if (rate > 0.0012) { fundingBias = -0.0012; fundingFlip = true; }
    else if (rate < -0.0012) { fundingBias = +0.0012; fundingFlip = true; }
    else if (abs > 0.0007) { fundingBias = -Math.sign(rate) * 0.0006; fundingFlip = true; }
  }

  return { fundingRate: Number.isFinite(rate) ? rate : null, fundingBias, fundingFlip, source: "coinglass" };
}

// -------- LIQ HEATMAP (levels) --------
export async function fetchBtcLiqHeatmapLevels() {
  // Best-effort endpoint; als dit faalt -> fallback.
  const url = "https://open-api.coinglass.com/public/v2/liquidation_heatmap?symbol=BTC&interval=1d";
  const j = await coinglassFetch(url);
  if (!j) return null;

  const data = j?.data || j?.result || j;
  // we verwachten iets als levels: [{price, size/weight}, ...]
  // we normaliseren naar {price, weight}
  const levels = [];

  if (Array.isArray(data)) {
    for (const x of data) {
      const price = Number(x?.price);
      const w = Number(x?.weight ?? x?.size ?? x?.liq ?? x?.value);
      if (!Number.isFinite(price) || !Number.isFinite(w)) continue;
      levels.push({ price, weight: w });
    }
  } else if (data && typeof data === "object") {
    const arr = data?.levels || data?.data || data?.list;
    if (Array.isArray(arr)) {
      for (const x of arr) {
        const price = Number(x?.price);
        const w = Number(x?.weight ?? x?.size ?? x?.liq ?? x?.value);
        if (!Number.isFinite(price) || !Number.isFinite(w)) continue;
        levels.push({ price, weight: w });
      }
    }
  }

  if (!levels.length) return null;

  // normaliseer weights naar 0..1
  const maxW = Math.max(...levels.map(x => x.weight));
  const norm = levels.map(x => ({ price: x.price, weight: clamp(x.weight / Math.max(1e-9, maxW), 0, 1) }));

  // pak top 12
  norm.sort((a, b) => b.weight - a.weight);
  return norm.slice(0, 12);
}

// -------- FALLBACK: synthetic liq levels --------
export function buildSyntheticLiqLevels(candlesTruth, { lookback = 220, bins = 64, topN = 10 } = {}) {
  if (!Array.isArray(candlesTruth) || candlesTruth.length < 50) return [];

  const slice = candlesTruth.slice(Math.max(0, candlesTruth.length - lookback));
  const closes = slice.map(c => c.close).filter(Number.isFinite);
  if (closes.length < 10) return [];

  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const range = Math.max(1e-9, hi - lo);

  const hist = Array(bins).fill(0);
  for (const c of slice) {
    const v = Number(c?.volume ?? 0);
    const p = Number(c?.close);
    if (!Number.isFinite(p)) continue;
    const idx = clamp(Math.floor(((p - lo) / range) * (bins - 1)), 0, bins - 1);
    hist[idx] += Number.isFinite(v) ? v : 1;
  }

  const maxH = Math.max(...hist, 1e-9);
  const levels = hist.map((h, i) => ({
    price: lo + (i / (bins - 1)) * range,
    weight: clamp(h / maxH, 0, 1)
  }));

  levels.sort((a, b) => b.weight - a.weight);
  return levels.slice(0, topN);
}

// -------- query parsing --------
// liq="price:weight,price:weight"
export function parseLiqLevelsFromQuery(liqQ) {
  const out = [];
  if (!liqQ || typeof liqQ !== "string") return out;

  const parts = liqQ.split(",");
  for (const part of parts) {
    const [pRaw, wRaw] = part.split(":");
    const price = Number(pRaw);
    const weight = Number(wRaw);
    if (!Number.isFinite(price) || !Number.isFinite(weight)) continue;
    out.push({ price, weight: clamp(weight, 0, 1) });
  }
  return out;
}

// liqB64 = base64(json array)
export function parseLiqLevelsB64(b64) {
  const out = [];
  if (!b64 || typeof b64 !== "string") return out;

  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return out;
    for (const x of arr) {
      const price = Number(x?.price);
      const weight = Number(x?.weight);
      if (!Number.isFinite(price) || !Number.isFinite(weight)) continue;
      out.push({ price, weight: clamp(weight, 0, 1) });
    }
  } catch {
    return out;
  }
  return out;
}