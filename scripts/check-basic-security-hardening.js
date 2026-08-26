import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

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

assert(server.includes("strictSecurityHeaders"), "Local server must apply shared strict security headers.");
assert(server.includes("MAX_JSON_BODY_BYTES"), "Local server must enforce request-size limits.");
assert(appCore.includes("strictSecurityHeaders"), "API JSON responses must include strict security headers.");
assert(appCore.includes("csrfOriginError"), "Unsafe API requests must validate browser Origin/Referer to mitigate CSRF.");
assert(appCore.includes("mutationRateLimit"), "Unsafe API requests must use a centralized mutation rate limit.");
assert(appCore.includes("isPlausibleAuthToken"), "Bearer tokens must be shape-validated before auth provider calls.");
assert(appCore.includes("REQUEST_TOO_LARGE"), "Oversized API payloads must return a precise safe error code.");
assert(appCore.includes("CSRF_ORIGIN_FORBIDDEN"), "CSRF origin failures must return a precise safe error code.");
assert(appCore.includes("RATE_LIMITED"), "Rate-limit failures must return a precise safe error code.");
assert((await readProjectFile("api/index.js")).includes("strictSecurityHeaders"), "Vercel API handler must apply shared strict security headers.");
assert((await readProjectFile("api/index.js")).includes("MAX_JSON_BODY_BYTES"), "Vercel API handler must enforce request-size limits.");
assert((await readProjectFile("vercel.json")).includes("Content-Security-Policy"), "Vercel deployment must apply CSP headers.");
assert((await readProjectFile("vercel.json")).includes("Strict-Transport-Security"), "Vercel deployment must apply HSTS headers.");

assert(appCore.includes("SUPABASE_REQUEST_TIMEOUT_MS"), "Supabase API calls must use a bounded request timeout.");
assert(appCore.includes("UPSTREAM_TIMEOUT"), "Timed-out upstream calls must return a safe error code.");
assert(appCore.includes("database_reachable"), "Health checks must report database reachability separately from configuration.");
assert(appCore.includes("logSafeServerEvent"), "Server errors must be logged through a safe structured logger.");
assert(appCore.includes("PUBLIC_BASE_URL_DEPRECATED_DOMAIN"), "Production preflight must reject deprecated public base domains.");
assert(appCore.includes("const RAW_PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL || \"\")"), "Public base URL must be centralized through PUBLIC_BASE_URL/PUBLIC_SITE_URL.");
assert(appCore.includes("public_base_url: PUBLIC_BASE_URL"), "Public config must expose the safe configured base URL for client metadata.");
assert(!appCore.includes("metadata: { guest_email: guestEmail }"), "Guest follow events must not duplicate email addresses into interaction metadata.");
assert(server.includes("process.env.PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL"), "Server SEO routes must use centralized public base URL configuration.");
assert(!server.includes("vercel.app"), "Runtime server code must not hardcode a Vercel deployment URL.");
assert(!appCore.includes("vercel.app"), "Backend link generation must not hardcode a Vercel deployment URL.");

