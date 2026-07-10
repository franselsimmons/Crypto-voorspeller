export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { cfg } from "../../../../src/config.js";
import { checkCron } from "../../../../src/security/auth.js";
import { runShard } from "../../../../src/scanner/shardEngine.js";
import { currentCycleId } from "../../../../src/utils/time.js";
import { saveRun } from "../../../../src/observability/runs.js";

const ROUTE_VERSION = "1.0.0";

export async function GET(req) {
  if (!checkCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const c = cfg();
  const url = new URL(req.url);
  const shard = Number(url.searchParams.get("shard") ?? "0");
  if (!Number.isInteger(shard) || shard < 0 || shard >= c.scanShards) {
    return Response.json({ error: `shard moet 0..${c.scanShards - 1} zijn` }, { status: 400 });
  }
  const startedAt = Date.now();
  const cycleId = Number(url.searchParams.get("cycleId") ?? currentCycleId(c.tfMs));
  try {
    const result = await runShard(cycleId, shard);
    const run = await saveRun(`SCAN:${shard}`, { ...result, startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run);
  } catch (err) {
    const run = await saveRun(`SCAN:${shard}`, {
      status: "FAILED", cycleId, shard, startedAt, completedAt: Date.now(),
      errorSummary: String(err?.message || err), routeVersion: ROUTE_VERSION,
    });
    return Response.json(run, { status: 500 });
  }
}
