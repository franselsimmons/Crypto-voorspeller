import { cfg } from "../config.js";
import { jget, jset, rcmd } from "../storage/redis.js";
import { K, TTL } from "../storage/keys.js";
import { acquireLock, releaseLock } from "../security/locks.js";
import { mapLimit } from "../utils/pool.js";
import { analyzeSymbol } from "./scanEngine.js";
import { getTickMap } from "../market/contracts.js";
import { resetApiCallCount, getApiCallCount } from "../market/bitgetClient.js";

export function symbolsForShard(symbols, shards, shard) {
  return symbols.filter((_, i) => i % shards === shard);
}

export async function runShard(cycleId, shard) {
  const c = cfg();
  const lockName = `scan:${cycleId}:${shard}`;
  const token = await acquireLock(lockName, 120000);
  if (!token) return { status: "SKIPPED_LOCKED", cycleId, shard };

  const started = Date.now();
  resetApiCallCount();
  try {
    await rcmd("HSETNX", K.scanCycle(cycleId), "expectedShardCount", c.scanShards);
    await rcmd("HSETNX", K.scanCycle(cycleId), "startedAt", started);
    await rcmd("EXPIRE", K.scanCycle(cycleId), TTL.cycle);

    const universe = await jget(K.universe());
    if (!universe) return { status: "FAILED", error: "universe ontbreekt", cycleId, shard };

    const tickMap = await getTickMap();
    const mySymbols = symbolsForShard(universe.symbols.map((x) => x.s), c.scanShards, shard);
    const results = await mapLimit(mySymbols, c.scanConcurrency, (sym) =>
      analyzeSymbol(sym, cycleId, tickMap[sym] ?? 1e-8)
    );

    const candidates = [];
    let failed = 0;
    for (const r of results) {
      if (!r.ok) { failed++; continue; }
      if (r.value.candidates) candidates.push(...r.value.candidates);
    }

    await jset(K.scanShard(cycleId, shard), {
      shard, cycleId, processed: mySymbols.length, failed, candidates,
      apiCalls: getApiCallCount(), durationMs: Date.now() - started,
    }, TTL.shard);
    await rcmd("HINCRBY", K.scanCycle(cycleId), "completedShardCount", 1);

    return { status: failed ? "PARTIAL" : "SUCCESS", cycleId, shard, processed: mySymbols.length, failed, candidates: candidates.length, apiCalls: getApiCallCount(), durationMs: Date.now() - started };
  } finally {
    await releaseLock(lockName, token);
  }
}