assert(!browserApp.includes("SUPABASE_SERVICE_ROLE_KEY"), "The browser bundle must not reference the Supabase service-role key.");
assert(!browserApp.includes("RESEND_API_KEY"), "The browser bundle must not reference the Resend API key.");
assert(!browserApp.includes("RESEND_WEBHOOK_SECRET"), "The browser bundle must not reference the Resend webhook secret.");
assert(!browserApp.includes("dangerouslySetInnerHTML"), "The browser app must not use dangerous raw HTML rendering.");
assert(browserApp.includes("escapeHtml("), "The browser app must retain HTML escaping helpers.");
assert(browserApp.includes("escapeAttr("), "The browser app must retain attribute escaping helpers.");
assert(browserApp.includes("function safeInternalNavigationUrl"), "Browser notification/deep-link navigation must use same-origin URL validation.");
assert(!browserApp.includes("window.location.href = button.dataset.openNotificationUrl"), "Notification buttons must not navigate directly to untrusted stored URLs.");
assert(appCore.includes("function safeInternalActionUrl"), "Server notification action URLs must be normalized to safe internal URLs.");
assert(appCore.includes("action_url: safeInternalActionUrl(actionUrl)"), "Created notifications must store only safe internal action URLs.");
assert(browserApp.includes("SmartTable home"), "Public brand fallback text must not use old domain-branded copy.");
assert(browserApp.includes("SmartTable serves New York restaurants and guests."), "Public footer fallback text must not use old domain-branded copy.");
assert(!indexHtml.includes('id="adminNav"'), "Super Admin navigation must not be present in the unauthenticated production header.");
assert(!indexHtml.includes('id="restaurantNav"'), "Partner navigation must not be present in the primary public header.");
assert(browserApp.includes("footer_for_restaurants_link") && browserApp.includes('href: "/partner"'), "Partner access must remain available through the intentional partner route link.");
assert(browserApp.includes("if (state.session && isSessionExpired(state.session))"), "Expired client sessions must be detected.");
assert(browserApp.includes("else if (state.mode === \"guest\") renderGuestLogin();"), "Expired guest sessions must show the login form instead of protected content.");
assert(browserApp.includes("showToast(t(\"session_expired_message\""), "Expired sessions must show a localized user-facing message.");
assert(browserApp.includes("function publicBaseUrl()"), "Client metadata must use a centralized public base URL helper.");
assert(browserApp.includes("state.config?.public_base_url"), "Client metadata must read the configured public base URL from backend public config.");
assert(browserApp.includes("const canonical = `${publicBaseUrl()}"), "Client canonical URLs must not be tied to one deployment host.");
assert(browserApp.includes("function canRenderLoginDiagnostics()"), "Login diagnostics must be controlled by one frontend guard.");
assert(browserApp.includes("health.login_diagnostics_enabled === true"), "Login diagnostics must require a server-side opt-in flag.");
assert(browserApp.includes("health.production_runtime !== true"), "Login diagnostics must have a hard production guard.");
assert(!browserApp.includes("__smartTableLastAuthStatus"), "Login diagnostics must not expose auth status through public globals.");
assert(!browserApp.includes("__smartTableLastAuthErrorCode"), "Login diagnostics must not expose auth error codes through public globals.");
assert(!browserApp.includes("__smartTableLastSelectedRedirectRoute"), "Login diagnostics must not expose redirect decisions through public globals.");

for (const emailLinkToken of [
  "login_url: `${PUBLIC_BASE_URL}/login`",
  "marketplace_url: PUBLIC_BASE_URL",
  "`${AUTH_CALLBACK_URL}?token=${encodeURIComponent(token)}`",
  "`${PUBLIC_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`",
  "account_url: `${PUBLIC_BASE_URL}/account/security`",
  "my_reservations_url: `${PUBLIC_BASE_URL}/account/reservations`"
]) {
  assert(appCore.includes(emailLinkToken), `Email/account links must be built from PUBLIC_BASE_URL: ${emailLinkToken}`);
}
assert(!appCore.includes("http://localhost:4173/reset-password"), "Password-reset email links must not hardcode localhost.");
assert(!appCore.includes("http://localhost:4173/verify-email"), "Verification email links must not hardcode localhost.");
assert(!appCore.includes("http://localhost:4173/auth/callback"), "Auth callback email links must not hardcode localhost.");

