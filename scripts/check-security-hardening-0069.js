import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const migrationFiles = (await readdir(new URL("supabase/migrations/", root)))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrationChain = (await Promise.all(
  migrationFiles.map((name) => read(`supabase/migrations/${name}`))
)).join("\n");
const hardening = await read("supabase/migrations/0069_security_hardening.sql");
const securityHeaders = await read("src/security-headers.js");
const vercelConfig = await read("vercel.json");
const indexHtml = await read("public/index.html");
const apiHandler = await read("api/index.js");
const server = await read("server.js");
const appCore = await read("src/app-core.js");
const envExample = await read(".env.example");
const publicApp = await read("public/app.js");

const createdTables = [...migrationChain.matchAll(/create table(?: if not exists)? public\.([a-z0-9_]+)/gi)]
  .map((match) => match[1]);
for (const table of new Set(createdTables)) {
  assert.match(
    migrationChain,
    new RegExp(`alter table(?: if exists)? public\\.${table} enable row level security`, "i"),
    `${table} must have RLS enabled in the canonical migration chain.`
  );
}

for (const relation of [
  "profiles",
  "reservations",
  "reservation_overview",
  "restaurant_reviews_overview",
  "admin_notifications_overview",
  "audit_logs",
  "payment_events",
  "subscriptions",
  "privacy_requests"
]) {
  assert(hardening.includes(`'${relation}'`), `${relation} must be converted to a server-only relation.`);
}

for (const rpc of [
  "admin_dashboard_stats",
  "restaurant_intelligence_summary",
  "create_reservation",
  "track_restaurant_view",
  "update_reservation_status"
]) {
  assert(hardening.includes(`'${rpc}'`), `${rpc} must be removed from the direct client RPC surface.`);
}

assert(hardening.includes("from public, anon, authenticated"), "Hardening must revoke inherited PUBLIC as well as Supabase client-role privileges.");
assert(hardening.includes("protect_profile_security_fields"), "Profile role and tenant fields must have a database-level mutation guard.");
assert(hardening.includes("new.role is distinct from old.role"), "The profile guard must protect role changes.");
assert(hardening.includes("new.restaurant_id is distinct from old.restaurant_id"), "The profile guard must protect tenant reassignment.");
assert(hardening.includes("auth.role() <> 'service_role' and not public.is_admin()"), "Admin aggregate RPC must authorize inside its SECURITY DEFINER body.");
assert(hardening.includes("alter default privileges in schema public"), "Future functions must not regain PUBLIC execute by default.");

