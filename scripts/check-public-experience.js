import { readFile } from "node:fs/promises";
import { handleApiRequest } from "../src/app-core.js";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function apiRaw(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
}

async function api(method, path, body = {}, headers = {}) {
  const response = await apiRaw(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.error || "unknown error"}`);
  }
  return response.body;
}

function uniqueEmail(prefix = "public-flow") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

async function loginAs(email, password) {
  const login = await api("POST", "/auth/login", { email, password });
  assert(login.access_token, `${email} must be able to log in.`);
  return { profile: login.profile, headers: authHeaders(login.access_token) };
}

function signupPayload(overrides = {}) {
  return {
    first_name: "Emma",
    last_name: "Carter",
    email: uniqueEmail(),
    password: "Strong!12345",
    confirm_password: "Strong!12345",
    phone: "+1 212 555 0199",
    city: "New York",
    region: "NY",
    postal_code: "10014",
    preferred_neighborhoods: ["West Village", "SoHo"],
    travel_distance_miles: "5",
    transportation_method: "Walking",
    transportation_methods: ["Walking", "Public transportation"],
    cuisines: ["American", "Italian"],
    food_categories: ["Steak", "Pasta"],
    dietary_needs: ["No restrictions"],
    allergy_notes: "",
    drink_preferences: ["Wine", "Coffee"],
    dining_experiences: ["Casual dining", "Quiet atmosphere"],
    companions: ["Partner"],
    party_size: "2",
    preferred_days: ["Friday", "Saturday"],
    preferred_time_windows: ["Early dinner", "Dinner"],
    booking_lead_time: "1-2 days",
    dining_duration: "60-90 minutes",
    discovery_preference: "A balance of both",
    selection_priorities: ["Food quality", "Discount", "Location"],
    new_restaurant_recommendations: "Yes",
    new_menu_item_recommendations: "No",
    excluded_categories: ["No exclusions"],
    spending_range: "$35-$50",
    discount_levels: ["15%", "20%"],
    consider_no_discount_match: "Sometimes",
    notification_preferences: ["Reservation status updates", "Reservation reminders"],
    notification_channels: ["Email"],
    notification_frequency: "Immediately",
    event_recommendations_interest: "No",
    future_calendar_interest: "No",
    transactional_email_consent: true,
    sms_consent: false,
    marketing_consent: false,
    allergy_acknowledgement: false,
    privacy_consent: true,
    terms_consent: true,
    preferred_language: "hu",
    ...overrides
  };
}

async function createGuest(overrides = {}) {
  const payload = signupPayload(overrides);
  const result = await api("POST", "/auth/signup-guest", payload);
  return { payload, result, headers: authHeaders(result.access_token) };
}

function assertNoSensitiveKeys(value, path = "response") {
  const blocked = new Set([
    "restaurant_email",
    "contact_email",
    "owner_user_id",
    "partner_notes",
    "admin_notes",
    "role",
    "permissions",
    "service_role",
    "secret",
    "token",
    "api_key",
    "password"
  ]);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    assert(!blocked.has(key), `Public API must not expose ${path}.${key}.`);
    assertNoSensitiveKeys(nested, `${path}.${key}`);
  }
}

async function assertResponsiveSeoAndSecurityWiring() {
  const [server, app, appCore, index, styles, guestDesign, en, es, hu] = await Promise.all([
    read("server.js"),
    read("public/app.js"),
    read("src/app-core.js"),
    read("public/index.html"),
    read("public/styles.css"),
    read("public/guest/design-system.css"),
    read("public/locales/en.json"),
    read("public/locales/es.json"),
    read("public/locales/hu.json")
  ]);

  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    assert(Number.isInteger(width), `Responsive audit viewport ${width}px must be listed.`);
  }

  assert(styles.includes("overflow-x: hidden"), "Global styles must prevent accidental horizontal page scroll.");
  assert(styles.includes("@media (max-width: 430px)"), "Mobile styles must explicitly cover 430px and narrower phones.");
  assert(styles.includes("min-height: 44px"), "Interactive mobile controls must have touch-friendly minimum height.");
  assert(styles.includes(".modal-card") && styles.includes("100dvh"), "Modals must fit small mobile viewports.");
  assert(styles.includes(".signup-chip-grid") && styles.includes("grid-template-columns: 1fr"), "Signup option grids must collapse on narrow mobile screens.");
  assert(!guestDesign.includes("margin: 260px"), "Guest hero search must not keep the old large mobile offset.");
  assert(guestDesign.includes("@media (max-width: 430px)") && guestDesign.includes("calc(100vw - 24px)"), "Guest design system must include narrow viewport containment.");

  assert(index.includes('<meta name="robots" content="index, follow">'), "Base document must include a robots meta tag.");
  assert(index.includes('property="og:title"') && index.includes('property="og:description"'), "Base document must include Open Graph metadata.");
  assert(index.includes('<link rel="canonical"'), "Base document must include a canonical URL.");
  assert(index.includes('type="application/ld+json"'), "Base document must include structured data.");
  assert(server.includes("function serveRobots") && server.includes("function serveSitemap"), "Server must expose robots.txt and sitemap.xml.");
  assert(server.includes("function injectSeo") && server.includes("function isNoIndexPath"), "Server must inject route-aware SEO and noindex metadata.");
  for (const privatePath of ["/admin", "/partner", "/account", "/login", "/forgot-password", "/reset-password"]) {
    assert(server.includes(`"${privatePath}"`), `${privatePath} must be marked as non-indexable.`);
  }
  assert(app.includes("function publicRouteMeta") && app.includes("function updateMeta"), "Client must update SEO metadata after SPA route changes.");
  assert(app.includes("updateMeta();") && app.includes("restaurants_seo_title"), "Client route rendering must refresh localized SEO metadata.");
  assert(app.includes('loading="lazy"') && app.includes('decoding="async"'), "Guest account/public images should use lazy or async decoding where image elements are rendered.");
  assert(app.includes("compact-restaurant-card") && app.includes("restaurant-discount-range"), "Public restaurant listings must render compact aggregated restaurant tiles.");
  assert(app.includes("function restaurantDetailPage(") && app.includes("data-restaurant-detail-page"), "Public restaurant detail routes must render a dedicated detail page.");
  assert(app.includes("async function loadPublicRestaurants()") && appCore.includes('pathname === "/public/restaurants"'), "Public restaurant listing must reuse the safe public restaurant-card API.");
  assert(!app.includes("${offerRows(restaurant)}"), "Public restaurant listing cards must not embed individual offer cards.");
  assert(styles.includes(".compact-restaurant-card") && styles.includes("grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))"), "Restaurant listing must use a compact responsive grid.");

  for (const [locale, source] of [["en", en], ["es", es], ["hu", hu]]) {
    const messages = JSON.parse(source);
    for (const key of [
      "restaurants_seo_title",
      "restaurants_seo_description",
      "offers_seo_title",
      "offers_seo_description",
      "restaurant_detail_seo_title",
      "restaurant_detail_seo_description",
      "signup_seo_title",
      "signup_seo_description"
    ]) {
      assert(String(messages[key] || "").trim(), `${locale}.json must define ${key}.`);
    }
  }
}

async function assertPublicApiDoesNotLeakPrivateFields() {
  const offers = await api("GET", "/public/offers?lang=hu");
  assert(Array.isArray(offers.offers) && offers.offers.length, "Public offers must load.");
  assertNoSensitiveKeys(offers.offers, "public.offers");
  assert(!offers.offers.some((offer) => offer.slug === "smarttable-test-bistro" || offer.restaurant_name === "SmartTable Test Bistro"), "Public offers must exclude test restaurant rows unless test_mode is explicitly enabled.");
  assert(!offers.offers.some((offer) => /verified\s+review\s+photo\s+qa|safe\s+production\s+qa|smarttable\s+qa/i.test([
    offer.offer_title,
    offer.title,
    offer.title_en,
    offer.offer_description,
    offer.offer_description_en,
    offer.description,
    offer.description_en
  ].filter(Boolean).join(" "))), "Public offers must exclude generated QA/test offer copy.");

  const testModeOffers = await api("GET", "/public/offers?lang=hu&test_mode=true");
  const testBistroOffers = testModeOffers.offers.filter((offer) => offer.slug === "smarttable-test-bistro" || offer.restaurant_name === "SmartTable Test Bistro");
  assert(testBistroOffers.length >= 3, "Public offers must include the production-safe SmartTable Test Bistro seed.");
  assert(testBistroOffers.every((offer) => offer.is_test_restaurant === true), "SmartTable Test Bistro offers must carry the public test restaurant flag.");
  assert(testBistroOffers.every((offer) => Number(offer.available_tables || 0) >= 10), "SmartTable Test Bistro offers must expose at least 10 test slots.");
  assert(testBistroOffers.every((offer) => String(offer.reservation_provider || "") === "internal_test"), "SmartTable Test Bistro must use the internal_test reservation provider.");
  assert(testBistroOffers.every((offer) => String(offer.district || "") === "Manhattan"), "SmartTable Test Bistro must use the pilot-safe Manhattan test location.");
  assert(testBistroOffers.every((offer) => String(offer.address || "").includes("Pilot Test Avenue")), "SmartTable Test Bistro must use an obviously fictional test address.");
  assert(testBistroOffers.some((offer) => String(offer.test_badge || "").includes("Test restaurant")), "SmartTable Test Bistro public rows must expose the safe test badge text.");

  const config = await api("GET", "/public/config");
  assert(config.platform_mode, "Public config must expose the current platform mode.");
  assertNoSensitiveKeys(config, "public.config");
}

async function assertRouteCompatibility() {
  const app = await read("public/app.js");
  const server = await read("server.js");
  const routes = [
    '"/"',
    '"/restaurants"',
    '"/offers"',
    '"/signup"',
    '"/login"',
    '"/forgot-password"',
    '"/terms"',
    '"/privacy"',
    '"/cookies"',
    '"/contact"',
    '"/account"',
    '"/account/reservations"',
    '"/account/favorites"',
    '"/partner"',
    '"/partner/reservations"',
    '"/admin"',
    '"/admin/platform-settings"'
  ];
  for (const route of routes) {
    assert(app.includes(route) || server.includes(route), `Route compatibility must include ${route}.`);
  }
  assert(server.includes("if (!path.extname(resolved))") && server.includes("index.html"), "Server must support direct SPA URL opening and refresh fallback.");
  assert(app.includes("currentPublicGuestRoute") && app.includes("publicRouteTarget"), "Guest route aliases must be routed inside the SPA.");
}

async function assertGuestPartnerReservationFlow() {
  const partner = await loginAs(TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
  const guest = await createGuest();
  const offers = await api("GET", "/public/offers?lang=en");
  const offer = (offers.offers || []).find((item) => {
    const restaurantMatches = !partner.profile.restaurant_id || item.restaurant_id === partner.profile.restaurant_id;
    return restaurantMatches && Number(item.available_tables || 0) > 0 && Number(item.max_party_size || 4) >= 2;
  });
  assert(offer, "A public offer for the demo partner must be available for end-to-end reservation checks.");

  const reservationPayload = await api("POST", "/reservations", {
    offer_id: offer.offer_id || offer.id,
    reservation_date: offer.offer_date || offer.reservation_date,
    reservation_time: offer.start_time || offer.offer_time,
    party_size: 2,
    notes: "Public experience end-to-end check.",
    guest_name: `${guest.payload.first_name} ${guest.payload.last_name}`,
    guest_email: guest.payload.email,
    guest_phone: guest.payload.phone,
    lang: "en"
  }, guest.headers);
  const reservationId = reservationPayload.reservation?.reservation_id || reservationPayload.reservation?.id;
  assert(reservationId, "Reservation request must return an id.");
  assert(["pending", "requested"].includes(reservationPayload.reservation?.status), "New guest reservation must start as pending.");

  const partnerReservations = await api("GET", "/partner/reservations", {}, partner.headers);
  assert(partnerReservations.reservations.some((item) => item.reservation_id === reservationId), "Reservation must appear in the correct partner dashboard.");

  const guestDenied = await apiRaw("GET", "/partner/reservations", {}, guest.headers);
  assert(guestDenied.status === 403, "Guest users must not open partner reservations.");

  const accepted = await api("PATCH", "/partner/reservations", { id: reservationId, status: "accepted" }, partner.headers);
  assert(accepted.reservation?.status === "accepted", "Partner acceptance must update reservation status.");

  const guestReservations = await api("GET", "/guest/reservations", {}, guest.headers);
  assert(guestReservations.reservations.some((item) => item.reservation_id === reservationId && item.status === "accepted"), "Accepted status must be visible in the guest account.");

  const notifications = await api("GET", "/guest/notifications", {}, guest.headers);
  assert((notifications.notifications || []).some((item) => String(item.reservation_id || item.entity_id || "").includes(reservationId) || String(item.message || "").includes(accepted.reservation?.reference || "")), "Reservation status change must create a guest-visible notification.");

  const otherGuest = await createGuest({ email: uniqueEmail("other-guest") });
  const otherReservations = await api("GET", "/guest/reservations", {}, otherGuest.headers);
  assert(!otherReservations.reservations.some((item) => item.reservation_id === reservationId), "A different guest must not see another guest's reservation.");
}

async function assertModeAndLanguageBehavior() {
  const config = await api("GET", "/public/config");
  assert(["basic", "ai_concierge"].includes(config.platform_mode), "Platform mode must have one central normalized value.");
  const app = await read("public/app.js");
  assert(app.includes("canShowFeature(\"ai.concierge\"") && app.includes("isBasicMode()"), "BASIC and AI_CONCIERGE UI must use the central feature registry.");
  assert(app.includes("supportedLanguages") && app.includes("hu"), "Hungarian must be a supported visible language.");
}

await assertResponsiveSeoAndSecurityWiring();
await assertPublicApiDoesNotLeakPrivateFields();
await assertRouteCompatibility();
await assertGuestPartnerReservationFlow();
await assertModeAndLanguageBehavior();

console.log("Public guest experience, SEO, responsive, privacy, route, and reservation flow checks passed.");
