import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PLATFORM_FEATURE_REGISTRY,
  DEFAULT_PLATFORM_SETTINGS
} from "../public/shared-contracts.js";
import { handleApiRequest } from "../src/app-core.js";

const root = new URL("../", import.meta.url);

async function readProjectFile(relativePath) {
  return await readFile(new URL(relativePath, root), "utf8");
}

function includesAll(source, tokens, label) {
  for (const token of tokens) {
    assert(source.includes(token), `${label} is missing evidence token: ${token}`);
  }
}

function excludesAll(source, tokens, label) {
  for (const token of tokens) {
    assert(!source.includes(token), `${label} must not expose: ${token}`);
  }
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist.`);
  const bodyStart = source.indexOf("{", start);
  assert(bodyStart >= 0, `${name} must have a body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }
  throw new Error(`${name} function body could not be parsed.`);
}

async function api(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
}

const [
  appSource,
  appCore,
  indexHtml,
  serverSource,
  enLocale,
  esLocale,
  huLocale,
  publicExperienceCheck,
  reservationCheck,
  guestAccountCheck,
  routeProtectionCheck,
  analyticsCheck,
  basicSecurityHardeningCheck
] = await Promise.all([
  readProjectFile("public/app.js"),
  readProjectFile("src/app-core.js"),
  readProjectFile("public/index.html"),
  readProjectFile("server.js"),
  readProjectFile("public/locales/en.json"),
  readProjectFile("public/locales/es.json"),
  readProjectFile("public/locales/hu.json"),
  readProjectFile("scripts/check-public-experience.js"),
  readProjectFile("scripts/check-reservation-lifecycle.js"),
  readProjectFile("scripts/check-guest-account.js"),
  readProjectFile("scripts/check-route-protection.js"),
  readProjectFile("scripts/check-analytics-reporting.js"),
  readProjectFile("scripts/check-basic-security-hardening.js")
]);

const sourceBundle = [
  appSource,
  appCore,
  publicExperienceCheck,
  reservationCheck,
  guestAccountCheck,
  routeProtectionCheck,
  analyticsCheck,
  basicSecurityHardeningCheck
].join("\n");

assert.equal(DEFAULT_PLATFORM_SETTINGS.platform_mode, "basic", "BASIC must remain the default platform mode.");
assert.equal(DEFAULT_PLATFORM_SETTINGS.ai_demo_visibility, false, "AI demo visibility must remain off by default.");

const requiredFeatureEvidence = {
  "basic.restaurantListings": {
    ui: ["function renderGuest(", "\"/restaurants\"", "function restaurantCard(", "data-restaurant-slug"],
    backend: ["/public/restaurants", "public_available_offers", "filterPublicTestDataRows"],
    tests: ["Public offers must exclude test restaurant rows", "Public offers must load"]
  },
  "basic.discountOffers": {
    ui: ["function offerRows(", "function offerIsPublicVisible(", "Search Offers"],
    backend: ["/public/offers", "evaluateOfferValidity", "available_tables"],
    tests: ["Public offers must load", "SmartTable Test Bistro offers must carry"]
  },
  "basic.reservations": {
    ui: ["reservationModal", "successModal", "state.reservationSubmitting"],
    backend: ["/reservations", "OFFER_UNAVAILABLE", "emailDeliverySummary"],
    tests: ["Duplicate active reservation requests must be blocked", "Reservation request must return an id"]
  },
  "basic.partnerDashboard": {
    ui: ["renderBasicPartner(", "partnerTodayReservationLeadsPanel", "basicPartnerOverviewPanel"],
    backend: ["/partner/profile", "/partner/reservations", "getPartnerRestaurant"],
    tests: ["Partners must not request another restaurant", "Reservation must appear in the correct partner dashboard"]
  },
  "basic.adminManagement": {
    ui: ["renderAdmin(", "restaurantAdminPanel", "contentEditorV2"],
    backend: ["/admin/restaurants", "/admin/content", "/admin/notifications"],
    tests: ["Regular admins must access admin stats", "Partners must not access admin routes"]
  },
  "basic.favorites": {
    ui: ["accountFavoritesPanel", "data-remove-favorite", "guest/favorites"],
    backend: ["/guest/favorites", "restaurant_followers", "publicFollowerResponse"],
    tests: ["guest/favorites", "Public follow response must not expose"]
  },
  "basic.reviews": {
    ui: ["accountReviewsPanel", "renderVerifiedReviewPage", "verifiedReviewForm"],
    backend: ["/guest/reviews/verified", "/admin/reviews", "restaurant_reviews"],
    tests: ["restaurant_reviews", "Guest account analytics"]
  },
  "partner.restaurantAnalytics": {
    ui: ["partnerAnalyticsPanel", "offerAnalyticsTable", "analyticsRecommendationsPanel"],
    backend: ["/partner/analytics", "buildRestaurantAnalytics", "analyticsExportResponse"],
    tests: ["Partner analytics must require partner/admin authentication", "Recommendations must be rule-based"]
  }
};

