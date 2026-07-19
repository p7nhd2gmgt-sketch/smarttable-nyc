import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const capturedServerErrors = [];
console.error = (...args) => {
  capturedServerErrors.push(args.map((item) => String(item)).join(" "));
};

function resetEnv(overrides = {}) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("SUPABASE_") || key.startsWith("RESEND_") || key.startsWith("EMAIL_") || key === "PUBLIC_BASE_URL" || key === "PUBLIC_SITE_URL" || key === "SMARTTABLE_ENV" || key === "APP_ENV" || key === "VERCEL_ENV" || key === "NODE_ENV") {
      delete process.env[key];
    }
  }
  Object.assign(process.env, overrides);
}

function jsonResponse(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload
  };
}

async function importCore(label) {
  return await import(`../src/app-core.js?production-auth-flow=${label}-${Date.now()}-${Math.random()}`);
}

async function rawApi(core, method, path, body = {}, headers = {}) {
  return await core.handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
}

function productionEnv() {
  return {
    SMARTTABLE_ENV: "production",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    PUBLIC_BASE_URL: "https://smarttablenyc.com",
    EMAIL_FROM: "SmartTable <reservations@mail.smarttablenyc.com>",
    RESEND_API_KEY: "test-resend-key"
  };
}

function validSignupPayload(overrides = {}) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    first_name: "Production",
    last_name: "Guest",
    email: `auth-flow-${id}@smarttablenyc.test`,
    password: "Strong!12345",
    confirm_password: "Strong!12345",
    phone: "+1 212 555 0177",
    city: "New York",
    region: "NY",
    postal_code: "10014",
    preferred_neighborhoods: ["West Village"],
    travel_distance_miles: "5",
    transportation_method: "Walking",
    transportation_methods: ["Walking"],
    cuisines: ["American"],
    food_categories: ["Pasta"],
    dietary_needs: ["No restrictions"],
    allergy_notes: "",
    drink_preferences: ["Coffee"],
    dining_experiences: ["Casual dining"],
    companions: ["Partner"],
    party_size: "2",
    preferred_days: ["Friday"],
    preferred_time_windows: ["Dinner"],
    booking_lead_time: "1-2 days",
    dining_duration: "60-90 minutes",
    discovery_preference: "A balance of both",
    selection_priorities: ["Food quality", "Location"],
    new_restaurant_recommendations: "Yes",
    new_menu_item_recommendations: "No",
    excluded_categories: ["No exclusions"],
    spending_range: "$35-$50",
    discount_levels: ["10%", "20%"],
    consider_no_discount_match: "Sometimes",
    notification_preferences: ["Reservation status updates"],
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

async function withMockedProductionCore(label, fetchImpl, callback) {
  resetEnv(productionEnv());
  capturedServerErrors.length = 0;
  globalThis.fetch = fetchImpl;
  const core = await importCore(label);
  return await callback(core);
}

await withMockedProductionCore("login-email-not-confirmed", async (url) => {
  const target = String(url);
  if (target.includes("/auth/v1/token")) {
    return jsonResponse(400, {
      error: "email_not_confirmed",
      error_description: "Email not confirmed"
    });
  }
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/login", {
    email: "pending-confirmation@smarttablenyc.test",
    password: "Strong!12345"
  });
  assert.equal(response.status, 403, "Unverified Supabase Auth accounts must not be reported as invalid credentials.");
  assert.equal(response.body.code, "EMAIL_NOT_CONFIRMED");
  assert.match(response.body.error, /verification/i);
});

await withMockedProductionCore("login-invalid-password", async (url) => {
  const target = String(url);
  if (target.includes("/auth/v1/token")) {
    return jsonResponse(400, {
      error: "invalid_grant",
      error_description: "Invalid login credentials"
    });
  }
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/login", {
    email: "unknown-or-wrong-password@smarttablenyc.test",
    password: "Wrong!12345"
  });
  assert.equal(response.status, 401, "Incorrect credentials must return a safe generic login failure.");
  assert.equal(response.body.error, "Invalid email or password.");
  assert(!response.body.code, "Invalid credentials must not reveal whether the email exists.");
});

