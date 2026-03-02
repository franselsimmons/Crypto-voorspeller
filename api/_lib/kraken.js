/* EOF: /api/_lib/kraken.js */
const axios = require("axios");
const logger = require("./logger");

const BASE_URL = "https://api.kraken.com/0/public";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function pickResultKey(resultObj, requestedPair) {
  if (!resultObj || typeof resultObj !== "object") return null;
  if (resultObj[requestedPair]) return requestedPair;
  const keys = Object.keys(resultObj).filter((k) => k !== "last");
  return keys.length ? keys[0] : null;
}

async function getTicker(pair = "XBTUSD") {
  const res = await axiosWithRetry({
    method: "get",
    url: `${BASE_URL}/Ticker`,
    params: { pair }
  });

  const result = res.data?.result;
  const key = pickResultKey(result, pair);
  if (!key) return null;
  return result[key];
}

/**
 * Kraken OHLC geeft ook `last` terug: de juiste cursor voor paging.
 * We retourneren { candles, last }.
 */
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
  const raw = key ? result[key] : null;
  const last = result?.last != null ? Number(result.last) : null;

  if (!Array.isArray(raw)) return { candles: [], last };

  const candles = raw.map((c) => ({
    time: Number(c[0]),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[6])
  }));

  return { candles, last };
}

/**
 * Betrouwbare range fetch met:
 * - paging via `last` cursor
 * - dedupe op time
 * - harde stopcondities
 */
async function getOHLCRange(pair = "XBTUSD", interval = 1440, from, to) {
  const unique = new Map();

  let cursor = from;
  let attempts = 0;
  const maxAttempts = 120;

  while (attempts < maxAttempts) {
    attempts++;
    logger.info(`OHLC fetch since=${new Date(cursor * 1000).toISOString()}`);

    const { candles, last } = await getOHLC(pair, interval, cursor);
    if (!candles.length) break;

    for (const c of candles) {
      if (c.time >= from && c.time <= to) unique.set(c.time, c);
    }

    const lastCandleTime = candles[candles.length - 1].time;

    // Stop als we voorbij 'to' zijn
    if (lastCandleTime >= to) break;

    // Stop als Kraken geen cursor geeft (zeldzaam)
    if (!last || !Number.isFinite(last)) {
      logger.warn("Kraken paging: geen 'last' cursor, stop.");
      break;
    }

    // Stop als cursor niet vooruit gaat
    if (last <= cursor) {
      logger.warn("Kraken paging: 'last' gaat niet vooruit, stop.");
      break;
    }

    cursor = last;
    await sleep(900);
  }

  return Array.from(unique.values()).sort((a, b) => a.time - b.time);
}

module.exports = { getTicker, getOHLC, getOHLCRange };