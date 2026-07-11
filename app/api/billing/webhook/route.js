export const dynamic = "force-dynamic";

import { getBillingProvider } from "../../../../src/billing/provider.js";
import { rcmd } from "../../../../src/storage/redis.js";
import { K, TTL } from "../../../../src/storage/keys.js";
import { log } from "../../../../src/observability/log.js";

/**
 * Idempotentie-volgorde is bewust: eerst verwerken, PAS DAARNA markeren.
 * Faalt verwerking → 500 → Stripe retryt; markering ontbreekt dan nog,
 * dus de retry wordt niet als duplicaat weggegooid.
 */
export async function POST(req) {
  try {
    const provider = getBillingProvider();
    if (!provider.enabled) {
      return Response.json({ error: provider.reason || "billing uitgeschakeld" }, { status: 503 });
    }
    const payload = await req.text();
    const event = provider.verifyWebhook(payload, req.headers.get("stripe-signature"));
    if (!event || !event.id) {
      return Response.json({ error: "ongeldige signatuur" }, { status: 400 });
    }
    const seen = await rcmd("EXISTS", K.billEvent(event.id));
    if (seen) return Response.json({ ok: true, duplicate: true });

    const result = await provider.handleEvent(event);
    await rcmd("SET", K.billEvent(event.id), "1", "EX", TTL.billEvent);
    log("info", "billing", "webhook_processed", { type: event.type, handled: result.handled });
    return Response.json({ ok: true, handled: result.handled });
  } catch (err) {
    log("error", "billing", "webhook_error", { error: String(err?.message || err) });
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
