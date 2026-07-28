export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { checkCron } from "../../../../src/security/auth.js";
import { runHrbMonitor } from "../../../../src/hrb/hrbMonitor.js";
import { saveRun } from "../../../../src/observability/runs.js";

const ROUTE_VERSION = "1.0.0";

export async function GET(req) {
  if (!checkCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  try {
    const result = await runHrbMonitor();
    const run = await saveRun("HRB_MONITOR", { ...result, startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run);
  } catch (err) {
    const run = await saveRun("HRB_MONITOR", { status: "FAILED", error: String(err?.message || err), startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run, { status: 500 });
  }
}
