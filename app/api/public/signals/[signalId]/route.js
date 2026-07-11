export const dynamic = "force-dynamic";
import { getSignal } from "../../../../../src/site/queries.js";

export async function GET(req, { params }) {
  try {
    const id = String(params.signalId || "");
    if (!/^ARS-[a-f0-9]{16}$/.test(id)) {
      return Response.json({ error: "invalid signalId" }, { status: 400 });
    }
    const signal = await getSignal(id);
    if (!signal) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(signal, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
