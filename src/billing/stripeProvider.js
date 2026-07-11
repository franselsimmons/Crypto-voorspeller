import { createHmac, timingSafeEqual } from "node:crypto";
import { billingCfg } from "./billingConfig.js";
import { grantMemberRole, revokeMemberRole } from "./discordRoles.js";
import { rcmd, rpipe } from "../storage/redis.js";
import { K } from "../storage/keys.js";
import { log } from "../observability/log.js";

const ACTIVE = new Set(["active", "trialing"]);
const REVOKE = new Set(["canceled", "unpaid", "incomplete_expired"]);

async function stripeCall(secretKey, path, params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) body.set(k, String(v));
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json?.error?.message || "onbekende fout"}`);
  return json;
}

function verifySignature(payload, header, secret, toleranceSec = 300) {
  if (!header || !secret) return null;
  const parts = { v1: [] };
  for (const kv of header.split(",")) {
    const idx = kv.indexOf("=");
    if (idx < 1) continue;
    const k = kv.slice(0, idx).trim();
    const v = kv.slice(idx + 1).trim();
    if (k === "t") parts.t = v;
    else if (k === "v1") parts.v1.push(v);
  }
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || !parts.v1.length) return null;
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSec) return null;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex")
  );
  for (const sig of parts.v1) {
    const buf = Buffer.from(sig);
    if (buf.length === expected.length && timingSafeEqual(buf, expected)) {
      try { return JSON.parse(payload); } catch { return null; }
    }
  }
  return null;
}

async function discordIdForCustomer(customerId) {
  const raw = await rcmd("GET", K.billCustomer(customerId));
  return raw ? JSON.parse(raw).discordId : null;
}

async function saveMapping(customerId, discordId, status) {
  await rpipe([
    ["SET", K.billCustomer(customerId), JSON.stringify({ discordId, status, updatedAt: Date.now() })],
    ["SET", K.billDiscord(discordId), customerId],
  ]);
}

export function stripeProvider() {
  const c = billingCfg();
  const missing = ["secretKey", "webhookSecret", "priceId"].filter((k) => !c.stripe[k]);
  if (missing.length) {
    return {
      name: "stripe",
      enabled: false,
      reason: `Stripe-env ontbreekt: ${missing.join(", ")}`,
      createCheckout() { throw new Error(this.reason); },
      createPortal() { throw new Error(this.reason); },
      verifyWebhook() { return null; },
      async handleEvent() { throw new Error(this.reason); },
    };
  }

  return {
    name: "stripe",
    enabled: true,
    reason: null,

    async createCheckout({ discordId }) {
      const session = await stripeCall(c.stripe.secretKey, "/checkout/sessions", {
        mode: "subscription",
        "line_items[0][price]": c.stripe.priceId,
        "line_items[0][quantity]": 1,
        client_reference_id: discordId,
        "subscription_data[metadata][discordId]": discordId,
        success_url: `${c.appUrl}/pricing?checkout=success`,
        cancel_url: `${c.appUrl}/pricing?checkout=cancelled`,
      });
      return { url: session.url };
    },

    async createPortal({ customerId }) {
      const session = await stripeCall(c.stripe.secretKey, "/billing_portal/sessions", {
        customer: customerId,
        return_url: `${c.appUrl}/pricing`,
      });
      return { url: session.url };
    },

    verifyWebhook(payload, signatureHeader) {
      return verifySignature(payload, signatureHeader, c.stripe.webhookSecret);
    },

    /** Gooit bij falen → route antwoordt 500 → Stripe retryt (max ~3 dagen). */
    async handleEvent(event) {
      const type = event.type;
      const obj = event.data?.object || {};

      if (type === "checkout.session.completed") {
        const customerId = obj.customer;
        const discordId = obj.client_reference_id || obj.metadata?.discordId || null;
        if (!customerId || !discordId) {
          log("error", "billing", "checkout_without_ids", { type });
          return { handled: false };
        }
        await saveMapping(customerId, discordId, "active");
        if (!(await grantMemberRole(discordId))) throw new Error("Discord-rol toekennen mislukt");
        return { handled: true };
      }

      if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
        const customerId = obj.customer;
        const discordId = obj.metadata?.discordId || (await discordIdForCustomer(customerId));
        if (!discordId) {
          log("error", "billing", "subscription_without_mapping", { type });
          return { handled: false };
        }
        const status = type === "customer.subscription.deleted" ? "canceled" : obj.status;
        await saveMapping(customerId, discordId, status);
        if (ACTIVE.has(status)) {
          if (!(await grantMemberRole(discordId))) throw new Error("Discord-rol toekennen mislukt");
        } else if (REVOKE.has(status)) {
          if (!(await revokeMemberRole(discordId))) throw new Error("Discord-rol intrekken mislukt");
        } else {
          log("info", "billing", "subscription_status_kept", { status }); // bv. past_due: rol behouden
        }
        return { handled: true };
      }

      if (type === "invoice.payment_failed") {
        log("info", "billing", "payment_failed", { customer: obj.customer });
        return { handled: true }; // rol pas weg bij canceled/unpaid via subscription-event
      }

      return { handled: false }; // onbekende events: bevestigen zonder actie
    },
  };
}