await withMockedProductionCore("login-confirmed-account", async (url) => {
  const target = String(url);
  if (target.includes("/auth/v1/token")) {
    return jsonResponse(200, {
      access_token: "confirmed-access-token",
      refresh_token: "confirmed-refresh-token",
      expires_in: 3600
    });
  }
  if (target.includes("/auth/v1/user")) {
    return jsonResponse(200, {
      id: "auth-user-confirmed",
      email: "confirmed@smarttablenyc.test",
      email_confirmed_at: "2026-07-19T12:00:00.000Z"
    });
  }
  if (target.includes("/rest/v1/profiles?select=*")) {
    return jsonResponse(200, [{
      id: "auth-user-confirmed",
      email: "confirmed@smarttablenyc.test",
      full_name: "Confirmed Guest",
      role: "guest",
      preferred_language: "en"
    }]);
  }
  if (target.includes("/rest/v1/guests?select=id,status")) return jsonResponse(200, [{ id: "guest-confirmed", status: "active" }]);
  if (target.includes("/rest/v1/guest_profiles?select=id")) return jsonResponse(200, [{ id: "guest-profile-confirmed" }]);
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/login", {
    email: "confirmed@smarttablenyc.test",
    password: "Strong!12345"
  });
  assert.equal(response.status, 200, "Confirmed valid Supabase accounts must be able to log in.");
  assert.equal(response.body.mode, "supabase");
  assert.equal(response.body.profile.email_verified, true);
  assert.equal(response.body.profile.role, "guest");
});

await withMockedProductionCore("login-profile-missing", async (url) => {
  const target = String(url);
  if (target.includes("/auth/v1/token")) {
    return jsonResponse(200, {
      access_token: "missing-profile-token",
      refresh_token: "missing-profile-refresh",
      expires_in: 3600
    });
  }
  if (target.includes("/auth/v1/user")) {
    return jsonResponse(200, {
      id: "auth-user-without-profile",
      email: "missing-profile@smarttablenyc.test",
      email_confirmed_at: "2026-07-19T12:00:00.000Z"
    });
  }
  if (target.includes("/rest/v1/profiles?select=*")) return jsonResponse(200, []);
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/login", {
    email: "missing-profile@smarttablenyc.test",
    password: "Strong!12345"
  });
  assert.equal(response.status, 409, "Auth users missing SmartTable profile setup must receive a distinct recoverable state.");
  assert.equal(response.body.code, "ACCOUNT_SETUP_INCOMPLETE");
  assert.equal(response.body.onboarding_required, true, "Missing SmartTable profile setup must redirect the guest to onboarding.");
  assert.equal(response.body.redirect, "/signup", "Recoverable profile setup must point at the dedicated signup/onboarding page.");
  assert.equal(response.body.access_token, "missing-profile-token", "Recoverable profile setup must preserve the authenticated Supabase session.");
});

