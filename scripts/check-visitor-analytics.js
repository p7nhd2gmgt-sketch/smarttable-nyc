#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";

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
  'const anonymousPublicAnalyticsEvents = new Set(["guest_website_view", "restaurant_booking_options_viewed"])',
  'if (!anonymousPublicAnalyticsEvents.has(eventType)) payload.profile_key = state.aiProfileKey',
  'fetch("/api/analytics/events"'
], "First-party guest website view tracking");
assert(!appJs.includes('trackSafeAnalyticsEvent("guest_website_view", {\n    profile_key:'), "Guest website views must not include a profile key.");

includesAll(appCore, [
  '"guest_website_view"',
  'anonymousPublicAnalyticsEvents.has(eventType) ? null',
  '? "guest_website"',
  'async function supabaseExactCount',
  'Prefer: "count=exact"',
  'event_type=eq.guest_website_view',
  'guest_website_views: guestWebsiteViews'
], "Guest website view aggregation");

includesAll(appJs, [
  'trackSafeAnalyticsEvent("restaurant_booking_options_viewed"',
  'trackRestaurantBookingOptionsView(button.dataset.restaurant, "offer_reservation")',
  'trackRestaurantBookingOptionsView(button.dataset.restaurant || button.dataset.openStandardReserve, "standard_reservation")',
  'trackRestaurantBookingOptionsView(trigger.dataset.openRestaurant, "restaurant_detail")',
  'trackRestaurantBookingOptionsView(restaurantId, "newest_restaurant")',
  'trackRestaurantBookingOptionsView(button.dataset.foodFeedRestaurant, "food_feed")',
  'adminBookingOptionViewsPanel(stats)',
  'stats.booking_option_views_total ?? 0'
], "Restaurant booking-option interaction tracking");

includesAll(appCore, [
  '"restaurant_booking_options_viewed"',
  'looksLikeUuid(bookingRestaurantId)',
  'public_restaurant_cards?select=restaurant_id',
  'restaurant_id: row.restaurant_id',
  'metadata: row.properties',
  'const schemaFields = ["metadata", "properties", "restaurant_id"]',
  'analyticsRestaurantId(row)',
  'isAnalyticsSchemaMismatch(error)',
  'event_type=eq.restaurant_booking_options_viewed',
  'const bookingOptionCountByRestaurant = new Map()',
  'const analyticsPageSize = 1000',
  'booking_option_views_by_restaurant: bookingOptionViewsByRestaurant'
], "Secure restaurant booking-option aggregation");
assert(!appCore.includes('event_type=eq.restaurant_booking_options_viewed&restaurant_id=eq.${encodeURIComponent(restaurant.id)}'), "Admin analytics must not issue one count request per restaurant.");

assert(!appCore.includes('/rest/v1/rpc/track_restaurant_view'), "Loading an offer list must not count every restaurant as viewed.");
assert(!appCore.includes('restaurant.views_count = numberOr(restaurant.views_count, 0) + 1'), "Demo offer-list loading must not inflate restaurant views.");

const {
  analyticsEventInsertPayloads,
  analyticsRestaurantId,
  handleApiRequest,
  isAnalyticsSchemaMismatch
} = await import(`../src/app-core.js?visitor-analytics=${Date.now()}`);

