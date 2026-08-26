import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

export const RESTAURANT_IDS = Object.freeze({
  hudsonHearth: "10000000-0000-4000-8000-000000000001",
  casaLuna: "10000000-0000-4000-8000-000000000002",
  testBistro: "10000000-0000-4000-8000-000000000123"
});

export function configureBillingTestEnv(overrides = {}) {
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: "sk_test_smarttable_mock",
    STRIPE_PUBLISHABLE_KEY: "pk_test_smarttable_mock",
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
    STRIPE_BASIC_MONTHLY_PRICE_ID: "price_test_basic_monthly",
    STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID: "price_test_professional_monthly",
    STRIPE_ENTERPRISE_MONTHLY_PRICE_ID: "price_test_enterprise_monthly",
    STRIPE_VIDEO_STANDARD_PRICE_ID: "price_test_video_standard_299",
    STRIPE_VIDEO_PREMIUM_PRICE_ID: "price_test_video_premium_499",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_test_smarttable",
    STRIPE_SELF_SERVICE_ENTERPRISE_ENABLED: "false",
    STRIPE_LIVE_BILLING_ENABLED: "false",
    BILLING_DEFAULT_TRIAL_DAYS: "14",
    BILLING_GRACE_PERIOD_DAYS: "7",
    BILLING_OVERRIDE_MAX_DAYS: "30",
    BILLING_ENFORCEMENT_MODE: "strict",
    STRIPE_ENABLE_ACH: "true",
    STRIPE_ALLOW_PROMOTION_CODES: "true",
    PUBLIC_BASE_URL: "https://smarttablenyc.com",
    ...overrides
  });
}

export const stripeRequests = [];

export function installStripeFetchMock() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (!target.startsWith("https://api.stripe.com")) {
      return originalFetch(url, options);
    }
    const body = String(options.body || "");
    stripeRequests.push({ url: target, body, headers: options.headers || {} });
    if (target.includes("/v1/prices/")) {
      const priceId = decodeURIComponent(target.split("/v1/prices/")[1] || "");
      const priceCatalog = {
        price_test_basic_monthly: { unit_amount: 14900, currency: "usd", recurring: { interval: "month" } },
        price_test_video_standard_299: { unit_amount: 29900, currency: "usd", recurring: null },
        price_test_video_premium_499: { unit_amount: 49900, currency: "usd", recurring: null }
      };
      return stripeJson({ id: priceId, active: true, ...priceCatalog[priceId] }, priceCatalog[priceId] ? 200 : 404);
    }
    if (target.endsWith("/v1/customers")) {
      return stripeJson({ id: "cus_smarttable_mock", object: "customer", metadata: { restaurant_id: RESTAURANT_IDS.testBistro } });
    }
    if (target.endsWith("/v1/customers/cus_smarttable_mock")) {
      return stripeJson({
        id: "cus_smarttable_mock",
        object: "customer",
        deleted: false,
        metadata: { restaurant_id: RESTAURANT_IDS.testBistro }
      });
    }
    if (target.includes("/v1/customers/cus_attack")) {
      return stripeJson({
        id: "cus_attack",
        object: "customer",
        deleted: false,
        metadata: { restaurant_id: "attacker-restaurant" }
      });
    }
    if (target.endsWith("/v1/checkout/sessions")) {
      return stripeJson({
        id: "cs_test_smarttable_checkout",
        object: "checkout.session",
        url: "https://checkout.stripe.com/c/pay/cs_test_smarttable_checkout"
      });
    }
    if (target.endsWith("/v1/billing_portal/sessions")) {
      return stripeJson({
        id: "bps_test_smarttable_portal",
        object: "billing_portal.session",
        url: "https://billing.stripe.com/p/session/bps_test_smarttable_portal"
      });
    }
    if (target.includes("/v1/subscriptions/")) {
      return stripeJson({
        id: "sub_smarttable_mock",
        object: "subscription",
        customer: "cus_smarttable_mock",
        status: "active",
        cancel_at_period_end: true,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        metadata: {
          restaurant_id: RESTAURANT_IDS.testBistro,
          plan_id: "94000000-0000-4000-8000-000000000002",
          internal_plan: "basic",
          billing_interval: "monthly",
          stripe_price_id: "price_test_basic_monthly"
        },
        items: { data: [{ price: { id: "price_test_basic_monthly" } }] }
      });
    }
    return new Response(JSON.stringify({ error: { message: "Unhandled Stripe mock route.", type: "invalid_request_error" } }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function stripeJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export async function importAppCore(label = "billing-check") {
  return await import(`../src/app-core.js?${label}=${Date.now()}-${Math.random()}`);
}

export async function readRepoFile(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

export async function rawApi(handleApiRequest, method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
}

export async function api(handleApiRequest, method, path, body = {}, headers = {}) {
  const response = await rawApi(handleApiRequest, method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.code || response.body?.error || "unknown error"}`);
  }
  return response.body;
}

export function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

export function stripeSignature(raw, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export async function signedStripeEvent(handleApiRequest, event, timestamp) {
  const raw = JSON.stringify(event);
  return await rawApi(handleApiRequest, "POST", "/webhooks/stripe", {
    ...event,
    __rawBody: raw
  }, {
    "stripe-signature": stripeSignature(raw, timestamp)
  });
}

export function containsSecret(value) {
  const text = JSON.stringify(value);
  return /sk_(test|live)_/i.test(text)
    || /whsec_/i.test(text)
    || /rk_(test|live)_/i.test(text)
    || /card_number|cvc|exp_month|exp_year/i.test(text);
}
