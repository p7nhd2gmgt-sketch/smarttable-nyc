import assert from "node:assert/strict";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";
import {
  api,
  authHeaders,
  configureBillingTestEnv,
  containsSecret,
  importAppCore,
  installStripeFetchMock,
  readRepoFile
} from "./billing-check-helpers.mjs";

configureBillingTestEnv();
installStripeFetchMock();

const { handleApiRequest } = await importAppCore("check-billing");

const [packageJson, appCore, publicApp, envExample, migration] = await Promise.all([
  readRepoFile("package.json").then(JSON.parse),
  readRepoFile("src/app-core.js"),
  readRepoFile("public/app.js"),
  readRepoFile(".env.example"),
  readRepoFile("supabase/migrations/0056_fixed_monthly_restaurant_subscriptions.sql")
]);

for (const script of ["check:billing", "check:stripe-webhook", "check:subscription-access", "check:billing-ui"]) {
  assert(packageJson.scripts?.[script], `package.json must define ${script}.`);
}

for (const token of [
  "/partner/billing",
  "/admin/billing",
  "/webhooks/stripe",
  "verifyStripeWebhookSignature",
  "recordBillingAuditEvent",
  "requirePartnerBillingManager",
  "requirePartnerBillingMutationAccess",
  "forbiddenClientBillingMutation",
  "safePartnerBillingUrl",
  "stripePlanPriceId",
  "subscriptionEntitlementDefinitions",
  "billingNotificationEventForSubscription"
]) {
  assert(appCore.includes(token), `Billing backend is missing ${token}.`);
}

for (const token of [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_LIVE_BILLING_ENABLED",
  "STRIPE_BASIC_MONTHLY_PRICE_ID",
  "STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID",
  "STRIPE_ENTERPRISE_MONTHLY_PRICE_ID",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "STRIPE_SELF_SERVICE_ENTERPRISE_ENABLED",
  "BILLING_DEFAULT_TRIAL_DAYS",
  "BILLING_GRACE_PERIOD_DAYS",
  "BILLING_OVERRIDE_MAX_DAYS",
  "PUBLIC_BASE_URL"
]) {
  assert(envExample.includes(`${token}=`), `.env.example must document ${token} without a value.`);
}

assert(!publicApp.includes("STRIPE_SECRET_KEY"), "Frontend must not reference STRIPE_SECRET_KEY.");
assert(!publicApp.includes("STRIPE_WEBHOOK_SECRET"), "Frontend must not reference STRIPE_WEBHOOK_SECRET.");
assert(!publicApp.includes("STRIPE_BASIC_MONTHLY_PRICE_ID"), "Frontend must not reference protected Stripe Price IDs.");
assert(!publicApp.includes("STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID"), "Frontend must not reference protected Stripe Price IDs.");
assert(!publicApp.includes("STRIPE_ENTERPRISE_MONTHLY_PRICE_ID"), "Frontend must not reference protected Stripe Price IDs.");
assert(!/stripe\s+connect/i.test(appCore + migration), "Fixed subscription billing must not introduce Stripe Connect.");
assert(!/\bpos\b/i.test(migration), "Billing migration must not introduce POS references.");
assert(!/card_number|cvc|exp_month|exp_year/i.test(migration + appCore), "Billing code must not store raw card data.");
assert(!/console\.(log|error|warn)\([^)]*STRIPE_SECRET_KEY/i.test(appCore), "Stripe secret must not be logged.");
assert(!/rawWebhookBody\(body\)[\s\S]{0,120}logSafeServerEvent/i.test(appCore), "Raw webhook body must not be logged.");

for (const token of [
  "create table if not exists public.restaurant_billing_accounts",
  "create table if not exists public.billing_access_overrides",
  "create table if not exists public.billing_audit_events",
  "alter table public.restaurant_billing_accounts enable row level security",
  "alter table public.billing_access_overrides enable row level security",
  "alter table public.billing_audit_events enable row level security",
  "restaurant_billing_accounts_scoped_read",
  "billing_access_overrides_admin_read",
  "billing_audit_events_admin_read",
  "idx_restaurant_subscriptions_one_active_fixed"
]) {
  assert(migration.includes(token), `Billing migration is missing ${token}.`);
}

const publicConfig = await api(handleApiRequest, "GET", "/public/config");
assert(!containsSecret(publicConfig), "Public config must not expose Stripe or webhook secrets.");
assert(!JSON.stringify(publicConfig).includes("price_test_"), "Public config must not expose protected Stripe Price IDs.");

const adminSession = await api(handleApiRequest, "POST", "/auth/login", {
  email: TEST_ACCOUNTS.superadmin.email,
  password: TEST_ACCOUNTS.superadmin.password
});
const adminBilling = await api(handleApiRequest, "GET", "/admin/billing", {}, authHeaders(adminSession.access_token));
assert.equal(adminBilling.stripe.fixed_monthly_plans, true, "Admin billing diagnostics must confirm fixed monthly billing.");
assert.equal(adminBilling.stripe.test_mode_only, true, "Stripe billing must remain test-mode-only unless live billing is explicitly enabled in production.");
assert.equal(adminBilling.stripe.billing_environment, "test", "Default billing environment must be test.");
assert.equal(adminBilling.stripe.live_billing_enabled, false, "Live billing must be disabled by default.");
assert.equal(adminBilling.stripe.publishable_key_configured, true, "Stripe publishable key configuration should be reported without exposing its value.");
assert.equal(adminBilling.stripe.portal_configuration_configured, true, "Stripe portal configuration should be reported without exposing its value.");
assert.equal(adminBilling.stripe.trial_days, 14, "Server trial policy must use BILLING_DEFAULT_TRIAL_DAYS alias.");
assert.equal(adminBilling.stripe.grace_period_days, 7, "Grace policy must use BILLING_GRACE_PERIOD_DAYS alias.");
assert.equal(adminBilling.stripe.override_max_days, 30, "Override policy must use BILLING_OVERRIDE_MAX_DAYS.");
assert(!containsSecret(adminBilling), "Admin billing payload must not expose Stripe secrets or raw card data.");

console.log("Billing architecture checks passed.");
