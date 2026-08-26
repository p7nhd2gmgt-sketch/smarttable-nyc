import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.STRIPE_SECRET_KEY = "sk_test_smarttable_mock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.STRIPE_BASIC_MONTHLY_PRICE_ID = "price_test_basic_monthly";
process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID = "price_test_professional_monthly";
process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID = "price_test_enterprise_monthly";
process.env.STRIPE_VIDEO_STANDARD_PRICE_ID = "price_test_video_standard_299";
process.env.STRIPE_VIDEO_PREMIUM_PRICE_ID = "price_test_video_premium_499";
process.env.STRIPE_ENTERPRISE_SELF_SERVICE_ENABLED = "false";
process.env.STRIPE_LIVE_BILLING_ENABLED = "false";
process.env.STRIPE_TRIAL_PERIOD_DAYS = "14";
process.env.BILLING_ENFORCEMENT_MODE = "strict";
process.env.STRIPE_ENABLE_ACH = "true";
process.env.STRIPE_ALLOW_PROMOTION_CODES = "true";
process.env.PUBLIC_BASE_URL = "https://smarttablenyc.com";

const stripeRequests = [];
let forceStripePriceMismatch = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (!target.startsWith("https://api.stripe.com")) {
    return originalFetch(url, options);
  }
  const body = String(options.body || "");
  stripeRequests.push({ url: target, body });
  if (target.includes("/v1/prices/")) {
    const priceId = decodeURIComponent(target.split("/v1/prices/")[1] || "");
    const priceCatalog = {
      price_test_basic_monthly: { unit_amount: 14900, currency: "usd", recurring: { interval: "month" } },
      price_test_video_standard_299: { unit_amount: 29900, currency: "usd", recurring: null },
      price_test_video_premium_499: { unit_amount: 49900, currency: "usd", recurring: null }
    };
    const configuredPrice = priceCatalog[priceId];
    return new Response(JSON.stringify({
      id: priceId,
      active: true,
      ...configuredPrice,
      ...(forceStripePriceMismatch && configuredPrice ? { unit_amount: 100 } : {})
    }), {
      status: priceCatalog[priceId] ? 200 : 404,
      headers: { "content-type": "application/json" }
    });
  }
  if (target.endsWith("/v1/customers")) {
    return new Response(JSON.stringify({ id: "cus_smarttable_mock" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  if (target.endsWith("/v1/customers/cus_smarttable_mock")) {
    return new Response(JSON.stringify({
      id: "cus_smarttable_mock",
      object: "customer",
      deleted: false,
      metadata: { restaurant_id: "10000000-0000-4000-8000-000000000123" }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  if (target.endsWith("/v1/checkout/sessions")) {
    return new Response(JSON.stringify({
      id: "cs_test_smarttable_checkout",
      url: "https://checkout.stripe.com/c/pay/cs_test_smarttable_checkout"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  if (target.endsWith("/v1/billing_portal/sessions")) {
    return new Response(JSON.stringify({
      id: "bps_test_smarttable_portal",
      url: "https://billing.stripe.com/p/session/bps_test_smarttable_portal"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  if (target.includes("/v1/subscriptions/")) {
    return new Response(JSON.stringify({
      id: "sub_smarttable_mock",
      object: "subscription",
      customer: "cus_smarttable_mock",
      status: "active",
      cancel_at_period_end: true,
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      metadata: {
        restaurant_id: "10000000-0000-4000-8000-000000000123",
        plan_id: "94000000-0000-4000-8000-000000000002",
        internal_plan: "basic",
        billing_interval: "monthly",
        stripe_price_id: "price_test_basic_monthly"
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ error: { message: "Unhandled Stripe mock route.", type: "invalid_request_error" } }), {
    status: 400,
    headers: { "content-type": "application/json" }
  });
};

const { handleApiRequest } = await import(`../src/app-core.js?stripe-billing=${Date.now()}`);

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function rawApi(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
}

async function api(method, path, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.code || response.body?.error || "unknown error"}`);
  }
  return response.body;
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function stripeSignature(raw, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function signedStripeEvent(event) {
  const raw = JSON.stringify(event);
  return await rawApi("POST", "/webhooks/stripe", {
    ...event,
    __rawBody: raw
  }, {
    "stripe-signature": stripeSignature(raw)
  });
}

function containsSecret(value) {
  return JSON.stringify(value).includes("sk_") || JSON.stringify(value).includes("whsec_test_secret");
}

const migration = await read("supabase/migrations/0046_stripe_partner_subscriptions.sql");
for (const token of [
  "create table if not exists public.subscription_plans",
  "create table if not exists public.restaurant_subscriptions",
  "create table if not exists public.billing_events",
  "alter table public.invoices",
  "enable row level security",
  "restaurant_subscriptions_scoped_read",
  "billing_events_admin_read"
]) {
  assert(migration.includes(token), `Stripe billing migration is missing ${token}.`);
}
assert(!/stripe connect/i.test(migration), "Billing migration must not introduce Stripe Connect.");
assert(!/\bpos\b/i.test(migration), "Billing migration must not introduce POS references.");

const hardeningMigration = await read("supabase/migrations/0049_enterprise_compliance_hardening.sql");
for (const token of [
  "alter table public.billing_events",
  "idempotency_key",
  "attempt_count",
  "locked_at",
  "dead_lettered_at",
  "idx_billing_events_lock_retry"
]) {
  assert(hardeningMigration.includes(token), `Billing hardening migration is missing ${token}.`);
}

const fixedMonthlyMigration = await read("supabase/migrations/0056_fixed_monthly_restaurant_subscriptions.sql");
for (const token of [
  "create table if not exists public.restaurant_billing_accounts",
  "create table if not exists public.billing_access_overrides",
  "create table if not exists public.billing_audit_events",
  "internal_plan in ('no_subscription', 'trial', 'basic', 'professional', 'enterprise', 'complimentary_test')",
  "subscription_status in ('no_subscription', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused')",
  "idx_restaurant_subscriptions_one_active_fixed",
  "'trial'",
  "'basic'",
  "'professional'",
  "'enterprise'",
  "'complimentary_test'"
]) {
  assert(fixedMonthlyMigration.includes(token), `Fixed monthly billing migration is missing ${token}.`);
}
for (const forbidden of [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bstripe\s+connect\b/i, /\bper_booking\b/i, /\bpos\b/i]) {
  assert(!forbidden.test(fixedMonthlyMigration), `Fixed monthly billing migration contains forbidden pattern ${forbidden}.`);
}

const appCore = await read("src/app-core.js");
for (const token of [
  "verifyStripeWebhookSignature",
  "stripeWebhook",
  "partnerBilling",
  "adminBilling",
  "requirePartnerBillingMutationAccess",
  "fixedMonthlySubscriptionPlanDefinitions",
  "STRIPE_BASIC_MONTHLY_PRICE_ID",
  "STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID",
  "STRIPE_ENTERPRISE_MONTHLY_PRICE_ID",
  "STRIPE_LIVE_BILLING_ENABLED",
  "stripeLiveModeActive",
  "stripeBillingEnvironment",
  "billingAccessSummary",
  "BILLING_ENFORCEMENT_MODE",
  "STRIPE_ENTERPRISE_SELF_SERVICE_ENABLED",
  "STRIPE_TRIAL_PERIOD_DAYS",
  "stripeCustomerIsReusable",
  "requirePartnerBillingManager",
  "subscriptionEntitlementDefinitions",
  "clientEntitlementsForPlan",
  "sendBillingNotificationEmail",
  "stripe_billing_portal_created",
  "subscription_plan_created",
  "subscription_trial_extended",
  "billing_access_override_granted",
  "billing_access_override_removed",
  "billing_plan_corrected",
  "billing_email_resend_requested"
]) {
  assert(appCore.includes(token), `Backend billing implementation is missing ${token}.`);
}
assert(appCore.includes('stripeSecretMode === "test" || stripeLiveModeActive'), "Stripe integration must require the protected live billing gate for live mode.");
assert(!/stripe connect/i.test(appCore), "Backend must not introduce Stripe Connect.");

const publicApp = await read("public/app.js");
for (const token of [
  "partnerBillingPanel",
  "billingFeatureList",
  "runPartnerBillingAction",
  "runAdminBillingAction",
  "data-admin-billing-action",
  "/partner/billing",
  "billingPlanForm",
  "/admin/billing",
  "billing_retry_payment_button"
]) {
  assert(publicApp.includes(token), `Frontend billing wiring is missing ${token}.`);
}

const adminSession = await api("POST", "/auth/login", {
  email: TEST_ACCOUNTS.superadmin.email,
  password: TEST_ACCOUNTS.superadmin.password
});
const regularAdminSession = await api("POST", "/auth/login", {
  email: TEST_ACCOUNTS.admin.email,
  password: TEST_ACCOUNTS.admin.password
});
const partnerSession = await api("POST", "/auth/login", {
  email: TEST_ACCOUNTS.partner.email,
  password: TEST_ACCOUNTS.partner.password
});

const adminBilling = await api("GET", "/admin/billing", {}, authHeaders(adminSession.access_token));
assert.equal(adminBilling.stripe.provider, "stripe");
assert.equal(adminBilling.stripe.configured, true);
assert.equal(adminBilling.stripe.test_mode_only, true, "Stripe diagnostics must indicate test-mode billing by default.");
assert.equal(adminBilling.stripe.billing_environment, "test", "Default billing diagnostics must remain test.");
assert.equal(adminBilling.stripe.live_billing_enabled, false, "Live billing must remain disabled by default.");
assert.equal(adminBilling.stripe.fixed_monthly_plans, true, "Stripe diagnostics must indicate fixed monthly plans.");
assert.equal(adminBilling.stripe.enterprise_self_service_enabled, false, "Enterprise self-service checkout must stay disabled unless explicitly enabled.");
assert.equal(adminBilling.stripe.trial_period_configured, true, "Stripe trial period must be server-policy controlled.");
assert(Array.isArray(adminBilling.plans), "Admin billing must return plans.");
assert.deepEqual(
  adminBilling.plans.map((plan) => plan.internal_name),
  ["trial", "basic", "professional", "enterprise", "complimentary_test"],
  "Admin billing must expose the fixed internal plan catalog."
);
for (const plan of adminBilling.plans) {
  assert.equal(plan.billing_model, "fixed_monthly", `Plan ${plan.internal_name} must use fixed monthly billing.`);
  assert.equal(plan.stripe_annual_configured, false, `Plan ${plan.internal_name} must not expose annual billing.`);
  assert.equal(plan.entitlements?.server_authoritative, true, `Plan ${plan.internal_name} must expose server-authoritative entitlements.`);
}
const enterprisePlan = adminBilling.plans.find((plan) => plan.internal_name === "enterprise");
assert(enterprisePlan && !enterprisePlan.checkout_available, "Enterprise checkout must be disabled while self-service is off.");
assert(Array.isArray(adminBilling.subscriptions), "Admin billing must return subscriptions.");
assert(Array.isArray(adminBilling.invoices), "Admin billing must return invoices.");
assert(Array.isArray(adminBilling.billing_audit_events), "Admin billing must return billing audit events.");
assert(!containsSecret(adminBilling), "Admin billing payload must not expose Stripe secrets.");

const partnerBilling = await api("GET", "/partner/billing", {}, authHeaders(partnerSession.access_token));
assert.equal(partnerBilling.stripe.provider, "stripe");
assert.equal(partnerBilling.stripe.configured, true);
assert(partnerBilling.billing, "Partner billing must return access state.");
assert.equal(partnerBilling.billing.entitlements?.server_authoritative, true, "Partner billing must return server-authoritative entitlements.");
assert("offers" in partnerBilling.billing.feature_gates, "Partner billing must return server feature gates.");
assert(Array.isArray(partnerBilling.plans), "Partner billing must return available plans.");
assert(partnerBilling.plans.some((plan) => plan.internal_name === "basic" && plan.checkout_available && plan.stripe_monthly_configured), "Basic monthly plan must be checkout eligible when its server Price ID is configured.");
assert.equal(partnerBilling.plans.find((plan) => plan.internal_name === "basic")?.monthly_price, 149, "The launch partner plan must display $149 per month.");
assert(partnerBilling.plans.some((plan) => plan.internal_name === "trial" && !plan.checkout_available), "Trial must not be started through Stripe Checkout.");
assert(!partnerBilling.plans.some((plan) => plan.stripe_annual_configured), "Partner billing must not expose annual Stripe prices.");
assert.deepEqual(partnerBilling.video_packages.map((item) => [item.key, item.amount_cents]), [
  ["video_standard_3s", 29900],
  ["video_premium_3s", 49900]
], "Partner billing must expose the two server-priced one-time video packages.");
assert(partnerBilling.video_packages.every((item) => item.checkout_available), "Configured video packages must be checkout eligible.");
assert(Array.isArray(partnerBilling.invoices), "Partner billing must return invoice history.");
assert(!containsSecret(partnerBilling), "Partner billing payload must not expose Stripe secrets.");

const adminRestaurants = await api("GET", "/admin/restaurants", {}, authHeaders(adminSession.access_token));
const productionRestaurant = adminRestaurants.restaurants.find((restaurant) => restaurant.name === "Hudson Hearth");
const testRestaurant = adminRestaurants.restaurants.find((restaurant) => restaurant.name === "SmartTable Test Bistro");
assert(productionRestaurant?.id, "A non-test demo restaurant is required for billing isolation checks.");
assert(testRestaurant?.id, "SmartTable Test Bistro is required for complimentary-test checks.");

const checkoutPlan = partnerBilling.plans.find((plan) => plan.internal_name === "basic" && plan.stripe_monthly_configured) || partnerBilling.plans[0];
const restaurantId = testRestaurant.id;
const planId = checkoutPlan?.id;
const checkout = await rawApi("POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: restaurantId,
  plan_id: checkoutPlan?.id,
  billing_interval: "monthly"
}, authHeaders(partnerSession.access_token));
assert.equal(checkout.status, 200, `Checkout must be created through the Stripe adapter: ${JSON.stringify(checkout.body)}`);
assert.equal(checkout.body.session_id, "cs_test_smarttable_checkout");
assert(checkout.body.url.startsWith("https://checkout.stripe.com/"), "Checkout response must return a Stripe Checkout URL.");
const checkoutRequest = stripeRequests.find((request) => request.url.endsWith("/v1/checkout/sessions"));
assert(checkoutRequest, "Checkout creation must call Stripe checkout sessions.");
assert(checkoutRequest.body.includes("mode=subscription"), "Checkout request must use subscription mode.");
assert(checkoutRequest.body.includes("payment_method_types%5B0%5D=card"), "Checkout request must include card payments.");
assert(checkoutRequest.body.includes("allow_promotion_codes=true"), "Checkout request must allow Stripe promotional codes when enabled.");
assert(checkoutRequest.body.includes("line_items%5B0%5D%5Bprice%5D=price_test_basic_monthly"), "Checkout must use the protected Basic monthly Stripe Price ID.");
assert(checkoutRequest.body.includes("subscription_data%5Btrial_period_days%5D=14"), "Checkout trial duration must come from server policy.");
assert(checkoutRequest.body.includes("metadata%5Binternal_plan%5D=basic"), "Checkout metadata must include the fixed internal plan.");
assert(checkoutRequest.body.includes("metadata%5Bstripe_price_id%5D=price_test_basic_monthly"), "Checkout metadata must include the server-selected Stripe Price ID.");
assert(!checkoutRequest.body.includes("annual"), "Checkout request must not include annual billing in this phase.");

const videoCheckout = await rawApi("POST", "/partner/billing", {
  action: "video_checkout",
  restaurant_id: restaurantId,
  package_key: "video_standard_3s"
}, authHeaders(partnerSession.access_token));
assert.equal(videoCheckout.status, 200, `Video package Checkout should be created: ${JSON.stringify(videoCheckout.body)}`);
const videoCheckoutRequest = stripeRequests.filter((request) => request.url.endsWith("/v1/checkout/sessions")).at(-1);
assert(videoCheckoutRequest.body.includes("mode=payment"), "Video Checkout must use one-time payment mode.");
assert(videoCheckoutRequest.body.includes("line_items%5B0%5D%5Bprice%5D=price_test_video_standard_299"), "Video Checkout must use the protected server Price ID.");
assert(videoCheckoutRequest.body.includes("metadata%5Bpurchase_type%5D=video_service"), "Video Checkout must identify the purchase type for webhook routing.");
assert(!videoCheckoutRequest.body.includes("subscription_data"), "Video Checkout must not create or modify a subscription.");

const checkoutRequestCountBeforeMismatch = stripeRequests.filter((request) => request.url.endsWith("/v1/checkout/sessions")).length;
forceStripePriceMismatch = true;
const mismatchedVideoCheckout = await rawApi("POST", "/partner/billing", {
  action: "video_checkout",
  restaurant_id: restaurantId,
  package_key: "video_premium_3s"
}, authHeaders(partnerSession.access_token));
forceStripePriceMismatch = false;
assert.equal(mismatchedVideoCheckout.status, 409, "A Stripe Price with the wrong amount must block Checkout.");
assert.equal(mismatchedVideoCheckout.body.code, "STRIPE_PRICE_CATALOG_MISMATCH");
assert.equal(
  stripeRequests.filter((request) => request.url.endsWith("/v1/checkout/sessions")).length,
  checkoutRequestCountBeforeMismatch,
  "A catalog mismatch must be rejected before a Stripe Checkout session is created."
);

const clientPricedVideoCheckout = await rawApi("POST", "/partner/billing", {
  action: "video_checkout",
  restaurant_id: restaurantId,
  package_key: "video_standard_3s",
  amount_cents: 100
}, authHeaders(partnerSession.access_token));
assert.equal(clientPricedVideoCheckout.status, 400, "Client-supplied video package amounts must be rejected.");
assert.equal(clientPricedVideoCheckout.body.code, "BILLING_AMOUNT_CLIENT_REJECTED");

const videoPaidWebhook = await signedStripeEvent({
  id: "evt_video_checkout_paid",
  type: "checkout.session.completed",
  livemode: false,
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: "cs_test_smarttable_checkout",
      object: "checkout.session",
      customer: "cus_smarttable_mock",
      payment_intent: "pi_test_video_standard",
      payment_status: "paid",
      metadata: {
        purchase_type: "video_service",
        restaurant_id: restaurantId,
        package_key: "video_standard_3s",
        requested_by_user_id: partnerSession.profile?.id || ""
      }
    }
  }
});
assert.equal(videoPaidWebhook.status, 200, "A signed paid video Checkout webhook must be accepted.");
const partnerBillingAfterVideo = await api("GET", `/partner/billing?restaurant_id=${encodeURIComponent(restaurantId)}`, {}, authHeaders(partnerSession.access_token));
const paidVideoOrder = partnerBillingAfterVideo.video_orders.find((item) => item.stripe_payment_intent_id === "pi_test_video_standard");
assert.equal(paidVideoOrder?.order_status, "paid", "Paid video Checkout must be recorded independently from the subscription.");
assert.equal(paidVideoOrder?.amount_cents, 29900, "Webhook processing must use the server package amount.");
const adminBillingAfterVideo = await api("GET", "/admin/billing", {}, authHeaders(adminSession.access_token));
assert(adminBillingAfterVideo.video_service_orders.some((item) => item.stripe_payment_intent_id === "pi_test_video_standard"), "Admin billing must expose paid video production orders.");
assert(!containsSecret(checkout.body), "Checkout response must not expose Stripe secrets.");

const trialCheckout = await rawApi("POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: restaurantId,
  plan_id: "trial",
  billing_interval: "monthly"
}, authHeaders(partnerSession.access_token));
assert.equal(trialCheckout.status, 409, "Trial plan must not be available through Stripe Checkout.");
assert.equal(trialCheckout.body.code, "PLAN_NOT_CHECKOUT_ELIGIBLE");

const savedPlan = await api("POST", "/admin/billing", {
  action: "save_plan",
  internal_name: "basic",
  display_name_en: "Basic",
  display_name_es: "Plan de prueba",
  display_name_hu: "Ellenorzo csomag",
  is_active: true
}, authHeaders(adminSession.access_token));
assert.equal(savedPlan.plan.internal_name, "basic");
assert.equal(savedPlan.plan.stripe_annual_configured, false);

const unsignedWebhook = await rawApi("POST", "/webhooks/stripe", {
  id: "evt_unsigned",
  type: "checkout.session.completed"
});
assert.equal(unsignedWebhook.status, 401, "Stripe webhook must reject unsigned requests.");
assert.match(unsignedWebhook.body.code, /STRIPE_/);

const subscriptionId = "sub_smarttable_mock";
const customerId = "cus_smarttable_mock";
const currentPeriodStart = Math.floor(Date.now() / 1000);
const currentPeriodEnd = currentPeriodStart + 30 * 24 * 60 * 60;

const customerUpdated = await signedStripeEvent({
  id: "evt_customer_updated_regression",
  type: "customer.updated",
  livemode: false,
  created: currentPeriodStart,
  data: {
    object: {
      id: customerId,
      object: "customer",
      email: "billing@smarttable.test",
      name: "SmartTable Test Bistro",
      metadata: { restaurant_id: restaurantId }
    }
  }
});
assert.equal(customerUpdated.status, 200, "Customer update webhook must process with restaurant metadata.");

for (const [id, type] of [
  ["evt_invoice_created_regression", "invoice.created"],
  ["evt_invoice_finalized_regression", "invoice.finalized"],
  ["evt_invoice_action_required_regression", "invoice.payment_action_required"],
  ["evt_payment_intent_succeeded_unknown", "payment_intent.succeeded"],
  ["evt_payment_intent_failed_unknown", "payment_intent.payment_failed"]
]) {
  const response = await signedStripeEvent({
    id,
    type,
    livemode: false,
    created: currentPeriodStart,
    data: {
      object: {
        id: id.replace("evt_", type.startsWith("invoice.") ? "in_" : "pi_"),
        object: type.startsWith("invoice.") ? "invoice" : "payment_intent",
        customer: customerId,
        subscription: type.startsWith("invoice.") ? subscriptionId : undefined,
        amount_due: 19900,
        amount_paid: type.endsWith("succeeded") ? 19900 : 0,
        currency: "usd",
        status: type.endsWith("succeeded") ? "succeeded" : "open"
      }
    }
  });
  assert.equal(response.status, 200, `${type} webhook must return safe success.`);
}

const checkoutCompleted = await signedStripeEvent({
  id: "evt_checkout_completed_regression",
  type: "checkout.session.completed",
  livemode: false,
  created: currentPeriodStart,
  data: {
    object: {
      id: "cs_test_completed_regression",
      object: "checkout.session",
      customer: customerId,
      subscription: subscriptionId,
      payment_status: "paid",
      metadata: {
        restaurant_id: restaurantId,
        plan_id: planId,
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(checkoutCompleted.status, 200, `Signed checkout webhook failed: ${JSON.stringify(checkoutCompleted.body)}`);
assert.equal(checkoutCompleted.body.status, "processed");

const duplicateCheckoutCompleted = await signedStripeEvent({
  id: "evt_checkout_completed_regression",
  type: "checkout.session.completed",
  livemode: false,
  created: currentPeriodStart,
  data: {
    object: {
      id: "cs_test_completed_regression",
      object: "checkout.session",
      customer: customerId,
      subscription: subscriptionId,
      payment_status: "paid",
      metadata: {
        restaurant_id: restaurantId,
        plan_id: planId,
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(duplicateCheckoutCompleted.status, 200, "Duplicate signed Stripe events must be accepted idempotently.");

let billingAfterCheckout = await api("GET", "/admin/billing", {}, authHeaders(adminSession.access_token));
assert.equal(
  billingAfterCheckout.billing_events.filter((event) => event.stripe_event_id === "evt_checkout_completed_regression").length,
  1,
  "Duplicate Stripe webhook delivery must not create duplicate billing event rows."
);
const checkoutSubscription = billingAfterCheckout.subscriptions.find((item) => item.stripe_subscription_id === subscriptionId);
assert.equal(
  checkoutSubscription?.subscription_status,
  "active",
  "A paid Checkout event must activate the subscription instead of downgrading it to incomplete."
);

const subscriptionActive = await signedStripeEvent({
  id: "evt_subscription_active_regression",
  type: "customer.subscription.updated",
  livemode: false,
  created: currentPeriodStart,
  data: {
    object: {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      status: "active",
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      items: { data: [{ price: { id: "price_test_basic_monthly" } }] },
      metadata: {
        restaurant_id: restaurantId,
        plan_id: planId,
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(subscriptionActive.status, 200, "Subscription update webhook must process.");

let partnerBillingAfterActive = await api("GET", `/partner/billing?restaurant_id=${encodeURIComponent(restaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(partnerBillingAfterActive.billing.status, "active", "Successful subscription webhook must activate partner billing.");
assert.equal(partnerBillingAfterActive.billing.internal_plan, "basic", "Successful subscription webhook must preserve the fixed internal plan.");
assert.equal(partnerBillingAfterActive.billing.can_use_partner_features, true, "Active subscription must permit partner features.");

const duplicateActiveCheckout = await rawApi("POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: restaurantId,
  plan_id: planId,
  billing_interval: "monthly"
}, authHeaders(partnerSession.access_token));
assert.equal(duplicateActiveCheckout.status, 409, "Checkout must not create a duplicate active Stripe subscription.");
assert.equal(duplicateActiveCheckout.body.code, "STRIPE_ACTIVE_SUBSCRIPTION_EXISTS");

const changePlanPortal = await rawApi("POST", "/partner/billing", {
  action: "change_plan",
  restaurant_id: restaurantId,
  plan_id: planId,
  billing_interval: "annual"
}, authHeaders(partnerSession.access_token));
assert.equal(changePlanPortal.status, 200, `Plan changes for active subscriptions should use Customer Portal: ${JSON.stringify(changePlanPortal.body)}`);
assert.equal(changePlanPortal.body.session_id, "bps_test_smarttable_portal");

const failedPayment = await signedStripeEvent({
  id: "evt_invoice_failed_regression",
  type: "invoice.payment_failed",
  livemode: false,
  created: currentPeriodStart,
  data: {
    object: {
      id: "in_failed_regression",
      object: "invoice",
      customer: customerId,
      subscription: subscriptionId,
      amount_due: 19900,
      amount_paid: 0,
      currency: "usd",
      status: "open",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_failed_regression",
      invoice_pdf: "https://invoice.stripe.com/i/in_failed_regression.pdf",
      period_start: currentPeriodStart,
      period_end: currentPeriodEnd
    }
  }
});
assert.equal(failedPayment.status, 200, "Failed-payment webhook must process.");

const partnerBillingAfterFailure = await api("GET", `/partner/billing?restaurant_id=${encodeURIComponent(restaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(partnerBillingAfterFailure.billing.status, "past_due", "Failed payment must mark subscription past_due.");
assert.equal(partnerBillingAfterFailure.billing.can_use_partner_features, true, "Past-due subscription must remain usable during grace period.");
assert(partnerBillingAfterFailure.billing.subscription.grace_period_ends_at, "Failed payment must create a grace-period end timestamp.");

const successfulRenewal = await signedStripeEvent({
  id: "evt_invoice_renewal_regression",
  type: "invoice.payment_succeeded",
  livemode: false,
  created: currentPeriodStart,
  data: {
    object: {
      id: "in_success_regression",
      object: "invoice",
      customer: customerId,
      subscription: subscriptionId,
      amount_due: 19900,
      amount_paid: 19900,
      currency: "usd",
      status: "paid",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_success_regression",
      invoice_pdf: "https://invoice.stripe.com/i/in_success_regression.pdf",
      period_start: currentPeriodStart,
      period_end: currentPeriodEnd,
      status_transitions: { paid_at: currentPeriodStart }
    }
  }
});
assert.equal(successfulRenewal.status, 200, "Successful renewal webhook must process.");

const partnerBillingAfterRenewal = await api("GET", `/partner/billing?restaurant_id=${encodeURIComponent(restaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(partnerBillingAfterRenewal.billing.status, "active", "Successful renewal must restore active billing status.");
assert.equal(partnerBillingAfterRenewal.billing.subscription.grace_period_ends_at, null, "Successful renewal must clear grace-period state.");

const cancelAtPeriodEnd = await rawApi("POST", "/partner/billing", {
  action: "cancel_at_period_end",
  restaurant_id: restaurantId
}, authHeaders(partnerSession.access_token));
assert.equal(cancelAtPeriodEnd.status, 200, "Partner cancellation must call Stripe subscription update.");
assert.equal(cancelAtPeriodEnd.body.subscription.cancel_at_period_end, true, "Cancellation must set cancel_at_period_end.");

const cancelledSubscription = await signedStripeEvent({
  id: "evt_subscription_cancelled_regression",
  type: "customer.subscription.deleted",
  livemode: false,
  created: currentPeriodStart,
  data: {
    object: {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      status: "canceled",
      canceled_at: currentPeriodStart,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      metadata: {
        restaurant_id: restaurantId,
        plan_id: planId,
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(cancelledSubscription.status, 200, "Subscription cancellation webhook must process.");

const partnerBillingAfterCancel = await api("GET", `/partner/billing?restaurant_id=${encodeURIComponent(restaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(partnerBillingAfterCancel.billing.status, "canceled", "Cancellation webhook must mark subscription canceled.");
assert.equal(partnerBillingAfterCancel.billing.can_use_partner_features, true, "Canceled subscriptions must keep access until the paid period ends.");

const cancelledExpiredSubscription = await signedStripeEvent({
  id: "evt_subscription_cancelled_expired_regression",
  type: "customer.subscription.deleted",
  livemode: false,
  created: currentPeriodStart,
  data: {
    object: {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      status: "canceled",
      canceled_at: currentPeriodStart,
      current_period_start: currentPeriodStart - 60 * 24 * 60 * 60,
      current_period_end: currentPeriodStart - 30,
      metadata: {
        restaurant_id: restaurantId,
        plan_id: planId,
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(cancelledExpiredSubscription.status, 200, "Expired cancellation webhook must process.");

const partnerBillingAfterExpiredCancel = await api("GET", `/partner/billing?restaurant_id=${encodeURIComponent(restaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(partnerBillingAfterExpiredCancel.billing.status, "canceled", "Expired cancellation must keep canceled status.");
assert.equal(partnerBillingAfterExpiredCancel.billing.read_only, true, "Canceled subscriptions must become read-only after the paid period ends.");

const restrictedOfferMutation = await rawApi("POST", "/partner/offers", {
  restaurant_id: restaurantId,
  title: "Blocked Billing Feature Test",
  offer_date: "2026-08-01",
  start_time: "17:00",
  end_time: "18:00",
  discount: 20,
  status: "active"
}, authHeaders(partnerSession.access_token));
assert.equal(restrictedOfferMutation.status, 402, "Strict billing mode must block partner feature mutations after cancellation.");
assert.equal(restrictedOfferMutation.body.code, "SUBSCRIPTION_REQUIRED");

const customerCreateCountBeforeReuse = stripeRequests.filter((request) => request.url.endsWith("/v1/customers")).length;
const professionalPlan = partnerBilling.plans.find((plan) => plan.internal_name === "basic");
const restartCheckout = await rawApi("POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: restaurantId,
  plan_id: professionalPlan?.id,
  billing_interval: "monthly"
}, authHeaders(partnerSession.access_token));
assert.equal(restartCheckout.status, 200, "Checkout after an expired cancellation may start a new subscription.");
const customerCreateCountAfterReuse = stripeRequests.filter((request) => request.url.endsWith("/v1/customers")).length;
assert.equal(customerCreateCountAfterReuse, customerCreateCountBeforeReuse, "Existing valid Stripe Customer must be reused instead of creating a duplicate.");

const complimentaryDenied = await rawApi("POST", "/admin/billing", {
  action: "grant_complimentary_access",
  restaurant_id: productionRestaurant.id,
  reason: "Production restaurants must not receive complimentary test access.",
  days: 30
}, authHeaders(adminSession.access_token));
assert.equal(complimentaryDenied.status, 409, "Complimentary test access must be rejected for non-test restaurants.");
assert.equal(complimentaryDenied.body.code, "COMPLIMENTARY_TEST_RESTAURANT_REQUIRED");

const complimentaryAdminDenied = await rawApi("POST", "/admin/billing", {
  action: "grant_complimentary_access",
  restaurant_id: testRestaurant.id,
  reason: "Regular admin must not approve complimentary test billing access.",
  days: 30
}, authHeaders(regularAdminSession.access_token));
assert.equal(complimentaryAdminDenied.status, 403, "Complimentary test access must require superadmin approval.");
assert.equal(complimentaryAdminDenied.body.code, "SUPERADMIN_REQUIRED");

const complimentaryMissingReason = await rawApi("POST", "/admin/billing", {
  action: "grant_complimentary_access",
  restaurant_id: testRestaurant.id,
  days: 30
}, authHeaders(adminSession.access_token));
assert.equal(complimentaryMissingReason.status, 400, "Complimentary access must require a written reason.");
assert.equal(complimentaryMissingReason.body.code, "BILLING_REASON_REQUIRED");

const complimentaryGranted = await api("POST", "/admin/billing", {
  action: "grant_complimentary_access",
  restaurant_id: testRestaurant.id,
  reason: "Approved internal SmartTable demo restaurant access.",
  days: 30
}, authHeaders(adminSession.access_token));
assert.equal(complimentaryGranted.subscription.internal_plan, "complimentary_test");
assert.equal(complimentaryGranted.subscription.subscription_status, "active");

const overrideMissingReason = await rawApi("POST", "/admin/billing", {
  action: "grant_billing_override",
  restaurant_id: testRestaurant.id,
  days: 7
}, authHeaders(adminSession.access_token));
assert.equal(overrideMissingReason.status, 400, "Billing override must require a written reason.");
assert.equal(overrideMissingReason.body.code, "BILLING_OVERRIDE_REASON_REQUIRED");

const overrideGranted = await api("POST", "/admin/billing", {
  action: "grant_billing_override",
  restaurant_id: testRestaurant.id,
  internal_plan: "trial",
  reason: "Temporary operations-approved grace while billing setup is completed.",
  days: 7
}, authHeaders(adminSession.access_token));
assert.equal(overrideGranted.subscription.billing_access_override, true, "Billing override must be stored on the subscription state.");

const overrideRemoved = await api("POST", "/admin/billing", {
  action: "remove_billing_override",
  restaurant_id: testRestaurant.id,
  reason: "Temporary billing override resolved after verification.",
}, authHeaders(adminSession.access_token));
assert.equal(overrideRemoved.subscription.billing_access_override, false, "Billing override removal must update subscription state.");

const regularAdminPlanCorrection = await rawApi("POST", "/admin/billing", {
  action: "correct_billing_plan",
  restaurant_id: testRestaurant.id,
  internal_plan: "professional",
  subscription_status: "active",
  reason: "Regular admin should not correct protected billing plans."
}, authHeaders(regularAdminSession.access_token));
assert.equal(regularAdminPlanCorrection.status, 403, "Plan correction must be superadmin-only.");
assert.equal(regularAdminPlanCorrection.body.code, "SUPERADMIN_REQUIRED");

const superAdminPlanCorrection = await api("POST", "/admin/billing", {
  action: "correct_billing_plan",
  restaurant_id: testRestaurant.id,
  internal_plan: "professional",
  subscription_status: "active",
  reason: "Correcting demo billing state after webhook reconciliation test."
}, authHeaders(adminSession.access_token));
assert.equal(superAdminPlanCorrection.subscription.internal_plan, "professional", "Superadmin plan correction must update the internal plan.");
assert.equal(superAdminPlanCorrection.subscription.subscription_status, "active", "Superadmin plan correction must preserve explicit status.");

const billingEmailResend = await rawApi("POST", "/admin/billing", {
  action: "resend_billing_email",
  restaurant_id: testRestaurant.id,
  event_type: "subscription_changed",
  reason: "Regression test billing notification resend."
}, authHeaders(adminSession.access_token));
assert([202, 502].includes(billingEmailResend.status), "Billing email resend must return an explicit provider outcome.");
assert(!containsSecret(billingEmailResend.body), "Billing email resend response must not expose secrets.");

const adminBillingAfterActions = await api("GET", "/admin/billing", {}, authHeaders(adminSession.access_token));
assert(adminBillingAfterActions.billing_audit_events.some((event) => (event.action || event.event_type) === "billing_access_override_removed"), "Billing override removal must be audited.");
assert(adminBillingAfterActions.billing_audit_events.some((event) => (event.action || event.event_type) === "billing_plan_corrected"), "Superadmin plan correction must be audited.");

console.log("Stripe billing checks passed.");
