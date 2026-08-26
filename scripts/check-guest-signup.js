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

function uniqueEmail(prefix = "signup") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function validSignupPayload(overrides = {}) {
  return {
    first_name: "Emma",
    last_name: "Carter",
    email: uniqueEmail(),
    password: "Strong!12345",
    confirm_password: "Strong!12345",
    phone: "+1 212 555 0142",
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
    discount_levels: ["10%", "20%"],
    consider_no_discount_match: "Sometimes",
    notification_preferences: ["Reservation status updates", "Reservation reminders", "Offers from favorite restaurants"],
    notification_channels: ["Email"],
    notification_frequency: "Immediately",
    event_recommendations_interest: "Yes",
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

function minimalSignupPayload(overrides = {}) {
  return {
    full_name: "Emma Carter",
    email: uniqueEmail("fast-signup"),
    password: "Strong!12345",
    confirm_password: "Strong!12345",
    transactional_email_consent: true,
    privacy_consent: true,
    terms_consent: true,
    notification_channels: ["Email"],
    notification_preferences: ["Reservation status updates"],
    preferred_neighborhoods: ["No preference"],
    account_creation_phase: true,
    preferred_language: "en",
    ...overrides
  };
}

async function assertLocales() {
  const required = [
    "signup_create_account",
    "signup_subtitle_fast",
    "signup_fast_title",
    "signup_phone_optional",
    "signup_optional_preferences_note",
    "signup_check_email_title",
    "signup_check_email_body",
    "signup_welcome_title",
    "signup_welcome_body",
    "signup_welcome_confirmed_title",
    "signup_welcome_confirmed_body",
    "signup_welcome_browse_offers",
    "signup_welcome_personalize",
    "signup_welcome_later",
    "signup_welcome_email_warning_title",
    "auth_callback_expired_message",
    "auth_callback_invalid_message",
    "auth_callback_already_confirmed_message",
    "auth_callback_return_signup_button",
    "signup_terms_link",
    "signup_privacy_link",
    "signup_error_consent",
    "signup_country",
    "signup_custom_cuisine",
    "signup_travel_distance_unit",
    "signup_sms_country_code",
    "signup_sms_phone_number",
    "signup_sms_not_sending_note",
    "signup_location_suggested",
    "signup_location_timeout",
    "signup_error_sms_phone",
    "profile_setup_location_title",
    "profile_no_neighborhood_preference",
    "profile_setup_food_title",
    "profile_setup_notifications_title",
    "account_complete_profile_button",
    "account_tab_account_privacy",
    "push_channel_label",
    "option_single_solo",
    "option_solo",
    "login_email_not_confirmed_error",
    "login_account_setup_incomplete_error",
    "login_account_setup_incomplete_redirect",
    "login_account_setup_incomplete_toast",
    "login_service_unavailable_error",
    "auth_callback_success_message",
    "auth_callback_expired_message",
    "auth_callback_resend_button",
    "auth_callback_resend_neutral_success",
    "auth_callback_resend_cooldown",
    "auth_callback_resend_failed"
  ];
  for (const locale of ["en", "es", "hu"]) {
    const messages = JSON.parse(await readFile(new URL(`../public/locales/${locale}.json`, import.meta.url), "utf8"));
    for (const key of required) {
      assert(Object.hasOwn(messages, key), `${locale}.json must define ${key}.`);
      assert(String(messages[key] || "").trim(), `${locale}.json must not leave ${key} empty.`);
    }
  }
}

async function assertFrontendWiring() {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert(app.includes('path === "/signup"') && app.includes('hash === "#guest-signup"'), "Dedicated /signup and #guest-signup routes must be handled.");
  assert(app.includes('path === "/signup/check-email"'), "Dedicated /signup/check-email route must be handled.");
  assert(app.includes('path === "/signup/welcome"') && app.includes("renderSignupWelcome()"), "Dedicated /signup/welcome confirmation success route must be handled.");
  assert(app.includes("renderGuestSignup()"), "Dedicated signup page must render through renderGuestSignup().");
  assert(app.includes("fast-signup-card") && app.includes("fastSignupErrors"), "Signup page must render the compact one-screen account form.");
  assert(app.includes("signup_create_account"), "Signup submit button must use the fast Create account translation key.");
  assert(app.includes("signup_check_email_title") && app.includes("renderSignupCheckEmail"), "Signup must show a dedicated confirmation screen when email verification is required.");
  assert(app.includes("signup_welcome_confirmed_title") && app.includes("renderSignupWelcome"), "Confirmed email callbacks must show a dedicated account-ready success page.");
  assert(app.includes('window.history.replaceState(null, "", "/signup/welcome")'), "Confirmed callbacks must redirect to /signup/welcome instead of the old onboarding flow.");
  assert(app.includes("signup_welcome_email_warning_title"), "Signup success UI must distinguish optional welcome-email failures from Supabase confirmation.");
  assert(app.includes("payload.welcome_email"), "Signup success UI must read the explicit welcome_email result.");
  assert(app.includes("payload.auth_confirmation_email"), "Signup success UI must read the explicit Supabase confirmation-email result.");
  assert(!app.includes("const emailDeliveryFailed = Number(emailDelivery.failed_count || 0) > 0"), "Signup success UI must not treat aggregate email_delivery failures as registration confirmation failure.");
  assert(app.includes("signup_success_welcome_email_issue"), "Signup toast must use the separate welcome-email warning copy.");
  assert(app.includes('path === "/auth/callback"') && app.includes("renderAuthCallback()"), "Supabase email confirmation callbacks must render a dedicated callback screen.");
  assert(app.includes("auth_callback_expired_message") && app.includes("auth_callback_invalid_message"), "Expired and invalid confirmation links must show distinct localized messages.");
  assert(app.includes("auth_callback_return_signup_button"), "Callback errors must offer a safe return-to-signup action.");
  assert(app.includes('token_hash: params.get("token_hash")'), "Auth callback must preserve Supabase token_hash parameters.");
  assert(app.includes('api("/auth/callback"'), "Auth callback token exchange must go through the backend.");
  assert(app.includes('api("/auth/resend-verification"'), "Expired confirmation links must offer a safe public resend action.");
  assert(app.includes("resendCooldownUntil") && app.includes("authCallbackCooldownSeconds()"), "Verification resend must include a visible client cooldown.");
  assert(app.includes("role=\"timer\"") && app.includes("auth_callback_resend_cooldown"), "Verification resend cooldown must expose an accessible countdown indicator.");
  assert(app.includes("callback.resendSubmitting") && app.includes("resendDisabled"), "Verification resend button must have loading and disabled cooldown states.");
  assert(app.includes("auth_callback_resend_neutral_success"), "Verification resend must use a generic non-enumerating success response.");
  assert(app.includes("login_email_not_confirmed_error"), "Guest login must show a specific email-verification-required state.");
  assert(app.includes("login_account_setup_incomplete_error"), "Guest login must show an incomplete account setup state.");
  assert(app.includes("login_account_setup_incomplete_redirect") && app.includes("history.pushState(null, \"\", \"/signup\")"), "Guest login must redirect recoverable incomplete accounts to onboarding.");
  assert(app.includes("login_service_unavailable_error"), "Guest login must show a temporary service-unavailable state.");
  assert(app.includes("error.payload?.code") && app.includes('errorCode === "EMAIL_NOT_CONFIRMED"'), "Guest login must use the backend EMAIL_NOT_CONFIRMED code.");
  assert(app.includes("signup.submitting") && app.includes("disabled"), "Signup button must be disabled while submission is in progress.");
  assert(app.includes("travel_distance_unit") && app.includes("distance_unit_miles") && app.includes("distance_unit_kilometers"), "Optional profile setup must expose a visible travel distance unit selector.");
  assert(app.includes("no_neighborhood_preference") && app.includes("profile_no_neighborhood_preference"), "Optional profile setup must support No preference for neighborhoods.");
  assert(app.includes("navigator.geolocation.getCurrentPosition") && app.includes("signup_location_suggested"), "Location services must request permission only after the user clicks the location button.");
  assert(app.includes("custom_cuisine") && app.includes("signup_custom_cuisine"), "Other cuisine selection must capture a custom cuisine value.");
  assert(app.includes('"Solo"') && app.includes("choiceKey(value) === \"single_solo\""), "Dining companion labels must use Solo while preserving stored Alone values.");
  assert(app.includes("sms_phone_number") && app.includes("isValidInternationalPhone"), "SMS notification preference must collect and validate an international phone number.");
  assert(!/renderGuestSignup\(\);\s*return;\s*\}\s*if \(targetName === "terms_consent"/.test(app), "Policy checkbox changes must not rerender the full signup page.");
  assert(app.includes("collectSignupForm(form)") && app.includes("state.signup") && app.includes("data: defaultSignupData()"), "Form answers must remain in signup state after validation errors.");
  assert(app.includes("legal_consent") && app.includes("syncSignupLegalConsent"), "Signup must expose one visible legal acceptance while preserving backend Terms and Privacy consent fields.");
  assert(app.includes("marketing_consent") && !app.includes("if (!data.marketing_consent)"), "Marketing consent must remain optional.");
  assert(app.includes("trackSignupEvent(\"signup_started\""), "signup_started analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"signup_validation_failed\""), "signup_validation_failed analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"signup_submitted\""), "signup_submitted analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"signup_succeeded\""), "signup_succeeded analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"confirmation_email_sent\""), "confirmation_email_sent analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"confirmation_email_resent\""), "confirmation_email_resent analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"email_confirmed\""), "email_confirmed analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"profile_setup_started\""), "profile_setup_started analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"profile_setup_skipped\""), "profile_setup_skipped analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"profile_setup_completed\""), "profile_setup_completed analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"signup_abandoned\""), "signup_abandoned analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"signup_completed\""), "signup_completed analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"terms_accepted\""), "terms_accepted analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"privacy_accepted\""), "privacy_accepted analytics event must be tracked.");
  assert(!app.includes("signup_favorite_restaurants") || !app.includes('signupCheckboxGroup("favorite_restaurants"'), "Signup must not ask for a Favorite SmartTable Restaurant.");
  assert(app.includes("safeSignupAnalyticsMetadata"), "Frontend analytics metadata must be whitelisted.");
  assert(!/localStorage\.setItem\([^)]*(password|allergy_notes|phone)/i.test(app), "Sensitive signup fields must not be stored in localStorage.");
  assert(css.includes("@media (max-width: 860px)") && css.includes(".fast-signup-card") && css.includes(".preference-section"), "Signup and optional profile setup must include responsive mobile/desktop layout styles.");
}

