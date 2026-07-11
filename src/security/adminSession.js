import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cfg } from "../config.js";
import { adminCookieValue } from "./auth.js";
import { safeEqual } from "../utils/hash.js";

/** Server-side sessiecheck voor admin-pagina's (cookie gezet door /api/auth/admin/login). */
export function isAdminSession() {
  if (!cfg().adminSecret) return false; // zonder secret bestaat er geen geldige sessie
  const c = cookies().get("ars_admin");
  return !!c?.value && safeEqual(c.value, adminCookieValue());
}

export function requireAdmin() {
  if (!isAdminSession()) redirect("/admin/login");
}
