// api/forest.js
import { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";
import {
  fetchBtcFundingStats,
  fetchBtcOpenInterestChange,
  fetchBtcEtfFlows,
  fetchBtcLiqHeatmapLevels,
  buildSyntheticLiqLevels,
  parseLiqLevelsFromQuery,
  parseLiqLevelsB64
} from "./_lib/derivs.js";

export const config = { runtime: "nodejs" };

function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

async function safe(promiseFactory, fallback) {
  try {
    const v = await promiseFactory();
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeFunding(raw) {
  // forestEngine verwacht deze keys
  return {
    fundingRate: isNum(raw?.fundingRate) ? raw.fundingRate : null,
    fundingPercentile: isNum(raw?.fundingPercentile) ? raw.fundingPercentile : null,
    fundingExtreme: raw?.fundingExtreme ?? null,
    fundingFlip: !!raw?.fundingFlip,
    fundingBias: isNum(raw?.fundingBias) ? raw.fundingBias : 0,
    source: raw?.source ?? raw?.exchange ?? null
  };
}

function normalizeOI(raw) {
  // forestEngine verwacht oiNow, oiChange1, oiChange7
  return {
    oiNow: isNum(raw?.oiNow) ? raw.oiNow : null,
    oiChange1: isNum(raw?.oiChange1) ? raw.oiChange1 : null,
    oiChange7: isNum(raw?.oiChange7) ? raw.oiChange7 : null,
    source: raw?.source ?? raw?.exchange ?? null
  };
}

function normalizeETF(raw) {
  // forestEngine verwacht etfNetFlow, etfFlow7, etfPercentile, etfFlip, etfBias
  return {
    etfNetFlow: isNum(raw?.etfNetFlow) ? raw.etfNetFlow : null,
    etfFlow7: isNum(raw?.etfFlow7) ? raw.etfFlow7 : null,
    etfPercentile: isNum(raw?.etfPercentile) ? raw.etfPercentile : null,
    etfFlip: !!raw?.etfFlip,
    etfBias: isNum(raw?.etfBias) ? raw.etfBias : 0,
    source: raw?.source ?? null
  };
}

export default async function handler(req, res) {
  try {
    const tf = String(req.query?.tf || "1d").toLowerCase();
    const includeLive = String(req.query?.includeLive || "0") === "1";

    const hRaw = Number(req.query?.h || 90);
    const horizonBars = Number.isFinite(hRaw) ? Math.max(1, Math.min(hRaw, 180)) : 90;

    let candlesTruth, candlesWithLive, hasLive, intervalLabel;
    let weeklyTruthCandles = null;

    if (tf === "1w") {
      ({ candlesTruth, candlesWithLive, hasLive } = await getWeeklyBtcCandlesKraken());
      intervalLabel = "1w";
    } else {
      ({ candlesTruth, candlesWithLive, hasLive } = await getDailyBtcCandlesKraken());
      intervalLabel = "1d";
      const w = await getWeeklyBtcCandlesKraken();
      weeklyTruthCandles = w?.candlesTruth ?? null;
    }

    const candles = includeLive ? candlesWithLive : candlesTruth;

    // ---- Derivs (NOOIT laten throwen) ----
    const fundingFallback = normalizeFunding({ source: "coinglass-denied" });
    const oiFallback = normalizeOI({ source: "coinglass-denied" });
    const etfFallback = normalizeETF({ source: "coinglass-denied" });

    const [fundingRaw, oiRaw, etfRaw] = await Promise.all([
      safe(
        () => fetchBtcFundingStats({ lookbackDays: 120, symbol: "BTCUSDT", productType: "usdt-futures" }),
        fundingFallback
      ),
      safe(
        () => fetchBtcOpenInterestChange({ symbol: "BTCUSDT", productType: "usdt-futures" }),
        oiFallback
      ),
      safe(
        () => fetchBtcEtfFlows({ lookbackDays: 120 }),
        etfFallback
      )
    ]);

    const funding = normalizeFunding(fundingRaw);
    const oi = normalizeOI(oiRaw);
    const etf = normalizeETF(etfRaw);

    // ---- Liq levels (query overrides) ----
    const liqQ = String(req.query?.liq || "");
    const liqB64 = String(req.query?.liqB64 || "");

    let liqLevels = [];
    liqLevels = liqLevels.concat(parseLiqLevelsFromQuery(liqQ));
    liqLevels = liqLevels.concat(parseLiqLevelsB64(liqB64));

    if (!liqLevels.length) {
      const real = await safe(
        () => fetchBtcLiqHeatmapLevels({ symbol: "BTCUSDT", topN: 12 }),
        []
      );
      if (Array.isArray(real) && real.length) liqLevels = real;
    }

    if (!liqLevels.length) {
      liqLevels = buildSyntheticLiqLevels(candlesTruth, {
        lookback: intervalLabel === "1d" ? 220 : 180,
        bins: intervalLabel === "1d" ? 64 : 48,
        topN: 12
      });
    }

    const out = buildForestOverlay({
      candlesTruth,
      candlesWithLive,
      hasLive,
      tf: intervalLabel,
      horizonBars,
      weeklyTruthCandles,
      funding,
      liqLevels,
      oi,
      etf
    });

    res.setHeader("content-type", "application/json; charset=utf-8");
    // (optioneel) beetje caching voor UI, maar niet te agressief
    res.setHeader("cache-control", "s-maxage=20, stale-while-revalidate=60");

    res.status(200).send(
      JSON.stringify({
        source: "kraken",
        interval: intervalLabel,
        truthCount: candlesTruth.length,
        hasLive,
        horizonBars,

        funding,
        oi,
        etf,
        liqLevels,

        candles: candles.map(c => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? null
        })),

        forestOverlayTruth: out.forestOverlayTruth,
        forestOverlayLive: out.forestOverlayLive,

        forestOverlayForwardMid: out.forestOverlayForwardMid,
        forestOverlayForwardUpper: out.forestOverlayForwardUpper,
        forestOverlayForwardLower: out.forestOverlayForwardLower,

        forestZTruth: out.forestZTruth,
        forestZLive: out.forestZLive,
        nowPoint: out.nowPoint,

        bandsNow: out.bandsNow,
        freezeNow: out.freezeNow,
        regimeLabel: out.regimeLabel,

        confidence: out.confidence,
        stabilityScore: out.stabilityScore,
        flipProbability: out.flipProbability,
        squeezeProb: out.squeezeProb
      })
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}