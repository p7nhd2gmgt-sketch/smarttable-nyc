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
  "layoutHero(guestHeroSearchPanel())",
  "function guestHeroSearchPanel()",
  "offers_title",
  "filterBar()",
  "listView(restaurants)",
  "mapView(restaurants)"
], "Homepage and BASIC guest listing rendering");

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
  "function listView(restaurants)",
  "id=\"guest-restaurants\"",
  "restaurant-grid grouped-grid",
  "offers_empty",
  "function restaurantDetailModal()",
  "role=\"dialog\"",
  "aria-modal=\"true\"",
  "restaurantDetailTitle"
], "Restaurant list, empty state, and detail modal");

includesAll(app, [
  "function offerIsPublicVisible(",
  "isDisallowedStatus(offer.status || offer.offer_status || offer.deal_status)",
  "isPastOffer(offer)",
  "Number(offer.available_tables ?? offer.available_seats ?? 0) < 1",
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
  "data-reserve=\"${escapeAttr(offer.offer_id)}\"",
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
  "function viewAsPartner(",
  "\"/admin/impersonate-partner\""
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
    "skip_to_content"
  ]) {
    assert(String(messages[key] || "").trim(), `${locale}.json must define ${key}.`);
  }
}

includesAny(packageJson, [
  "\"check:basic-ui-behavior\"",
  "check-basic-ui-behavior.js"
], "Package scripts");

console.log("BASIC UI behavior checks passed.");
