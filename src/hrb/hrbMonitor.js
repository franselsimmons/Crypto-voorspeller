import { hrbCfg } from "./config.js";
import { jget, rcmd, rpipe } from "../storage/redis.js";
import { HK, HTTL } from "./hrbKeys.js";
import { getCandles, closedOnly } from "../market/bitgetClient.js";
import { resolveOnCandles, categoryOf } from "../trade/outcomeEngine.js";
import { hrbRecordClose, recomputeHrbFamilies } from "./hrbFamilyEngine.js";
import { acquireLock, releaseLock } from "../security/locks.js";
import { mapLimit } from "../utils/pool.js";
import { log } from "../observability/log.js";

const TF_MS = 15 * 60 * 1000;
const TIMEOUT_MIN = 2880;
const CONCURRENCY = 6;

export async function openHrbPosition(signal) {
  const pos = {
    signalId: signal.signalId, symbol: signal.symbol, direction: signal.direction,
    familyId: signal.familyId, entry: signal.entry, stopLoss: signal.stopLoss,
    tp1: signal.tp1, tp2: signal.tp2, candleTime: signal.candleTime, tfMs: TF_MS,
    tp1Hit: false, tp1HitAt: null, highestPrice: null, lowestPrice: null,
    nextCheckTs: signal.candleTime + TF_MS, openedAt: Date.now(),
  };
  await rcmd("SET", HK.position(signal.signalId), JSON.stringify(pos), "EX", HTTL.position);
  return pos;
}

/** Hergebruikt de gedeelde, bewezen resolveOnCandles/categoryOf (Optie A). */
export async function runHrbMonitor() {
  const c = hrbCfg();
  const token = await acquireLock("hrb:monitor", 90000);
  if (!token) return { status: "SKIPPED_LOCKED" };
  const started = Date.now();
  try {
    const ids = (await rcmd("SMEMBERS", HK.open())) || [];
    if (!ids.length) return { status: "SUCCESS", open: 0, closed: 0, durationMs: Date.now() - started };

    const posRaw = await rpipe(ids.map((id) => ["GET", HK.position(id)]));
    const positions = posRaw.map((r) => (r ? JSON.parse(r) : null)).filter(Boolean);
    const bySymbol = new Map();
    for (const p of positions) { if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, []); bySymbol.get(p.symbol).push(p); }

    let closedCount = 0;
    const closedFamilies = new Set();

    await mapLimit([...bySymbol.entries()], CONCURRENCY, async ([symbol, group]) => {
      const oldest = Math.min(...group.map((p) => p.nextCheckTs));
      const need = Math.min(200, Math.ceil((Date.now() - oldest) / TF_MS) + 3);
      const candles = closedOnly(await getCandles(symbol, "15m", Math.max(need, 3)), TF_MS);

      for (const pos of group) {
        const res = resolveOnCandles(pos, candles, c.costR, TIMEOUT_MIN * 60000);
        if (!res.closed) {
          Object.assign(pos, { tp1Hit: res.tp1Hit, tp1HitAt: res.tp1HitAt, highestPrice: res.highestPrice, lowestPrice: res.lowestPrice, nextCheckTs: res.nextCheckTs });
          await rcmd("SET", HK.position(pos.signalId), JSON.stringify(pos), "EX", HTTL.position);
          continue;
        }
        const sig = await jget(HK.signal(pos.signalId));
        if (!sig) continue;
        const outcome = {
          exitReason: res.exitReason, grossR: res.grossR, costR: res.costR, netR: res.netR,
          ambiguousBar: res.ambiguousBar, tp1Hit: res.tp1Hit, tp1HitAt: res.tp1HitAt,
          closedAt: res.closedAt, durationMinutes: res.durationMinutes, category: categoryOf(res.exitReason),
        };
        await rpipe([
          ["SET", HK.signal(pos.signalId), JSON.stringify({ ...sig, status: "CLOSED", outcome })],
          ["SREM", HK.open(), pos.signalId],
          ["ZADD", HK.closed(), res.closedAt, pos.signalId],
          ["DEL", HK.position(pos.signalId)],
        ]);
        await hrbRecordClose(pos.familyId, outcome);
        closedFamilies.add(pos.familyId);
        closedCount++;
      }
    });

    if (closedFamilies.size) await recomputeHrbFamilies();
    log("info", "hrb-monitor", "done", { open: ids.length, closed: closedCount });
    return { status: "SUCCESS", open: ids.length, closed: closedCount, durationMs: Date.now() - started };
  } finally {
    await releaseLock("hrb:monitor", token);
  }
}