async function assertBackendValidationAndPersistence() {
  const incompleteEmail = uniqueEmail("incomplete");
  const incomplete = await apiRaw("POST", "/auth/signup-guest", { email: incompleteEmail, password: "Strong!12345" });
  assert(incomplete.status === 400, "Incomplete signup must be rejected.");
  const incompleteLogin = await apiRaw("POST", "/auth/login", { email: incompleteEmail, password: "Strong!12345" });
  assert(incompleteLogin.status >= 400, "Incomplete signup must not create a login-capable account.");

  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ email: "not-an-email" }))).status === 400, "Invalid email must be rejected.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ password: "weak", confirm_password: "weak" }))).status === 400, "Weak password must be rejected.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ confirm_password: "Strong!67890" }))).status === 400, "Mismatched passwords must be rejected.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ phone: "12" }))).status === 400, "Invalid phone must be rejected.");
  assert((await apiRaw("POST", "/auth/signup-guest", minimalSignupPayload({ phone: "" }))).status === 201, "Fast signup must allow an empty optional phone number.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ terms_consent: false }))).status === 400, "Terms acceptance must be mandatory.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ privacy_consent: false }))).status === 400, "Privacy Policy acceptance must be mandatory.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ notification_channels: ["Email", "SMS"], sms_consent: false }))).status === 400, "SMS must require separate consent.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ notification_channels: ["Email", "SMS"], sms_consent: true, sms_country_code: "+1", sms_phone_number: "12" }))).status === 400, "SMS must require a valid international phone number.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ selection_priorities: ["Food quality", "Price", "Discount", "Location", "Atmosphere", "Service"] }))).status === 201, "Restaurant-selection priorities must not be limited to five.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ cuisines: [] }))).status === 400, "Required preference questions must block completion.");
  assert((await apiRaw("POST", "/auth/signup-guest", minimalSignupPayload({ cuisines: [], food_categories: [], preferred_neighborhoods: ["No preference"] }))).status === 201, "Account creation must succeed before optional preferences are completed.");

  const payload = minimalSignupPayload({ marketing_consent: false });
  const created = await api("POST", "/auth/signup-guest", payload);
  assert(created.access_token, "Successful signup should sign the demo guest in automatically.");
  assert(created.preferences?.consents?.terms_version && created.preferences?.consents?.privacy_policy_version, "Consent versions must be present.");
  assert(created.preferences?.consents?.accepted_at, "Consent timestamp must be present.");
  assert(created.preferences?.consents?.marketing === false, "Marketing consent must be optional.");
  assert(created.preferences?.preferred_neighborhoods?.includes("No preference"), "Fast signup must store the No preference neighborhood default.");

  const duplicate = await apiRaw("POST", "/auth/signup-guest", { ...payload });
  assert(duplicate.status === 409, "Duplicate email registration must be rejected.");

  const prefs = await api("GET", "/guest/preferences", {}, { authorization: `Bearer ${created.access_token}` });
  assert(prefs.profile?.preferences?.preferred_neighborhoods?.includes("No preference"), "Initial profile can be partial and still load.");
  const laterPrefs = await api("PATCH", "/guest/preferences", {
    country: "US",
    region: "NY",
    city: "New York",
    preferred_neighborhoods: ["No preference"],
    travel_distance_unit: "miles",
    max_travel_distance_value: "5",
    cuisines: ["American", "Other"],
    custom_cuisine: "Georgian",
    dietary_needs: ["No restrictions"],
    companions: ["Solo"],
    notification_channels: ["Email"]
  }, { authorization: `Bearer ${created.access_token}` });
  assert(laterPrefs.profile?.preferences?.cuisines?.includes("American"), "Optional preferences must be saved after account creation.");
  assert(laterPrefs.profile?.preferences?.custom_cuisine === "Georgian", "Other cuisine must save during optional setup.");
  assert(laterPrefs.profile?.preferences?.companions?.includes("Solo"), "Solo companion value must be saved during optional setup.");

  const marketingPayload = validSignupPayload({ marketing_consent: true });
  const marketingCreated = await api("POST", "/auth/signup-guest", marketingPayload);
  const revoked = await api("PATCH", "/guest/preferences", { marketing_consent: false, preferred_language: "hu" }, { authorization: `Bearer ${marketingCreated.access_token}` });
  assert(revoked.profile?.consent?.marketing === false, "Guests must be able to withdraw marketing consent.");

  const deletion = await apiRaw("DELETE", "/guest/preferences", { message: "Please delete my account." }, { authorization: `Bearer ${marketingCreated.access_token}` });
  assert(deletion.status === 202, "Guests must be able to request account deletion.");

  const duplicateEmail = uniqueEmail("double-submit");
  const doublePayload = validSignupPayload({ email: duplicateEmail });
  const double = await Promise.all([
    apiRaw("POST", "/auth/signup-guest", doublePayload),
    apiRaw("POST", "/auth/signup-guest", doublePayload)
  ]);
  assert(double.some((item) => item.status === 201) && double.some((item) => item.status === 409), "Duplicate submissions must not create duplicate accounts.");
}

