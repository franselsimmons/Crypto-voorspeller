// api/forest.js
import { getWeeklyBtcCandlesKraken, getDailyBtcCandlesKraken } from "./_lib/kraken.js";
import { buildForestOverlay } from "./_lib/forestEngine.js";
import {
  fetchBtcFundingBias,
  buildSyntheticLiqLevels,
  parseLiqLevelsFromQuery,
  parseLiqLevelsB64
} from "./_lib/derivs.js";

export const config = { runtime: "nodejs" };

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

    const funding = await fetchBtcFundingBias();

    const liqQ = String(req.query?.liq || "");
    const liqB64 = String(req.query?.liqB64 || "");

    let liqLevels = [];
    liqLevels = liqLevels.concat(parseLiqLevelsFromQuery(liqQ));
    liqLevels = liqLevels.concat(parseLiqLevelsB64(liqB64));

    if (!liqLevels.length) {
      liqLevels = buildSyntheticLiqLevels(candlesTruth, {
        lookback: intervalLabel === "1d" ? 220 : 180,
        bins: intervalLabel === "1d" ? 64 : 48,
        topN: 10
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
      liqLevels
    });

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      source: "kraken",
      interval: intervalLabel,
      truthCount: candlesTruth.length,
      hasLive,
      horizonBars,

      funding,
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
      flipProbability: out.flipProbability
    }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}