export const dynamic = "force-dynamic";

import { cfg } from "../../../../../src/config.js";
import { safeEqual } from "../../../../../src/utils/hash.js";
import { adminCookieValue } from "../../../../../src/security/auth.js";
import { rcmd } from "../../../../../src/storage/redis.js";
import { K } from "../../../../../src/storage/keys.js";

export async function POST(req) {
  try {
    const c = cfg();
    if (!c.adminSecret) return Response.json({ error: "admin niet geconfigureerd" }, { status: 503 });

    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const bucket = `login:${ip}:${Math.floor(Date.now() / 3600000)}`;
    const hits = Number(await rcmd("INCR", K.rate(bucket)));
    await rcmd("EXPIRE", K.rate(bucket), 3600);
    if (hits > 10) return Response.json({ error: "te veel pogingen, probeer later" }, { status: 429 });

    const body = await req.json().catch(() => null);
    const secret = typeof body?.secret === "string" ? body.secret : "";
    if (!secret || !safeEqual(secret, c.adminSecret)) {
      return Response.json({ error: "ongeldig wachtwoord" }, { status: 401 });
    }

    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `ars_admin=${adminCookieValue()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
