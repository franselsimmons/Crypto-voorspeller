/**
 * Billing is bewust zelfstandig geconfigureerd: GEEN import van src/config.js.
 * Zo kan billing nooit afhankelijk raken van scanner-configuratie (spec-eis) en
 * blijft de scanner draaien ook als billing-env ontbreekt of stuk is.
 */
function env(name, def = "") {
  const v = process.env[name];
  return v === undefined || v === "" ? def : v;
}

export function billingCfg() {
  return {
    provider: env("BILLING_PROVIDER", "none"),
    paidLaunch: env("PAID_LAUNCH_ENABLED", "false") === "true",
    appUrl: env("APP_URL", "http://localhost:3000"),
    priceEur: Number(env("MONTHLY_PRICE_EUR", "99")),
    stripe: {
      secretKey: env("STRIPE_SECRET_KEY"),
      webhookSecret: env("STRIPE_WEBHOOK_SECRET"),
      priceId: env("STRIPE_PRICE_ID"),
    },
    discord: {
      botToken: env("DISCORD_BOT_TOKEN"),
      guildId: env("DISCORD_GUILD_ID"),
      memberRoleId: env("DISCORD_MEMBER_ROLE_ID"),
    },
  };
}
