export const dynamic = "force-dynamic";
import { adminJson } from "../../../../src/site/adminRoute.js";
import { adminListSignals } from "../../../../src/site/adminQueries.js";

export async function GET(req) {
  return adminJson(req, () => {
    const p = new URL(req.url).searchParams;
    return adminListSignals({
      limit: p.get("limit"), cursor: p.get("cursor"),
      direction: p.get("direction") || undefined,
      setupType: p.get("setupType") || undefined,
      class: p.get("class") || undefined,
      status: p.get("status") || undefined,
      symbol: p.get("symbol") || undefined,
      published: p.get("published") || undefined,
    });
  });
}
