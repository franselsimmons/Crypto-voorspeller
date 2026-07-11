export const dynamic = "force-dynamic";
import { adminJson } from "../../../../src/site/adminRoute.js";
import { discordLogsList } from "../../../../src/site/adminQueries.js";

export async function GET(req) {
  return adminJson(req, () => {
    const limit = Number(new URL(req.url).searchParams.get("limit")) || 100;
    return discordLogsList(limit);
  });
}
