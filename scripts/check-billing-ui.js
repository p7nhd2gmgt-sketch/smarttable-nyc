import assert from "node:assert/strict";
import { readRepoFile } from "./billing-check-helpers.mjs";

const [publicApp, en, es, hu] = await Promise.all([
  readRepoFile("public/app.js"),
  readRepoFile("public/locales/en.json").then(JSON.parse),
  readRepoFile("public/locales/es.json").then(JSON.parse),
  readRepoFile("public/locales/hu.json").then(JSON.parse)
]);

for (const token of [
  "partnerBillingPanel",
  "billingFeatureList",
  "billingPaymentMethodSummary",
  "billingPlanUnavailableReason",
  "data-partner-billing-action",
  "runPartnerBillingAction",
  "billingFoundationPanel",
  "runAdminBillingAction",
  "data-admin-billing-action",
  "billingMaskedRef",
  "billingSubscriptionMatchesFilter",
  "billing_retry_payment_button",
  "billing_diagnostics_summary"
]) {
  assert(publicApp.includes(token), `Billing UI is missing ${token}.`);
}

assert(publicApp.includes("subscription.stripe_customer_id") && publicApp.includes("billingMaskedRef"), "Stripe references must be masked in admin diagnostics.");
const partnerPanelStart = publicApp.indexOf("function partnerBillingPanel");
const partnerPanelEnd = publicApp.indexOf("function renderPartner", partnerPanelStart);
const partnerPanelSource = publicApp.slice(partnerPanelStart, partnerPanelEnd > partnerPanelStart ? partnerPanelEnd : partnerPanelStart + 4000);
assert(!partnerPanelSource.includes("billingMaskedRef"), "Partner Billing panel must not render restricted Stripe diagnostics.");
assert(!partnerPanelSource.includes("<dt>Customer"), "Partner Billing panel must not display Stripe Customer references.");
assert(!partnerPanelSource.includes("<dt>Subscription"), "Partner Billing panel must not display Stripe Subscription references.");
assert(!/card_number|cardNumber|cvc|security_code|full_card/i.test(publicApp), "Billing UI must not render raw card number or CVC fields.");
assert(!/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|STRIPE_BASIC_MONTHLY_PRICE_ID|STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID|STRIPE_ENTERPRISE_MONTHLY_PRICE_ID|STRIPE_VIDEO_STANDARD_PRICE_ID|STRIPE_VIDEO_PREMIUM_PRICE_ID/.test(publicApp), "Billing UI must not reference protected Stripe environment variables.");
assert(publicApp.includes('item.internal_name === "basic"'), "Partner Billing must expose only the launch $149 monthly plan.");
assert(publicApp.includes("data.video_packages"), "Partner Billing must render server-provided video packages.");
assert(publicApp.includes('api("/partner/billing"'), "Partner Billing actions must call the server endpoint.");
assert(publicApp.includes('api("/admin/billing"'), "Admin Billing actions must call the server endpoint.");
assert(publicApp.includes("restaurant_id: restaurantId"), "Partner Billing mutations must send the selected server-authorized restaurant_id.");
assert(publicApp.includes("data-restaurant-id="), "Partner Billing action buttons must carry the current restaurant ID for explicit server scoping.");
assert(publicApp.includes("billingPlanUnavailableReason(item, stripe)"), "Partner Billing plan cards must explain disabled checkout states.");
assert(!/localStorage\.[^(]*\([^)]*subscription_status/i.test(publicApp), "Browser must not store subscription status as an authorization source.");
assert(!/data-admin-billing-action="correct_billing_plan"[\s\S]{0,200}state\.profile\.role !== "super_admin"/.test(publicApp), "Superadmin-only controls should stay visually gated.");

const requiredKeys = [
  "partner_nav_billing",
  "partner_billing_title",
  "partner_billing_past_due_warning",
  "partner_billing_read_only_notice",
  "billing_current_plan",
  "billing_subscription_status",
  "billing_monthly_interval",
  "billing_trial_expiration",
  "billing_current_period",
  "billing_next_payment",
  "billing_cancel_at_period_end",
  "billing_grace_period",
  "billing_last_invoice",
  "billing_payment_status",
  "billing_payment_method",
  "billing_email_label",
  "billing_available_entitlements",
  "billing_available_plans",
  "billing_per_month",
  "billing_partner_plan_description",
  "billing_no_additional_fees",
  "billing_video_packages_title",
  "billing_video_packages_intro",
  "billing_one_time",
  "billing_buy_video_package",
  "billing_video_price_not_configured",
  "package_label",
  "billing_video_orders_admin_title",
  "billing_no_video_orders",
  "billing_plan_not_self_service",
  "billing_stripe_setup_required_short",
  "billing_price_id_required_short",
  "billing_start_subscription_button",
  "billing_upgrade_button",
  "billing_manage_button",
  "billing_retry_payment_button",
  "admin_nav_billing",
  "admin_billing_title",
  "billing_filter_label",
  "billing_filter_active",
  "billing_filter_trialing",
  "billing_filter_past_due",
  "billing_filter_unpaid",
  "billing_filter_canceled",
  "billing_filter_incomplete",
  "billing_filter_no_subscription",
  "billing_filter_complimentary_test",
  "billing_filter_override_active",
  "billing_filter_grace_active",
  "billing_filter_payment_failed",
  "billing_extend_trial_button",
  "billing_grant_override_button",
  "billing_remove_override_button",
  "billing_resend_email_button",
  "billing_correct_plan_button",
  "billing_enterprise_contract_button",
  "billing_reconcile_button",
  "billing_feature_core_profile",
  "billing_feature_offers",
  "billing_feature_reservations",
  "billing_feature_standard_email",
  "billing_feature_basic_analytics",
  "billing_feature_advanced_analytics",
  "billing_feature_campaign_placeholders",
  "billing_feature_priority_support",
  "billing_feature_multi_location",
  "billing_feature_custom_limits",
  "billing_feature_dedicated_support"
];

for (const [locale, messages] of Object.entries({ en, es, hu })) {
  for (const key of requiredKeys) {
    assert(typeof messages[key] === "string" && messages[key].trim(), `${locale}.json must define ${key}.`);
  }
}

console.log("Billing UI checks passed.");