const compatibilityRow = {
  event_type: "restaurant_booking_options_viewed",
  profile_key: null,
  restaurant_id: "00000000-0000-4000-8000-000000000001",
  entity_type: "restaurant",
  entity_id: "00000000-0000-4000-8000-000000000001",
  properties: {
    restaurant_id: "00000000-0000-4000-8000-000000000001",
    entry_point: "restaurant_detail"
  },
  created_at: "2026-08-30T00:00:00.000Z"
};
const compatibilityPayloads = analyticsEventInsertPayloads(compatibilityRow);
assert.equal(compatibilityPayloads[0].metadata.restaurant_id, compatibilityRow.restaurant_id, "Production-compatible metadata must preserve the restaurant attribution.");
assert.equal(compatibilityPayloads[0].user_id, null, "Anonymous visitor analytics must not attach a user identifier.");
assert.equal(compatibilityPayloads[2].properties.restaurant_id, compatibilityRow.restaurant_id, "Legacy properties schemas must preserve the restaurant attribution.");
assert.equal(analyticsRestaurantId({ metadata: compatibilityRow.properties }), compatibilityRow.restaurant_id, "Metadata-backed analytics must resolve the restaurant identifier.");
assert.equal(analyticsRestaurantId({ properties: compatibilityRow.properties }), compatibilityRow.restaurant_id, "Properties-backed analytics must resolve the restaurant identifier.");
assert.equal(analyticsRestaurantId({ restaurant_id: compatibilityRow.restaurant_id }), compatibilityRow.restaurant_id, "Column-backed analytics must resolve the restaurant identifier.");
assert.equal(isAnalyticsSchemaMismatch({ code: "42703" }), true, "Missing-column errors must activate the compatibility path.");
assert.equal(isAnalyticsSchemaMismatch({ code: "PGRST204" }), true, "PostgREST schema-cache errors must activate the compatibility path.");
assert.equal(isAnalyticsSchemaMismatch({ code: "42501" }), false, "Authorization errors must never be hidden as schema compatibility issues.");
const rawApi = (method, path, body = {}, headers = {}) => handleApiRequest({
  method,
  url: `/api${path}`,
  body,
  headers: {
    "x-forwarded-for": "203.0.113.90",
    "user-agent": "SmartTable visitor analytics automated verification",
    ...headers
  }
});
const publicRestaurants = await rawApi("GET", "/public/restaurants");
assert.equal(publicRestaurants.status, 200, "Public restaurants must be available for analytics verification.");
const publicRestaurantId = publicRestaurants.body.restaurants?.[0]?.restaurant_id || publicRestaurants.body.restaurants?.[0]?.id;
assert.match(publicRestaurantId || "", /^[0-9a-f-]{36}$/i, "A public restaurant UUID is required for analytics verification.");

const invalidRestaurant = await rawApi("POST", "/analytics/events", {
  event_type: "restaurant_booking_options_viewed",
  metadata: { restaurant_id: "not-a-uuid", entry_point: "restaurant_detail", path: "/restaurants/test" }
});
assert.equal(invalidRestaurant.status, 400, "Invalid restaurant identifiers must be rejected.");

const invalidEntryPoint = await rawApi("POST", "/analytics/events", {
  event_type: "restaurant_booking_options_viewed",
  metadata: { restaurant_id: publicRestaurantId, entry_point: "forged", path: "/restaurants/test" }
});
assert.equal(invalidEntryPoint.status, 400, "Unknown analytics entry points must be rejected.");

const nonPublicRestaurant = await rawApi("POST", "/analytics/events", {
  event_type: "restaurant_booking_options_viewed",
  metadata: { restaurant_id: "00000000-0000-4000-8000-000000000000", entry_point: "restaurant_detail", path: "/restaurants/test" }
});
assert.equal(nonPublicRestaurant.status, 400, "Unknown or non-public restaurants must not receive analytics events.");

const unsafePath = await rawApi("POST", "/analytics/events", {
  event_type: "restaurant_booking_options_viewed",
  metadata: { restaurant_id: publicRestaurantId, entry_point: "restaurant_detail", path: "/restaurants/test?token=secret" }
});
assert.equal(unsafePath.status, 400, "Analytics paths containing query data must be rejected.");

const validInteraction = await rawApi("POST", "/analytics/events", {
  event_type: "restaurant_booking_options_viewed",
  metadata: { restaurant_id: publicRestaurantId, entry_point: "restaurant_detail", path: "/restaurants/test" }
});
assert.equal(validInteraction.status, 201, "A valid public booking-option interaction must be recorded.");
assert.equal(validInteraction.body.event.profile_key, null, "Public restaurant interactions must remain anonymous.");

const adminLogin = await rawApi("POST", "/auth/login", {
  email: TEST_ACCOUNTS.admin.email,
  password: TEST_ACCOUNTS.admin.password
});
assert.equal(adminLogin.status, 200, "Admin login must succeed for analytics aggregation verification.");
const adminStats = await rawApi("GET", "/admin/stats", {}, {
  authorization: `Bearer ${adminLogin.body.access_token}`
});
assert.equal(adminStats.status, 200, "Admin analytics aggregation must be authorized and available.");
assert.equal(adminStats.body.stats.booking_option_views_total, 1, "The admin total must count every recorded booking-option interaction.");
assert.equal(
  adminStats.body.stats.booking_option_views_by_restaurant.find((row) => row.restaurant_id === publicRestaurantId)?.booking_option_views,
  1,
  "The admin restaurant breakdown must attribute the interaction to the exact restaurant."
);

console.log("Privacy-conscious visitor analytics checks passed.");
