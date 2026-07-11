import { checkAdmin } from "../security/auth.js";

/** Uniforme wrapper voor admin-API's: auth, try/catch, no-store. */
export async function adminJson(req, fn) {
  if (!checkAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const data = await fn(req);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