const resumeSignupCalls = [];
await withMockedProductionCore("signup-resume-auth-user", async (url, options = {}) => {
  const target = String(url);
  const method = String(options.method || "GET").toUpperCase();
  resumeSignupCalls.push({ target, method });
  if (target.includes("api.resend.com")) return jsonResponse(200, { id: "resend-resume-onboarding" });
  if (target.includes("/auth/v1/user")) {
    return jsonResponse(200, {
      id: "auth-user-resume",
      email: "resume-onboarding@smarttablenyc.test",
      email_confirmed_at: "2026-07-19T12:00:00.000Z",
      user_metadata: {
        full_name: "Resume Onboarding",
        preferred_language: "en"
      }
    });
  }
  if (target.includes("/rest/v1/profiles?select=id") || target.includes("/rest/v1/guests?select=id")) return jsonResponse(200, []);
  if (target.includes("/rest/v1/guests?on_conflict=email")) return jsonResponse(201, [{ id: "guest-resume-onboarding" }]);
  if (target.includes("/rest/v1/profiles?select=*&id=eq.auth-user-resume")) {
    return jsonResponse(200, [{
      id: "auth-user-resume",
      email: "resume-onboarding@smarttablenyc.test",
      full_name: "Resume Onboarding",
      role: "guest",
      preferred_language: "en"
    }]);
  }
  return jsonResponse(200, []);
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/signup-guest", validSignupPayload({
    email: "resume-onboarding@smarttablenyc.test",
    first_name: "Resume",
    last_name: "Onboarding"
  }), { authorization: "Bearer resume-token" });
  assert.equal(response.status, 201, "An authenticated Auth user must be able to complete missing SmartTable onboarding.");
  assert.equal(response.body.access_token, "resume-token", "Completed onboarding should keep the existing Supabase session.");
  assert.equal(response.body.email_verification_required, false, "A confirmed resumed Auth user must not be treated as pending confirmation.");
  assert(!resumeSignupCalls.some((call) => call.target.includes("/auth/v1/signup")), "Completing onboarding for an existing Auth user must not try to create a duplicate Auth user.");
  assert(resumeSignupCalls.some((call) => call.target.includes("/rest/v1/profiles?on_conflict=id")), "Resume onboarding must create or update the SmartTable profile.");
  assert(resumeSignupCalls.some((call) => call.target.includes("/rest/v1/guest_profiles?on_conflict=profile_key")), "Resume onboarding must persist guest preferences.");
  assert(resumeSignupCalls.some((call) => call.target.includes("api.resend.com")), "Resume onboarding must attempt the welcome email after required setup is saved.");
});

await withMockedProductionCore("signup-auth-rejected", async (url) => {
  const target = String(url);
  assert(!target.includes("api.resend.com"), "Welcome email must not be attempted when Supabase Auth signup fails.");
  if (target.includes("/rest/v1/profiles") || target.includes("/rest/v1/guests")) return jsonResponse(200, []);
  if (target.includes("/auth/v1/signup")) {
    return jsonResponse(422, {
      error: "weak_password",
      message: "Password should be stronger."
    });
  }
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/signup-guest", validSignupPayload());
  assert.equal(response.status, 400, "Supabase Auth signup failures must block successful registration UI.");
  assert.equal(response.body.code, "WEAK_PASSWORD");
});

await withMockedProductionCore("signup-profile-rollback", async (url, options = {}) => {
  const target = String(url);
  const method = String(options.method || "GET").toUpperCase();
  if (target.includes("/rest/v1/profiles?select=id") || target.includes("/rest/v1/guests?select=id")) return jsonResponse(200, []);
  if (target.includes("/auth/v1/signup")) return jsonResponse(200, { user: { id: "auth-user-profile-fail", email: "profile-fail@smarttablenyc.test" }, session: null });
  if (target.includes("/rest/v1/profiles?on_conflict=id")) return jsonResponse(201, []);
  if (target.includes("/rest/v1/guests?on_conflict=email")) return jsonResponse(500, { error: "database exploded with private context" });
  if (method === "DELETE") return jsonResponse(204, {});
  return jsonResponse(200, []);
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/signup-guest", validSignupPayload({ email: "profile-fail@smarttablenyc.test" }));
  assert.equal(response.status, 500, "Profile persistence failure must not report signup success.");
  assert.equal(response.body.code, "SIGNUP_PROFILE_CREATION_FAILED");
  assert.equal(response.body.rolled_back, true);
  assert(!JSON.stringify(response.body).includes("database exploded"), "Raw upstream database details must not be returned to the browser.");
  assert(!capturedServerErrors.join("\n").includes("database exploded"), "Raw upstream database details must not be written to structured server logs.");
});

