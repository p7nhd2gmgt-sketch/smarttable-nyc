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
  signedStripeEvent
} from "./billing-check-helpers.mjs";

configureBillingTestEnv();
installStripeFetchMock();

const { handleApiRequest } = await importAppCore("check-stripe-webhook");

const adminSession = await api(handleApiRequest, "POST", "/auth/login", {
  email: TEST_ACCOUNTS.superadmin.email,
  password: TEST_ACCOUNTS.superadmin.password
});

const now = Math.floor(Date.now() / 1000);

const invalidSignature = await rawApi(handleApiRequest, "POST", "/webhooks/stripe", {
  id: "evt_invalid_signature",
  type: "checkout.session.completed",
  __rawBody: JSON.stringify({ id: "evt_invalid_signature", type: "checkout.session.completed" })
}, {
  "stripe-signature": "t=1,v1=not-a-valid-signature"
});
assert.equal(invalidSignature.status, 401, "Invalid Stripe webhook signatures must be rejected.");
assert.match(invalidSignature.body.code, /STRIPE_/);
assert(!containsSecret(invalidSignature.body), "Invalid signature response must not leak secrets.");

const missingRestaurantMetadata = await signedStripeEvent(handleApiRequest, {
  id: "evt_missing_restaurant_metadata",
  type: "customer.updated",
  livemode: false,
  created: now,
  data: {
    object: {
      id: "cus_without_metadata",
      object: "customer",
      email: "billing@example.test",
      metadata: {}
    }
  }
});
assert.equal(missingRestaurantMetadata.status, 200, "Customer webhook without restaurant metadata must be handled safely.");
assert.equal(missingRestaurantMetadata.body.status, "ignored", "Missing restaurant metadata should be ignored, not treated as a successful state change.");

const outOfOrderInvoice = await signedStripeEvent(handleApiRequest, {
  id: "evt_out_of_order_invoice",
  type: "invoice.payment_failed",
  livemode: false,
  created: now,
  data: {
    object: {
      id: "in_out_of_order",
      object: "invoice",
      customer: "cus_unknown",
      subscription: "sub_unknown",
      status: "open",
      amount_due: 19900,
      amount_paid: 0,
      currency: "usd"
    }
  }
});
assert.equal(outOfOrderInvoice.status, 200, "Out-of-order invoice events must be retry-safe.");
assert.equal(outOfOrderInvoice.body.status, "processed", "Out-of-order invoice events should be stored without crashing.");

const unknownCustomerPayment = await signedStripeEvent(handleApiRequest, {
  id: "evt_unknown_customer_payment",
  type: "payment_intent.payment_failed",
  livemode: false,
  created: now,
  data: {
    object: {
      id: "pi_unknown_customer",
      object: "payment_intent",
      customer: "cus_unknown",
      status: "requires_payment_method",
      last_payment_error: { code: "card_declined", message: "The card was declined." },
      metadata: {}
    }
  }
});
assert.equal(unknownCustomerPayment.status, 200, "Unknown Stripe customers must be handled safely.");

const liveSeparatedEvent = await signedStripeEvent(handleApiRequest, {
  id: "evt_live_separation_regression",
  type: "customer.updated",
  livemode: true,
  created: now,
  data: {
    object: {
      id: "cus_live_without_metadata",
      object: "customer",
      email: "billing-live@example.test",
      metadata: {}
    }
  }
});
assert.equal(liveSeparatedEvent.status, 200, "Live-mode events must not crash the test-mode endpoint.");

const deliveredSubscription = await signedStripeEvent(handleApiRequest, {
  id: "evt_duplicate_idempotency_regression",
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
        restaurant_id: "10000000-0000-4000-8000-000000000123",
        plan_id: "94000000-0000-4000-8000-000000000002",
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(deliveredSubscription.status, 200, "Valid subscription webhook must process.");

const duplicateSubscription = await signedStripeEvent(handleApiRequest, {
  id: "evt_duplicate_idempotency_regression",
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
      metadata: {
        restaurant_id: "10000000-0000-4000-8000-000000000123",
        internal_plan: "basic",
        billing_interval: "monthly"
      }
    }
  }
});
assert.equal(duplicateSubscription.status, 200, "Duplicate webhook delivery must return safe success.");

const adminBilling = await api(handleApiRequest, "GET", "/admin/billing", {}, authHeaders(adminSession.access_token));
const duplicateEvents = adminBilling.billing_events.filter((event) => event.stripe_event_id === "evt_duplicate_idempotency_regression");
assert.equal(duplicateEvents.length, 1, "Duplicate webhook delivery must not create duplicate billing events.");
const liveEvent = adminBilling.billing_events.find((event) => event.stripe_event_id === "evt_live_separation_regression");
assert(liveEvent, "Live-mode webhook event must be stored for diagnostics.");
assert.equal(liveEvent.billing_environment, "live", "Live-mode webhook events must remain separated from test-mode events.");
for (const event of adminBilling.billing_events) {
  assert(!containsSecret(event), "Billing webhook events must not store raw secrets or raw card data.");
  assert(!JSON.stringify(event.payload || {}).includes("__rawBody"), "Billing webhook payload storage must not include the raw webhook body.");
}

console.log("Stripe webhook checks passed.");
