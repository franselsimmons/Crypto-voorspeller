export const dynamic = "force-dynamic";
import { adminJson } from "../../../../src/site/adminRoute.js";
import { scannerInfo } from "../../../../src/site/adminQueries.js";

export async function GET(req) {
  return adminJson(req, () => scannerInfo());
}
