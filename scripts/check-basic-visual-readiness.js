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

function parseLocale(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertLocaleKeys(locales, keys, label) {
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of keys) {
      const value = String(messages[key] || "").trim();
      assert(value, `${label}: ${locale}.json is missing ${key}.`);
      assert(value !== key, `${label}: ${locale}.json displays raw key ${key}.`);
    }
  }
}

const [
  indexHtml,
  app,
  styles,
  guestDesign,
  enSource,
  esSource,
  huSource
] = await Promise.all([
  read("public/index.html"),
  read("public/app.js"),
  read("public/styles.css"),
  read("public/guest/design-system.css"),
  read("public/locales/en.json"),
  read("public/locales/es.json"),
  read("public/locales/hu.json")
]);

const locales = {
  en: parseLocale(enSource, "English locale"),
  es: parseLocale(esSource, "Spanish locale"),
  hu: parseLocale(huSource, "Hungarian locale")
};

const viewportMatrix = {
  desktop: [
    [1440, 900],
    [1366, 768],
    [1280, 720]
  ],
  tablet: [
    [1024, 900],
    [1024, 768],
    [820, 1180],
    [768, 1024]
  ],
  mobile: [
    [430, 932],
    [390, 844],
    [375, 667],
    [360, 800],
    [320, 568]
  ]
};

assert(viewportMatrix.desktop.length === 3, "Desktop visual QA matrix must include 3 viewport sizes.");
assert(viewportMatrix.tablet.length === 4, "Tablet visual QA matrix must include 4 viewport sizes.");
assert(viewportMatrix.mobile.length === 5, "Mobile visual QA matrix must include 5 viewport sizes.");

for (const width of [320, 390, 768, 1024, 1366]) {
  const covered = Object.values(viewportMatrix).flat().some(([candidate]) => candidate === width);
  assert(covered, `Signup stepper requested viewport width ${width}px must remain in the regression matrix.`);
}

includesAll(indexHtml, [
  "class=\"skip-link\"",
  "href=\"#app\"",
  "<main id=\"app\"",
  "aria-live=\"polite\"",
  "tabindex=\"-1\"",
  "data-lang=\"en\"",
  "data-lang=\"es\"",
  "data-lang=\"hu\""
], "Accessible localized application shell");

includesAll(styles, [
  "* {",
  "box-sizing: border-box",
  "overflow-x: hidden",
  "overflow-x: clip",
  "input,",
  "select,",
  "textarea",
  "width: 100%",
  "max-width: 100%",
  "min-height: 44px",
  ".topbar",
  ".top-actions",
  ".language-switcher",
  ".mvp-hero",
  "max-width: 1440px",
  "grid-template-columns: minmax(0, 1.65fr) minmax(0, 0.95fr)",
  ".mvp-hero > *",
  "min-width: 0",
  ".guest-hero-search",
  ".guest-field-grid",
  ".restaurant-grid",
  ".grouped-grid",
  "aspect-ratio",
  "object-fit: cover",
  "@media (max-width: 1180px)",
  "@media (max-width: 1050px)",
  "@media (max-width: 900px)",
  "@media (max-width: 860px)",
  "@media (max-width: 760px)",
  "@media (max-width: 460px)",
  "@media (max-width: 430px)",
  "grid-template-columns: 1fr"
], "Phase 17 responsive containment CSS");

includesAll(styles, [
  "@media (max-width: 760px)",
  ".top-actions",
  "grid-template-columns: repeat(2, minmax(0, 1fr))",
  ".language-switcher",
  "display: contents",
  "overflow-wrap: anywhere",
  "white-space: normal"
], "Mobile header action containment regression coverage");

includesAll(app, [
  "function guestStandaloneShell(",
  "guestStandaloneShell(`",
  "shortLabelKey: \"signup_step_short_account\"",
  "function signupStepNavLabel(",
  "signupStepNavLabel(index)",
  "class=\"signup-progress-summary\"",
  "aria-current=\"step\"",
  "aria-hidden=\"true\"",
  "function scrollActiveSignupStepIntoView(",
  "scrollIntoView({ block: \"nearest\", inline: \"center\" })",
  "signupStepTitle()"
], "Signup stepper uses short navigation labels while preserving full content titles");

