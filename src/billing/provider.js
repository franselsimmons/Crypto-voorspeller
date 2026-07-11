import { billingCfg } from "./billingConfig.js";
import { stripeProvider } from "./stripeProvider.js";

function noneProvider() {
  const reason = "Billing is uitgeschakeld (BILLING_PROVIDER=none)";
  return {
    name: "none",
    enabled: false,
    reason,
    createCheckout() { throw new Error(reason); },
    createPortal() { throw new Error(reason); },
    verifyWebhook() { return null; },
    async handleEvent() { throw new Error(reason); },
  };
}

/** Factory: providerkeuze via env. Nieuwe providers implementeren dezelfde zes leden. */
export function getBillingProvider() {
  const c = billingCfg();
  if (c.provider === "stripe") return stripeProvider();
  return noneProvider();
}
