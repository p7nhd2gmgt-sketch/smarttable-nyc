import { readFile } from "node:fs/promises";
import { handleApiRequest } from "../src/app-core.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function uniqueEmail(prefix = "guest-account") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function validSignupPayload(overrides = {}) {
  return {
    first_name: "Maya",
    last_name: "Stone",
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
  const payload = validSignupPayload(overrides);
  const result = await api("POST", "/auth/signup-guest", payload);
  return { payload, result, headers: authHeaders(result.access_token) };
}

async function assertAuthFlows() {
  const guest = await createGuest();
  const login = await api("POST", "/auth/login", { email: guest.payload.email, password: guest.payload.password });
  assert(login.access_token, "Successful login must return an access token.");
  assert(login.profile?.role === "guest", "Successful guest login must return a guest profile.");

  assert((await apiRaw("POST", "/auth/login", { email: "not-an-email", password: "x" })).status === 400, "Invalid login email must be rejected.");
  assert((await apiRaw("POST", "/auth/login", { email: guest.payload.email, password: "Wrong!123" })).status === 401, "Wrong password must fail safely.");

  const limitedEmail = uniqueEmail("rate-limit");
  let lastStatus = 0;
  for (let index = 0; index < 7; index += 1) {
    const response = await apiRaw("POST", "/auth/login", { email: limitedEmail, password: "Wrong!123" });
    lastStatus = response.status;
  }
  assert(lastStatus === 429, "Repeated failed login attempts must be rate limited.");

  const verification = await api("GET", "/auth/verification", {}, guest.headers);
  assert(typeof verification.verified === "boolean", "Email verification status must be readable.");

  const forgot = await api("POST", "/auth/forgot-password", { email: guest.payload.email });
  assert(forgot.message, "Forgot password must return a neutral confirmation message.");
  assert((await apiRaw("POST", "/auth/reset-password", { token: "expired-token", password: "NewStrong!123", confirm_password: "NewStrong!123" })).status === 400, "Expired or invalid reset token must fail.");
  assert(forgot.demo_reset_token, "Demo mode should expose a reset token for tests.");
  await api("POST", "/auth/reset-password", { token: forgot.demo_reset_token, password: "NewStrong!123", confirm_password: "NewStrong!123" });
  assert((await apiRaw("POST", "/auth/login", { email: guest.payload.email, password: guest.payload.password })).status === 401, "Old password must stop working after reset.");
  assert((await api("POST", "/auth/login", { email: guest.payload.email, password: "NewStrong!123" })).access_token, "New password must work after reset.");

  const logout = await api("POST", "/auth/logout", { scope: "current" }, guest.headers);
  assert(logout.logged_out === true, "Logout endpoint must return success.");
}

async function assertAccountAndPreferences() {
  const guest = await createGuest();
  const account = await api("GET", "/guest/account", {}, guest.headers);
  assert(account.guest?.email === guest.payload.email, "Account dashboard must load the current guest.");

  const invalidProfile = await apiRaw("PATCH", "/guest/account", { first_name: "", phone: "12" }, guest.headers);
  assert(invalidProfile.status === 400, "Invalid profile updates must fail safely.");
  const updatedProfile = await api("PATCH", "/guest/account", {
    first_name: "Maya",
    last_name: "Stone",
    phone: "+1 212 555 0198",
    city: "New York",
    region: "NY",
    postal_code: "10011",
    preferred_dining_areas: ["Chelsea", "West Village"],
    max_travel_distance_miles: 4,
    transportation_method: "Walking",
    selected_language: "hu"
  }, guest.headers);
  assert(updatedProfile.guest?.postal_code === "10011", "Profile updates must persist.");

  const prefs = await api("GET", "/guest/preferences", {}, guest.headers);
  assert(prefs.profile?.preferences?.cuisines?.length, "Preferences must load.");
  const invalidPrefs = await apiRaw("PATCH", "/guest/preferences", { cuisines: [] }, guest.headers);
  assert(invalidPrefs.status === 400, "Required preference fields cannot be empty.");
  const updatedPrefs = await api("PATCH", "/guest/preferences", {
    discount_levels: ["20%", "30%"],
    event_recommendations_interest: "No",
    future_calendar_interest: "No"
  }, guest.headers);
  assert(updatedPrefs.profile?.preferences?.minimumInterestingDiscount === 20, "Minimum interesting discount must recalculate.");

  const privacy = await api("GET", "/guest/privacy", {}, guest.headers);
  assert(privacy.consent?.terms_accepted && privacy.consent?.privacy_accepted, "Consent records must display.");
}