includesAll(styles, [
  ".guest-standalone-page",
  "max-width: 1240px",
  ".guest-signup-shell",
  ".signup-progress-nav",
  ".signup-progress-summary",
  ".signup-progress",
  "grid-template-columns: repeat(7, minmax(0, 1fr))",
  ".signup-progress li",
  "display: flex",
  "min-width: 0",
  "height: 100%",
  "grid-template-rows: auto 1fr",
  "overflow-wrap: anywhere",
  "white-space: normal",
  "grid-template-columns: repeat(7, minmax(92px, 1fr))",
  "overflow-x: auto",
  "scroll-snap-type: x proximity"
], "Signup stepper responsive non-overlap regression coverage");

includesAll(styles, [
  ".modal-backdrop",
  ".modal-card",
  ".restaurant-detail-modal,",
  ".restaurant-modal",
  "max-height: calc(100dvh - 32px)",
  "width: min(1100px, calc(100vw - 32px))",
  "display: flex",
  "flex-direction: column",
  "overflow: hidden",
  ".restaurant-detail-body,",
  ".restaurant-modal__body",
  "overflow-y: auto",
  "overflow-x: hidden",
  "overscroll-behavior: contain",
  "-webkit-overflow-scrolling: touch",
  ".detail-close",
  "body.modal-open"
], "Phase 17 modal scroll and close-control CSS");

includesAll(styles, [
  ".partner-wide-shell",
  ".partner-wide-shell .saas-layout",
  ".partner-wide-shell .dashboard-content",
  ".partner-wide-shell .partner-management-grid",
  ".table-wrap",
  "overflow-x: auto",
  ".partner-wide-shell .partner-data-table",
  ".partner-wide-shell .partner-reservations-table",
  "min-width: 940px",
  ".reservation-history-card",
  ".account-tabs"
], "Phase 17 dashboard and table responsive CSS");

includesAll(styles, [
  ".skip-link",
  ".skip-link:focus",
  ":focus-visible",
  "button:focus-visible",
  "input:focus-visible",
  "select:focus-visible",
  "textarea:focus-visible",
  "prefers-reduced-motion: reduce",
  ".ghost-button.warning",
  ".ghost-button.danger",
  ".field-error",
  ".has-error input",
  ".app-error-state",
  ".empty-state"
], "Phase 19 accessibility and state CSS");

includesAll(guestDesign, [
  "--guest-container: min(1180px, calc(100vw - 32px))",
  "max-width: 100%",
  "min-width: 0",
  ".guest-mobile-nav",
  ".guest-empty-state",
  ".guest-error-state",
  ".guest-success-state",
  ".guest-skeleton",
  "@media (max-width: 760px)",
  "@media (max-width: 430px)",
  "calc(100vw - 24px)"
], "Guest design-system mobile readiness");

includesAll(app, [
  "function handleGuestModalKeydown(",
  "event.key === \"Escape\"",
  "event.key !== \"Tab\"",
  "restoreGuestModalFocus()",
  "role=\"dialog\"",
  "aria-modal=\"true\"",
  "aria-label",
  "role=\"alert\"",
  "aria-busy=\"true\"",
  "loading=\"lazy\"",
  "decoding=\"async\"",
  "photo_submission_thumbnail_alt",
  "guest_dining_photo_alt",
  "statusBadge(reservation.status, reservationStatusLabel(reservation.status))",
  "rejected: [\"reservation_status_declined\", \"Declined\"]",
  "class=\"ghost-button warning\" data-status=\"rejected\"",
  "decline_reservation_confirm",
  "confirm(t(\"accept_reservation_confirm\"",
  "confirm(t(\"decline_reservation_confirm\"",
  "confirm(t(\"cancel_reservation_confirm\""
], "Phase 19 keyboard, modal, image, status, and confirmation behavior");

includesAll(app, [
  "function setLanguage(",
  "SUPPORTED_LANGUAGE_CONFIG as supportedLanguages",
  "localStorage.setItem(\"smarttable.lang\"",
  "loadTranslations()",
  "document.documentElement.lang = state.lang",
  "document.querySelectorAll(\"[data-lang]\")",
  "button.setAttribute(\"aria-pressed\""
], "Phase 20 language switch behavior");

includesAll(app, [
  "if (!canShowFeature(\"ai.concierge\", { audience: \"guest\" })) return \"\";",
  "if (!canShowFeature(\"ai.concierge\", { allowDemo: true })) return \"\";",
  "if (isBasicMode()) return \"\";",
  "basic_hero_title",
  "basic_brand_title"
], "BASIC mode hides AI-only public claims");