for (const [featureKey, feature] of Object.entries(PLATFORM_FEATURE_REGISTRY)) {
  assert(Array.isArray(feature.modes), `${featureKey} must declare supported modes.`);
  assert(Array.isArray(feature.audiences), `${featureKey} must declare audiences.`);
  assert(["working", "demo", "disabled", "hidden"].includes(feature.status), `${featureKey} has an invalid status.`);
  if (feature.modes.includes("basic") && feature.status === "working") {
    const evidence = requiredFeatureEvidence[featureKey];
    assert(evidence, `${featureKey} is enabled in BASIC but lacks release evidence mapping.`);
    assert(Array.isArray(feature.required_backend_support) && feature.required_backend_support.length > 0, `${featureKey} must list backend dependencies.`);
    includesAll(sourceBundle, evidence.ui, `${featureKey} UI`);
    includesAll(sourceBundle, evidence.backend, `${featureKey} backend`);
    includesAll(sourceBundle, evidence.tests, `${featureKey} tests`);
  }
  if (feature.status !== "working") {
    assert.equal(feature.public_visibility, false, `${featureKey} is ${feature.status} and must not be public-visible.`);
  }
}

const publicShell = [indexHtml, functionBody(appSource, "renderGuest")].join("\n");
excludesAll(publicShell, [
  "Coming soon",
  "Super Admin",
  "demo credentials",
  "OpenTable",
  "Resy",
  "SevenRooms",
  "Stripe",
  "AI Demand",
  "SmartTable AI"
], "Public BASIC shell");

includesAll(appSource, [
  "function canShowFeature(",
  "function isBasicMode()",
  "function isFeedbackEligible(",
  "/review/verified?reservation_id=",
  "api(\"/partner/billing\").catch(() => ({ billing: null, plans: [], invoices: [], stripe: { configured: false } }))",
  "api(\"/admin/billing\").catch(() => ({ plans: [], subscriptions: [], invoices: [], payment_events: [], billing_events: [] }))",
  "basicMode ? Promise.resolve({ campaigns: [], templates: [] })",
  "basicMode ? Promise.resolve({ campaigns: [], provider: { configured: false } })",
  "basicMode ? Promise.resolve({ submissions: [], insights: null })"
], "BASIC future-feature gates");

const renderAdminBody = functionBody(appSource, "renderAdmin");
const renderBasicPartnerBody = functionBody(appSource, "renderBasicPartner");
includesAll(renderBasicPartnerBody, [
  "partner_nav_billing",
  "partnerBillingPanel()"
], "BASIC partner billing");
excludesAll(renderBasicPartnerBody, [
  "partner_nav_communications",
  "partnerPostVisitFeedbackPanel()"
], "BASIC partner dashboard");
assert(renderAdminBody.includes("if (!isBasicMode())"), "Admin future modules must be gated outside BASIC.");

for (const [localeName, localeSource] of [["en", enLocale], ["es", esLocale], ["hu", huLocale]]) {
  const messages = JSON.parse(localeSource);
  for (const key of [
    "homepage_hero_title",
    "homepage_hero_primary_cta",
    "homepage_hero_secondary_cta",
    "offers_title",
    "restaurants_seo_title",
    "reservation_success_title",
    "account_reservations_title",
    "partner_dashboard_title",
    "admin_dashboard_title",
    "partner_analytics_title",
    "admin_analytics_title",
    "route_forbidden_title",
    "app_error_title"
  ]) {
    assert(String(messages[key] || "").trim(), `${localeName}.json must include BASIC-visible key ${key}.`);
  }
}

includesAll(serverSource, [
  "function injectSeo",
  "function isNoIndexPath",
  "function serveRobots",
  "function serveSitemap",
  "strictSecurityHeaders"
], "SEO and public metadata support");

for (const path of ["/admin", "/partner", "/restaurant", "/account", "/login", "/forgot-password", "/reset-password", "/auth/callback"]) {
  assert(serverSource.includes(`"${path}"`), `${path} must be noindex on the server.`);
}

const config = await api("GET", "/public/config");
assert.equal(config.status, 200, "Public config must be available.");
assert.equal(config.body.platform_mode, "basic", "Public config must report BASIC mode by default.");
assert(!JSON.stringify(config.body).match(/SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|STRIPE_SECRET_KEY|WEBHOOK_SECRET|authorization/i), "Public config must not expose secrets.");

const offers = await api("GET", "/public/offers?lang=en");
assert.equal(offers.status, 200, "Public offers must be available.");
assert(!(offers.body.offers || []).some((offer) => offer.restaurant_name === "SmartTable Test Bistro" || offer.slug === "smarttable-test-bistro"), "Test restaurant data must not leak into public offers without test mode.");

console.log("BASIC feature completeness checks passed.");
