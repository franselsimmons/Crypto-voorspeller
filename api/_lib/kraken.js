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

// Kraken returned vaak keys zoals XXBTZUSD ipv XBTUSD
function pickResultKey(resultObj) {
  if (!resultObj || typeof resultObj !== "object") return null;
  const keys = Object.keys(resultObj).filter((k) => k !== "last");
  if (keys.length === 0) return null;
  // meestal is er maar 1 key (de echte pair)
  return keys[0];
}

async function getTicker(pair = "XBTUSD") {
  const res = await axiosWithRetry({
    method: "get",
    url: `${BASE_URL}/Ticker`,
    params: { pair }
  });

  const resultObj = res.data?.result;
  if (!resultObj || typeof resultObj !== "object") return null;

  // 1) probeer exact (soms werkt dit wél)
  if (resultObj[pair]) return resultObj[pair];

  // 2) pak de echte key die Kraken terugstuurt
  const key = pickResultKey(resultObj);
  if (key && resultObj[key]) return resultObj[key];

  return null;
}

async function getOHLC(pair = "XBTUSD", interval = 1440, since = null) {
  const params = { pair, interval };
  if (since) params.since = since;

  const res = await axiosWithRetry({
    method: "get",
    url: `${BASE_URL}/OHLC`,
    params
  });

  const resultObj = res.data?.result;
  if (!resultObj || typeof resultObj !== "object") return [];

  // 1) probeer exact
  let rows = resultObj[pair];

  // 2) anders: pak echte key (bv XXBTZUSD)
  if (!Array.isArray(rows)) {
    const key = pickResultKey(resultObj);
    rows = key ? resultObj[key] : null;
  }

  if (!Array.isArray(rows)) return [];

  return rows.map((c) => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[6])
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

    // stop als we voorbij 'to' zijn
    if (lastTime >= to) break;

    // stop als Kraken niet vooruit gaat
    if (lastTime === lastTimeSeen) {
      logger.warn("Kraken paging: geen vooruitgang in tijd, stop.");
      break;
    }

    lastTimeSeen = lastTime;

    // stop als minder dan max returned (meestal einde)
    if (candles.length < MAX_CANDLES_PER_REQUEST) break;

    since = lastTime + 1;
    await sleep(900);
  }

  // filter range
  all = all.filter((c) => c.time >= from && c.time <= to);

  // dedupe
  const unique = new Map();
  for (const c of all) unique.set(c.time, c);

  return Array.from(unique.values()).sort((a, b) => a.time - b.time);
}

module.exports = { getTicker, getOHLC, getOHLCRange };