async function assertAnalytics() {
  const result = await api("POST", "/analytics/events", {
    profile_key: "test-profile",
    event_type: "signup_started",
    metadata: {
      step_index: 0,
      step_key: "account",
      language: "hu",
      platform_mode: "basic",
      email: "private@example.com",
      phone: "+1 212 555 0000",
      password: "NeverStore!123",
      allergy_notes: "private allergy text"
    }
  });
  const props = result.event?.properties || {};
  assert(props.step_key === "account", "Allowed analytics properties must be retained.");
  assert(!("email" in props) && !("phone" in props) && !("password" in props) && !("allergy_notes" in props), "Private analytics properties must be stripped.");
  assert(JSON.stringify(props).includes("private@example.com") === false, "Private field values must not appear in analytics payload.");
  for (const eventType of ["signup_validation_failed", "signup_submitted", "signup_succeeded", "confirmation_email_sent", "confirmation_email_resent", "email_confirmed", "profile_setup_started", "profile_setup_skipped", "profile_setup_completed"]) {
    const eventResult = await apiRaw("POST", "/analytics/events", { profile_key: "test-profile", event_type: eventType, metadata: { step_key: "fast_account" } });
    assert(eventResult.status === 201, `${eventType} analytics event must be accepted.`);
  }
  const invalid = await apiRaw("POST", "/analytics/events", { profile_key: "x", event_type: "unsupported_event", metadata: {} });
  assert(invalid.status === 400, "Unsupported analytics events must be rejected.");
}

