import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function readProjectFile(relativePath) {
  return await readFile(new URL(relativePath, root), "utf8");
}

const [
  appCore,
  server,
  browserApp,
  indexHtml,
  robotsTxt,
  sitemapXml
] = await Promise.all([
  readProjectFile("src/app-core.js"),
  readProjectFile("server.js"),
  readProjectFile("public/app.js"),
  readProjectFile("public/index.html"),
  readProjectFile("public/robots.txt"),
  readProjectFile("public/sitemap.xml")
]);

assert(appCore.includes("SUPABASE_REQUEST_TIMEOUT_MS"), "Supabase API calls must use a bounded request timeout.");
assert(appCore.includes("UPSTREAM_TIMEOUT"), "Timed-out upstream calls must return a safe error code.");
assert(appCore.includes("database_reachable"), "Health checks must report database reachability separately from configuration.");
assert(appCore.includes("logSafeServerEvent"), "Server errors must be logged through a safe structured logger.");
assert(appCore.includes("PUBLIC_BASE_URL_DEPRECATED_DOMAIN"), "Production preflight must reject deprecated public base domains.");
assert(appCore.includes("const RAW_PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL || \"\")"), "Public base URL must be centralized through PUBLIC_BASE_URL/PUBLIC_SITE_URL.");
assert(appCore.includes("public_base_url: PUBLIC_BASE_URL"), "Public config must expose the safe configured base URL for client metadata.");
assert(server.includes("process.env.PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL"), "Server SEO routes must use centralized public base URL configuration.");
assert(!server.includes("vercel.app"), "Runtime server code must not hardcode a Vercel deployment URL.");
assert(!appCore.includes("vercel.app"), "Backend link generation must not hardcode a Vercel deployment URL.");

assert(!browserApp.includes("SUPABASE_SERVICE_ROLE_KEY"), "The browser bundle must not reference the Supabase service-role key.");
assert(!browserApp.includes("RESEND_API_KEY"), "The browser bundle must not reference the Resend API key.");
assert(!browserApp.includes("RESEND_WEBHOOK_SECRET"), "The browser bundle must not reference the Resend webhook secret.");
assert(!browserApp.includes("dangerouslySetInnerHTML"), "The browser app must not use dangerous raw HTML rendering.");
assert(browserApp.includes("escapeHtml("), "The browser app must retain HTML escaping helpers.");
assert(browserApp.includes("escapeAttr("), "The browser app must retain attribute escaping helpers.");
assert(browserApp.includes("SmartTable home"), "Public brand fallback text must not use old domain-branded copy.");
assert(browserApp.includes("SmartTable serves New York restaurants and guests."), "Public footer fallback text must not use old domain-branded copy.");
assert(browserApp.includes("adminNav.hidden = !isAdminRole(state.session?.profile?.role)"), "Super Admin navigation must stay hidden from public production users.");
assert(browserApp.includes("restaurantNav.hidden = normalizeRole(state.session?.profile?.role) !== \"partner\""), "Partner access must remain available only through the intended authenticated partner navigation path.");
assert(browserApp.includes("if (state.session && isSessionExpired(state.session))"), "Expired client sessions must be detected.");
assert(browserApp.includes("else if (state.mode === \"guest\") renderGuestLogin();"), "Expired guest sessions must show the login form instead of protected content.");
assert(browserApp.includes("showToast(t(\"session_expired_message\""), "Expired sessions must show a localized user-facing message.");
assert(browserApp.includes("function publicBaseUrl()"), "Client metadata must use a centralized public base URL helper.");
assert(browserApp.includes("state.config?.public_base_url"), "Client metadata must read the configured public base URL from backend public config.");
assert(browserApp.includes("const canonical = `${publicBaseUrl()}"), "Client canonical URLs must not be tied to one deployment host.");

