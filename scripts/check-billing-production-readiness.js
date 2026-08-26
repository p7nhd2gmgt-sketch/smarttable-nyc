import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import "../src/env-loader.js";

const root = new URL("../", import.meta.url);

async function readProjectFile(relativePath) {
  return await readFile(new URL(relativePath, root), "utf8");
}

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function envFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function clean(value) {
  return String(value || "").trim();
}

function hasEnv(name) {
  return clean(process.env[name]) !== "";
}

function maskedStatus(name, validator = () => true) {
  const value = clean(process.env[name]);
  if (!value) return { name, present: false, valid: false };
  return { name, present: true, valid: validator(value) };
}

function assertEnv(name, validator, message) {
  const result = maskedStatus(name, validator);
  assert(result.present, `${name} must be configured.`);
  assert(result.valid, message || `${name} has an invalid format.`);
  return result;
}

function assertOptionalEnv(name, validator, message) {
  if (!hasEnv(name)) return { name, present: false, valid: true };
  return assertEnv(name, validator, message);
}

function printStatus(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`- ${row.name}: ${row.present ? "present" : "missing"} / ${row.valid ? "valid" : "invalid"}`);
  }
}

const target = argValue("target", clean(process.env.SMARTTABLE_BILLING_READINESS_TARGET) || "static").toLowerCase();
const requireLive = process.argv.includes("--require-live") || envFlag(process.env.SMARTTABLE_REQUIRE_LIVE_STRIPE_BILLING, false);
const productionTargets = new Set(["production", "prod", "live"]);
const stagingTargets = new Set(["staging", "preview", "test"]);
const isProductionTarget = productionTargets.has(target);
const isStagingTarget = stagingTargets.has(target);

const BILLING_ENV_KEYS = [
  "PUBLIC_BASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_BASIC_MONTHLY_PRICE_ID",
  "STRIPE_VIDEO_STANDARD_PRICE_ID",
  "STRIPE_VIDEO_PREMIUM_PRICE_ID",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "STRIPE_LIVE_BILLING_ENABLED",
  "BILLING_LIVE_ENABLED",
  "BILLING_ENFORCEMENT_MODE",
  "STRIPE_SELF_SERVICE_ENTERPRISE_ENABLED",
  "STRIPE_ENTERPRISE_SELF_SERVICE_ENABLED",
  "BILLING_DEFAULT_TRIAL_DAYS",
  "STRIPE_TRIAL_PERIOD_DAYS",
  "BILLING_GRACE_PERIOD_DAYS",
  "BILLING_PAYMENT_GRACE_PERIOD_DAYS",
  "BILLING_OVERRIDE_MAX_DAYS"
];

