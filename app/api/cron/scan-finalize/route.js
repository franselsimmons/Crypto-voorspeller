export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { cfg } from "../../../../src/config.js";
import { checkCron } from "../../../../src/security/auth.js";
import { finalizeCycle } from "../../../../src/scanner/finalizeScan.js";
import { currentCycleId } from "../../../../src/utils/time.js";
import { saveRun } from "../../../../src/observability/runs.js";

const ROUTE_VERSION = "1.0.0";

export async function GET(req) {
  if (!checkCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const c = cfg();
  const url = new URL(req.url);
  const cycleId = Number(url.searchParams.get("cycleId") ?? currentCycleId(c.tfMs));
  const startedAt = Date.now();
  try {
    const result = await finalizeCycle(cycleId);
    const run = await saveRun("FINALIZE", { ...result, startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run);
  } catch (err) {
    const run = await saveRun("FINALIZE", {
      status: "FAILED", cycleId, startedAt, completedAt: Date.now(),
      errorSummary: String(err?.message || err), routeVersion: ROUTE_VERSION,
    });
    return Response.json(run, { status: 500 });
  }
}
