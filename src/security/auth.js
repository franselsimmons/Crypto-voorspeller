import { cfg } from "../config.js";
import { safeEqual, sha256Hex } from "../utils/hash.js";

/** Vercel Cron stuurt Authorization: Bearer CRON_SECRET; externe schedulers mogen ?secret= gebruiken. */
export function checkCron(req) {
  const c = cfg();
  if (!c.cronSecret) return false;
  const h = req.headers.get("authorization") || "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
  const q = new URL(req.url).searchParams.get("secret") || "";
  const token = bearer || q;
  return token.length > 0 && safeEqual(token, c.cronSecret);
}

export const adminCookieValue = () => sha256Hex(`ars-admin:${cfg().adminSecret}`);

export function checkAdmin(req) {
  const c = cfg();
  if (!c.adminSecret) return false;
  const h = req.headers.get("authorization") || "";
  if (h.startsWith("Bearer ") && safeEqual(h.slice(7), c.adminSecret)) return true;
  const cookie = req.headers.get("cookie") || "";
  const m = /(?:^|;\s*)ars_admin=([a-f0-9]{64})/.exec(cookie);
  return m ? safeEqual(m[1], adminCookieValue()) : false;
}
