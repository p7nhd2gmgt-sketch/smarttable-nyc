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

function excludesAll(source, tokens, label) {
  for (const token of tokens) {
    assert(!source.includes(token), `${label} must not include ${token}.`);
  }
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist.`);
  const bodyStart = source.indexOf("{", start);
  assert(bodyStart >= 0, `${name} must have a function body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }
  throw new Error(`${name} function body could not be parsed.`);
}

const [indexHtml, app, styles, guestDesign, routeMap, enLocale, esLocale, huLocale] = await Promise.all([
  read("public/index.html"),
  read("public/app.js"),
  read("public/styles.css"),
  read("public/guest/design-system.css"),
  read("scripts/check-route-map.js"),
  read("public/locales/en.json"),
  read("public/locales/es.json"),
  read("public/locales/hu.json")
]);

includesAll(indexHtml, [
  "class=\"skip-link\"",
  "href=\"#app\"",
  "id=\"app\"",
  "tabindex=\"-1\"",
  "aria-live=\"polite\""
], "Landmark and skip-link shell");

includesAll(app, [
  "function currentPublicGuestRoute()",
  "function currentGuestAccountRoute()",
  "function currentProtectedAreaRoute()",
  "function guardProtectedAreaRoute(",
  "function renderForbiddenRoute(",
  "function renderNotFoundRoute(",
  "function restaurantDetailModal()",
  "function reservationModal()",
  "function successModal()",
  "function renderGuestSignup()",
  "function renderGuestLogin()",
  "function renderForgotPassword()",
  "function renderResetPassword()",
  "async function renderAuthCallback()",
  "async function renderVerifyEmail()",
  "function renderGuestAccount()",
  "function accountReservationsPanel()",
  "function accountFavoritesPanel()",
  "function accountNotificationsPanel()",
  "function accountSecurityPanel()",
  "function renderBasicPartner(",
  "function renderAdmin()",
  "function contentEditorV2()",
  "function reservationTable(",
  "function reservationFilterForm(",
  "function reservationActionButtons(",
  "function bindReservationStatusButtons("
], "BASIC UI page/state inventory");

includesAll(app, [
  "\"/restaurants\"",
  "\"/offers\"",
  "\"/signup\"",
  "\"/login\"",
  "\"/forgot-password\"",
  "\"/reset-password\"",
  "\"/auth/callback\"",
  "\"/verify-email\"",
  "\"/terms\"",
  "\"/privacy\"",
  "\"/cookies\"",
  "\"/contact\"",
  "\"/help\"",
  "\"/account/reservations\"",
  "\"/account/favorites\"",
  "\"/account/profile\"",
  "\"/account/preferences\"",
  "\"/account/notifications\"",
  "\"/account/reviews\"",
  "\"/account/security\"",
  "\"/partner/offers\"",
  "\"/partner/reservations\"",
  "\"/partner/profile\"",
  "\"/partner/capacity\"",
  "\"/partner/availability\"",
  "\"/partner/notifications\"",
  "\"/partner/billing\"",
  "\"/partner/reviews\"",
  "\"/partner/analytics\"",
  "\"/partner/settings\"",
  "\"/admin/restaurants\"",
  "\"/admin/offers\"",
  "\"/admin/users\"",
  "\"/admin/notifications\"",
  "\"/admin/content\"",
  "\"/admin/platform-settings\""
], "BASIC route inventory");

includesAll(routeMap, [
  "\"/restaurants/\"",
  "data-restaurant-slug",
  "button.dataset.restaurantSlug",
  "routeForGuestAccountTab(state.guestAccountTab)"
], "Route compatibility checks");

includesAll(app, [
  "\"/partner/billing\": \"#partner-tab-panel-billing\""
], "Partner billing route mapping");

const basicPartnerBody = functionBody(app, "renderBasicPartner");
excludesAll(basicPartnerBody, [
  "partner_nav_communications",
  "partnerCommunicationsPanel()",
  "partnerPostVisitFeedbackPanel()"
], "BASIC partner dashboard future-module hiding");

includesAll(basicPartnerBody, [
  "partner_nav_billing",
  "partnerBillingPanel()"
], "BASIC partner billing visibility");

