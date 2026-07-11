export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { cfg } from "../../../../src/config.js";
import { adminJson } from "../../../../src/site/adminRoute.js";
import { runShard } from "../../../../src/scanner/shardEngine.js";
import { finalizeCycle } from "../../../../src/scanner/finalizeScan.js";
import { currentCycleId } from "../../../../src/utils/time.js";
import { mapLimit } from "../../../../src/utils/pool.js";

export async function GET(req) {
  return adminJson(req, async () => {
    const c = cfg();
    const p = new URL(req.url).searchParams;
    const cycleId = Number(p.get("cycleId") ?? currentCycleId(c.tfMs));
    const shardParam = p.get("shard");

    if (shardParam != null) {
      const shard = Number(shardParam);
      if (!Number.isInteger(shard) || shard < 0 || shard >= c.scanShards) {
        throw new Error(`shard moet 0..${c.scanShards - 1} zijn`);
      }
      return { manual: true, cycleId, result: await runShard(cycleId, shard) };
    }

    // Alle shards (2 parallel, dubbele concurrency blijft ruim binnen Bitget-limieten),
    // daarna finalize. Zelfde locks/dedupe als cron → geen dubbele signalen.
    const idx = Array.from({ length: c.scanShards }, (_, i) => i);
    const shardResults = await mapLimit(idx, 2, (i) => runShard(cycleId, i));
    const finalize = await finalizeCycle(cycleId);
    return {
      manual: true, cycleId,
      shards: shardResults.map((r) => (r.ok ? r.value : { status: "FAILED", error: r.error })),
      finalize,
    };
  });
}