async function assertFavoritesReservationsNotifications() {
  const publicOffers = await api("GET", "/public/offers?lang=en");
  const restaurantId = publicOffers.offers?.[0]?.restaurant_id || publicOffers.offers?.[0]?.restaurant?.id;
  assert(restaurantId, "Public offers must expose a restaurant to favorite.");

  const guest = await createGuest();
  await api("POST", "/public/follow", {
    restaurant_id: restaurantId,
    guest_email: guest.payload.email,
    guest_name: `${guest.payload.first_name} ${guest.payload.last_name}`,
    notification_enabled: true
  });
  await api("POST", "/public/follow", {
    restaurant_id: restaurantId,
    guest_email: guest.payload.email,
    guest_name: `${guest.payload.first_name} ${guest.payload.last_name}`,
    notification_enabled: true
  });
  const favorites = await api("GET", "/guest/favorites", {}, guest.headers);
  assert(favorites.favorites.filter((item) => item.restaurant_id === restaurantId).length === 1, "Duplicate favorite records must be prevented.");
  await api("PATCH", "/guest/favorites", { restaurant_id: restaurantId, notification_enabled: false }, guest.headers);
  await api("DELETE", `/guest/favorites?restaurant_id=${encodeURIComponent(restaurantId)}`, {}, guest.headers);
  const afterRemove = await api("GET", "/guest/favorites", {}, guest.headers);
  assert(!afterRemove.favorites.some((item) => item.restaurant_id === restaurantId), "Favorite removal must work.");

  const activeOffer = publicOffers.offers[0];
  const offerId = activeOffer.offer_id || activeOffer.id;
  const reservationDate = activeOffer.reservation_date || activeOffer.offer_date;
  const reservationTime = activeOffer.start_time || activeOffer.offer_time;
  const reservation = await api("POST", "/reservations", {
    offer_id: offerId,
    reservation_date: reservationDate,
    reservation_time: reservationTime,
    party_size: 2,
    notes: "Guest account test reservation.",
    guest_name: `${guest.payload.first_name} ${guest.payload.last_name}`,
    guest_email: guest.payload.email,
    guest_phone: guest.payload.phone
  }, guest.headers);
  const reservationId = reservation.reservation?.reservation_id || reservation.reservation?.id;
  assert(reservationId, "Reservation creation must return a reservation id.");
  assert((await apiRaw("POST", "/reservations", {
    offer_id: offerId,
    reservation_date: reservationDate,
    reservation_time: reservationTime,
    party_size: 2,
    notes: "Duplicate should be blocked.",
    guest_name: `${guest.payload.first_name} ${guest.payload.last_name}`,
    guest_email: guest.payload.email,
    guest_phone: guest.payload.phone
  }, guest.headers)).status === 409, "Duplicate active reservation requests must be blocked.");
  assert((await apiRaw("POST", "/reservations", {
    offer_id: offerId,
    reservation_date: "2000-01-01",
    reservation_time: reservationTime,
    party_size: 2,
    guest_name: "Expired Offer Test",
    guest_email: uniqueEmail("expired-offer"),
    guest_phone: "+1 212 555 0100"
  }, guest.headers)).status === 409, "Expired or unavailable offer dates must be blocked.");
  assert((await apiRaw("POST", "/reservations", {
    offer_id: offerId,
    reservation_date: reservationDate,
    reservation_time: "00:01",
    party_size: 2,
    guest_name: "Inactive Time Test",
    guest_email: uniqueEmail("inactive-time"),
    guest_phone: "+1 212 555 0100"
  }, guest.headers)).status === 409, "Inactive reservation times must be blocked.");
  assert((await apiRaw("POST", "/reservations", {
    offer_id: offerId,
    reservation_date: reservationDate,
    reservation_time: reservationTime,
    party_size: Number(activeOffer.max_party_size || 4) + 1,
    guest_name: "Large Party Test",
    guest_email: uniqueEmail("large-party"),
    guest_phone: "+1 212 555 0100"
  }, guest.headers)).status === 409, "Party sizes above the offer maximum must be blocked.");
  const reservations = await api("GET", "/guest/reservations", {}, guest.headers);
  assert(reservations.reservations.some((item) => item.reservation_id === reservationId), "Reservation history must include the guest's own reservation.");
  const cancelled = await api("PATCH", "/guest/reservations", { id: reservationId, action: "cancel" }, guest.headers);
  assert(cancelled.reservation?.status === "cancelled", "Cancellation must work when allowed.");
  assert(cancelled.reservation?.cancelled_at, "Guest cancellation must record a cancellation timestamp.");
  const cancellationNotifications = await api("GET", "/guest/notifications", {}, guest.headers);
  assert(cancellationNotifications.notifications.some((item) => item.type === "reservation_cancelled" && item.reservation_id === reservationId), "Guest cancellation must create an in-app notification for the guest.");
  assert((await apiRaw("PATCH", "/guest/reservations", { id: reservationId, action: "cancel" }, guest.headers)).status >= 400, "Repeated cancellation must be blocked.");

  const other = await createGuest();
  const otherReservations = await api("GET", "/guest/reservations", {}, other.headers);
  assert(!otherReservations.reservations.some((item) => item.reservation_id === reservationId), "Other users' reservations must not be exposed.");

  const notifications = await api("GET", "/guest/notifications", {}, guest.headers);
  assert(Array.isArray(notifications.notifications), "Notifications must load.");
  const readAll = await api("PATCH", "/guest/notifications", { read_all: true }, guest.headers);
  assert(Array.isArray(readAll.notifications), "Mark all notifications read must work.");
  const settings = await api("PATCH", "/guest/preferences", {
    notification_preferences: ["Reservation status updates", "Reservation reminders", "Weekend recommendations"],
    notification_channels: ["Email"],
    notification_frequency: "Weekly summary",
    marketing_consent: false
  }, guest.headers);
  assert(settings.profile?.preferences?.notification_frequency === "Weekly summary", "Notification settings must save.");
  assert(settings.profile?.preferences?.consents?.marketing === false, "Marketing consent must remain optional.");
}