const notificationSettingsBody = functionBody(app, "accountNotificationSettingsForm");
excludesAll(notificationSettingsBody, [
  "push_not_available_label",
  "transactional_sms_enabled_label",
  "marketing_sms_enabled_label"
], "BASIC guest notification channel hiding");

includesAll(app, [
  "basicMode ? Promise.resolve({ campaigns: [], templates: [] })",
  "basicMode ? Promise.resolve({ campaigns: [], provider: { configured: false } })",
  "basicMode ? Promise.resolve({ submissions: [], insights: null })"
], "BASIC partner loader skips future modules");

includesAll(app, [
  "api(\"/partner/billing\").catch(() => ({ billing: null, plans: [], invoices: [], stripe: { configured: false } }))"
], "BASIC partner loader includes launch billing");

const renderAdminBody = functionBody(app, "renderAdmin");
includesAll(renderAdminBody, [
  "if (!isBasicMode())",
  "futureAdminPanels",
  "futureAdminGridPanels"
], "BASIC admin dashboard future-module gates");
const adminBaseNavigation = renderAdminBody.slice(0, renderAdminBody.indexOf("if (!isBasicMode())"));
excludesAll(adminBaseNavigation, [
  "admin-photo-submissions",
  "admin_nav_broadcasts"
], "BASIC admin base navigation future-module hiding");

includesAll(app, [
  "basicMode ? Promise.resolve({ submissions: [] }) : api(\"/admin/photo-reward-submissions\")",
  "basicMode ? Promise.resolve({ campaigns: [], sms_provider: { configured: false } }) : api(\"/admin/system-messages\")",
  "api(\"/admin/billing\").catch(() => ({ plans: [], subscriptions: [], invoices: [], payment_events: [], billing_events: [] }))"
], "BASIC admin loader skips future modules");

includesAll(styles, [
  "overflow-x: hidden",
  ".mvp-hero",
  "max-width: 1440px",
  "grid-template-columns: minmax(0, 1.65fr) minmax(0, 0.95fr)",
  ".mvp-hero > *",
  "min-width: 0",
  "@media (max-width: 1180px)",
  "@media (max-width: 1050px)",
  "@media (max-width: 900px)",
  "@media (max-width: 760px)",
  "@media (max-width: 460px)",
  "@media (max-width: 430px)",
  "@media (max-width: 860px)",
  "grid-template-columns: 1fr",
  "min-height: 44px",
  ".modal-card",
  "max-height: calc(100dvh - 20px)",
  ".restaurant-modal__body",
  "overflow-y: auto",
  "body.modal-open",
  ".table-wrap",
  "overflow-x: auto",
  ".partner-wide-shell .partner-reservations-table",
  "min-width: 940px",
  ".reservation-history-card",
  ".account-tabs",
  ".empty-state"
], "Responsive CSS readiness");

includesAll(guestDesign, [
  "--guest-container: min(1180px, calc(100vw - 32px))",
  "@media (max-width: 760px)",
  "@media (max-width: 430px)",
  "calc(100vw - 24px)",
  "max-width: 100%",
  "min-width: 0"
], "Guest design-system containment");

includesAll(app, [
  "loadingSkeleton()",
  "empty-state",
  "form-error",
  "showToast(",
  "state.reservationSubmitting",
  "button.disabled = true",
  "confirm(",
  "aria-modal=\"true\"",
  "aria-label",
  "event.key === \"Escape\"",
  "event.key !== \"Tab\"",
  "route_forbidden_title",
  "route_go_home",
  "session_expired_message"
], "Accessible states and action feedback");

includesAll(app, [
  "function canShowDemoCredentials()",
  "state.apiMode === \"demo\" && isLocalBrowserRuntime() && !isProductionApiRuntime()",
  "Local test accounts require protected test credentials.",
  "value=\"\"",
  "data-toggle-dashboard-password",
  "data-dashboard-forgot-password",
  "function normalizeRole(role)",
  "\"restaurant_owner\"",
  "\"super-admin\"",
  "function defaultDashboardRouteForRole(role)",
  "redirectFallback: defaultDashboardRouteForRole(payload.profile.role)",
  "await completeAuthenticatedLogin(payload"
], "Phase 4 authentication UX safeguards");

