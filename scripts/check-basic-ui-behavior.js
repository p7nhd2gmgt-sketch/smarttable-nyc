import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function includesAll(source, tokens, label) {
  for (const token of tokens) {
    assert(source.includes(token), `${label} is missing ${token}.`);
  }
}

function includesAny(source, tokens, label) {
  assert(tokens.some((token) => source.includes(token)), `${label} is missing one of: ${tokens.join(", ")}.`);
}

function offerFormTemplates(source) {
  const matches = [...source.matchAll(/<form class="mini-form offer-form" id="offerForm">([\s\S]*?)<\/form>/g)];
  return matches.map((match) => match[1] || "");
}

function parseLocale(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

const [
  app,
  styles,
  guestDesign,
  indexHtml,
  appCore,
  packageJson,
  publicExperienceCheck,
  guestAccountCheck,
  reservationLifecycleCheck,
  routeProtectionCheck,
  platformModeCheck,
  enSource,
  esSource,
  huSource
] = await Promise.all([
  read("public/app.js"),
  read("public/styles.css"),
  read("public/guest/design-system.css"),
  read("public/index.html"),
  read("src/app-core.js"),
  read("package.json"),
  read("scripts/check-public-experience.js"),
  read("scripts/check-guest-account.js"),
  read("scripts/check-reservation-lifecycle.js"),
  read("scripts/check-route-protection.js"),
  read("scripts/check-platform-mode.js"),
  read("public/locales/en.json"),
  read("public/locales/es.json"),
  read("public/locales/hu.json")
]);

const locales = {
  en: parseLocale(enSource, "English locale"),
  es: parseLocale(esSource, "Spanish locale"),
  hu: parseLocale(huSource, "Hungarian locale")
};

includesAll(app, [
  "function renderGuest(",
  "layoutHero(\"\", { variant: \"home\" })",
  "function homepageHeroActions()",
  "data-home-find-table",
  "event.stopPropagation();",
  "openHeaderSearch();",
  "document.querySelector(\".topbar\")?.scrollIntoView({ behavior: reduceMotion ? \"auto\" : \"smooth\", block: \"start\" })",
  "data-home-browse-restaurants",
  "history.pushState(null, \"\", \"/restaurants\")",
  "function headerSearchPanelMarkup()",
  "id=\"headerOfferSearchForm\"",
  "offers_title",
  "filterBar()",
  "listView(restaurants)",
  "mapView(restaurants)"
], "Homepage and BASIC guest listing rendering");

includesAll(app, [
  "function activeGuestFilterCount(",
  "function syncGuestNativeFilterControl(",
  "guest-offer-filter-shell",
  "data-toggle-offer-filters",
  "aria-controls=\"guestOfferFilters\"",
  "id=\"guestOfferFilters\"",
  "guest-native-filter-control",
  "filter_any_date_placeholder",
  "filter_any_time_placeholder",
  "guest-offer-filter-actions",
  "apply_filters_button",
  "state.offerFiltersExpanded = false"
], "Compact guest offer filter behavior");

assert(
  !app.includes('<option value="admin_order"'),
  "Guest offer sorting must not expose the internal admin custom-order option."
);

includesAll(styles, [
  ".guest-offer-filter-toolbar",
  ".guest-offer-filter-shell.is-open .guest-offer-filters",
  "grid-template-columns: repeat(2, minmax(0, 1fr))",
  "input[type=\"date\"]",
  ".guest-native-filter-placeholder",
  ".guest-native-filter-control.has-value",
  ".guest-native-filter-control:not(.has-value) input[type=\"date\"]",
  ".guest-native-filter-control:not(.has-value) input[type=\"time\"]",
  "::-webkit-date-and-time-value",
  "::-webkit-datetime-edit-fields-wrapper",
  "-webkit-text-fill-color: transparent",
  "-webkit-text-fill-color: #f4f2e9"
], "Responsive, high-contrast guest offer filters");

includesAll(app, [
  "function canShowFeature(",
  "function isBasicMode()",
  "function guestAiConciergeHomepageEntry()",
  "if (!canShowFeature(\"ai.concierge\", { audience: \"guest\" })) return \"\";",
  "function aiConciergeSection()",
  "if (!canShowFeature(\"ai.concierge\", { allowDemo: true })) return \"\";"
], "AI-only public sections hidden by feature registry");

includesAll(app, [
  "function restaurantCard(",
  "compact-restaurant-card",
  "restaurant-discount-range",
  "restaurantOfferAggregate(restaurant)",
  "restaurantTileAvailabilityLabel(aggregate)",
  "async function loadPublicRestaurants()",
  "const testDataQuery = boolValue(includeTestData) ? \"&include_test_data=true\" : \"\";",
  "api(`/public/restaurants?lang=${encodeURIComponent(state.lang)}${testDataQuery}`)",
  "function listView(restaurants)",
  "id=\"guest-restaurants\"",
  "restaurant-grid grouped-grid compact-restaurant-grid",
  "offers_empty",
  "function restaurantDetailPage(",
  "data-restaurant-detail-page",
  "guestModals({ includeRestaurantDetail: false })",
  "function restaurantDetailModal()",
  "role=\"dialog\"",
  "aria-modal=\"true\"",
  "restaurantDetailTitle"
], "Compact restaurant list, empty state, detail page, and detail modal");

includesAll(app, [
  "function offerIsPublicVisible(",
  "isDisallowedStatus(offer.status || offer.offer_status || offer.deal_status)",
  "isPastOffer(offer)",
  "availableTables <= reservedTables",
  "Number(offer.available_seats ?? 0) < 1",
  "OFFER_INACTIVE: \"reservation_error_offer_inactive\"",
  "OFFER_EXPIRED: \"reservation_error_offer_expired\"",
  "OFFER_SOLD_OUT: \"reservation_error_offer_sold_out\""
], "Inactive, expired, sold-out, and unavailable offers blocked from booking UI");

includesAll(appCore, [
  "\"OFFER_INACTIVE\"",
  "status === \"active\"",
  "availableTables(offer) > 0"
], "Backend offer availability remains authoritative");

includesAll(app, [
  "function reservationModal()",
  "data-reserve=\"${escapeAttr(offer?.offer_id || \"\")}\"",
  "name=\"reservation_type\"",
  "value=\"${escapeAttr(isStandardReservation ? \"standard\" : \"discount_offer\")}\"",
  "name=\"restaurant_id\"",
  "name=\"reservation_date\" type=\"date\"",
  "name=\"reservation_time\" type=\"time\"",
  "name=\"party_size\" type=\"number\"",
  "name=\"guest_email\" type=\"email\" required",
  "state.reservationSubmitting",
  "reservation_sending_label",
  "submitReservation"
], "Booking form validation and submit loading state");

includesAll(app, [
  "function successModal()",
  "reservation_success_title",
  "reservation_success_body",
  "reservation_success_body_email_unconfirmed",
  "This is not a confirmed reservation yet",
  "guestEmailAccepted"
], "Booking success wording distinguishes submitted request from confirmed reservation");

includesAll(app, [
  "function reservationStatusLabel(",
  "pending: [\"reservations_pending_label\", \"Pending\"]",
  "accepted: [\"reservation_status_accepted\", \"Accepted\"]",
  "rejected: [\"reservation_status_declined\", \"Declined\"]",
  "cancelled: [\"reservation_status_cancelled\", \"Cancelled\"]",
  "completed: [\"reservation_status_completed\", \"Completed\"]",
  "statusBadge(reservation.status, reservationStatusLabel(reservation.status))"
], "Guest-safe reservation status labels");

includesAll(app, [
  "function primaryOfferContentFields(",
  "name=\"content_language\"",
  "textInput(\"title_primary\"",
  "textArea(\"description_primary\"",
  "function offerPayloadFromForm(",
  "data[`title_${language}`] = title",
  "data[`description_${language}`] = description",
  "function localizedContentField("
], "Single-source offer content authoring");

const partnerOfferForms = offerFormTemplates(app);
assert(partnerOfferForms.length >= 2, "Partner dashboards must render the BASIC and advanced offer forms.");
for (const template of partnerOfferForms) {
  assert(template.includes("primaryOfferContentFields(restaurant)"), "Partner offer forms must use one primary title/description block.");
  for (const legacyField of ["title_en", "title_es", "title_hu", "description_en", "description_es", "description_hu"]) {
    assert(!template.includes(`name=\"${legacyField}\"`) && !template.includes(`textInput(\"${legacyField}\"`) && !template.includes(`textArea(\"${legacyField}\"`), `Partner offer form must not require ${legacyField}.`);
  }
}

includesAll(app, [
  "confirm(t(\"cancel_reservation_confirm\"",
  "confirm(t(\"accept_reservation_confirm\"",
  "confirm(t(\"decline_reservation_confirm\"",
  "class=\"ghost-button warning\" data-status=\"rejected\"",
  "reservation_no_actions_available",
  "relatedButtons.forEach((item) => setButtonPending(item, true))"
], "Guest cancellation and partner accept/decline UI safeguards");

includesAll(styles, [
  ".ghost-button.warning",
  ".ghost-button.danger",
  ".primary-button:disabled",
  ".ghost-button:disabled"
], "Action button visual meaning");

includesAll(app, [
  "function currentProtectedAreaRoute()",
  "function guardProtectedAreaRoute(",
  "function renderForbiddenRoute(",
  "function renderUnavailableRoute(",
  "function renderNotFoundRoute(",
  "route_forbidden_title",
  "not_found_title"
], "Unauthorized, unavailable, and not-found UI routes");

includesAll(app, [
  "function isGuestSession()",
  "const session = currentSession();",
  "return Boolean(session) && normalizeRole(session.profile?.role) === \"guest\";",
  "if (accountRoute === \"login\")",
  "renderGuestLogin();",
  "else if (state.mode === \"guest\") renderGuestLogin();"
], "Guest login and logged-out route guard regression coverage");

includesAll(app, [
  "function isSuperAdmin()",
  "platform_mode_super_admin_only",
  "data-view-as-partner",
  "data-view-as-guest",
  "function viewAsPartner(",
  "function viewAsAccount(",
  "data-restaurant-partner-mode",
  "restaurantCapacityForm",
  "restaurant_table_allocation_note",
  "function restaurantDetailPanel(",
  "data-restaurant-access-action",
  "partner_access_mode",
  "partner.invitation_id || partner.id",
  "\"/admin/impersonate-account\"",
  "\"/api/admin/impersonation/end\""
], "Super Admin-only controls");

includesAll(indexHtml, [
  "class=\"skip-link\"",
  "<main id=\"app\"",
  "aria-live=\"polite\""
], "Accessible document shell");

includesAll(app, [
  "event.key === \"Escape\"",
  "event.key !== \"Tab\"",
  "restoreGuestModalFocus()",
  "aria-label",
  "aria-busy=\"true\"",
  "renderFatalAppError()",
  "data-retry-app"
], "Modal keyboard and critical accessibility behavior");

includesAll(styles, [
  ":focus-visible",
  "prefers-reduced-motion: reduce",
  "min-height: 44px",
  "@media (max-width: 430px)"
], "Focus, reduced motion, and mobile touch readiness");

includesAll(guestDesign, [
  ".guest-mobile-nav",
  ".guest-empty-state",
  ".guest-error-state",
  ".guest-success-state",
  ".guest-skeleton"
], "Guest design system state components");

includesAll(publicExperienceCheck, [
  "assertResponsiveSeoAndSecurityWiring",
  "assertPublicApiDoesNotLeakPrivateFields",
  "assertGuestPartnerReservationFlow",
  "Guest users must not open partner reservations"
], "Public experience automated coverage");

includesAll(guestAccountCheck, [
  "Duplicate active reservation requests must be blocked.",
  "Expired or unavailable offer dates must be blocked.",
  "Inactive reservation times must be blocked.",
  "Party sizes above the offer maximum must be blocked.",
  "Repeated cancellation must be blocked."
], "Guest reservation validation automated coverage");

includesAll(reservationLifecycleCheck, [
  "Repeated acceptance must not trigger duplicate emails.",
  "Accepted reservations must not be declined later.",
  "Partner must not modify another restaurant's reservation.",
  "Super Admin reservation search and status filter must work.",
  "Super Admin cancellation must require explicit confirmation."
], "Reservation lifecycle automated coverage");

includesAll(routeProtectionCheck, [
  "Guests must not access partner routes.",
  "Guests must not access admin routes.",
  "Partners must not request another restaurant reservation list by restaurant_id.",
  "Regular admins must not receive Super Admin platform-mode permission."
], "Authorization automated coverage");

includesAll(platformModeCheck, [
  "Regular admins must not be able to change platform mode.",
  "Super Admin must be able to reset the platform to Basic mode for checks.",
  "BASIC guest reservation request must create a pending reservation.",
  "AI Demo Visibility"
], "Platform mode automated coverage");

for (const [locale, messages] of Object.entries(locales)) {
  for (const key of [
    "offers_title",
    "offers_empty",
    "restaurant_no_active_offers_label",
    "restaurant_no_active_offers",
    "restaurant_discount_single",
    "restaurant_discount_range",
    "restaurant_tile_open_label",
    "restaurants_back_link",
    "remove_favorite_accessible_label",
    "reservation_success_title",
    "reservation_success_body",
    "reservation_success_body_email_unconfirmed",
    "reservations_pending_label",
    "reservation_status_accepted",
    "reservation_status_declined",
    "reservation_status_cancelled",
    "reservation_status_completed",
    "accept_reservation_confirm",
    "decline_reservation_confirm",
    "cancel_reservation_confirm",
    "route_forbidden_title",
    "not_found_title",
    "app_error_title",
    "retry_button",
    "skip_to_content",
    "filters_title",
    "filter_summary_default",
    "active_filters_label",
    "show_filters_button",
    "hide_filters_button",
    "apply_filters_button",
    "clear_filters_button"
  ]) {
    assert(String(messages[key] || "").trim(), `${locale}.json must define ${key}.`);
  }
  for (const key of [
    "content_language_english",
    "content_language_spanish",
    "content_language_hungarian",
    "offer_content_language_note",
    "offer_primary_title_label",
    "offer_primary_description_label"
  ]) {
    assert(String(messages[key] || "").trim(), `${locale}.json must define ${key}.`);
  }
}

const expectedHomepageHero = {
  en: {
    homepage_hero_kicker: "SMARTTABLE",
    homepage_hero_title: "Book great restaurants for less",
    homepage_hero_subtitle: "Discover discounted restaurant tables during selected times and send your reservation request directly to the restaurant.",
    homepage_hero_primary_cta: "Find a Table",
    homepage_hero_secondary_cta: "Browse Restaurants"
  },
  es: {
    homepage_hero_kicker: "SMARTTABLE",
    homepage_hero_title: "Reserva excelentes restaurantes por menos",
    homepage_hero_subtitle: "Descubre mesas con descuento en horarios seleccionados y env\u00eda tu solicitud de reserva directamente al restaurante.",
    homepage_hero_primary_cta: "Buscar una mesa",
    homepage_hero_secondary_cta: "Ver restaurantes"
  },
  hu: {
    homepage_hero_kicker: "SMARTTABLE",
    homepage_hero_title: "Foglalj nagyszer\u0171 \u00e9ttermekbe kedvez\u0151bb \u00e1ron",
    homepage_hero_subtitle: "Fedezz fel kedvezm\u00e9nyes \u00e9ttermi asztalokat kiv\u00e1lasztott id\u0151pontokban, \u00e9s k\u00fcldd el foglal\u00e1si k\u00e9relmedet k\u00f6zvetlen\u00fcl az \u00e9tteremnek.",
    homepage_hero_primary_cta: "Asztalt keresek",
    homepage_hero_secondary_cta: "\u00c9ttermek b\u00f6ng\u00e9sz\u00e9se"
  }
};

for (const [locale, expectedMessages] of Object.entries(expectedHomepageHero)) {
  for (const [key, expectedValue] of Object.entries(expectedMessages)) {
    assert(locales[locale][key] === expectedValue, `${locale}.json must define ${key} as ${expectedValue}.`);
  }
}

includesAny(packageJson, [
  "\"check:basic-ui-behavior\"",
  "check-basic-ui-behavior.js"
], "Package scripts");

console.log("BASIC UI behavior checks passed.");
