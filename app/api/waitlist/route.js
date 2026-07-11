export const dynamic = "force-dynamic";
import { rcmd } from "../../../src/storage/redis.js";
import { K } from "../../../src/storage/keys.js";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.email !== "string") {
      return Response.json({ error: "email vereist" }, { status: 400 });
    }
    if (typeof body.website === "string" && body.website.length > 0) {
      return Response.json({ ok: true }); // honeypot: stil accepteren, niets opslaan
    }
    const email = body.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return Response.json({ error: "ongeldig e-mailadres" }, { status: 400 });
    }
    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const bucket = `wl:${ip}:${Math.floor(Date.now() / 3600000)}`;
    const hits = Number(await rcmd("INCR", K.rate(bucket)));
    await rcmd("EXPIRE", K.rate(bucket), 3600);
    if (hits > 5) return Response.json({ error: "te veel verzoeken" }, { status: 429 });
    await rcmd("SADD", K.waitlist(), email);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
