import { cfg } from "../config.js";
import { jget, rcmd, rpipe } from "../storage/redis.js";
import { K, TTL } from "../storage/keys.js";
import { getCandles, closedOnly } from "../market/bitgetClient.js";
import { resolveOnCandles, categoryOf } from "./outcomeEngine.js";
import { recordClose, recomputeAllFamilies } from "../verification/familyEngine.js";
import { appendChain } from "../storage/hashChain.js";
import { acquireLock, releaseLock } from "../security/locks.js";
import { mapLimit } from "../utils/pool.js";
import { log } from "../observability/log.js";

export async function openPosition(signal) {
  const c = cfg();
  const pos = {
    signalId: signal.signalId, symbol: signal.symbol, direction: signal.direction,
    familyId: signal.familyId, entry: signal.entry, stopLoss: signal.stopLoss,
    tp1: signal.tp1, tp2: signal.tp2, candleTime: signal.candleTime, tfMs: c.tfMs,
    tp1Hit: false, tp1HitAt: null, highestPrice: null, lowestPrice: null,
    nextCheckTs: signal.candleTime + c.tfMs, openedAt: Date.now(),
  };
  await rcmd("SET", K.position(signal.signalId), JSON.stringify(pos), "EX", TTL.position);
  return pos;
}

export async function runMonitor() {
  const c = cfg();
  const token = await acquireLock("monitor", 90000);
  if (!token) return { status: "SKIPPED_LOCKED" };
  const started = Date.now();
  try {
    const ids = (await rcmd("SMEMBERS", K.open())) || [];
    if (!ids.length) return { status: "SUCCESS", open: 0, closed: 0, durationMs: Date.now() - started };

    const posRaw = await rpipe(ids.map((id) => ["GET", K.position(id)]));
    const positions = posRaw.map((r) => (r ? JSON.parse(r) : null)).filter(Boolean);
    const bySymbol = new Map();
    for (const p of positions) {
      if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, []);
      bySymbol.get(p.symbol).push(p);
    }

    let closedCount = 0;
    const closedFamilies = new Set();

    await mapLimit([...bySymbol.entries()], c.scanConcurrency, async ([symbol, group]) => {
      const oldest = Math.min(...group.map((p) => p.nextCheckTs));
      const need = Math.min(200, Math.ceil((Date.now() - oldest) / c.tfMs) + 3);
      const candles = closedOnly(await getCandles(symbol, "15m", Math.max(need, 3)), c.tfMs);

      for (const pos of group) {
        const res = resolveOnCandles(pos, candles, c.costR, c.timeoutMinutes * 60000);
        if (!res.closed) {
          Object.assign(pos, { tp1Hit: res.tp1Hit, tp1HitAt: res.tp1HitAt, highestPrice: res.highestPrice, lowestPrice: res.lowestPrice, nextCheckTs: res.nextCheckTs });
          await rcmd("SET", K.position(pos.signalId), JSON.stringify(pos), "EX", TTL.position);
          continue;
        }

        const sig = await jget(K.signal(pos.signalId));
        if (!sig) continue;
        const outcome = {
          exitReason: res.exitReason, grossR: res.grossR, costR: res.costR, netR: res.netR,
          ambiguousBar: res.ambiguousBar, tp1Hit: res.tp1Hit, tp1HitAt: res.tp1HitAt,
          highestPrice: res.highestPrice, lowestPrice: res.lowestPrice,
          closedAt: res.closedAt, durationMinutes: res.durationMinutes,
          category: categoryOf(res.exitReason),
        };
        const [chain] = await appendChain([{ type: "CLOSE", ts: res.closedAt, signalId: pos.signalId, exitReason: res.exitReason, grossR: res.grossR, netR: res.netR, ambiguousBar: res.ambiguousBar }]);
        const updated = { ...sig, status: "CLOSED", outcome, closeRecordHash: chain.recordHash, closePreviousRecordHash: chain.previousRecordHash };

        await rpipe([
          ["SET", K.signal(pos.signalId), JSON.stringify(updated)],
          ["SREM", K.open(), pos.signalId],
          ["ZADD", K.closed(), res.closedAt, pos.signalId],
          ["DEL", K.position(pos.signalId)],
        ]);
        await recordClose(pos.familyId, outcome);
        closedFamilies.add(pos.familyId);
        closedCount++;
      }
    });

    if (closedFamilies.size) await recomputeAllFamilies();
    log("info", "monitor", "done", { open: ids.length, closed: closedCount });
    return { status: "SUCCESS", open: ids.length, closed: closedCount, durationMs: Date.now() - started };
  } finally {
    await releaseLock("monitor", token);
  }
}