const confirmationCalls = [];
await withMockedProductionCore("signup-confirmation-required", async (url, options = {}) => {
  const target = String(url);
  const method = String(options.method || "GET").toUpperCase();
  confirmationCalls.push({ target, method });
  if (target.includes("/api.resend.com") || target.includes("api.resend.com")) return jsonResponse(200, { id: "resend-confirmation-required" });
  if (target.includes("/rest/v1/profiles?select=id") || target.includes("/rest/v1/guests?select=id")) return jsonResponse(200, []);
  if (target.includes("/auth/v1/signup")) return jsonResponse(200, { user: { id: "auth-user-confirmation-required", email: "confirmation-required@smarttablenyc.test" }, session: null });
  if (target.includes("/rest/v1/guests?on_conflict=email")) return jsonResponse(201, [{ id: "guest-confirmation-required" }]);
  return jsonResponse(200, []);
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/signup-guest", validSignupPayload({ email: "confirmation-required@smarttablenyc.test" }));
  assert.equal(response.status, 201, "Signup should succeed only after Auth and required profile records are saved.");
  assert.equal(response.body.email_verification_required, true, "Signup must explicitly tell the frontend when verification is required.");
  assert(!response.body.access_token, "Confirmation-required signup must not imply an active session.");
  assert(response.body.email_delivery?.accepted_count >= 1, "Welcome/registration email delivery state must be returned truthfully.");
  assert(confirmationCalls.some((call) => call.target.includes("/auth/v1/signup")), "Successful signup must create a Supabase Auth user.");
  assert(confirmationCalls.some((call) => call.target.includes("/rest/v1/profiles?on_conflict=id")), "Successful signup must create the SmartTable profile row.");
  assert(confirmationCalls.some((call) => call.target.includes("/rest/v1/guest_profiles?on_conflict=profile_key")), "Successful signup must persist guest preferences.");
  assert(confirmationCalls.some((call) => call.target.includes("api.resend.com")), "Welcome email must be attempted after successful registration.");
});

let deleteCalledAfterEmailFailure = false;
await withMockedProductionCore("signup-welcome-email-fails", async (url, options = {}) => {
  const target = String(url);
  const method = String(options.method || "GET").toUpperCase();
  if (method === "DELETE") deleteCalledAfterEmailFailure = true;
  if (target.includes("api.resend.com")) return jsonResponse(403, { message: "Sender domain is not verified." });
  if (target.includes("/rest/v1/profiles?select=id") || target.includes("/rest/v1/guests?select=id")) return jsonResponse(200, []);
  if (target.includes("/auth/v1/signup")) return jsonResponse(200, { user: { id: "auth-user-email-failure", email: "email-failure@smarttablenyc.test" }, session: null });
  if (target.includes("/rest/v1/guests?on_conflict=email")) return jsonResponse(201, [{ id: "guest-email-failure" }]);
  return jsonResponse(200, []);
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/signup-guest", validSignupPayload({ email: "email-failure@smarttablenyc.test" }));
  assert.equal(response.status, 201, "Welcome email failure must not invalidate a successfully created Auth account.");
  assert.equal(response.body.email_verification_required, true);
  assert(response.body.email_delivery?.failed_count >= 1, "Welcome email failure must be reported truthfully.");
  assert.equal(deleteCalledAfterEmailFailure, false, "Email failure must not roll back or delete the valid account.");
});

await withMockedProductionCore("guest-notifications-logged-out", async () => {
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "GET", "/guest/notifications");
  assert.equal(response.status, 401, "Logged-out guest notifications must report authentication required instead of a noisy bad request.");
  assert.equal(response.body.code, "AUTHENTICATION_REQUIRED");
});

const publicApp = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
assert(publicApp.includes("function canShowDemoCredentials()"), "Demo credentials must be controlled by one visibility helper.");
assert(publicApp.includes("isLocalBrowserRuntime()") && publicApp.includes("!isProductionApiRuntime()"), "Demo credentials must be limited to local non-production runtime.");
assert(!indexHtml.includes('id="adminNav"'), "Production public navigation must not include a Super Admin entry.");
assert(!indexHtml.includes('id="restaurantNav"'), "Production public navigation must not include Partner as a primary guest-nav item.");
assert(publicApp.includes("footer_partner_login_link") && publicApp.includes("href=\"/partner\""), "Partner route must remain intentionally reachable outside primary guest navigation.");

for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, originalEnv);
globalThis.fetch = originalFetch;
console.error = originalConsoleError;

console.log("Production auth flow checks passed.");
