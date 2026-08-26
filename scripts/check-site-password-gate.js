import assert from "node:assert/strict";
import middleware from "../middleware.js";
import {
  isSitePasswordGateExempt,
  sitePasswordGateConstants,
  sitePasswordGateResponse
} from "../src/site-password-gate.js";

const configuredPassword = `gate-${crypto.randomUUID()}`;
const enabledProduction = {
  SMARTTABLE_SITE_PASSWORD_ENABLED: "true",
  SMARTTABLE_SITE_PASSWORD: configuredPassword,
  VERCEL_ENV: "production"
};

function request(url, options = {}) {
  return new Request(url, options);
}

function formBody(password, returnTo = "/") {
  return new URLSearchParams({ password, return_to: returnTo });
}

function cookieValue(setCookie, cookieName) {
  const match = String(setCookie || "").match(new RegExp(`(?:^|,\\s*)${cookieName}=([^;]+)`));
  return match?.[1] || "";
}

const anonymous = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/partner"), enabledProduction);
assert.equal(anonymous.status, 401, "Anonymous production UI navigation must receive the unlock page.");
const anonymousHtml = await anonymous.text();
assert.match(anonymousHtml, /SmartTable is getting ready\./);
assert.match(anonymousHtml, /name="password"/);
assert.match(anonymousHtml, />Enter SmartTable</);
assert(!anonymousHtml.includes(configuredPassword), "The configured password must never appear in unlock HTML.");
assert.equal(anonymous.headers.get("cache-control"), "no-store, max-age=0");
assert.match(anonymous.headers.get("x-robots-tag") || "", /noindex/);

const wrong = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/__smarttable_unlock", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://www.smarttablenyc.com", "x-forwarded-for": "198.51.100.10" },
  body: formBody("incorrect", "/partner")
}), enabledProduction);
assert.equal(wrong.status, 401, "Wrong password must be denied.");
const wrongHtml = await wrong.text();
assert.match(wrongHtml, /Unable to unlock SmartTable\./);
assert(!wrongHtml.includes(configuredPassword), "The configured password must never appear in a denial response.");
assert.match(wrong.headers.get("set-cookie") || "", /HttpOnly/);

const unlocked = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/__smarttable_unlock", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://www.smarttablenyc.com", "x-forwarded-for": "198.51.100.11" },
  body: formBody(configuredPassword, "/partner")
}), enabledProduction);
assert.equal(unlocked.status, 303, "Correct password must create a session and redirect.");
assert.equal(unlocked.headers.get("location"), "/partner");
const setCookie = unlocked.headers.get("set-cookie") || "";
const session = cookieValue(setCookie, sitePasswordGateConstants.sessionCookie);
assert(session, "Successful unlock must set the signed session cookie.");
assert.match(setCookie, /HttpOnly/);
assert.match(setCookie, /Secure/);
assert.match(setCookie, /SameSite=Lax/);
assert.match(setCookie, /Max-Age=604800/);
assert(!setCookie.includes(configuredPassword), "The raw password must not be stored in the session cookie.");

const retained = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/admin", {
  headers: { cookie: `${sitePasswordGateConstants.sessionCookie}=${session}` }
}), enabledProduction);
assert.equal(retained, null, "A valid signed cookie must retain access across page requests.");

const cleared = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/admin"), enabledProduction);
assert.equal(cleared.status, 401, "Clearing the site cookie must protect the UI again.");

const staging = await sitePasswordGateResponse(request("https://smarttable-stripe-staging.vercel.app/partner"), enabledProduction);
assert.equal(staging, null, "The verified staging host must remain unprotected even if the switch is enabled.");

for (const pathname of [
  "/api/health",
  "/api/webhooks/stripe",
  "/api/webhooks/resend",
  "/api/auth/callback",
  "/api/auth/login",
  "/api/public/offers",
  "/api/guest/reservations",
  "/api/partner/reservations",
  "/api/admin/stats",
  "/.well-known/apple-app-site-association",
  "/.well-known/assetlinks.json",
  "/assets/restaurant-hero.png",
  "/app.js",
  "/styles.css",
  "/site.webmanifest",
  "/sw.js",
  "/robots.txt",
  "/sitemap.xml",
  "/auth/callback",
  "/reset-password",
  "/verify-email",
  "/signup/welcome"
]) {
  assert(isSitePasswordGateExempt(pathname), `${pathname} must be exempt from the website gate.`);
  const response = await sitePasswordGateResponse(request(`https://www.smarttablenyc.com${pathname}`), enabledProduction);
  assert.equal(response, null, `${pathname} must continue to its existing handler.`);
}

for (const pathname of ["/", "/offers", "/login", "/account", "/partner", "/admin", "/superadmin", "/index.html"]) {
  assert(!isSitePasswordGateExempt(pathname), `${pathname} must be protected as web UI.`);
}

const disabled = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/admin"), {
  ...enabledProduction,
  SMARTTABLE_SITE_PASSWORD_ENABLED: "false"
});
assert.equal(disabled, null, "The disable switch must restore normal routing without removing code.");

const missingPassword = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/"), {
  SMARTTABLE_SITE_PASSWORD_ENABLED: "true",
  SMARTTABLE_SITE_PASSWORD: "",
  VERCEL_ENV: "production"
});
assert.equal(missingPassword.status, 503, "Enabled production gate without a password must fail closed.");
assert(!((await missingPassword.text()).includes(configuredPassword)));

const trustedProductionOrigin = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/__smarttable_unlock", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://smarttablenyc.com" },
  body: formBody(configuredPassword)
}), enabledProduction);
assert.equal(trustedProductionOrigin.status, 303, "The www and apex production domains must trust each other's unlock submissions.");

const missingOrigin = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/__smarttable_unlock", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "198.51.100.12" },
  body: formBody(configuredPassword, "/")
}), enabledProduction);
assert.equal(missingOrigin.status, 303, "Unlock must work when privacy settings omit origin and referer headers.");

for (let index = 0; index < sitePasswordGateConstants.maxAttempts; index += 1) {
  const response = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/__smarttable_unlock", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://www.smarttablenyc.com", "x-forwarded-for": "203.0.113.77" },
    body: formBody("still-wrong")
  }), enabledProduction);
  if (index === sitePasswordGateConstants.maxAttempts - 1) {
    assert.equal(response.status, 429, "Repeated failures must trigger basic brute-force protection.");
    assert(Number(response.headers.get("retry-after")) > 0);
  }
}

const validAfterBlock = await sitePasswordGateResponse(request("https://www.smarttablenyc.com/__smarttable_unlock", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://www.smarttablenyc.com", "x-forwarded-for": "203.0.113.77" },
  body: formBody(`  ${configuredPassword.toUpperCase()}  `, "/")
}), enabledProduction);
assert.equal(validAfterBlock.status, 303, "The correct password must clear failed-attempt blocks and tolerate pasted whitespace.");

const middlewareBypass = await middleware(request("https://smarttable-stripe-staging.vercel.app/"));
assert(middlewareBypass instanceof Response, "Vercel middleware pass-through must return a routing response.");

console.log("SmartTable site password gate checks passed.");
