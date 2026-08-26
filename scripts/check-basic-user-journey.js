import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";

const { handleApiRequest } = await import(`../src/app-core.js?basic-user-journey=${Date.now()}`);

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function rawApi(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    body,
    headers
  });
}

async function api(method, path, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.code || response.body?.error || "unknown error"}`);
  }
  return response.body;
}

function headersFor(token) {
  return { authorization: `Bearer ${token}` };
}

function uniqueEmail(prefix = "basic-journey") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function tomorrowDate() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function signupPayload(overrides = {}) {
  return {
    first_name: "Basic",
    last_name: "Guest",
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
    preferred_language: "en",
    ...overrides
  };
}

async function loginAs(email, password) {
  const result = await api("POST", "/auth/login", { email, password });
  assert.ok(result.access_token, `${email} must receive an access token.`);
  return { profile: result.profile, headers: headersFor(result.access_token), token: result.access_token };
}

async function createGuest(overrides = {}) {
  const payload = signupPayload(overrides);
  const result = await api("POST", "/auth/signup-guest", payload);
  assert.equal(result.profile?.role, "guest", "Signup must create a guest profile.");
  assert.ok(result.access_token, "Guest signup must return a session in demo mode.");
  return { payload, profile: result.profile, headers: headersFor(result.access_token), token: result.access_token };
}

async function createReservation(offer, guest, overrides = {}) {
  return await api("POST", "/reservations", {
    offer_id: offer.offer_id || offer.id,
    reservation_date: offer.reservation_date || offer.offer_date,
    reservation_time: offer.start_time || offer.offer_time,
    party_size: 2,
    notes: "BASIC user-journey check.",
    guest_name: guest.profile?.full_name || `${guest.payload.first_name} ${guest.payload.last_name}`,
    guest_email: guest.profile?.email || guest.payload.email,
    guest_phone: guest.payload.phone,
    guest_language: guest.payload.preferred_language || "en",
    ...overrides
  }, guest.headers);
}

function assertIncludes(source, tokens, label) {
  for (const token of tokens) {
    assert.ok(source.includes(token), `${label} is missing ${token}.`);
  }
}

function assertNoPosOrPublicAiInBasic(appSource, config) {
  assert.equal(config.platform_mode, "basic", "BASIC must be the active platform mode for BASIC QA.");
  assert.equal(config.ai_demo_visibility, false, "AI Demo Visibility must remain off for BASIC QA.");
  assertIncludes(appSource, [
    "function canShowFeature(",
    "function isBasicMode()",
    "if (!canShowFeature(\"ai.concierge\", { audience: \"guest\" })) return \"\";",
    "if (!canShowFeature(\"ai.partnerDemand\", { audience: \"partner\" })) return \"\";",
    "renderUnavailableRoute("
  ], "BASIC AI visibility guards");
  assert.ok(!/\bToast POS\b|\bSquare POS\b|\bClover\b|\bLightspeed\b|\bOracle MICROS\b|\bTouchBistro\b/i.test(appSource), "BASIC UI must not expose POS functionality.");
}

async function assertPublicGuestExperience(appSource, stylesSource) {
  const config = await api("GET", "/public/config");
  assertNoPosOrPublicAiInBasic(appSource, config);

  const offersResponse = await api("GET", "/public/offers?lang=en");
  const offers = offersResponse.offers || [];
  assert.ok(offers.length > 0, "Restaurant listings must render from public offers.");
  const offer = offers[0];
  for (const key of ["restaurant_name", "card_image", "cuisine", "district", "discount_value", "offer_title", "offer_date", "start_time"]) {
    assert.ok(offer[key] !== undefined && offer[key] !== null && String(offer[key]).trim() !== "", `Restaurant card data must include ${key}.`);
  }
  assert.ok(Number(offer.available_tables) > 0, "Public restaurant cards must expose active availability.");

  assertIncludes(appSource, [
    "function renderGuest(",
    "headerSearchPanelMarkup()",
    "headerOfferSearchForm",
    "function filterBar()",
    "function restaurantCard(",
    "data-restaurant-slug",
    "function restaurantDetailModal()",
    "function reservationModal()",
    "state.reservationSubmitting",
    "reservation_sending_label",
    "reservation_success_body",
    "This is not a confirmed reservation yet",
    "offers_empty",
    "renderFatalAppError()",
    "data-retry-app",
    "offerIsPublicVisible",
    "isPastOffer(offer)",
    "OFFER_INACTIVE",
    "OFFER_EXPIRED",
    "OFFER_SOLD_OUT"
  ], "Public guest UI flow");

  assertIncludes(appSource, [
    "name=\"restaurantName\"",
    "name=\"date\" type=\"date\"",
    "name=\"time\" type=\"time\"",
    "name=\"partySize\" type=\"number\"",
    "optionSelect(\"neighborhood\"",
    "optionSelect(\"cuisine\"",
    "select name=\"discount\"",
    "clear_filters_button"
  ], "Search and filter UI");

  assertIncludes(stylesSource, [
    ".mvp-hero",
    "grid-template-columns: minmax(0, 1.65fr) minmax(0, 0.95fr)",
    "@media (max-width: 430px)",
    "overflow-x: hidden",
    ".restaurant-modal__body",
    "overflow-y: auto"
  ], "Responsive public UI");

  const invalidReservation = await rawApi("POST", "/reservations", {
    offer_id: offer.offer_id,
    reservation_date: offer.offer_date,
    reservation_time: offer.start_time,
    party_size: 0,
    guest_name: "",
    guest_email: "bad-email",
    guest_phone: ""
  });
  assert.equal(invalidReservation.status, 400, "Invalid reservation form submissions must fail with a useful validation error.");

  return offer;
}

async function assertGuestAccountJourney(publicOffer) {
  const noConsent = await rawApi("POST", "/auth/signup-guest", signupPayload({
    email: uniqueEmail("missing-consent"),
    terms_consent: false
  }));
  assert.equal(noConsent.status, 400, "Terms consent must be enforced during signup.");

  const guest = await createGuest({ preferred_language: "hu" });
  const login = await api("POST", "/auth/login", { email: guest.payload.email, password: guest.payload.password });
  assert.equal(login.profile?.role, "guest", "Guest login must return a guest role.");

  const logout = await api("POST", "/auth/logout", {}, guest.headers);
  assert.equal(logout.logged_out, true, "Guest logout endpoint must work.");

  const loggedOutAccount = await rawApi("GET", "/guest/account");
  assert.equal(loggedOutAccount.status, 401, "Protected guest account API must reject logged-out users.");

  const account = await api("GET", "/guest/account", {}, guest.headers);
  assert.equal(account.guest?.email, guest.payload.email, "Guest account dashboard must display the signed-in guest profile.");
  assert.ok(account.guest, "Guest account dashboard must include guest profile data.");

  const follow = await api("POST", "/public/follow", {
    restaurant_id: publicOffer.restaurant_id,
    guest_email: guest.payload.email,
    guest_name: `${guest.payload.first_name} ${guest.payload.last_name}`,
    notification_enabled: true
  });
  assert.ok(follow.follower, "Favorites/follow must work when implemented in BASIC.");

  const favorites = await api("GET", "/guest/favorites", {}, guest.headers);
  assert.ok(favorites.favorites.some((item) => item.restaurant_id === publicOffer.restaurant_id), "Guest favorites page data must include followed restaurants.");

  const reservation = await createReservation(publicOffer, guest);
  assert.equal(reservation.reservation?.status, "pending", "Successful guest reservation request must create a pending reservation.");
  assert.ok(reservation.email_delivery, "Reservation success must return truthful email delivery state.");

  const duplicate = await rawApi("POST", "/reservations", {
    offer_id: publicOffer.offer_id,
    reservation_date: publicOffer.offer_date,
    reservation_time: publicOffer.start_time,
    party_size: 2,
    guest_name: `${guest.payload.first_name} ${guest.payload.last_name}`,
    guest_email: guest.payload.email,
    guest_phone: guest.payload.phone
  }, guest.headers);
  assert.equal(duplicate.status, 409, "Duplicate guest reservation submissions must be prevented.");

  const reservations = await api("GET", "/guest/reservations", {}, guest.headers);
  assert.ok(reservations.reservations.some((item) => item.reservation_id === reservation.reservation.reservation_id && item.status === "pending"), "Guest reservation history must show pending requests.");

  return { guest, reservation: reservation.reservation };
}

async function assertPartnerJourney(publicOffer, appSource) {
  const guestDenied = await loginAs(TEST_ACCOUNTS.guest.email, TEST_ACCOUNTS.guest.password);
  const deniedPartner = await rawApi("GET", "/partner/profile", {}, guestDenied.headers);
  assert.equal(deniedPartner.status, 403, "Unauthorized users must not access partner routes.");

  const partner = await loginAs(TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
  const profile = await api("GET", "/partner/profile", {}, partner.headers);
  assert.ok(profile.restaurant?.id, "Partner dashboard must load the partner restaurant profile.");

  const offers = await api("GET", "/partner/offers", {}, partner.headers);
  assert.ok(Array.isArray(offers.offers), "Partner offer list must load.");

  const createdOffer = await api("POST", "/partner/offers", {
    title_en: "BASIC QA controlled offer",
    description_en: "Created by the BASIC user-journey check.",
    offer_date: tomorrowDate(),
    start_time: "17:30",
    end_time: "19:00",
    available_tables: 2,
    max_party_size: 4,
    discount_value: 15,
    status: "active",
    valid_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  }, partner.headers);
  assert.ok(createdOffer.offer?.id, "Partner must be able to create an offer.");

  const editedOffer = await api("PATCH", "/partner/offers", {
    id: createdOffer.offer.id,
    discount_value: 20,
    available_tables: 3
  }, partner.headers);
  assert.equal(Number(editedOffer.offer.discount_value), 20, "Partner must be able to edit an own offer.");

  const deletedOffer = await api("DELETE", "/partner/offers", { id: createdOffer.offer.id }, partner.headers);
  assert.equal(deletedOffer.offer.status, "expired", "Partner delete/deactivate must make an offer non-active.");

  const otherRestaurantAttempt = await rawApi("GET", "/partner/profile?restaurant_id=not-their-restaurant", {}, partner.headers);
  assert.equal(otherRestaurantAttempt.status, 403, "Partner must not modify or view another restaurant's data.");

  const guestForAccept = await createGuest({ email: uniqueEmail("partner-accept") });
  const createdReservation = await createReservation(publicOffer, guestForAccept);
  const reservationId = createdReservation.reservation.reservation_id;
  const pendingList = await api("GET", `/partner/reservations?status=pending&search=${encodeURIComponent(createdReservation.reservation.reference)}`, {}, partner.headers);
  assert.ok(pendingList.reservations.some((item) => item.reservation_id === reservationId), "Incoming reservation requests must be visible to the partner.");

  const accepted = await api("PATCH", "/partner/reservations", { id: reservationId, status: "accepted" }, partner.headers);
  assert.equal(accepted.reservation.status, "accepted", "Accept must update the reservation status.");
  const repeatedAccept = await api("PATCH", "/partner/reservations", { id: reservationId, status: "accepted" }, partner.headers);
  assert.equal(repeatedAccept.reservation.status_unchanged, true, "Repeated Accept must be idempotent and non-actionable.");

  const guestForDecline = await createGuest({ email: uniqueEmail("partner-decline") });
  const declinable = await createReservation(publicOffer, guestForDecline);
  const declined = await api("PATCH", "/partner/reservations", { id: declinable.reservation.reservation_id, status: "declined" }, partner.headers);
  assert.equal(declined.reservation.status, "rejected", "Decline must use the canonical internal rejected status.");
  const repeatDecline = await api("PATCH", "/partner/reservations", { id: declinable.reservation.reservation_id, status: "declined" }, partner.headers);
  assert.equal(repeatDecline.reservation.status_unchanged, true, "Repeated Decline must be idempotent and non-actionable.");

  assertIncludes(appSource, [
    "confirm(t(\"accept_reservation_confirm\"",
    "confirm(t(\"decline_reservation_confirm\"",
    "class=\"ghost-button warning\" data-status=\"rejected\"",
    "reservation_no_actions_available",
    "function renderBasicPartner(",
    "partnerTodayOffersPanel()",
    "partnerTodayReservationLeadsPanel()",
    "canShowFeature(\"ai.partnerDemand\""
  ], "Partner BASIC UI safeguards");

  return partner;
}

async function assertAdminAndSuperAdminJourney(appSource) {
  const guest = await loginAs(TEST_ACCOUNTS.guest.email, TEST_ACCOUNTS.guest.password);
  const guestAdminDenied = await rawApi("GET", "/admin/stats", {}, guest.headers);
  assert.equal(guestAdminDenied.status, 403, "Guests must not access admin routes.");

  const partner = await loginAs(TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
  const partnerAdminDenied = await rawApi("GET", "/admin/restaurants", {}, partner.headers);
  assert.equal(partnerAdminDenied.status, 403, "Partners must not access admin routes.");

  const admin = await loginAs(TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
  const stats = await api("GET", "/admin/stats", {}, admin.headers);
  assert.ok(stats.stats, "Admin dashboard must load.");
  const restaurants = await api("GET", "/admin/restaurants", {}, admin.headers);
  assert.ok(Array.isArray(restaurants.restaurants), "Admin must be able to manage restaurants.");
  const offers = await api("GET", "/admin/offers", {}, admin.headers);
  assert.ok(Array.isArray(offers.offers), "Admin must be able to manage offers.");
  const partners = await api("GET", "/admin/partners", {}, admin.headers);
  assert.ok(Array.isArray(partners.partners), "Admin must be able to manage relevant partner users.");
  const content = await api("GET", "/admin/content", {}, admin.headers);
  assert.ok(Array.isArray(content.content), "Admin must be able to manage supported content/translations.");

  const regularAdminSettings = await api("GET", "/admin/settings/platform-mode", {}, admin.headers);
  assert.equal(regularAdminSettings.can_edit, false, "Regular admin must not get Super Admin-only platform-mode editing.");
  const regularAdminPatch = await rawApi("PATCH", "/admin/settings/platform-mode", { platform_mode: "ai_concierge" }, admin.headers);
  assert.equal(regularAdminPatch.status, 403, "Regular admin direct URL/API access to Super Admin-only controls must be rejected.");

  const superAdmin = await loginAs(TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);
  const superSettings = await api("GET", "/admin/settings/platform-mode", {}, superAdmin.headers);
  assert.equal(superSettings.can_edit, true, "Super Admin must be able to manage platform mode where implemented.");
  assert.equal(superSettings.platform_mode, "basic", "BASIC must remain the default/current platform mode during this QA.");
  const refreshedConfig = await api("GET", "/public/config");
  assert.equal(refreshedConfig.platform_mode, "basic", "Platform mode state must remain consistent after refresh/read.");

  assertIncludes(appSource, [
    "restaurant_suspend_confirm",
    "delete_offer_confirm",
    "platformMode.switchConfirmation",
    "platform_mode_super_admin_only",
    "data-view-as-partner",
    "function viewAsPartner("
  ], "Admin and Super Admin UI safeguards");

  const featureStatus = await api("GET", "/system/feature-status");
  const unfinished = (featureStatus.features || []).filter((item) => ["demo_only", "coming_soon", "requires_integration", "requires_more_data"].includes(item.status));
  assert.ok(unfinished.length > 0, "Unfinished feature statuses must be classified instead of exposed as production-ready.");
}

async function assertLocalizationAndStatusMapping() {
  const [en, es, hu, appSource] = await Promise.all([
    read("public/locales/en.json"),
    read("public/locales/es.json"),
    read("public/locales/hu.json"),
    read("public/app.js")
  ]);
  const locales = { en: JSON.parse(en), es: JSON.parse(es), hu: JSON.parse(hu) };
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of [
      "reservations_pending_label",
      "reservation_status_accepted",
      "reservation_status_declined",
      "reservation_status_cancelled",
      "reservation_status_completed",
      "accept_reservation_confirm",
      "decline_reservation_confirm",
      "reservation_success_body",
      "reservation_success_body_email_unconfirmed",
      "route_forbidden_title",
      "not_found_title"
    ]) {
      assert.ok(String(messages[key] || "").trim(), `${locale}.json must define ${key}.`);
    }
  }
  assertIncludes(appSource, [
    "rejected: [\"reservation_status_declined\", \"Declined\"]",
    "statusBadge(reservation.status, reservationStatusLabel(reservation.status))"
  ], "User-facing status mapping");
}

const [appSource, stylesSource] = await Promise.all([
  read("public/app.js"),
  read("public/styles.css")
]);

const publicOffer = await assertPublicGuestExperience(appSource, stylesSource);
await assertGuestAccountJourney(publicOffer);
await assertPartnerJourney(publicOffer, appSource);
await assertAdminAndSuperAdminJourney(appSource);
await assertLocalizationAndStatusMapping();

console.log("BASIC user-journey QA checks passed.");
