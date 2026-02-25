// api/derivs-health.js
export const config = { runtime: "nodejs" };

const BASE = "https://open-api-v4.coinglass.com";

async function hit(path, params = {}) {
  const key = process.env.COINGLASS_KEY || "";
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  // als key ontbreekt: meteen terug
  if (!key) return { url: url.toString(), ok: false, status: 0, note: "NO_KEY" };

  const r = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      // we proberen beide headers, zodat we niet gokken
      "CG-API-KEY": key,
      "coinglassSecret": key
    }
  });

  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  // CoinGlass is vaak { code, msg, data }
  const data = json?.data ?? json?.result ?? null;

  return {
    url: url.toString(),
    ok: r.ok,
    status: r.status,
    // klein stukje teruggeven (geen grote payload)
    cgCode: json?.code ?? null,
    cgMsg: json?.msg ?? json?.message ?? null,
    dataType: Array.isArray(data) ? "array" : (data && typeof data === "object" ? "object" : null),
    dataLen: Array.isArray(data) ? data.length : null,
    keys: (data && typeof data === "object" && !Array.isArray(data)) ? Object.keys(data).slice(0, 12) : null,
    sample: Array.isArray(data) ? data.slice(0, 1) : (data && typeof data === "object" ? data : null)
  };
}

export default async function handler(req, res) {
  try {
    // typische combinaties
    const exchange = String(req.query?.exchange || "Binance");
    const symbol = String(req.query?.symbol || "BTCUSDT");
    const interval = String(req.query?.interval || "8h");

    const tests = [
      // Funding candidates (verschillende naming varianten)
      () => hit("/api/futures/funding-rate/history", { exchange, symbol, interval, limit: 200 }),
      () => hit("/api/futures/fundingRate/history", { exchange, symbol, interval: "8h", limit: 200 }),
      () => hit("/api/futures/fundingRate/history", { symbol: "BTC", interval: "8h", limit: 200 }),

      // OI candidates
      () => hit("/api/futures/open-interest/history", { exchange, symbol, interval: "1d", limit: 120 }),
      () => hit("/api/futures/openInterest/history", { exchange, symbol, interval: "1d", limit: 120 }),

      // ETF candidates
      () => hit("/api/bitcoin/etf/flow-history", { interval: "1d", limit: 180 }),
      () => hit("/api/etf/bitcoin/flow-history", { limit: 180 }),

      // Liquidation heatmap candidates
      () => hit("/api/futures/liquidation/heatmap", { exchange, symbol }),
      () => hit("/api/futures/liquidation/heatmap", { symbol })
    ];

    const out = [];
    for (const fn of tests) out.push(await fn());

    res.status(200).json({
      hasKey: !!(process.env.COINGLASS_KEY || ""),
      keyLength: (process.env.COINGLASS_KEY || "").length,
      exchange,
      symbol,
      interval,
      results: out
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}