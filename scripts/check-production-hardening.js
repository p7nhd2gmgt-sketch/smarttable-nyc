import assert from "node:assert/strict";
import { createEmailService, isEmailAccepted } from "../src/email-service.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function resetEnv(overrides = {}) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("SUPABASE_") || key.startsWith("RESEND_") || key.startsWith("EMAIL_") || key === "PUBLIC_BASE_URL" || key === "PUBLIC_SITE_URL" || key === "SMARTTABLE_ENV" || key === "APP_ENV" || key === "VERCEL_ENV" || key === "NODE_ENV") {
      delete process.env[key];
    }
  }
  Object.assign(process.env, overrides);
}

async function importCore(label) {
  return await import(`../src/app-core.js?production-hardening=${label}-${Date.now()}-${Math.random()}`);
}

async function rawApi(core, method, path, body = {}, headers = {}) {
  return await core.handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
}

resetEnv({
  SMARTTABLE_ENV: "production",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  PUBLIC_BASE_URL: "",
  EMAIL_FROM: "",
  RESEND_API_KEY: ""
});
const missingCore = await importCore("missing-config");
const missingHealth = await rawApi(missingCore, "GET", "/health");
assert.equal(missingHealth.status, 503, "Production health must fail safely when mandatory configuration is missing.");
assert.equal(missingHealth.body.mode, "configuration_error");
assert.equal(missingHealth.body.webhook_status, "deferred");
assert(missingHealth.body.production_configuration_issues.includes("SUPABASE_CONFIGURATION_MISSING"));
assert(missingHealth.body.production_configuration_issues.includes("PUBLIC_BASE_URL_MISSING"));
assert(missingHealth.body.production_configuration_issues.includes("EMAIL_FROM_MISSING"));
assert(missingHealth.body.production_configuration_issues.includes("RESEND_API_KEY_MISSING"));

const blockedPublic = await rawApi(missingCore, "GET", "/public/offers");
assert.equal(blockedPublic.status, 503, "Production API must not fall back to demo data when mandatory configuration is missing.");
assert.equal(blockedPublic.body.code, "PRODUCTION_CONFIGURATION_INCOMPLETE");
assert(!JSON.stringify(blockedPublic.body).includes("SUPABASE_SERVICE_ROLE_KEY"), "Production config failure response must not expose secret variable names.");

resetEnv({
  SMARTTABLE_ENV: "development",
  VERCEL_ENV: "production",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  PUBLIC_BASE_URL: "",
  EMAIL_FROM: "",
  RESEND_API_KEY: ""
});
const vercelProductionCore = await importCore("vercel-production-wins");
const vercelProductionHealth = await rawApi(vercelProductionCore, "GET", "/health");
assert.equal(vercelProductionHealth.status, 503, "Vercel production must not be downgraded to development by SMARTTABLE_ENV.");
assert.equal(vercelProductionHealth.body.environment, "production");
assert.equal(vercelProductionHealth.body.mode, "configuration_error");

resetEnv({
  SMARTTABLE_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PUBLIC_BASE_URL: "http://localhost:4173",
  EMAIL_FROM: "SmartTable <reservations@mail.smarttablenyc.com>",
  RESEND_API_KEY: "test-resend-key"
});
globalThis.fetch = async (url) => {
  if (String(url).includes("example.supabase.co")) {
    return {
      ok: true,
      status: 200,
      text: async () => "[]"
    };
  }
  return originalFetch(url);
};
const localhostCore = await importCore("localhost-base-url");
const localhostHealth = await rawApi(localhostCore, "GET", "/health");
assert.equal(localhostHealth.status, 503, "Production health must fail when PUBLIC_BASE_URL points to localhost.");
assert(localhostHealth.body.production_configuration_issues.includes("PUBLIC_BASE_URL_LOCALHOST"));
assert.equal(localhostHealth.body.database_reachable, true, "Health should report a reachable mocked database separately from configuration failures.");

resetEnv({
  SMARTTABLE_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PUBLIC_BASE_URL: "https://smarttable.com",
  EMAIL_FROM: "SmartTable <reservations@mail.smarttablenyc.com>",
  RESEND_API_KEY: "test-resend-key"
});
const deprecatedDomainCore = await importCore("deprecated-public-domain");
const deprecatedDomainHealth = await rawApi(deprecatedDomainCore, "GET", "/health");
assert.equal(deprecatedDomainHealth.status, 503, "Production health must fail when PUBLIC_BASE_URL uses the deprecated smarttable.com domain.");
assert(deprecatedDomainHealth.body.production_configuration_issues.includes("PUBLIC_BASE_URL_DEPRECATED_DOMAIN"));

resetEnv({
  SMARTTABLE_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PUBLIC_BASE_URL: "https://smarttablenyc.com",
  EMAIL_FROM: "SmartTable <noreply@smarttable.com>",
  RESEND_API_KEY: "test-resend-key"
});
const unexpectedSenderCore = await importCore("unexpected-sender");
const unexpectedSenderHealth = await rawApi(unexpectedSenderCore, "GET", "/health");
assert.equal(unexpectedSenderHealth.status, 503, "Production health must fail when EMAIL_FROM is not the approved SmartTable SMTP sender.");
assert(unexpectedSenderHealth.body.production_configuration_issues.includes("EMAIL_FROM_UNEXPECTED_SENDER"));

