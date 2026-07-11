export const dynamic = "force-dynamic";
import { getDaily } from "../../../../src/site/queries.js";

export async function GET(req) {
  try {
    const date = new URL(req.url).searchParams.get("date") || undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "date moet YYYY-MM-DD zijn" }, { status: 400 });
    }
    const data = await getDaily(date);
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