async function assertModeBehavior() {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert(app.includes("isBasicMode()"), "BASIC mode helper must exist.");
  assert(app.includes("isAIConciergeMode()"), "AI_CONCIERGE mode helper must exist.");
  assert(app.includes("canShowFeature(\"ai.concierge\""), "AI Concierge visibility must use the feature registry.");
  assert(app.includes("if (status === \"demo\") return isAiDemoVisible()"), "Demo AI features must require AI Demo Visibility.");
}

async function assertRollbackSupport() {
  const core = await readFile(new URL("../src/app-core.js", import.meta.url), "utf8");
  assert(core.includes("rollbackSupabaseGuestSignup"), "Supabase signup must include rollback support.");
  assert(core.includes("SIGNUP_PROFILE_CREATION_FAILED"), "Signup failures after auth creation must report a safe rollback code.");
  assert(core.includes("function emailDeliveryResult("), "Signup must expose explicit email delivery result objects.");
  assert(core.includes("function supabaseConfirmationEmailResult("), "Signup must expose Supabase confirmation email separately from welcome email.");
  assert(core.includes("auth_confirmation_email"), "Signup response must include Supabase confirmation email state.");
  assert(core.includes("welcome_email"), "Signup response must include SmartTable welcome email state.");
  assert(core.includes('logSafeServerEvent("auth_signup_success"'), "Signup must log Supabase Auth signup success.");
  assert(core.includes('logSafeServerEvent("auth_signup_failure"'), "Signup must log Supabase Auth signup failures.");
  assert(core.includes('logSafeServerEvent("auth_confirmation_requested"'), "Signup must log Supabase confirmation request state.");
  assert(core.includes('"welcome_email_sent"') && core.includes('"welcome_email_failed"'), "Signup must log welcome-email success and failure separately.");
  assert(core.includes("EMAIL_NOT_CONFIRMED"), "Supabase login must distinguish unverified accounts from invalid credentials.");
  assert(core.includes("AUTH_CALLBACK_URL"), "Supabase auth emails must use the centralized production callback URL.");
  assert(core.includes('/auth/v1/signup?redirect_to='), "Supabase signup must explicitly request the production auth callback redirect.");
  assert(core.includes('/auth/v1/verify'), "Auth callback must support Supabase token/token_hash verification.");
  assert(core.includes("/auth/resend-verification"), "Public verification resend must be available for expired confirmation links.");
  assert(core.includes("VERIFICATION_RESEND_RATE_LIMITED") && core.includes('"retry-after"'), "Public verification resend must be rate limited with a retry hint.");
  assert(core.includes("cooldown_seconds"), "Public verification resend must return a safe client cooldown hint.");
  assert(core.includes("OTP_EXPIRED"), "Auth callback failures must preserve expired-link error codes for the UI.");
  assert(core.includes("mapSupabaseSignupError"), "Supabase signup failures must be mapped before the UI reports success.");
  assert(core.includes("guestPreferenceColumns"), "Important preference data must be persisted as structured fields.");
  assert(core.includes("sanitizeSignupAnalyticsProperties"), "Backend analytics must strip private field values.");
  assert(core.includes('supabaseTableExists("user_legal_consents")'), "Signup must treat newer legal consent tables as optional for production schema compatibility.");
  assert(core.includes('supabaseTableExists("communication_preferences")'), "Signup must treat newer communication preference tables as optional for production schema compatibility.");
  assert(core.includes('supabaseTableExists("communication_consents")'), "Signup must treat newer communication consent tables as optional for production schema compatibility.");
}

async function main() {
  await assertLocales();
  await assertFrontendWiring();
  await assertBackendValidationAndPersistence();
  await assertAnalytics();
  await assertModeBehavior();
  await assertRollbackSupport();
  console.log("Guest signup acceptance checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
