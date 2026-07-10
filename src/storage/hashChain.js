import { rcmd, rpipe } from "./redis.js";
import { K, TTL } from "./keys.js";
import { sha256Hex, stableStringify } from "../utils/hash.js";
import { acquireLock, releaseLock } from "../security/locks.js";
import { utcDate } from "../utils/time.js";

/**
 * Append-only, tamper-evident keten. Serialisatie via kort lock:
 * finalize en monitor kunnen overlappen en mogen de keten niet vervlechten.
 */
export async function appendChain(entries) {
  if (!entries.length) return [];
  const lock = await acquireLock("hashchain", 10000, 12, 250);
  if (!lock) throw new Error("hashchain lock niet verkregen");
  try {
    let prev = (await rcmd("GET", K.hashHead())) || "GENESIS";
    const out = [];
    const cmds = [];
    for (const entry of entries) {
      const recordHash = sha256Hex(prev + stableStringify(entry));
      const day = utcDate(entry.ts || Date.now());
      cmds.push(["RPUSH", K.hashDay(day), recordHash]);
      cmds.push(["EXPIRE", K.hashDay(day), TTL.hashDay]);
      out.push({ previousRecordHash: prev, recordHash });
      prev = recordHash;
    }
    cmds.push(["SET", K.hashHead(), prev]);
    await rpipe(cmds);
    return out;
  } finally {
    await releaseLock("hashchain", lock);
  }
}

export async function dailyManifest(dateStr) {
  const hashes = (await rcmd("LRANGE", K.hashDay(dateStr), 0, -1)) || [];
  if (!hashes.length) return { date: dateStr, recordCount: 0, firstRecordHash: null, lastRecordHash: null, dailyRootHash: null };
  return {
    date: dateStr,
    recordCount: hashes.length,
    firstRecordHash: hashes[0],
    lastRecordHash: hashes[hashes.length - 1],
    dailyRootHash: sha256Hex(hashes.join("")),
  };
}
