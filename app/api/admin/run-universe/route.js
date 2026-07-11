export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { adminJson } from "../../../../src/site/adminRoute.js";
import { refreshUniverse } from "../../../../src/scanner/universe.js";

export async function GET(req) {
  return adminJson(req, async () => {
    const snap = await refreshUniverse();
    return { manual: true, count: snap.count, updatedAt: snap.ts };
  });
}
