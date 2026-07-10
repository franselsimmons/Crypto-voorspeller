import { getContractsRaw } from "./bitgetClient.js";
import { jget, jset } from "../storage/redis.js";
import { K, TTL } from "../storage/keys.js";

/** tick = priceEndStep · 10^-pricePlace. Redis-cache 24h. */
export async function getTickMap() {
  const cached = await jget(K.contracts());
  if (cached) return cached;
  const raw = await getContractsRaw();
  const map = {};
  for (const c of raw) {
    const place = Number(c.pricePlace);
    const step = Number(c.priceEndStep);
    if (Number.isFinite(place) && Number.isFinite(step) && step > 0) {
      map[c.symbol] = step / 10 ** place;
    }
  }
  await jset(K.contracts(), map, TTL.contracts);
  return map;
}
