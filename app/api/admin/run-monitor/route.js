export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { adminJson } from "../../../../src/site/adminRoute.js";
import { runMonitor } from "../../../../src/trade/positionEngine.js";

export async function GET(req) {
  return adminJson(req, async () => ({ manual: true, result: await runMonitor() }));
}
