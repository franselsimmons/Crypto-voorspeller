export const dynamic = "force-dynamic";

import { billingCfg } from "../../../../src/billing/billingConfig.js";
import { getBillingProvider } from "../../../../src/billing/provider.js";

const DISCORD_ID_RE = /^\d{15,21}$/;

async function start(discordId) {
  const c = billingCfg();
  if (!c.paidLaunch) {
    return Response.json(
      { error: "Collecting-fase: betalingen zijn nog niet geopend", phase: "COLLECTING" },
      { status: 409 }
    );
  }
  const provider = getBillingProvider();
  if (!provider.enabled) {
    return Response.json({ error: provider.reason || "billing niet geconfigureerd" }, { status: 503 });
  }
  if (!DISCORD_ID_RE.test(discordId)) {
    return Response.json({ error: "discordId (jouw Discord user-ID) vereist" }, { status: 400 });
  }
  const { url } = await provider.createCheckout({ discordId });
  return url;
}

export async function GET(req) {
  try {
    const discordId = new URL(req.url).searchParams.get("discordId") || "";
    const out = await start(discordId);
    if (out instanceof Response) return out;
    return Response.redirect(out, 302);
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const out = await start(String(body.discordId || ""));
    if (out instanceof Response) return out;
    return Response.json({ url: out });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