assert(!securityHeaders.includes("script-src 'self' 'unsafe-inline'"), "Executable inline JavaScript must be removed from the CSP.");
assert(!vercelConfig.includes("script-src 'self' 'unsafe-inline'"), "Vercel CSP must not allow executable inline JavaScript.");
assert(!securityHeaders.includes("https://*.supabase.co"), "The browser CSP must not allow direct Supabase API connections.");
assert(!securityHeaders.includes("https://api.resend.com"), "The browser CSP must not allow direct Resend API connections.");
assert(indexHtml.includes("/theme-bootstrap.js"), "Theme bootstrap must load from a CSP-compatible external script.");
assert(indexHtml.includes("/analytics-bootstrap.js"), "Analytics bootstrap must load from a CSP-compatible external script.");
assert.equal((indexHtml.match(/<script>(?:.|\n)*?<\/script>/g) || []).length, 0, "The public shell must not contain executable inline script blocks.");
assert(apiHandler.includes("Invalid JSON request body."), "The Vercel adapter must reject malformed JSON instead of treating it as an empty object.");
assert(server.includes('error.status = 400'), "The local server adapter must classify malformed JSON as a safe client error.");
assert(!server.includes('error.message || "Server error."'), "HTTP error responses must not echo internal exception messages.");
assert(appCore.includes('if (IS_PRODUCTION_RUNTIME) {\n    throw Object.assign(new Error("Demo authentication is disabled.")'), "Production must reject demo-token issuance.");
assert(appCore.includes("if (IS_PRODUCTION_RUNTIME) return null;"), "Production must reject demo-token restoration.");
assert(!appCore.includes("SUPABASE_SERVICE_ROLE_KEY || IMPERSONATION_SECRET"), "Impersonation signing must not reuse the Supabase service-role key.");
assert(!appCore.includes('"smarttable-impersonation-secret"'), "Impersonation signing must not use a hardcoded fallback secret.");
assert(appCore.includes("IMPERSONATION_SECRET_MISSING_OR_WEAK"), "Production configuration must reject a missing or weak impersonation secret.");
assert(appCore.includes("ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS"), "Privileged sessions must have a shorter configurable maximum age.");
assert(appCore.includes("PRIVILEGED_REAUTH_REQUIRED"), "Expired privileged sessions must require re-authentication.");
assert(appCore.includes("ADMIN_MFA_REQUIRED") && appCore.includes("MFA_REQUIRED"), "Admin MFA enforcement must be configurable and fail closed when enabled.");
assert(publicApp.includes("function isPrivilegedWebSession"), "The web client must identify privileged sessions for stronger storage policy.");
assert(publicApp.includes("Privileged sessions must never survive a browser restart"), "Legacy persistent admin sessions must be removed.");
assert(publicApp.includes("isPrivilegedWebSession(state.session) || state.session.remember_me === false"), "Admin and superadmin sessions must remain session-scoped in the browser.");
for (const key of [
  "IMPERSONATION_SECRET=",
  "ADMIN_MFA_REQUIRED=false",
  "ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS=3600",
  "AUTH_LOGIN_RATE_LIMIT=10",
  "AUTH_RECOVERY_RATE_LIMIT=3",
  "RESERVATION_CREATE_RATE_LIMIT=20",
  "DISTRIBUTED_RATE_LIMIT_ENABLED=false",
  "DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED=true"
]) {
  assert(envExample.includes(key), `.env.example must document ${key.split("=")[0]} without a real secret.`);
}

const originalEnv = { ...process.env };
for (const key of Object.keys(process.env)) {
  if (key.startsWith("SUPABASE_") || key.startsWith("RESEND_") || key.startsWith("EMAIL_") || key.startsWith("API_") || key.startsWith("AUTH_")) {
    delete process.env[key];
  }
}
process.env.SMARTTABLE_ENV = "development";
process.env.PUBLIC_BASE_URL = "https://www.smarttablenyc.com";
process.env.IMPERSONATION_SECRET = "security-test-only-placeholder-secret-32";
process.env.AUTH_LOGIN_RATE_LIMIT = "2";
process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = "60000";
process.env.API_RATE_LIMIT_WINDOW_MS = "60000";

const core = await import(`../src/app-core.js?security-hardening-0069=${Date.now()}-${Math.random()}`);
const request = (method, path, body = {}, headers = {}) => core.handleApiRequest({
  method,
  url: `/api${path}`,
  body,
  headers
});

const unknownEmail = `does-not-exist-${Date.now()}@example.test`;
const unknownLogin = await request("POST", "/auth/login", { email: unknownEmail, password: "Wrong!Password1" }, { "x-forwarded-for": "198.51.100.10" });
const knownLoginWrongPassword = await request("POST", "/auth/login", { email: "guest@smarttable.com", password: "Wrong!Password1" }, { "x-forwarded-for": "198.51.100.11" });
assert.equal(unknownLogin.status, knownLoginWrongPassword.status, "Login status must not reveal whether an email exists.");
assert.equal(unknownLogin.body?.error, knownLoginWrongPassword.body?.error, "Login error copy must resist account enumeration.");

const rateHeaders = { "x-forwarded-for": "198.51.100.12", "user-agent": "SmartTable security regression" };
await request("POST", "/auth/login", { email: unknownEmail, password: "Wrong!Password1" }, rateHeaders);
await request("POST", "/auth/login", { email: unknownEmail, password: "Wrong!Password2" }, rateHeaders);
const limitedLogin = await request("POST", "/auth/login", { email: unknownEmail, password: "Wrong!Password3" }, rateHeaders);
assert.equal(limitedLogin.status, 429, "Repeated login attempts must be rate limited.");
assert.equal(limitedLogin.body?.code, "RATE_LIMITED", "Login abuse must return the generic rate-limit code.");