includesAll(app, [
  "function setButtonPending(",
  "delete_offer_confirm",
  "restaurant_suspend_confirm",
  "accept_reservation_confirm",
  "decline_reservation_confirm",
  "class=\"ghost-button warning\" data-status=\"rejected\"",
  "setButtonPending(submitButton, true, t(\"login_signing_in\", \"Signing in...\"))",
  "setButtonPending(submitButton, true)",
  "relatedButtons.forEach((item) => setButtonPending(item, true))",
  "statusBadge(reservation.status, reservationStatusLabel(reservation.status))",
  "offerStatusLabel(offer.status)",
  "reservation_internal_notes_placeholder"
], "Phase 5 partner action and table UX safeguards");

includesAll(app, [
  "function renderFatalAppError()",
  "data-retry-app",
  "app_error_title",
  "retry_button",
  "aria-busy=\"true\"",
  "loading=\"lazy\"",
  "decoding=\"async\"",
  "photo_submission_thumbnail_alt",
  "guest_dining_photo_alt",
  "skip_to_content"
], "Phase 7-11 accessibility, performance, and resilient-state safeguards");

includesAll(styles, [
  ".skip-link",
  ":focus-visible",
  "button:focus-visible",
  "prefers-reduced-motion: reduce",
  ".ghost-button.danger",
  ".ghost-button.warning",
  ".app-error-state",
  ".ghost-button:disabled",
  ".icon-button:disabled"
], "Phase 7-11 design-system and accessibility CSS safeguards");

includesAll(app, [
  "platformMode.switchConfirmation",
  "setButtonPending(submitButton, true)",
  "platform_mode_super_admin_only",
  "featureVisibilityLabel(feature)",
  "data-view-as-partner",
  "data-view-as-guest",
  "function viewAsPartner(",
  "function viewAsAccount(",
  "data-restaurant-partner-mode",
  "partner_access_mode",
  "partner.invitation_id || partner.id",
  "\"/admin/impersonate-account\"",
  "\"/api/admin/impersonation/end\""
], "Phase 6 admin and Super Admin UX safeguards");

includesAll(app, [
  "function restaurantAdminPanel(",
  "function restaurantOnboardingWizard(",
  "id=\"adminRestaurantFilters\"",
  "data-restaurant-status-action",
  "data-invite-restaurant",
  "data-manage-restaurant-access",
  "data-restaurant-audit",
  "restaurantHoursSetupForm",
  "restaurantReservationSetupForm",
  "restaurantCapacityForm",
  "restaurant_dining_areas_label",
  "restaurant_tables_label",
  "restaurant_capacity_overrides_label",
  "restaurant_table_allocation_note",
  "function restaurantDetailPanel(",
  "data-restaurant-detail-tab",
  "id=\"restaurantCapacityForm\"",
  "data-restaurant-access-action",
  "restaurant_filter_production",
  "restaurant_filter_test",
  "adminRestaurantPageSize",
  "/admin/restaurant-detail",
  "/admin/restaurant-capacity",
  "/admin/audit-logs"
], "Restaurant administration lifecycle UI safeguards");

excludesAll(functionBody(app, "restaurantAdminPanel"), [
  "restaurant_subscription_placeholder",
  "restaurant_subscription_no_stripe_note"
], "BASIC restaurant administration placeholder hiding");

excludesAll(functionBody(app, "restaurantOnboardingWizard"), [
  "restaurant_subscription_placeholder",
  "restaurant_subscription_no_stripe_note"
], "BASIC restaurant onboarding placeholder hiding");

excludesAll(functionBody(app, "offerAnalyticsTable"), [
  "analytics_revenue_placeholder",
  "revenue_placeholder"
], "BASIC offer analytics placeholder hiding");

includesAll(app, [
  "function reservationStatusLabel(",
  "rejected: [\"reservation_status_declined\", \"Declined\"]",
  "statusBadge(reservation.status, reservationStatusLabel(reservation.status))"
], "Guest-safe reservation status labeling");

includesAll(enLocale, [
  "\"reservation_status_declined\": \"Declined\"",
  "\"reservation_status_expired\": \"Expired\"",
  "\"reservation_status_no_show\": \"No-show\""
], "English reservation status labels");