async function assertPrivacySecurity() {
  const guest = await createGuest();
  const privacy = await api("GET", "/guest/privacy", {}, guest.headers);
  assert(privacy.consent?.terms_version && privacy.consent?.privacy_policy_version, "Privacy page must show legal consent versions.");
  assert(privacy.export_scope?.includes("Profile") && privacy.export_scope?.includes("Consent records"), "Privacy page must describe the personal data export scope.");
  const exportRequest = await api("POST", "/guest/privacy", { action: "export", message: "Test export request." }, guest.headers);
  assert(exportRequest.request?.status === "received", "Data export request must work.");
  assert(exportRequest.export?.generated === false, "Export must be labeled as a request workflow until a real file is generated.");
  assert(exportRequest.export?.excluded?.includes("Password hashes"), "Data export must explicitly exclude password hashes and security metadata.");

  assert((await apiRaw("POST", "/guest/privacy", { action: "delete_account", current_password: "wrong", confirmation_phrase: "DELETE MY ACCOUNT" }, guest.headers)).status === 401, "Account deletion must require reauthentication.");
  assert((await apiRaw("POST", "/guest/privacy", { action: "delete_account", current_password: guest.payload.password, confirmation_phrase: "delete" }, guest.headers)).status === 400, "Account deletion must require the confirmation phrase.");

  const passwordGuest = await createGuest();
  await api("POST", "/auth/security", {
    action: "change_password",
    current_password: passwordGuest.payload.password,
    new_password: "Changed!12345",
    confirm_password: "Changed!12345"
  }, passwordGuest.headers);
  assert((await apiRaw("POST", "/auth/login", { email: passwordGuest.payload.email, password: passwordGuest.payload.password })).status === 401, "Password change must invalidate old password.");
  const newLogin = await api("POST", "/auth/login", { email: passwordGuest.payload.email, password: "Changed!12345" });
  assert(newLogin.access_token, "Changed password must allow login.");
  const signOutAll = await api("POST", "/auth/security", { action: "sign_out_all" }, passwordGuest.headers);
  assert(signOutAll.sign_out_current === true, "Sign out all sessions must ask the client to clear the current session.");

  const deletionGuest = await createGuest();
  const deleted = await api("POST", "/guest/privacy", {
    action: "delete_account",
    current_password: deletionGuest.payload.password,
    confirmation_phrase: "DELETE MY ACCOUNT"
  }, deletionGuest.headers);
  assert(deleted.deleted === true && deleted.sign_out === true, "Account deletion must complete and instruct sign-out.");
  assert((await apiRaw("POST", "/auth/login", { email: deletionGuest.payload.email, password: deletionGuest.payload.password })).status === 401, "Deleted account must not remain login-capable.");
  assert((await apiRaw("GET", "/guest/account", {}, deletionGuest.headers)).status === 401, "Account deletion must revoke existing guest session access.");
}