for (const privatePrefix of [
  "/admin",
  "/partner",
  "/restaurant",
  "/account",
  "/login",
  "/signup/check-email",
  "/signup/welcome",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/callback",
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
assert(indexHtml.includes("https://www.smarttablenyc.com/"), "The public shell must use the SmartTable NYC canonical domain.");
assert(!indexHtml.includes("https://smarttable.com"), "The public shell must not use the old smarttable.com canonical domain.");
assert(!indexHtml.includes("Smarttable.com"), "The public shell must not render old domain-branded text.");
assert(sitemapXml.includes("https://www.smarttablenyc.com/"), "The sitemap must use the SmartTable NYC canonical domain.");
assert(!sitemapXml.includes("https://smarttable.com"), "The sitemap must not use the old smarttable.com canonical domain.");
assert(robotsTxt.includes("Sitemap: https://www.smarttablenyc.com/sitemap.xml"), "robots.txt must point to the SmartTable NYC sitemap.");

const originalEnv = { ...process.env };
for (const key of Object.keys(process.env)) {
  if (key.startsWith("SUPABASE_") || key.startsWith("RESEND_") || key.startsWith("EMAIL_") || key === "PUBLIC_BASE_URL" || key === "PUBLIC_SITE_URL" || key === "SMARTTABLE_ENV" || key === "APP_ENV" || key === "VERCEL_ENV" || key === "NODE_ENV") {
    delete process.env[key];
  }
}
process.env.SMARTTABLE_ENV = "development";
process.env.PUBLIC_BASE_URL = "https://smarttablenyc.com";
process.env.API_MUTATION_RATE_LIMIT = "1";
process.env.MAX_JSON_BODY_BYTES = "20000";

const core = await import(`../src/app-core.js?basic-security-hardening=${Date.now()}-${Math.random()}`);
async function rawCore(method, url, body = {}, headers = {}) {
  return await core.handleApiRequest({ method, url, headers, body });
}

const health = await core.handleApiRequest({
  method: "GET",
  url: "/api/health",
  headers: {},
  body: {}
});
assert.equal(health.status, 200, "Development health should remain available without Supabase.");
assert.equal(health.headers["content-security-policy"]?.includes("frame-ancestors 'none'"), true, "API responses must include a restrictive CSP.");
assert.equal(health.headers["strict-transport-security"]?.includes("max-age=31536000"), true, "API responses must include HSTS.");
assert.equal(health.headers["x-frame-options"], "DENY", "API responses must deny framing.");
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

const oversized = await rawCore("POST", "/api/analytics/events", { __rawBody: "x".repeat(21000) });
assert.equal(oversized.status, 413, "Oversized API payloads must be rejected before route handling.");
assert.equal(oversized.body.code, "REQUEST_TOO_LARGE");

const csrfBlocked = await rawCore("POST", "/api/public/follow", {}, { origin: "https://evil.example" });
assert.equal(csrfBlocked.status, 403, "Unsafe cross-site browser requests must be rejected by Origin validation.");
assert.equal(csrfBlocked.body.code, "CSRF_ORIGIN_FORBIDDEN");

const firstAnalyticsEvent = await rawCore("POST", "/api/analytics/events", {
  event_type: "signup_started",
  properties: { source: "security-check" }
});
assert.equal(firstAnalyticsEvent.status, 201, "First mutation request within the rate window should be allowed.");
const secondAnalyticsEvent = await rawCore("POST", "/api/analytics/events", {
  event_type: "signup_started",
  properties: { source: "security-check" }
});
assert.equal(secondAnalyticsEvent.status, 429, "Repeated mutation requests beyond the configured limit must be rate-limited.");
assert.equal(secondAnalyticsEvent.body.code, "RATE_LIMITED");

const unauthGuestNotificationsByEmail = await rawCore(`GET`, `/api/guest/notifications?guest_email=${encodeURIComponent(TEST_ACCOUNTS.guest.email)}`);
assert.equal(unauthGuestNotificationsByEmail.status, 401, "Guest notifications must not be readable by unauthenticated email query.");
const unauthGuestNotificationsByProfile = await rawCore("GET", "/api/guest/notifications?profile_key=guest-smarttable-com");
assert.equal(unauthGuestNotificationsByProfile.status, 401, "Guest notifications must not be readable by unauthenticated profile-key query.");

const demoLogin = await rawCore("POST", "/api/auth/login", { email: TEST_ACCOUNTS.guest.email, password: TEST_ACCOUNTS.guest.password });
assert.equal(demoLogin.status, 200, "Demo guest login must remain available for authenticated notification checks.");
const demoNotifications = await rawCore("GET", "/api/guest/notifications?guest_email=other@example.com", {}, { authorization: `Bearer ${demoLogin.body.access_token}` });
assert.equal(demoNotifications.status, 200, "Authenticated guests must still be able to load their own notifications.");
assert(
  (demoNotifications.body.notifications || []).every((item) => item.guest_email === TEST_ACCOUNTS.guest.email || item.profile_key === "guest-smarttable-com"),
  "Authenticated guest notifications must ignore caller-supplied email/profile query filters."
);
const unauthAiPreferences = await rawCore("GET", "/api/ai/preferences?profile_key=guest-smarttable-com");
assert.equal(unauthAiPreferences.status, 401, "AI preference profiles must not be readable by unauthenticated profile-key query.");
const authAiPreferences = await rawCore("GET", "/api/ai/preferences?profile_key=other-guest", {}, { authorization: `Bearer ${demoLogin.body.access_token}` });
assert.equal(authAiPreferences.status, 200, "Authenticated guests must still be able to load their own preference profile.");
assert.notEqual(authAiPreferences.body.profile_key, "other-guest", "AI preference lookups must ignore caller-supplied profile keys.");

const publicOffers = await rawCore("GET", "/api/public/offers?lang=en");
assert.equal(publicOffers.status, 200, "Public offers must remain available for booking-context PII checks.");
const firstOffer = publicOffers.body.offers?.[0];
assert(firstOffer, "At least one public offer must exist for booking-context PII checks.");
const piiEmail = `pii-security-${Date.now()}@example.com`;
const restaurantId = firstOffer.restaurant_id || firstOffer.restaurant?.id;
assert(restaurantId, "Public offer must include a restaurant id for PII response checks.");
const followResponse = await rawCore("POST", "/api/public/follow", {
  restaurant_id: restaurantId,
  guest_name: "Private Follow Guest",
  guest_email: piiEmail,
  notification_enabled: true
});
assert([200, 201].includes(followResponse.status), "Public follow setup must succeed.");
const followText = JSON.stringify(followResponse.body.follower || {});
for (const forbiddenToken of ["guest_email", "guest_name", piiEmail, "Private Follow Guest"]) {
  assert(!followText.includes(forbiddenToken), `Public follow response must not expose ${forbiddenToken}.`);
}

const reviewResponse = await rawCore("POST", "/api/guest/reviews/verified", {
  restaurant_id: restaurantId,
  reservation_id: "00000000-0000-0000-0000-000000000000",
  guest_name: "Private Review Guest",
  guest_email: piiEmail,
  food_rating: 5,
  service_rating: 5,
  atmosphere_rating: 5,
  comment: "Private free-text review should not be echoed."
});
assert.equal(reviewResponse.status, 401, "Verified review submission must require guest authentication.");
const reviewText = JSON.stringify(reviewResponse.body.review || {});
for (const forbiddenToken of ["guest_email", "guest_name", piiEmail, "Private Review Guest", "Private free-text review"]) {
  assert(!reviewText.includes(forbiddenToken), `Verified review denial must not expose ${forbiddenToken}.`);
}

const createdReservation = await rawCore("POST", "/api/reservations", {
  offer_id: firstOffer.offer_id || firstOffer.id,
  reservation_date: firstOffer.reservation_date || firstOffer.offer_date,
  reservation_time: firstOffer.start_time || firstOffer.offer_time,
  party_size: 2,
  guest_name: "Private Guest",
  guest_email: piiEmail,
  guest_phone: "+1 212 555 0199"
});
assert.equal(createdReservation.status, 201, "PII regression reservation setup must succeed.");
const bookingId = createdReservation.body.reservation?.reservation_id || createdReservation.body.reservation?.id;
assert(bookingId, "PII regression reservation must return a booking id.");
const rewardContext = await rawCore("GET", `/api/public/rewards/context?bookingId=${encodeURIComponent(bookingId)}`);
assert.equal(rewardContext.status, 200, "Public rewards booking context must remain available.");
const contextText = JSON.stringify(rewardContext.body.context || {});
for (const forbiddenToken of [
  "guestEmail",
  "guest_email",
  "guestName",
  "guest_name",
  "guestId",
  "guest_id",
  piiEmail,
  "Private Guest",
  "+1 212 555 0199",
  "partySize",
  "party_size"
]) {
  assert(!contextText.includes(forbiddenToken), `Public rewards booking context must not expose ${forbiddenToken}.`);
}

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
