export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { checkCron } from "../../../../src/security/auth.js";
import { refreshUniverse } from "../../../../src/scanner/universe.js";
import { saveRun } from "../../../../src/observability/runs.js";

const ROUTE_VERSION = "1.0.0";

export async function GET(req) {
  if (!checkCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  try {
    const snap = await refreshUniverse();
    const run = await saveRun("UNIVERSE", {
      status: "SUCCESS", startedAt, completedAt: Date.now(),
      durationMs: Date.now() - startedAt, processed: snap.count, routeVersion: ROUTE_VERSION,
    });
    return Response.json(run);
  } catch (err) {
    const run = await saveRun("UNIVERSE", {
      status: "FAILED", startedAt, completedAt: Date.now(),
      durationMs: Date.now() - startedAt, errorSummary: String(err?.message || err), routeVersion: ROUTE_VERSION,
    });
    return Response.json(run, { status: 500 });
  }
}
