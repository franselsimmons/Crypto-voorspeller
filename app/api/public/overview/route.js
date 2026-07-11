export const dynamic = "force-dynamic";
import { getOverview } from "../../../../src/site/queries.js";

export async function GET() {
  try {
    const data = await getOverview();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
