export const dynamic = "force-dynamic";
import { getStatusInfo } from "../../../../src/site/queries.js";

export async function GET() {
  try {
    const data = await getStatusInfo();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
