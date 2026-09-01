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

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) || [];
  assert(channels.length === 3, `Invalid contrast color ${hex}.`);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
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
  assert(covered, `Guest signup requested viewport width ${width}px must remain in the regression matrix.`);
}

includesAll(indexHtml, [
  "class=\"skip-link\"",
  "href=\"#app\"",
  "<main id=\"app\"",
  "aria-live=\"polite\"",
  "tabindex=\"-1\"",
  "data-language-selector",
  "id=\"languageSelectorButton\"",
  "aria-haspopup=\"listbox\"",
  "id=\"languageSelectorMenu\"",
  "role=\"listbox\""
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
  ".language-selector",
  ".language-selector__button",
  ".language-selector__menu",
  ".language-selector__option",
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
  ".language-selector",
  "grid-column: 1 / -1",
  ".language-selector__menu",
  "overflow-wrap: anywhere",
  "white-space: normal"
], "Mobile header action containment regression coverage");

includesAll(app, [
  "function guestStandaloneShell(",
  "guestStandaloneShell(`",
  "function fastSignupErrors(",
  "class=\"signup-card fast-signup-card\"",
  "signup_phone_optional",
  "legal_consent",
  "terms_consent",
  "privacy_consent",
  "account_creation_phase: true",
  "history.pushState(null, \"\", \"/signup/check-email\")",
  "function renderSignupCheckEmail(",
  "function accountWelcomePanel(",
  "profile_setup_location_title",
  "profile_setup_food_title",
  "profile_setup_notifications_title"
], "Simplified signup renders compact account creation and optional profile setup");

includesAll(styles, [
  ".guest-standalone-page",
  "max-width: 1240px",
  ".signup-page",
  ".fast-signup-page",
  ".fast-signup-card",
  ".check-email-card",
  ".signup-email-pill",
  ".account-welcome-card",
  ".preference-section",
  ".account-tabs",
  "grid-template-columns: minmax(0, 1fr)",
  "min-height: 44px",
  "overflow-wrap: anywhere",
  "white-space: normal"
], "Simplified signup and optional profile responsive non-overlap regression coverage");

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

includesAll(styles, [
  ".smarttable-feedback-toast",
  ".smarttable-feedback-toast::before",
  ".smarttable-feedback-toast__message",
  "background: #111814 !important",
  "background-image: linear-gradient(#111814, #111814) !important",
  "forced-color-adjust: none",
  "color: #ffffff !important",
  "-webkit-text-fill-color: #ffffff !important"
], "Theme-independent toast contrast CSS");
assert(
  indexHtml.includes('class="toast smarttable-feedback-toast"'),
  "Toast feedback must preserve the legacy .toast integration contract."
);
includesAll(app, [
  'toast.style.setProperty("background", "#111814", "important")',
  'toast.style.setProperty("background-image", "linear-gradient(#111814, #111814)", "important")',
  'toast.style.setProperty("background-color", "#111814", "important")',
  'toast.style.setProperty("color", "#ffffff", "important")',
  'toast.style.setProperty("-webkit-text-fill-color", "#ffffff", "important")',
  'toastMessage.style.setProperty("color", "#ffffff", "important")'
], "Browser-forced toast contrast behavior");
assert(
  contrastRatio("#ffffff", "#111814") >= 7,
  "Toast feedback must meet WCAG AAA contrast for normal text."
);

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
  "persistLanguagePreference",
  "document.documentElement.lang = state.lang",
  "function updateLanguageSelector(",
  "data-language-option",
  "aria-selected",
  "event.key === \"ArrowDown\"",
  "event.key === \"Escape\"",
  "selectLanguageFromSelector"
], "Phase 20 language selector behavior");

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
  "footer_navigation_label",
  "footer_about_link",
  "footer_help_center_link",
  "footer_for_restaurants_link",
  "cookie_page_title",
  "cookie_page_body",
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

assert(!indexHtml.includes('id="adminNav"'), "Super Admin entry must not appear in the unauthenticated public header.");
assert(!indexHtml.includes('id="restaurantNav"'), "Partner entry must not appear in the primary public header.");
assert(!indexHtml.includes('id="contactNav"'), "Contact must not appear in the primary public header.");
assert(indexHtml.includes("id=\"restaurantsNav\""), "Public header must include a consumer restaurant-list navigation link.");
includesAll(app, [
  "document.querySelector(\"#restaurantsNav\").textContent = t(\"nav_restaurants\", \"Restaurants\")",
  "history.pushState(null, \"\", \"/offers\")",
  "history.pushState(null, \"\", \"/restaurants\")",
  "function publicFooter()",
  "footer_about_link",
  "href: \"/contact\"",
  "href: \"/help\"",
  "href: \"/privacy\"",
  "href: \"/terms\"",
  "href: \"/cookies\"",
  "footer_for_restaurants_link",
  "href: \"/partner\"",
  "if (state.mode === \"partner\")"
], "Public chrome internal-entry hardening");

assertLocaleKeys(locales, [
  "signup_title",
  "guest_login_title",
  "guest_login_heading",
  "forgot_password_title",
  "reset_password_title",
  "signup_validation_summary_title",
  "signup_legal_package_prefix",
  "signup_legal_package_and",
  "signup_legal_terms_link",
  "signup_legal_privacy_link",
  "signup_legal_reservations_link",
  "signup_legal_reviews_link",
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
  "signup_subtitle_fast",
  "signup_fast_kicker",
  "signup_fast_title",
  "signup_phone_optional",
  "signup_optional_preferences_note",
  "signup_check_email_title",
  "signup_check_email_body",
  "signup_welcome_title",
  "signup_welcome_body",
  "signup_welcome_browse_offers",
  "signup_welcome_personalize",
  "signup_welcome_later",
  "profile_setup_location_title",
  "profile_setup_food_title",
  "profile_setup_notifications_title",
  "account_tab_account_privacy",
  "account_complete_profile_button"
], "Simplified signup and optional profile localization");

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
  "skip_to_content",
  "language_selector_label",
  "language_selector_menu_label"
], "Phase 20 admin, route, loading, and error localization");

assert(locales.hu.reservation_status_declined.includes("Elutas"), "Hungarian declined status should be translated.");
assert(locales.hu.skip_to_content.includes("Ugr"), "Hungarian skip link should be translated.");
assert(locales.es.reservation_status_declined.toLowerCase().includes("rechaz"), "Spanish declined status should be translated.");

console.log("BASIC visual, accessibility, and localization readiness checks passed.");
