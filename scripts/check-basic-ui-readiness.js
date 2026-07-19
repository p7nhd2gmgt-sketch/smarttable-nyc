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
  "\"/verify-email\"",
  "\"/terms\"",
  "\"/privacy\"",
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
  "const demoMode = state.apiMode === \"demo\"",
  "value=\"${escapeAttr(demoEmail)}\"",
  "value=\"${escapeAttr(demoPassword)}\"",
  "data-toggle-dashboard-password",
  "data-dashboard-forgot-password",
  "partner_login_role_error",
  "admin_login_role_error",
  "const defaultRedirect = state.mode === \"admin\" ? \"/admin\" : state.mode === \"partner\" ? \"/partner\" : \"/account\""
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
  "function viewAsPartner(",
  "\"/admin/impersonate-partner\""
], "Phase 6 admin and Super Admin UX safeguards");

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