const manipulatedSignup = await request("POST", "/auth/signup-guest", {
  full_name: "Security Role Probe",
  email: `role-probe-${Date.now()}@example.test`,
  password: "Strong!Password1",
  confirm_password: "Strong!Password1",
  role: "super_admin",
  restaurant_id: "00000000-0000-0000-0000-000000000001",
  unexpected_privilege: true,
  transactional_email_consent: true,
  privacy_consent: true,
  terms_consent: true,
  notification_channels: ["Email"],
  notification_preferences: ["Reservation status updates"],
  preferred_neighborhoods: ["No preference"],
  account_creation_phase: true,
  preferred_language: "en"
}, { "x-forwarded-for": "198.51.100.13" });
assert.equal(manipulatedSignup.status, 201, "A valid guest signup must still succeed when harmless unknown fields are ignored.");
assert.equal(manipulatedSignup.body?.profile?.role, "guest", "Client-supplied role must never elevate a guest signup.");
assert.notEqual(manipulatedSignup.body?.profile?.restaurant_id, "00000000-0000-0000-0000-000000000001", "Client-supplied tenant binding must be ignored.");

const unexpectedReservationField = await request("POST", "/reservations", {
  reservation_type: "standard",
  restaurant_id: "00000000-0000-4000-8000-000000000001",
  reservation_date: "2099-12-31",
  reservation_time: "19:00",
  party_size: 2,
  guest_name: "Security Guest",
  guest_email: "security-guest@example.test",
  role: "super_admin"
}, { "x-forwarded-for": "198.51.100.15" });
assert.equal(unexpectedReservationField.status, 400, "Unexpected reservation fields must be rejected.");
assert.equal(unexpectedReservationField.body?.code, "UNEXPECTED_FIELD", "Unexpected reservation fields must use the safe validation code.");

const invalidUuidReservation = await request("POST", "/reservations", {
  reservation_type: "standard",
  restaurant_id: "not-a-uuid",
  reservation_date: "2099-12-31",
  reservation_time: "19:00",
  party_size: 2,
  guest_name: "Security Guest",
  guest_email: "security-guest@example.test"
}, { "x-forwarded-for": "198.51.100.16" });
assert.equal(invalidUuidReservation.status, 400, "Invalid reservation UUIDs must be rejected.");
assert.equal(invalidUuidReservation.body?.code, "INVALID_UUID", "Invalid UUIDs must use the safe validation code.");

const oversizedReservation = await request("POST", "/reservations", {
  reservation_type: "standard",
  restaurant_id: "00000000-0000-4000-8000-000000000001",
  reservation_date: "2099-12-31",
  reservation_time: "19:00",
  party_size: 2,
  guest_name: "Security Guest",
  guest_email: "security-guest@example.test",
  notes: "x".repeat(1001)
}, { "x-forwarded-for": "198.51.100.17" });
assert.equal(oversizedReservation.status, 400, "Oversized reservation input must be rejected.");
assert.equal(oversizedReservation.body?.code, "NOTES_TOO_LONG", "Oversized reservation notes must use the safe validation code.");

const maliciousReservation = await request("POST", "/reservations", {
  offer_id: "' OR 1=1; --",
  restaurant_id: "<script>alert(1)</script>",
  reservation_date: "2099-99-99",
  reservation_time: "99:99",
  party_size: -100,
  guest_name: "<img src=x onerror=alert(1)>",
  guest_email: "not-an-email",
  role: "super_admin"
}, { "x-forwarded-for": "198.51.100.14" });
assert(maliciousReservation.status >= 400, "Injection-style and invalid reservation input must be rejected.");
const maliciousResponse = JSON.stringify(maliciousReservation.body || {});
assert(!maliciousResponse.includes("<script>"), "Error responses must not reflect XSS payloads.");
assert(!maliciousResponse.includes("OR 1=1"), "Error responses must not reflect SQL-injection-style payloads.");

for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, originalEnv);

console.log(`Security hardening 0069 checks passed (${new Set(createdTables).size} RLS tables audited).`);