assertLocaleKeys(locales, [
  "basic_brand_title",
  "nav_offers",
  "nav_restaurants",
  "nav_contact",
  "nav_partner",
  "nav_admin",
  "signup_nav_button",
  "login_button",
  "guest_search_title",
  "filter_restaurant_name_label",
  "filter_date_label",
  "filter_time_label",
  "filter_party_size_label",
  "filter_neighborhood_label",
  "filter_cuisine_label",
  "filter_discount_label",
  "search_offers_button",
  "clear_filters_button",
  "offers_title",
  "offers_empty",
  "restaurant_details_button",
  "reserve_button"
], "Phase 20 public guest localization");

assert(/id="adminNav"[^>]*hidden/.test(indexHtml), "Super Admin entry must be hidden from the unauthenticated public header by default.");
assert(/id="restaurantNav"[^>]*hidden/.test(indexHtml), "Partner entry must be hidden from the unauthenticated public header by default.");
assert(indexHtml.includes("id=\"restaurantsNav\""), "Public header must include a consumer restaurant-list navigation link.");
assert(indexHtml.includes("id=\"contactNav\""), "Public header must include a consumer contact navigation link.");
includesAll(app, [
  "document.querySelector(\"#restaurantsNav\").textContent = t(\"nav_restaurants\", \"Restaurants\")",
  "document.querySelector(\"#contactNav\").textContent = t(\"nav_contact\", \"Contact\")",
  "history.pushState(null, \"\", \"/offers\")",
  "history.pushState(null, \"\", \"/restaurants\")",
  "history.pushState(null, \"\", \"/contact\")",
  "adminNav.hidden = !isAdminRole(state.session?.profile?.role)",
  "restaurantNav.hidden = normalizeRole(state.session?.profile?.role) !== \"partner\"",
  "document.querySelector(\"#adminNav\")?.addEventListener",
  "document.querySelector(\"#restaurantNav\")?.addEventListener"
], "Public chrome internal-entry hardening");

assertLocaleKeys(locales, [
  "signup_title",
  "guest_login_title",
  "guest_login_heading",
  "forgot_password_title",
  "reset_password_title",
  "signup_validation_summary_title",
  "signup_terms_consent_prefix",
  "signup_terms_link",
  "signup_privacy_consent_prefix",
  "signup_privacy_link",
  "account_menu_my_account",
  "account_menu_my_reservations",
  "account_menu_favorites",
  "account_menu_sign_out",
  "profile_saved_toast",
  "preferences_saved_toast"
], "Phase 20 auth and account localization");

assertLocaleKeys(locales, [
  "signup_step_short_account",
  "signup_step_short_location",
  "signup_step_short_preferences",
  "signup_step_short_habits",
  "signup_step_short_budget",
  "signup_step_short_notifications",
  "signup_step_short_consent"
], "Signup stepper short-label localization");

assertLocaleKeys(locales, [
  "reservation_success_title",
  "reservation_success_body",
  "reservation_success_body_email_unconfirmed",
  "reservations_pending_label",
  "reservation_status_accepted",
  "reservation_status_declined",
  "reservation_status_cancelled",
  "reservation_status_completed",
  "cancel_reservation_confirm",
  "accept_reservation_confirm",
  "decline_reservation_confirm",
  "reservation_no_actions_available"
], "Phase 20 reservation lifecycle localization");

assertLocaleKeys(locales, [
  "partner_nav_today",
  "partner_nav_offers",
  "partner_nav_reservations",
  "partner_nav_guests",
  "partner_nav_reviews",
  "partner_nav_settings",
  "partner_login_title",
  "partner_login_role_error",
  "offer_status_active",
  "offer_status_expired",
  "offer_status_sold_out",
  "delete_offer_confirm",
  "reservation_internal_notes_placeholder"
], "Phase 20 partner localization");

assertLocaleKeys(locales, [
  "admin_login_title",
  "admin_nav_restaurants",
  "admin_nav_offers",
  "admin_nav_partners",
  "admin_nav_notifications",
  "admin_nav_content",
  "admin_nav_reservations",
  "admin_dashboard_kicker",
  "refresh_button",
  "platformMode.title",
  "platformMode.currentMode",
  "platform_mode_super_admin_only",
  "route_forbidden_title",
  "not_found_title",
  "app_error_title",
  "retry_button",
  "loading_label",
  "skip_to_content"
], "Phase 20 admin, route, loading, and error localization");

assert(locales.hu.reservation_status_declined.includes("Elutas"), "Hungarian declined status should be translated.");
assert(locales.hu.skip_to_content.includes("Ugr"), "Hungarian skip link should be translated.");
assert(locales.es.reservation_status_declined.toLowerCase().includes("rechaz"), "Spanish declined status should be translated.");

console.log("BASIC visual, accessibility, and localization readiness checks passed.");
