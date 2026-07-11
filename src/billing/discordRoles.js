import { billingCfg } from "./billingConfig.js";
import { log } from "../observability/log.js";

const API = "https://discord.com/api/v10";

async function roleCall(method, discordUserId) {
  const { discord } = billingCfg();
  if (!discord.botToken || !discord.guildId || !discord.memberRoleId) {
    log("error", "billing", "discord_role_not_configured", {});
    return false;
  }
  const url = `${API}/guilds/${discord.guildId}/members/${discordUserId}/roles/${discord.memberRoleId}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bot ${discord.botToken}` },
      signal: AbortSignal.timeout(8000),
    });
    // 204 = gelukt; 404 = lid/rol bestaat niet (meer) — functioneel gelijkwaardig aan "klaar"
    const ok = res.status === 204 || res.status === 404;
    if (!ok) log("error", "billing", "discord_role_failed", { method, status: res.status });
    return ok;
  } catch (err) {
    log("error", "billing", "discord_role_error", { method, error: String(err?.message || err) });
    return false;
  }
}

export const grantMemberRole = (discordUserId) => roleCall("PUT", discordUserId);
export const revokeMemberRole = (discordUserId) => roleCall("DELETE", discordUserId);
