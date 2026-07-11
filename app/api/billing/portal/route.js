export const dynamic = "force-dynamic";

import { getBillingProvider } from "../../../../src/billing/provider.js";
import { rcmd } from "../../../../src/storage/redis.js";
import { K } from "../../../../src/storage/keys.js";

export async function GET(req) {
  try {
    const provider = getBillingProvider();
    if (!provider.enabled) {
      return Response.json({ error: provider.reason || "billing uitgeschakeld" }, { status: 503 });
    }
    const p = new URL(req.url).searchParams;
    let customerId = p.get("customerId") || "";
    const discordId = p.get("discordId") || "";
    if (!customerId && /^\d{15,21}$/.test(discordId)) {
      customerId = (await rcmd("GET", K.billDiscord(discordId))) || "";
    }
    if (!customerId) {
      return Response.json({ error: "geen abonnement gevonden voor deze gebruiker" }, { status: 404 });
    }
    const { url } = await provider.createPortal({ customerId });
    return Response.redirect(url, 302);
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
