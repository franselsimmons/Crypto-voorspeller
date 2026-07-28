export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { checkCron } from "../../../../src/security/auth.js";
import { finalizeHrbCycle } from "../../../../src/hrb/hrbFinalize.js";
import { currentCycleId } from "../../../../src/utils/time.js";
import { saveRun } from "../../../../src/observability/runs.js";

const TF_MS = 15 * 60 * 1000;
const ROUTE_VERSION = "1.0.0";

export async function GET(req) {
  if (!checkCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const cycleId = Number(new URL(req.url).searchParams.get("cycleId") ?? currentCycleId(TF_MS));
  const startedAt = Date.now();
  try {
    const result = await finalizeHrbCycle(cycleId);
    const run = await saveRun("HRB_FINALIZE", { ...result, startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run);
  } catch (err) {
    const run = await saveRun("HRB_FINALIZE", { status: "FAILED", cycleId, error: String(err?.message || err), startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run, { status: 500 });
  }
}
