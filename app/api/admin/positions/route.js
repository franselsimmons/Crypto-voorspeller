export const dynamic = "force-dynamic";
import { adminJson } from "../../../../src/site/adminRoute.js";
import { positionsDetail } from "../../../../src/site/adminQueries.js";

export async function GET(req) {
  return adminJson(req, () => {
    const noPrices = new URL(req.url).searchParams.get("prices") === "no";
    return positionsDetail(!noPrices);
  });
}
