export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { hrbCfg } from "../../../../src/hrb/config.js";
import { checkCron } from "../../../../src/security/auth.js";
import { jget, jset, rcmd } from "../../../../src/storage/redis.js";
import { HK, HTTL } from "../../../../src/hrb/hrbKeys.js";
import { K } from "../../../../src/storage/keys.js";
import { getTickMap } from "../../../../src/market/contracts.js";
import { analyzeHrbSymbol } from "../../../../src/hrb/hrbScanEngine.js";
import { mapLimit } from "../../../../src/utils/pool.js";
import { acquireLock, releaseLock } from "../../../../src/security/locks.js";
import { currentCycleId } from "../../../../src/utils/time.js";
import { saveRun } from "../../../../src/observability/runs.js";
import { resetApiCallCount, getApiCallCount } from "../../../../src/market/bitgetClient.js";

const TF_MS = 15 * 60 * 1000;
const CONCURRENCY = 6;
const ROUTE_VERSION = "1.0.0";

/**
 * HRB draait op ARS-U's universe-snapshot (zelfde ~68 munten) — geen aparte
 * universe-cron nodig. Eén scan-invocatie doet alle munten (single shard);
 * de Band-prefilter houdt het licht genoeg voor 60s.
 */
export async function GET(req) {
  if (!checkCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const c = hrbCfg();
  const cycleId = Number(new URL(req.url).searchParams.get("cycleId") ?? currentCycleId(TF_MS));
  const startedAt = Date.now();
  const token = await acquireLock(`hrb:scan:${cycleId}`, 120000);
  if (!token) {
    const run = await saveRun("HRB_SCAN", { status: "SKIPPED_LOCKED", cycleId, startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run);
  }
  resetApiCallCount();
  try {
    await rcmd("HSETNX", HK.scanCycle(cycleId), "expectedShardCount", 1);
    await rcmd("EXPIRE", HK.scanCycle(cycleId), HTTL.cycle);

    // hergebruik ARS-U's universe (K.universe); valt terug op HRB-eigen als die er is
    const universe = (await jget(K.universe())) || (await jget(HK.universe()));
    if (!universe?.symbols?.length) {
      const run = await saveRun("HRB_SCAN", { status: "FAILED", error: "universe ontbreekt", cycleId, startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
      return Response.json(run, { status: 500 });
    }

    const tickMap = await getTickMap();
    const symbols = universe.symbols.map((x) => x.s);
    const results = await mapLimit(symbols, CONCURRENCY, (sym) => analyzeHrbSymbol(sym, cycleId, tickMap[sym] ?? 1e-8));

    const candidates = [];
    let failed = 0;
    for (const r of results) {
      if (!r.ok) { failed++; continue; }
      if (r.value.candidates) candidates.push(...r.value.candidates);
    }

    await jset(HK.scanShard(cycleId, 0), {
      shard: 0, cycleId, processed: symbols.length, failed, candidates,
      apiCalls: getApiCallCount(), durationMs: Date.now() - startedAt,
    }, HTTL.shard);
    await rcmd("HINCRBY", HK.scanCycle(cycleId), "completedShardCount", 1);

    const run = await saveRun("HRB_SCAN", {
      status: failed ? "PARTIAL" : "SUCCESS", cycleId, processed: symbols.length, failed,
      candidates: candidates.length, apiCalls: getApiCallCount(),
      startedAt, completedAt: Date.now(), durationMs: Date.now() - startedAt, routeVersion: ROUTE_VERSION,
    });
    return Response.json(run);
  } catch (err) {
    const run = await saveRun("HRB_SCAN", { status: "FAILED", cycleId, error: String(err?.message || err), startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run, { status: 500 });
  } finally {
    await releaseLock(`hrb:scan:${cycleId}`, token);
  }
}
