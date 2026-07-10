export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { checkCron } from "../../../../src/security/auth.js";
import { runMonitor } from "../../../../src/trade/positionEngine.js";
import { saveRun } from "../../../../src/observability/runs.js";

const ROUTE_VERSION = "1.0.0";

export async function GET(req) {
  if (!checkCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  try {
    const result = await runMonitor();
    const run = await saveRun("MONITOR", { ...result, startedAt, completedAt: Date.now(), routeVersion: ROUTE_VERSION });
    return Response.json(run);
  } catch (err) {
    const run = await saveRun("MONITOR", {
      status: "FAILED", startedAt, completedAt: Date.now(),
      errorSummary: String(err?.message || err), routeVersion: ROUTE_VERSION,
    });
    return Response.json(run, { status: 500 });
  }
}
