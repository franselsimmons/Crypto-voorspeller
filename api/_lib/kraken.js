/* EOF: /api/lib/kraken.js */
const axios = require("axios");
const logger = require("./logger");

const BASE_URL = "https://api.kraken.com/0/public";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_CANDLES_PER_REQUEST = 720;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function axiosWithRetry(config, retries = MAX_RETRIES) {
  try {
    return await axios(config);
  } catch (error) {
    const status = error?.response?.status;
    const retryable = !status || status >= 500;
    if (retries > 0 && retryable) {
      logger.warn(`Kraken API fout, retry... (${MAX_RETRIES - retries + 1})`);
      await sleep(RETRY_DELAY);
      return axiosWithRetry(config, retries - 1);
    }
    throw error;
  }
}

function pickResultKey(resultObj, preferredKey) {
  if (!resultObj || typeof resultObj !== "object") return null;
  if (preferredKey && Array.isArray(resultObj[preferredKey])) return preferredKey;

  // Kraken returned keys are often like "XXBTZUSD" even if you request "XBTUSD"
  const keys = Object.keys(resultObj).filter((k) => k !== "last");
  if (keys.length === 0) return null;

  // Prefer something that looks like BTC/USD if present
  const btcKey = keys.find((k) => k.includes("XBT") || k.includes("XXBT"));
  return btcKey || keys[0];
}

async function getTicker(pair = "XBTUSD") {
  const res = await axiosWithRetry({
    method: "get",
    url: `${BASE_URL}/Ticker`,
    params: { pair }
  });

  const result = res.data?.result;
  const key = pickResultKey(result, pair);
  if (!key) throw new Error("Kraken Ticker: geen result key gevonden");
  return result[key];
}

async function getOHLC(pair = "XBTUSD", interval = 1440, since = null) {
  const params = { pair, interval };
  if (since != null) params.since = since;

  const res = await axiosWithRetry({
    method: "get",
    url: `${BASE_URL}/OHLC`,
    params
  });

  const result = res.data?.result;
  const key = pickResultKey(result, pair);
  const rows = key ? result?.[key] : null;

  if (!Array.isArray(rows)) return [];

  return rows.map((c) => ({
    time: Number(c[0]),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[6])
  }));
}

/**
 * Betrouwbare range fetch met dedupe + stopconditie.
 */
async function getOHLCRange(pair = "XBTUSD", interval = 1440, from, to) {
  let all = [];
  let since = from;
  let attempts = 0;
  const maxAttempts = 80;
  let lastTimeSeen = 0;

  while (attempts < maxAttempts) {
    attempts++;
    logger.info(`OHLC fetch since=${new Date(since * 1000).toISOString()}`);

    const candles = await getOHLC(pair, interval, since);
    if (candles.length === 0) break;

    // Kraken stuurt vaak overlap; alleen strikt nieuw
    const fresh = candles.filter((c) => c.time > since);
    all = all.concat(fresh);

    const lastTime = candles[candles.length - 1].time;

    if (lastTime >= to) break;

    if (lastTime === lastTimeSeen) {
      logger.warn("Kraken paging: geen vooruitgang in tijd, stop.");
      break;
    }
    lastTimeSeen = lastTime;

    if (candles.length < MAX_CANDLES_PER_REQUEST) break;

    since = lastTime + 1;
    await sleep(900);
  }

  all = all.filter((c) => c.time >= from && c.time <= to);

  const unique = new Map();
  for (const c of all) unique.set(c.time, c);

  return Array.from(unique.values()).sort((a, b) => a.time - b.time);
}

module.exports = { getTicker, getOHLC, getOHLCRange };