resetEnv({
  SMARTTABLE_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PUBLIC_BASE_URL: "https://smarttablenyc.com",
  EMAIL_FROM: "SmartTable <reservations@mail.smarttablenyc.com>",
  RESEND_API_KEY: "test-resend-key"
});
const configuredCore = await importCore("configured");
const configuredHealth = await rawApi(configuredCore, "GET", "/health");
assert.equal(configuredHealth.status, 200, "Configured production health should pass.");
assert.equal(configuredHealth.body.environment, "production");
assert.equal(configuredHealth.body.mode, "supabase");
assert.equal(configuredHealth.body.status, "ok");
assert.equal(configuredHealth.body.database_reachable, true);
assert.equal(configuredHealth.body.platform_mode_default, "basic");
assert.equal(configuredHealth.body.public_base_url_uses_localhost, false);

globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes("public_restaurant_cards")) {
    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({
        code: "PGRST205",
        message: "Could not find the table 'public.public_restaurant_cards' in the schema cache"
      })
    };
  }
  if (target.includes("example.supabase.co")) {
    return {
      ok: true,
      status: 200,
      text: async () => "[]"
    };
  }
  return originalFetch(url);
};
const missingNewestViewCore = await importCore("missing-newest-view");
const newestRestaurants = await rawApi(missingNewestViewCore, "GET", "/public/restaurants/newest?lang=en");
assert.equal(newestRestaurants.status, 200, "Missing optional newest-restaurants view must not break the public homepage.");
assert.deepEqual(newestRestaurants.body.restaurants, [], "Missing optional newest-restaurants view should render as an empty section.");

resetEnv({
  SMARTTABLE_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_test_key",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_key",
  PUBLIC_BASE_URL: "https://smarttablenyc.com",
  EMAIL_FROM: "SmartTable <reservations@mail.smarttablenyc.com>",
  RESEND_API_KEY: "test-resend-key"
});
let secretKeyRequestHeaders = null;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes("example.supabase.co")) {
    secretKeyRequestHeaders = options.headers || {};
    return {
      ok: true,
      status: 200,
      text: async () => "[]"
    };
  }
  return originalFetch(url, options);
};
const secretKeyCore = await importCore("supabase-secret-key-headers");
const secretKeyHealth = await rawApi(secretKeyCore, "GET", "/health");
assert.equal(secretKeyHealth.status, 200, "Supabase secret keys should support production health checks.");
assert.equal(secretKeyRequestHeaders.apikey, "sb_secret_test_key", "Supabase secret keys must be sent as apikey.");
assert(!("authorization" in secretKeyRequestHeaders), "Opaque Supabase secret keys must not be sent as Bearer JWTs.");

globalThis.fetch = async (url) => {
  if (String(url).includes("example.supabase.co")) {
    throw Object.assign(new Error("network down"), { code: "NETWORK_DOWN" });
  }
  return originalFetch(url);
};
const unreachableCore = await importCore("supabase-unreachable");
const unreachableHealth = await rawApi(unreachableCore, "GET", "/health");
assert.equal(unreachableHealth.status, 503, "Production health must fail when Supabase cannot be reached.");
assert.equal(unreachableHealth.body.database_reachable, false);
assert.equal(unreachableHealth.body.status, "degraded");
assert(!JSON.stringify(unreachableHealth.body).includes("service-role-key"), "Health must not expose Supabase credentials.");

const restrictedPreview = createEmailService({
  resendApiKey: "test-key",
  defaultFrom: "SmartTable <reservations@mail.smarttablenyc.com>",
  environment: "preview",
  enforceRecipientAllowlist: true,
  recipientAllowlist: ["allowed@example.com"],
  diagnosticLogging: false,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: "resend-allowed-preview" })
  })
});
const blockedPreviewEmail = await restrictedPreview.sendEmail({
  to: "unapproved@example.com",
  subject: "Preview restricted",
  text: "Preview real sending must be allowlisted."
});
assert.equal(blockedPreviewEmail.accepted, false);
assert.equal(blockedPreviewEmail.errorCode, "EMAIL_RECIPIENT_NOT_ALLOWED_NON_PRODUCTION");

const allowedPreviewEmail = await restrictedPreview.sendEmail({
  to: "allowed@example.com",
  subject: "Preview allowed",
  text: "Preview real sending is allowlisted."
});
assert.equal(isEmailAccepted(allowedPreviewEmail), true);

let productionFetchCalled = false;
const productionEmail = createEmailService({
  resendApiKey: "test-key",
  defaultFrom: "SmartTable <reservations@mail.smarttablenyc.com>",
  environment: "production",
  diagnosticLogging: false,
  fetchImpl: async () => {
    productionFetchCalled = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "should-not-send" })
    };
  }
});
const exampleTldEmail = await productionEmail.sendEmail({
  to: "guest@test.example",
  subject: "Blocked production recipient",
  text: "Reserved test TLD recipients must not receive production email."
});
assert.equal(exampleTldEmail.accepted, false);
assert.equal(exampleTldEmail.errorCode, "EMAIL_RECIPIENT_EXAMPLE_BLOCKED_PRODUCTION");
assert.equal(productionFetchCalled, false, "Production .example recipient must be blocked before the provider request.");

for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, originalEnv);
globalThis.fetch = originalFetch;
console.log("Production environment and email hardening checks passed.");