async function assertModeAndFrontendWiring() {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const apiClient = await readFile(new URL("../public/api-client.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert(app.includes('guestAccountTabs()'), "Guest account navigation must be centralized.");
  for (const tab of ["overview", "reservations", "favorites", "profile", "preferences", "notifications", "reviews", "security"]) {
    assert(app.includes(`["${tab}"`) || app.includes(`'${tab}'`), `Guest account must include ${tab} tab.`);
  }
  assert(app.includes('"/account/reviews": "reviews"') && app.includes('"/account/security": "security"'), "Guest account routes must expose Reviews and Security pages.");
  assert(app.includes("accountReviewsPanel()") && app.includes("accountSecurityPanel()"), "Guest account must render Reviews and Security panels.");
  assert(app.includes("account_pending_requests") && app.includes("account_accepted_reservations") && app.includes("account_fresh_offers"), "Guest account overview must show pending, accepted, favorite, and fresh offer summaries.");
  assert(app.includes('canShowFeature("ai.concierge", { audience: "guest"'), "AI account features must use feature registry checks.");
  assert(app.includes('const showAiPreferenceFields = canShowFeature("ai.concierge", { audience: "guest" })'), "BASIC mode must hide AI preference/calendar fields.");
  assert(app.includes('type="hidden" name="future_calendar_interest"'), "Hidden AI preference values must be preserved when BASIC mode hides them.");
  const requiredAnalyticsEvents = [
    "login_success",
    "login_failed",
    "password_reset_requested",
    "password_reset_completed",
    "profile_updated",
    "preferences_updated",
    "favorite_added",
    "favorite_removed",
    "notification_opened",
    "marketing_consent_changed",
    "data_export_requested",
    "account_deletion_requested",
    "account_deleted"
  ];
  for (const eventName of requiredAnalyticsEvents) {
    assert(app.includes(`"${eventName}"`), `${eventName} must be registered for guest account analytics.`);
    assert(app.includes(`trackGuestAccountEvent("${eventName}"`) || ["preferences_updated", "password_reset_completed"].includes(eventName), `${eventName} analytics must be tracked from the UI.`);
  }
  const analyticsMetadataCalls = [...app.matchAll(/trackGuestAccountEvent\(\s*"[^"]+"\s*,\s*({[^)]*})/g)];
  for (const [, metadata] of analyticsMetadataCalls) {
    assert(!/\b(password|reset_token|phone|allergy_notes|full_name|email|message|notes|review|description)\s*:/i.test(metadata), "Guest account analytics must not pass private or free-text field values.");
  }
  assert(app.includes("sessionStorage.setItem(\"smarttable.session\"") && app.includes("localStorage.setItem(\"smarttable.session\""), "Session persistence must respect Remember Me.");
  assert(app.includes("function sessionExpiryMs") && app.includes("function isSessionExpired") && app.includes("expires_at"), "Stored sessions must carry and enforce an expiration.");
  assert(app.includes("function clearGuestPrivateState") && app.includes("clearGuestPrivateState();"), "Logout and auth expiration must clear cached private guest data.");
  assert(app.includes("requestJson(path, options, currentSession)") && apiClient.includes("sessionAuthHeaders(sessionProvider())") && apiClient.includes("Authorization: `Bearer ${session.access_token}`"), "API requests must not use an expired cached token.");
  assert(app.includes("state.postLoginRedirect = \"/account\""), "Protected account route must preserve intended destination before login.");
  assert(app.includes("favorite_unavailable_state"), "Disabled or unavailable restaurants must have a safe favorites state.");
  assert(app.includes("isFeedbackEligible") && app.includes("feedback_submitted"), "Completed feedback CTA must be guarded by eligibility state.");
  assert(app.includes("return !isBasicMode() && canShowFeature(\"ai.concierge\""), "BASIC mode must hide demo-only feedback and AI account CTAs.");
  assert(app.includes("account_preferences_update_anytime"), "Preference page must explain that guests can update preferences at any time.");
  assert(app.includes("loadingSkeleton()") && app.includes("loading_label"), "Account system must include an accessible localized loading state.");
  assert(app.includes("empty-state"), "Account system must include empty states.");
  assert(app.includes("role=\"alert\""), "Account error states must be announced to assistive technology.");
  assert(app.includes("success-state") && app.includes("aria-live"), "Account success states must be announced politely.");
  assert(app.includes("confirm(t(\"cancel_reservation_confirm\"") && app.includes("confirm(t(\"delete_account_confirm_dialog\""), "Risky account actions must use confirmation dialogs.");
  assert(app.includes("setAttribute(\"role\", \"menu\")") && app.includes("role=\"menuitem\"") && app.includes("account_menu_label"), "Account menu must be keyboard and screen-reader friendly.");
  assert(app.includes("async function setLanguage") && app.includes("persistLanguagePreference"), "Language switching must persist for logged-in users.");
  assert(css.includes("@media (max-width: 860px)") && css.includes(".account-tabs") && css.includes(".consent-status-grid"), "Account UI must include responsive layout styles.");
  assert(css.includes(":focus") || css.includes(":focus-visible"), "Visible focus states must exist.");
  assert(packageJson.scripts["check:guest-account"] === "node scripts/check-guest-account.js", "package.json must expose check:guest-account.");
}

async function assertLocales() {
  const required = [
    "notification_settings_title",
    "personal_data_export_title",
    "request_data_export_button",
    "delete_account_button",
    "delete_confirmation_phrase_label",
    "password_changed_toast",
    "account_deleted_toast",
    "account_menu_label",
    "reservation_cancelled_notification_title",
    "reservation_cancelled_notification_message",
    "reservation_cancelled_notification_cta",
    "account_tab_reviews",
    "account_tab_security",
    "account_pending_requests",
    "account_accepted_reservations",
    "account_upcoming_reservations",
    "account_favorite_restaurants_with_images",
    "account_fresh_offers",
    "account_security_title",
    "account_reviews_title",
    "account_reviews_privacy_note",
    "review_submitted_label",
    "review_not_submitted_label",
    "submitted_label",
    "eligible_label",
    "account_no_completed_reviews",
    "reviews_basic_mode_note",
    "reviews_no_eligible_note",
    "reservation_sending_label",
    "service_time_estimate_body",
    "restaurant_type_fallback",
    "loading_label",
    "filter_restaurant_placeholder",
    "filter_neighborhood_placeholder",
    "filter_cuisine_placeholder",
    "view_mode_label",
    "rating_choose_label",
    "event_name_placeholder",
    "event_location_placeholder",
    "risk_high_label",
    "risk_medium_label",
    "risk_low_label",
    "event_weather_manual_note",
    "event_traffic_walk_note",
    "event_traffic_buffer_note",
    "route_plan_created",
    "photo_upload_failed_error",
    "google_maps_load_failed_error"
  ];
  for (const locale of ["en", "es", "hu"]) {
    const messages = JSON.parse(await readFile(new URL(`../public/locales/${locale}.json`, import.meta.url), "utf8"));
    for (const key of required) {
      assert(Object.hasOwn(messages, key), `${locale}.json must define ${key}.`);
      assert(String(messages[key] || "").trim(), `${locale}.json must not leave ${key} empty.`);
    }
  }
}

async function assertAnalyticsEndpoint() {
  const allowed = await api("POST", "/analytics/events", {
    profile_key: "guest-account-test",
    event_type: "profile_updated",
    metadata: {
      status: "saved",
      email: "private@example.com",
      phone: "+1 212 555 0199",
      password: "NeverSend!123",
      allergy_notes: "private text",
      message: "private free text",
      review: "private review text",
      notes: "private note"
    }
  });
  const props = allowed.event?.properties || {};
  assert(props.status === "saved", "Allowed guest account analytics properties must be retained.");
  assert(
    !("email" in props) && !("phone" in props) && !("password" in props) && !("allergy_notes" in props) && !("message" in props) && !("review" in props) && !("notes" in props),
    "Private analytics properties and free-text content must be stripped."
  );
  assert((await apiRaw("POST", "/analytics/events", { profile_key: "x", event_type: "not_allowed", metadata: {} })).status === 400, "Unsupported analytics event must be rejected.");
}

async function main() {
  await assertAuthFlows();
  await assertAccountAndPreferences();
  await assertFavoritesReservationsNotifications();
  await assertPrivacySecurity();
  await assertModeAndFrontendWiring();
  await assertLocales();
  await assertAnalyticsEndpoint();
  console.log("Guest account acceptance checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
