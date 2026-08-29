#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const analyticsBootstrap = await readFile(new URL("../public/analytics-bootstrap.js", import.meta.url), "utf8");
const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const appCore = await readFile(new URL("../src/app-core.js", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const vercelJson = await readFile(new URL("../vercel.json", import.meta.url), "utf8");

function includesAll(source, values, message) {
  for (const value of values) {
    assert(source.includes(value), `${message}: missing ${value}`);
  }
}

assert(packageJson.dependencies?.["@vercel/analytics"], "Official @vercel/analytics package must be installed.");
assert.equal(packageJson.scripts?.["check:visitor-analytics"], "node scripts/check-visitor-analytics.js", "Visitor analytics check script must be exposed.");
assert(indexHtml.includes('src="/analytics-bootstrap.js'), "The CSP-safe analytics bootstrap must be loaded as an external script.");
assert.equal((analyticsBootstrap.match(/data-smarttable-analytics/g) || []).length, 1, "Vercel Web Analytics script marker must be configured once.");
assert(analyticsBootstrap.includes('script.setAttribute("data-smarttable-analytics", "vercel-web-analytics")'), "Vercel Web Analytics script must be injected once.");
assert(analyticsBootstrap.includes('/_vercel/insights/script.js'), "Vercel Web Analytics must use the Vercel insights script route.");
assert(analyticsBootstrap.includes('window.va("beforeSend"'), "Vercel Web Analytics must use beforeSend for privacy filtering.");
assert(analyticsBootstrap.includes("productionHosts"), "Analytics must be production-host gated.");
includesAll(analyticsBootstrap, [
  '"smarttablenyc.com"',
  '"www.smarttablenyc.com"',
  '"/admin"',
  '"/superadmin"',
  '"/partner"',
  '"/api"',
  '"/auth"',
  '"/reset-password"',
  '"/review/verified"',
  '"/post-visit/action"',
  '"token"',
  '"code"',
  '"access_token"',
  '"refresh_token"',
  '"email"',
  '"phone"',
  '"reservation_id"',
  '"user_id"',
  '"guest_id"',
  "return null",
  "return `${url.origin}${pathname === \"/\" ? \"/\" : pathname}`"
], "Analytics privacy guard");
assert(!indexHtml.includes("googletagmanager.com"), "Google Tag Manager must not be added.");
assert(!indexHtml.includes("google-analytics.com"), "Google Analytics must not be added.");
assert(!indexHtml.includes("GTM-"), "GTM IDs must not be present.");
assert(!indexHtml.includes("gtag("), "gtag must not be present.");
assert(vercelJson.includes("connect-src 'self'"), "CSP must allow same-origin Vercel Analytics intake only.");
assert(vercelJson.includes("script-src 'self'"), "CSP must allow same-origin Vercel Analytics script only.");

includesAll(appJs, [
  'const guestWebsiteAnalyticsHosts = new Set(["smarttablenyc.com", "www.smarttablenyc.com"])',
  'const guestWebsiteAnalyticsRouteKinds = new Set(["home", "restaurants", "restaurant-detail", "offers", "food-feed", "info"])',
  'trackSafeAnalyticsEvent("guest_website_view"',
  'path: analyticsRoute.path',
  'route_kind: analyticsRoute.routeKind',
  'if (eventType !== "guest_website_view") payload.profile_key = state.aiProfileKey',
  'fetch("/api/analytics/events"'
], "First-party guest website view tracking");
assert(!appJs.includes('trackSafeAnalyticsEvent("guest_website_view", {\n    profile_key:'), "Guest website views must not include a profile key.");

includesAll(appCore, [
  '"guest_website_view"',
  'profile_key: eventType === "guest_website_view" ? null',
  '? "guest_website"',
  'async function supabaseExactCount',
  'Prefer: "count=exact"',
  'event_type=eq.guest_website_view',
  'guest_website_views: guestWebsiteViews'
], "Guest website view aggregation");

console.log("Privacy-conscious visitor analytics checks passed.");