function parseEnvFile(source = "") {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readEnvFile(relativePath) {
  const filePath = new URL(relativePath, root);
  return existsSync(filePath) ? parseEnvFile(readFileSync(filePath, "utf8")) : {};
}

function loadProductionReadinessEnvironment() {
  const productionSnapshot = {
    ...readEnvFile(".env.vercel.production.local"),
    ...readEnvFile(".env.production.billing.local")
  };
  for (const key of BILLING_ENV_KEYS) {
    process.env[key] = productionSnapshot[key] ?? "";
  }
}

assert(["static", ...productionTargets, ...stagingTargets].includes(target), "Use --target=static, staging, preview, test, production, prod, or live.");

if (isProductionTarget) loadProductionReadinessEnvironment();

const [appCore, publicApp, envExample, billingCheck, subscriptionCheck] = await Promise.all([
  readProjectFile("src/app-core.js"),
  readProjectFile("public/app.js"),
  readProjectFile(".env.example"),
  readProjectFile("scripts/check-billing.js"),
  readProjectFile("scripts/check-subscription-access.js")
]);

for (const token of [
  "stripeLiveModeActive",
  "STRIPE_LIVE_BILLING_ENABLED",
  "stripeSecretMode === \"test\" || stripeLiveModeActive",
  "verifyStripeWebhookSignature",
  "STRIPE_BASIC_MONTHLY_PRICE_ID",
  "STRIPE_VIDEO_STANDARD_PRICE_ID",
  "STRIPE_VIDEO_PREMIUM_PRICE_ID",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "safePartnerBillingUrl",
  "subscription_data",
  "mode: \"subscription\"",
  "billing_environment"
]) {
  assert(appCore.includes(token), `Billing backend is missing safety evidence: ${token}`);
}

for (const token of [
  "Checkout success redirect alone must not activate billing access",
  "Authorized owner should create Checkout",
  "Signed subscription webhook must activate access",
  "Customer Portal configuration must come from the server environment",
  "Active restaurants must not create duplicate active subscriptions"
]) {
  assert(subscriptionCheck.includes(token), `Subscription access checks are missing evidence: ${token}`);
}

for (const token of [
  "Frontend must not reference STRIPE_SECRET_KEY",
  "Admin billing payload must not expose Stripe secrets",
  "Billing architecture checks passed"
]) {
  assert(billingCheck.includes(token), `Billing checks are missing evidence: ${token}`);
}

assert(!/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|STRIPE_BASIC_MONTHLY_PRICE_ID|STRIPE_VIDEO_STANDARD_PRICE_ID|STRIPE_VIDEO_PREMIUM_PRICE_ID/.test(publicApp), "Public app must not reference protected Stripe environment variables.");
assert(!/stripe\s+connect/i.test(appCore + envExample), "SmartTable BASIC fixed monthly billing must not introduce Stripe Connect.");
assert(!/raw\s+card|card_number|cvc|exp_month|exp_year/i.test(appCore), "SmartTable must not handle raw card data.");

if (target === "static") {
  console.log("Billing production-readiness static checks passed.");
  console.log("Run `node scripts/check-billing-production-readiness.js --target=production --require-live` with protected production environment variables before enabling live partner billing.");
  process.exit(0);
}

const baseUrl = clean(process.env.PUBLIC_BASE_URL);
const baseUrlIsProduction = /^https:\/\/(www\.)?smarttablenyc\.com\/?$/.test(baseUrl);
const baseUrlIsNonProduction = /^https:\/\/.+/.test(baseUrl) && !baseUrlIsProduction;

const statuses = [
  assertEnv("PUBLIC_BASE_URL", (value) => isProductionTarget ? /^https:\/\/www\.smarttablenyc\.com\/?$/.test(value) : /^https:\/\//.test(value), isProductionTarget ? "PUBLIC_BASE_URL must be https://www.smarttablenyc.com for production." : "PUBLIC_BASE_URL must be an HTTPS URL."),
  assertEnv("STRIPE_SECRET_KEY", (value) => isProductionTarget ? value.startsWith("sk_live_") : value.startsWith("sk_test_"), isProductionTarget ? "Production must use a live Stripe secret key." : "Non-production must use a Stripe test secret key."),
  assertEnv("STRIPE_PUBLISHABLE_KEY", (value) => isProductionTarget ? value.startsWith("pk_live_") : value.startsWith("pk_test_"), isProductionTarget ? "Production must use a live Stripe publishable key." : "Non-production must use a Stripe test publishable key."),
  assertEnv("STRIPE_WEBHOOK_SECRET", (value) => value.startsWith("whsec_"), "STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret."),
  assertEnv("STRIPE_BASIC_MONTHLY_PRICE_ID", (value) => value.startsWith("price_"), "Basic monthly Stripe Price ID must start with price_."),
  assertEnv("STRIPE_VIDEO_STANDARD_PRICE_ID", (value) => value.startsWith("price_"), "Standard video package Stripe Price ID must start with price_."),
  assertEnv("STRIPE_VIDEO_PREMIUM_PRICE_ID", (value) => value.startsWith("price_"), "Premium video package Stripe Price ID must start with price_."),
  assertEnv("STRIPE_PORTAL_CONFIGURATION_ID", (value) => value.startsWith("bpc_"), "Stripe Customer Portal configuration ID must start with bpc_.")
];

const liveBillingEnabled = envFlag(process.env.STRIPE_LIVE_BILLING_ENABLED ?? process.env.BILLING_LIVE_ENABLED, false);
const enforcementMode = clean(process.env.BILLING_ENFORCEMENT_MODE || "warn").toLowerCase();
const enterpriseSelfService = envFlag(process.env.STRIPE_SELF_SERVICE_ENTERPRISE_ENABLED ?? process.env.STRIPE_ENTERPRISE_SELF_SERVICE_ENABLED, false);

if (isProductionTarget) {
  assert(baseUrlIsProduction, "Production billing must use the canonical www.smarttablenyc.com base URL.");
  assert(liveBillingEnabled, "Production live billing requires STRIPE_LIVE_BILLING_ENABLED=true.");
  assert(["strict", "warn"].includes(enforcementMode), "Production billing enforcement must be strict or warn.");
  if (requireLive) assert.equal(enforcementMode, "strict", "Production launch gate requires BILLING_ENFORCEMENT_MODE=strict.");
  assert(!enterpriseSelfService, "The launch catalog has one $149 monthly plan; Enterprise self-service must remain disabled.");
}

if (isStagingTarget) {
  assert(!baseUrlIsProduction || target === "staging", "Preview/test billing should not point at the production public base URL unless this is the official staging gate.");
  assert(!liveBillingEnabled, "Staging/test billing must keep STRIPE_LIVE_BILLING_ENABLED=false.");
  assert(!clean(process.env.STRIPE_SECRET_KEY).startsWith("sk_live_"), "Staging/test must not use a live Stripe secret key.");
  assert(!clean(process.env.STRIPE_PUBLISHABLE_KEY).startsWith("pk_live_"), "Staging/test must not use a live Stripe publishable key.");
  assert(baseUrlIsNonProduction || target === "staging", "Staging/test should use an HTTPS non-production base URL where possible.");
}

const trialDays = Number(process.env.BILLING_DEFAULT_TRIAL_DAYS ?? process.env.STRIPE_TRIAL_PERIOD_DAYS ?? 0);
const graceDays = Number(process.env.BILLING_GRACE_PERIOD_DAYS ?? process.env.BILLING_PAYMENT_GRACE_PERIOD_DAYS ?? 7);
const overrideDays = Number(process.env.BILLING_OVERRIDE_MAX_DAYS ?? 90);
assert(Number.isFinite(trialDays) && trialDays >= 0 && trialDays <= 365, "Billing trial days must be between 0 and 365.");
assert(Number.isFinite(graceDays) && graceDays >= 0 && graceDays <= 90, "Billing grace period must be between 0 and 90 days.");
assert(Number.isFinite(overrideDays) && overrideDays >= 1 && overrideDays <= 365, "Billing override max days must be between 1 and 365.");

printStatus(`Billing ${target} configuration readiness`, statuses);
console.log(`- STRIPE_LIVE_BILLING_ENABLED: ${liveBillingEnabled ? "enabled" : "disabled"}`);
console.log(`- BILLING_ENFORCEMENT_MODE: ${enforcementMode || "unset"}`);
console.log(`- Enterprise self-service: ${enterpriseSelfService ? "enabled" : "disabled"}`);
console.log("Billing production-readiness environment checks passed.");
