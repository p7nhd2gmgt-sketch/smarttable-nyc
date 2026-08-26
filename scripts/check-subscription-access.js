import assert from "node:assert/strict";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";
import {
  api,
  authHeaders,
  configureBillingTestEnv,
  containsSecret,
  importAppCore,
  installStripeFetchMock,
  rawApi,
  RESTAURANT_IDS,
  signedStripeEvent,
  stripeRequests
} from "./billing-check-helpers.mjs";

configureBillingTestEnv();
installStripeFetchMock();

const { handleApiRequest } = await importAppCore("check-subscription-access");

const guestSession = await api(handleApiRequest, "POST", "/auth/login", {
  email: TEST_ACCOUNTS.guest.email,
  password: TEST_ACCOUNTS.guest.password
});
const partnerSession = await api(handleApiRequest, "POST", "/auth/login", {
  email: TEST_ACCOUNTS.partner.email,
  password: TEST_ACCOUNTS.partner.password
});
const adminSession = await api(handleApiRequest, "POST", "/auth/login", {
  email: TEST_ACCOUNTS.superadmin.email,
  password: TEST_ACCOUNTS.superadmin.password
});

const partnerBilling = await api(handleApiRequest, "GET", "/partner/billing", {}, authHeaders(partnerSession.access_token));
const ownRestaurantId = RESTAURANT_IDS.testBistro;
const basicPlan = partnerBilling.plans.find((plan) => plan.internal_name === "basic");
const assignedTestBilling = await api(handleApiRequest, "GET", `/partner/billing?restaurant_id=${encodeURIComponent(ownRestaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(assignedTestBilling.restaurant_id, ownRestaurantId, "Partner billing must allow the assigned test restaurant.");
assert(basicPlan?.id, "Basic plan must be available for access tests.");

const noAuthCheckout = await rawApi(handleApiRequest, "POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: ownRestaurantId,
  plan_id: basicPlan.id
});
assert.equal(noAuthCheckout.status, 401, "Anonymous users must not create Checkout sessions.");

const guestCheckout = await rawApi(handleApiRequest, "POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: ownRestaurantId,
  plan_id: basicPlan.id
}, authHeaders(guestSession.access_token));
assert.equal(guestCheckout.status, 403, "Guests must not create Checkout sessions.");

const otherRestaurantId = ownRestaurantId === RESTAURANT_IDS.casaLuna ? RESTAURANT_IDS.hudsonHearth : RESTAURANT_IDS.casaLuna;
const otherRestaurantCheckout = await rawApi(handleApiRequest, "POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: otherRestaurantId,
  plan_id: basicPlan.id
}, authHeaders(partnerSession.access_token));
assert.equal(otherRestaurantCheckout.status, 403, "Partners must not create Checkout for another restaurant.");

for (const [field, value, expectedCode] of [
  ["stripe_price_id", "price_attack", "STRIPE_PRICE_ID_CLIENT_REJECTED"],
  ["price_id", "price_attack", "STRIPE_PRICE_ID_CLIENT_REJECTED"],
  ["stripe_customer_id", "cus_attack", "STRIPE_CUSTOMER_ID_CLIENT_REJECTED"],
  ["customer_id", "cus_attack", "STRIPE_CUSTOMER_ID_CLIENT_REJECTED"],
  ["success_url", "https://evil.example/success", "BILLING_REDIRECT_CLIENT_REJECTED"],
  ["cancel_url", "https://evil.example/cancel", "BILLING_REDIRECT_CLIENT_REJECTED"],
  ["return_url", "https://evil.example/portal", "BILLING_REDIRECT_CLIENT_REJECTED"],
  ["subscription_status", "active", "BILLING_STATUS_CLIENT_REJECTED"],
  ["status", "active", "BILLING_STATUS_CLIENT_REJECTED"],
  ["trial_period_days", 999, "BILLING_TRIAL_CLIENT_REJECTED"],
  ["trial_end", "2099-01-01T00:00:00Z", "BILLING_TRIAL_CLIENT_REJECTED"]
]) {
  const response = await rawApi(handleApiRequest, "POST", "/partner/billing", {
    action: "checkout",
    restaurant_id: ownRestaurantId,
    plan_id: basicPlan.id,
    [field]: value
  }, authHeaders(partnerSession.access_token));
  assert.equal(response.status, 400, `${field} injection must be rejected.`);
  assert.equal(response.body.code, expectedCode, `${field} injection should return ${expectedCode}.`);
}

const checkout = await rawApi(handleApiRequest, "POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: ownRestaurantId,
  plan_id: basicPlan.id
}, authHeaders(partnerSession.access_token));
assert.equal(checkout.status, 200, `Authorized owner should create Checkout: ${JSON.stringify(checkout.body)}`);
assert(checkout.body.url.startsWith("https://checkout.stripe.com/"), "Checkout must return only the Stripe Checkout URL.");
assert(!containsSecret(checkout.body), "Checkout response must not expose Stripe secrets.");
const checkoutRequest = stripeRequests.find((request) => request.url.endsWith("/v1/checkout/sessions"));
assert(checkoutRequest, "Authorized Checkout must call Stripe.");
assert(checkoutRequest.body.includes("success_url=https%3A%2F%2Fwww.smarttablenyc.com%2Fpartner%3Fbilling%3Dsuccess"), "Checkout success URL must be server-derived.");
assert(!checkoutRequest.body.includes("evil.example"), "Checkout request must not include attacker-controlled redirects.");
assert(!checkoutRequest.body.includes("price_attack"), "Checkout request must not include attacker-controlled Price IDs.");
assert(!checkoutRequest.body.includes("cus_attack"), "Checkout request must not include attacker-controlled Customer IDs.");

const billingAfterCheckout = await api(handleApiRequest, "GET", `/partner/billing?restaurant_id=${encodeURIComponent(ownRestaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.notEqual(billingAfterCheckout.billing.status, "active", "Checkout success redirect alone must not activate billing access.");
assert.equal(billingAfterCheckout.billing.can_use_partner_features, false, "Checkout success redirect alone must not grant partner feature access.");

const guestPortal = await rawApi(handleApiRequest, "POST", "/partner/billing", {
  action: "portal",
  restaurant_id: ownRestaurantId
}, authHeaders(guestSession.access_token));
assert.equal(guestPortal.status, 403, "Guests must not open the Customer Portal.");

const now = Math.floor(Date.now() / 1000);
const activeSubscription = await signedStripeEvent(handleApiRequest, {
  id: "evt_access_active_subscription",
  type: "customer.subscription.updated",
  livemode: false,
  created: now,
  data: {
    object: {
      id: "sub_smarttable_mock",
      object: "subscription",
      customer: "cus_smarttable_mock",
      status: "active",
      current_period_start: now,
      current_period_end: now + 30 * 24 * 60 * 60,
      items: { data: [{ price: { id: "price_test_basic_monthly" } }] },
      metadata: {
        restaurant_id: ownRestaurantId,
        plan_id: basicPlan.id,
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(activeSubscription.status, 200, "Subscription webhook must activate billing state.");
const billingAfterWebhook = await api(handleApiRequest, "GET", `/partner/billing?restaurant_id=${encodeURIComponent(ownRestaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(billingAfterWebhook.billing.status, "active", "Signed subscription webhook must activate access.");
assert.equal(billingAfterWebhook.billing.can_use_partner_features, true, "Active webhook-confirmed billing must grant partner feature access.");

const portal = await rawApi(handleApiRequest, "POST", "/partner/billing", {
  action: "portal",
  restaurant_id: ownRestaurantId
}, authHeaders(partnerSession.access_token));
assert.equal(portal.status, 200, "Authorized owner/manager may open the Customer Portal after customer/subscription linkage.");
const portalRequest = stripeRequests.find((request) => request.url.endsWith("/v1/billing_portal/sessions"));
assert(portalRequest.body.includes("configuration=bpc_test_smarttable"), "Customer Portal configuration must come from the server environment.");

const duplicateCheckout = await rawApi(handleApiRequest, "POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: ownRestaurantId,
  plan_id: basicPlan.id
}, authHeaders(partnerSession.access_token));
assert.equal(duplicateCheckout.status, 409, "Active restaurants must not create duplicate active subscriptions.");
assert.equal(duplicateCheckout.body.code, "STRIPE_ACTIVE_SUBSCRIPTION_EXISTS");

const paymentFailed = await signedStripeEvent(handleApiRequest, {
  id: "evt_access_payment_failed",
  type: "invoice.payment_failed",
  livemode: false,
  created: now,
  data: {
    object: {
      id: "in_access_payment_failed",
      object: "invoice",
      customer: "cus_smarttable_mock",
      subscription: "sub_smarttable_mock",
      amount_due: 19900,
      amount_paid: 0,
      currency: "usd",
      status: "open"
    }
  }
});
assert.equal(paymentFailed.status, 200, "Payment failure webhook must process.");
const billingPastDueGrace = await api(handleApiRequest, "GET", `/partner/billing?restaurant_id=${encodeURIComponent(ownRestaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(billingPastDueGrace.billing.status, "past_due", "Failed payment must set past_due.");
assert.equal(billingPastDueGrace.billing.can_use_partner_features, true, "Past-due restaurants must retain access during grace period.");

const unpaidManualState = await api(handleApiRequest, "POST", "/admin/billing", {
  action: "correct_billing_plan",
  restaurant_id: ownRestaurantId,
  internal_plan: "basic",
  subscription_status: "unpaid",
  reason: "Regression test unpaid read-only behavior."
}, authHeaders(adminSession.access_token));
assert.equal(unpaidManualState.subscription.subscription_status, "unpaid", "Superadmin correction should set unpaid state for regression.");
const billingUnpaid = await api(handleApiRequest, "GET", `/partner/billing?restaurant_id=${encodeURIComponent(ownRestaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(billingUnpaid.billing.read_only, true, "Unpaid subscriptions must become read-only.");

const restrictedMutation = await rawApi(handleApiRequest, "POST", "/partner/offers", {
  restaurant_id: ownRestaurantId,
  title: "Blocked Billing Access Test",
  offer_date: "2026-08-01",
  start_time: "17:00",
  end_time: "18:00",
  discount: 20,
  status: "active"
}, authHeaders(partnerSession.access_token));
assert.equal(restrictedMutation.status, 402, "Unpaid read-only billing state must block partner feature mutations.");

const overrideMissingReason = await rawApi(handleApiRequest, "POST", "/admin/billing", {
  action: "grant_billing_override",
  restaurant_id: ownRestaurantId,
  days: 7
}, authHeaders(adminSession.access_token));
assert.equal(overrideMissingReason.status, 400, "Admin billing override must require a reason.");
assert.equal(overrideMissingReason.body.code, "BILLING_OVERRIDE_REASON_REQUIRED");

const overrideMissingExpiration = await rawApi(handleApiRequest, "POST", "/admin/billing", {
  action: "grant_billing_override",
  restaurant_id: ownRestaurantId,
  reason: "Regression test missing expiration."
}, authHeaders(adminSession.access_token));
assert.equal(overrideMissingExpiration.status, 400, "Admin billing override must require an expiration.");
assert.equal(overrideMissingExpiration.body.code, "BILLING_OVERRIDE_EXPIRATION_REQUIRED");

const overrideGranted = await api(handleApiRequest, "POST", "/admin/billing", {
  action: "grant_billing_override",
  restaurant_id: ownRestaurantId,
  reason: "Regression test temporary override.",
  days: 999
}, authHeaders(adminSession.access_token));
assert(overrideGranted.subscription.billing_access_override_expires_at, "Billing override must store an expiration timestamp.");
const overrideEnd = new Date(overrideGranted.subscription.billing_access_override_expires_at).getTime();
assert(overrideEnd <= Date.now() + 31 * 24 * 60 * 60 * 1000, "Billing override must be capped by BILLING_OVERRIDE_MAX_DAYS.");

const overrideRemoved = await api(handleApiRequest, "POST", "/admin/billing", {
  action: "remove_billing_override",
  restaurant_id: ownRestaurantId,
  reason: "Regression test override removal before cancellation transitions."
}, authHeaders(adminSession.access_token));
assert.equal(overrideRemoved.subscription.billing_access_override, false, "Removed override must stop granting billing access.");

const canceledFuture = await signedStripeEvent(handleApiRequest, {
  id: "evt_access_canceled_future",
  type: "customer.subscription.deleted",
  livemode: false,
  created: now,
  data: {
    object: {
      id: "sub_smarttable_mock",
      object: "subscription",
      customer: "cus_smarttable_mock",
      status: "canceled",
      canceled_at: now,
      current_period_start: now - 60,
      current_period_end: now + 7 * 24 * 60 * 60,
      metadata: {
        restaurant_id: ownRestaurantId,
        plan_id: basicPlan.id,
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(canceledFuture.status, 200, "Cancellation webhook must process.");
const billingCanceledFuture = await api(handleApiRequest, "GET", `/partner/billing?restaurant_id=${encodeURIComponent(ownRestaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(billingCanceledFuture.billing.status, "canceled", "Canceled webhook must set canceled status.");
assert.equal(billingCanceledFuture.billing.can_use_partner_features, true, "Canceled subscriptions keep access until current paid period end.");

const canceledExpired = await signedStripeEvent(handleApiRequest, {
  id: "evt_access_canceled_expired",
  type: "customer.subscription.deleted",
  livemode: false,
  created: now,
  data: {
    object: {
      id: "sub_smarttable_mock",
      object: "subscription",
      customer: "cus_smarttable_mock",
      status: "canceled",
      canceled_at: now,
      current_period_start: now - 60 * 24 * 60 * 60,
      current_period_end: now - 60,
      metadata: {
        restaurant_id: ownRestaurantId,
        plan_id: basicPlan.id,
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(canceledExpired.status, 200, "Expired cancellation webhook must process.");
const billingCanceledExpired = await api(handleApiRequest, "GET", `/partner/billing?restaurant_id=${encodeURIComponent(ownRestaurantId)}`, {}, authHeaders(partnerSession.access_token));
assert.equal(billingCanceledExpired.billing.read_only, true, "Canceled subscriptions must become read-only after current period end.");

await api(handleApiRequest, "POST", "/admin/partners", {
  email: TEST_ACCOUNTS.partner.email,
  full_name: "Read Only Regression Partner",
  restaurant_id: otherRestaurantId,
  restaurant_role: "read_only"
}, authHeaders(adminSession.access_token));
const readOnlyCheckout = await rawApi(handleApiRequest, "POST", "/partner/billing", {
  action: "checkout",
  restaurant_id: otherRestaurantId,
  plan_id: basicPlan.id
}, authHeaders(partnerSession.access_token));
assert.equal(readOnlyCheckout.status, 403, "read_only restaurant partners must not manage billing.");
assert.equal(readOnlyCheckout.body.code, "BILLING_MANAGER_REQUIRED");

console.log("Subscription access checks passed.");