for (const emailLinkToken of [
  "login_url: `${PUBLIC_BASE_URL}/login`",
  "marketplace_url: PUBLIC_BASE_URL",
  "`${PUBLIC_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`",
  "`${PUBLIC_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`",
  "account_url: `${PUBLIC_BASE_URL}/account/security`",
  "my_reservations_url: `${PUBLIC_BASE_URL}/account/reservations`"
]) {
  assert(appCore.includes(emailLinkToken), `Email/account links must be built from PUBLIC_BASE_URL: ${emailLinkToken}`);
}
assert(!appCore.includes("http://localhost:4173/reset-password"), "Password-reset email links must not hardcode localhost.");
assert(!appCore.includes("http://localhost:4173/verify-email"), "Verification email links must not hardcode localhost.");

for (const privatePrefix of [
  "/admin",
  "/partner",
  "/restaurant",
  "/account",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/ai",
  "/ai-concierge",
  "/ai-preferences",
  "/partner-ai-demand",
  "/admin-ai-controls"
]) {
  assert(server.includes(`"${privatePrefix}"`), `Server-side SEO must noindex ${privatePrefix}.`);
  assert(browserApp.includes(`"${privatePrefix}"`), `Client-side SEO must noindex ${privatePrefix}.`);
  assert(robotsTxt.includes(`Disallow: ${privatePrefix}`), `robots.txt must disallow ${privatePrefix}.`);
}

assert(indexHtml.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'), "The public shell must include a favicon.");
assert(indexHtml.includes("https://smarttablenyc.com/"), "The public shell must use the SmartTable NYC canonical domain.");
assert(!indexHtml.includes("https://smarttable.com"), "The public shell must not use the old smarttable.com canonical domain.");
assert(!indexHtml.includes("Smarttable.com"), "The public shell must not render old domain-branded text.");
assert(sitemapXml.includes("https://smarttablenyc.com/"), "The sitemap must use the SmartTable NYC canonical domain.");
assert(!sitemapXml.includes("https://smarttable.com"), "The sitemap must not use the old smarttable.com canonical domain.");
assert(robotsTxt.includes("Sitemap: https://smarttablenyc.com/sitemap.xml"), "robots.txt must point to the SmartTable NYC sitemap.");

const originalEnv = { ...process.env };
for (const key of Object.keys(process.env)) {
  if (key.startsWith("SUPABASE_") || key.startsWith("RESEND_") || key.startsWith("EMAIL_") || key === "PUBLIC_BASE_URL" || key === "PUBLIC_SITE_URL" || key === "SMARTTABLE_ENV" || key === "APP_ENV" || key === "VERCEL_ENV" || key === "NODE_ENV") {
    delete process.env[key];
  }
}
process.env.SMARTTABLE_ENV = "development";
process.env.PUBLIC_BASE_URL = "https://smarttablenyc.com";

const core = await import(`../src/app-core.js?basic-security-hardening=${Date.now()}-${Math.random()}`);
const health = await core.handleApiRequest({
  method: "GET",
  url: "/api/health",
  headers: {},
  body: {}
});
assert.equal(health.status, 200, "Development health should remain available without Supabase.");
assert.equal(health.body.database_reachable, false, "Development health should truthfully report no database reachability when Supabase is not configured.");
assert(!JSON.stringify(health.body).match(/service-role|RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|WEBHOOK_SECRET/i), "Health responses must not expose secrets or secret variable names.");

const publicConfig = await core.handleApiRequest({
  method: "GET",
  url: "/api/public/config",
  headers: {},
  body: {}
});
assert.equal(publicConfig.status, 200, "Public configuration must remain available.");
assert(!JSON.stringify(publicConfig.body).match(/RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|RESEND_WEBHOOK_SECRET|authorization/i), "Public configuration must not expose privileged configuration.");

const malformedReservation = await core.handleApiRequest({
  method: "POST",
  url: "/api/reservations",
  headers: {},
  body: {
    offer_id: "<script>alert(1)</script>",
    reservation_date: "not-a-date",
    reservation_time: "25:99",
    party_size: -2,
    guest_name: "<img src=x onerror=alert(1)>",
    guest_email: "not-an-email",
    guest_phone: "bad"
  }
});
assert(malformedReservation.status >= 400, "Malformed unauthenticated reservation attempts must fail.");
assert(!JSON.stringify(malformedReservation.body).includes("<script>"), "Reservation error responses must not echo malicious input.");

for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, originalEnv);

console.log("BASIC security, observability, and SEO hardening checks passed.");
