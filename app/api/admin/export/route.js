export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { adminJson } from "../../../../src/site/adminRoute.js";
import { exportAll } from "../../../../src/site/adminQueries.js";

/** JSON-export (signalen, families, statuslog, open posities). CSV met filters: /api/public/export. */
export async function GET(req) {
  return adminJson(req, () => exportAll());
}
