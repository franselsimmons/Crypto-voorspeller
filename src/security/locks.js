import { rcmd } from "../storage/redis.js";
import { K } from "../storage/keys.js";
import { uuid } from "../utils/hash.js";

const RELEASE_LUA = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** SET NX PX met owner-token. Retourneert token of null. */
export async function acquireLock(name, ttlMs, retries = 0, retryDelayMs = 200) {
  const token = uuid();
  for (let i = 0; i <= retries; i++) {
    const ok = await rcmd("SET", K.lock(name), token, "NX", "PX", ttlMs);
    if (ok === "OK") return token;
    if (i < retries) await sleep(retryDelayMs);
  }
  return null;
}

export async function releaseLock(name, token) {
  try {
    await rcmd("EVAL", RELEASE_LUA, 1, K.lock(name), token);
  } catch {
    // lock verloopt via TTL; release-fout is niet fataal
  }
}