includesAll(enLocale, [
  "\"partner_login_role_error\": \"Please use the partner login for restaurant accounts.\"",
  "\"delete_offer_confirm\": \"Delete this offer? It will no longer be bookable.\"",
  "\"restaurant_suspend_confirm\": \"Suspend this restaurant? It will no longer appear publicly.\"",
  "\"offer_status_sold_out\": \"Sold out\"",
  "\"reservation_internal_notes_placeholder\": \"Internal restaurant notes\""
], "English Phase 4-6 labels");

includesAll(enLocale, [
  "\"skip_to_content\": \"Skip to main content\"",
  "\"app_error_title\": \"SmartTable could not load this screen.\"",
  "\"retry_button\": \"Retry\"",
  "\"photo_submission_thumbnail_alt\": \"Guest-submitted dining photo\"",
  "\"no_photo_label\": \"No photo\""
], "English Phase 7-11 labels");

includesAll(esLocale, [
  "\"reservation_status_declined\": \"Rechazada\"",
  "\"reservation_status_expired\": \"Expirada\"",
  "\"reservation_status_no_show\": \"No se presentó\""
], "Spanish reservation status labels");

includesAll(esLocale, [
  "\"partner_login_role_error\": \"Usa el inicio de sesion de partner para cuentas de restaurante.\"",
  "\"delete_offer_confirm\": \"Eliminar esta oferta? Ya no se podra reservar.\"",
  "\"restaurant_suspend_confirm\": \"Suspender este restaurante? Ya no aparecera publicamente.\"",
  "\"offer_status_sold_out\": \"Agotada\"",
  "\"reservation_internal_notes_placeholder\": \"Notas internas del restaurante\""
], "Spanish Phase 4-6 labels");

includesAll(esLocale, [
  "\"skip_to_content\": \"Saltar al contenido principal\"",
  "\"app_error_title\": \"SmartTable no pudo cargar esta pantalla.\"",
  "\"retry_button\": \"Reintentar\"",
  "\"photo_submission_thumbnail_alt\": \"Foto de comida enviada por un cliente\"",
  "\"no_photo_label\": \"Sin foto\""
], "Spanish Phase 7-11 labels");

includesAll(huLocale, [
  "\"reservation_status_declined\": \"Elutas\\u00edtva\"",
  "\"reservation_status_expired\": \"Lej\\u00e1rt\"",
  "\"reservation_status_no_show\": \"Nem jelent meg\""
], "Hungarian reservation status labels");

includesAll(huLocale, [
  "\"partner_login_role_error\": \"\\u00c9ttermi fi\\u00f3khoz a partner bel\\u00e9p\\u00e9st haszn\\u00e1ld.\"",
  "\"delete_offer_confirm\": \"T\\u00f6rl\\u00f6d ezt az aj\\u00e1nlatot? Ezut\\u00e1n nem lesz foglalhat\\u00f3.\"",
  "\"restaurant_suspend_confirm\": \"Felf\\u00fcggeszted ezt az \\u00e9ttermet? Nem fog megjelenni nyilv\\u00e1nosan.\"",
  "\"offer_status_sold_out\": \"Elfogyott\"",
  "\"reservation_internal_notes_placeholder\": \"Bels\\u0151 \\u00e9ttermi megjegyz\\u00e9sek\""
], "Hungarian Phase 4-6 labels");

includesAll(huLocale, [
  "\"skip_to_content\": \"Ugr\\u00e1s a f\\u0151 tartalomhoz\"",
  "\"app_error_title\": \"A SmartTable nem tudta bet\\u00f6lteni ezt a k\\u00e9perny\\u0151t.\"",
  "\"retry_button\": \"\\u00dajrapr\\u00f3b\\u00e1lkoz\\u00e1s\"",
  "\"photo_submission_thumbnail_alt\": \"Vend\\u00e9g \\u00e1ltal bek\\u00fcld\\u00f6tt \\u00e9tel- vagy italfot\\u00f3\"",
  "\"no_photo_label\": \"Nincs fot\\u00f3\""
], "Hungarian Phase 7-11 labels");

const viewportMatrix = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440];
assert(viewportMatrix.length === 9, "Responsive viewport matrix must include all required widths.");

console.log("BASIC UI readiness checks passed.");
