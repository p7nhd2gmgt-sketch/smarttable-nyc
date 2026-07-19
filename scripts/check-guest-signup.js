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

async function assertLocales() {
  const required = [
    "signup_create_my_account",
    "signup_validation_summary_title",
    "signup_profile_ready_title",
    "signup_profile_ready_message",
    "signup_explore_restaurants",
    "signup_view_preferences",
    "signup_terms_link",
    "signup_privacy_link",
    "signup_error_select_one",
    "signup_error_consent"
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
  assert(app.includes("renderGuestSignup()"), "Dedicated signup page must render through renderGuestSignup().");
  assert(!app.includes("Skip for now") && !app.includes("Complete later") && !app.includes("Continue without answering"), "Signup must not include skip/complete-later options.");
  assert(app.includes("signup_create_my_account"), "Final signup button must use Create My SmartTable Account translation key.");
  assert(app.includes("createDisabled") && app.includes("disabled"), "Final signup button must be disabled until the form is complete.");
  assert(app.includes("signupValidationSummaryHtml()"), "Signup must show a validation summary with incomplete section links.");
  assert(app.includes("data-signup-back") && app.includes("data-signup-step"), "Back and forward step navigation must exist.");
  assert(app.includes("collectSignupForm(form)") && app.includes("state.signup") && app.includes("data: defaultSignupData()"), "Form answers must remain in signup state between steps.");
  assert(app.includes("terms_consent") && app.includes("privacy_consent"), "Terms and Privacy consent fields must be separate.");
  assert(app.includes("marketing_consent") && !app.includes("if (!data.marketing_consent)"), "Marketing consent must remain optional.");
  assert(app.includes("canShowFeature(\"ai.concierge\"") && app.includes("data-start-ai-concierge"), "Start AI Concierge must be gated by the feature registry.");
  assert(app.includes("trackSignupEvent(\"signup_started\""), "signup_started analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"signup_step_completed\""), "signup_step_completed analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"signup_abandoned\""), "signup_abandoned analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"signup_completed\""), "signup_completed analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"preference_selected\""), "preference_selected analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"terms_accepted\""), "terms_accepted analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"privacy_accepted\""), "privacy_accepted analytics event must be tracked.");
  assert(app.includes("trackSignupEvent(\"marketing_consent_given\""), "marketing_consent_given analytics event must be tracked.");
  assert(!app.includes("signup_favorite_restaurants") || !app.includes('signupCheckboxGroup("favorite_restaurants"'), "Signup must not ask for a Favorite SmartTable Restaurant.");
  assert(app.includes("safeSignupAnalyticsMetadata"), "Frontend analytics metadata must be whitelisted.");
  assert(!/localStorage\.setItem\([^)]*(password|allergy_notes|phone)/i.test(app), "Sensitive signup fields must not be stored in localStorage.");
  assert(css.includes("@media (max-width: 860px)") && css.includes(".signup-review-grid") && css.includes(".signup-validation-summary"), "Signup must include responsive mobile/desktop layout styles.");
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
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ terms_consent: false }))).status === 400, "Terms acceptance must be mandatory.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ privacy_consent: false }))).status === 400, "Privacy Policy acceptance must be mandatory.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ notification_channels: ["Email", "SMS"], sms_consent: false }))).status === 400, "SMS must require separate consent.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ selection_priorities: ["Food quality", "Price", "Discount", "Location", "Atmosphere", "Service"] }))).status === 201, "Restaurant-selection priorities must not be limited to five.");
  assert((await apiRaw("POST", "/auth/signup-guest", validSignupPayload({ cuisines: [] }))).status === 400, "Required preference questions must block completion.");

  const payload = validSignupPayload({ marketing_consent: false });
  const created = await api("POST", "/auth/signup-guest", payload);
  assert(created.access_token, "Successful signup should sign the demo guest in automatically.");
  assert(created.preferences?.minimumInterestingDiscount === 10, "Minimum interesting discount must be derived from selected discount levels.");
  assert(created.preferences?.consents?.terms_version && created.preferences?.consents?.privacy_policy_version, "Consent versions must be present.");
  assert(created.preferences?.consents?.accepted_at, "Consent timestamp must be present.");
  assert(created.preferences?.consents?.marketing === false, "Marketing consent must be optional.");

  const duplicate = await apiRaw("POST", "/auth/signup-guest", { ...payload });
  assert(duplicate.status === 409, "Duplicate email registration must be rejected.");

  const prefs = await api("GET", "/guest/preferences", {}, { authorization: `Bearer ${created.access_token}` });
  assert(prefs.profile?.preferences?.cuisines?.includes("American"), "Preferences must be saved.");
  assert(prefs.profile?.minimum_interesting_discount === 10, "Structured preference fields must be saved.");

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
  assert(core.includes("Account creation rolled back"), "Signup failures after auth creation must report rollback.");
  assert(core.includes("guestPreferenceColumns"), "Important preference data must be persisted as structured fields.");
  assert(core.includes("sanitizeSignupAnalyticsProperties"), "Backend analytics must strip private field values.");
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
