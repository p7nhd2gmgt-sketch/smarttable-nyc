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
    if (key.startsWith("SUPABASE_") || key.startsWith("RESEND_") || key.startsWith("EMAIL_") || key === "PUBLIC_BASE_URL" || key === "PUBLIC_SITE_URL" || key === "SMARTTABLE_ENV" || key === "APP_ENV" || key === "VERCEL_ENV" || key === "NODE_ENV" || key === "SMARTTABLE_ENABLE_LOGIN_DIAGNOSTICS") {
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
    PUBLIC_BASE_URL: "https://www.smarttablenyc.com",
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
const resumeAccessToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdXRoLXVzZXItcmVzdW1lIn0.signature";
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
  }), { authorization: `Bearer ${resumeAccessToken}` });
  assert.equal(response.status, 201, "An authenticated Auth user must be able to complete missing SmartTable onboarding.");
  assert.equal(response.body.access_token, resumeAccessToken, "Completed onboarding should keep the existing Supabase session.");
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

await withMockedProductionCore("signup-auth-rate-limited", async (url) => {
  const target = String(url);
  assert(!target.includes("api.resend.com"), "Welcome email must not be attempted when Supabase Auth signup is rate limited.");
  if (target.includes("/rest/v1/profiles") || target.includes("/rest/v1/guests")) return jsonResponse(200, []);
  if (target.includes("/auth/v1/signup")) {
    return jsonResponse(429, {
      error: "rate_limit_exceeded",
      message: "Too many signup requests."
    });
  }
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/signup-guest", validSignupPayload());
  assert.equal(response.status, 429, "Supabase Auth signup rate limits must be returned as a precise retryable state.");
  assert.equal(response.body.code, "AUTH_SIGNUP_RATE_LIMITED");
  assert.match(response.body.error, /too many account creation attempts/i);
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
  const body = options.body ? JSON.parse(options.body) : null;
  confirmationCalls.push({ target, method, body });
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
  assert.equal(response.body.auth_confirmation_email?.provider, "supabase", "Supabase confirmation email state must be tracked separately.");
  assert.equal(response.body.auth_confirmation_email?.attempted, true, "Confirmation-required signup must mark the Supabase confirmation email as requested.");
  assert.equal(response.body.auth_confirmation_email?.accepted, null, "Signup must not claim Supabase confirmation email delivery without provider delivery proof.");
  assert.equal(response.body.welcome_email?.provider, "resend", "SmartTable welcome email state must be tracked separately from Supabase Auth email.");
  assert.equal(response.body.welcome_email?.accepted, true, "Accepted welcome email should be reported on the welcome_email result.");
  assert(response.body.email_delivery?.accepted_count >= 1, "Welcome/registration email delivery state must be returned truthfully.");
  assert(confirmationCalls.some((call) => call.target.includes("/auth/v1/signup")), "Successful signup must create a Supabase Auth user.");
  const authSignupCall = confirmationCalls.find((call) => call.target.includes("/auth/v1/signup"));
  assert(authSignupCall.target.includes("redirect_to="), "Supabase signup must explicitly set a confirmation callback redirect.");
  assert(authSignupCall.target.includes(encodeURIComponent("https://www.smarttablenyc.com/auth/callback")), "Supabase signup confirmation links must target /auth/callback.");
  assert(confirmationCalls.some((call) => call.target.includes("/rest/v1/profiles?on_conflict=id")), "Successful signup must create the SmartTable profile row.");
  assert(confirmationCalls.some((call) => call.target.includes("/rest/v1/guest_profiles?on_conflict=profile_key")), "Successful signup must persist guest preferences.");
  assert(confirmationCalls.some((call) => call.target.includes("api.resend.com")), "Welcome email must be attempted after successful registration.");
  const consentCall = confirmationCalls.find((call) => call.target.includes("/rest/v1/guest_consents"));
  assert(consentCall, "Successful signup must persist consent records.");
  assert(Array.isArray(consentCall.body), "Consent records must be inserted as a bulk array.");
  const [firstConsentKeys, ...remainingConsentKeys] = consentCall.body.map((row) => Object.keys(row).sort().join("|"));
  assert(remainingConsentKeys.every((keys) => keys === firstConsentKeys), "Bulk consent insert rows must use identical keys for PostgREST.");
});

const authCallbackCalls = [];
await withMockedProductionCore("auth-callback-token-success", async (url) => {
  const target = String(url);
  authCallbackCalls.push({ target });
  if (target.includes("/auth/v1/user")) {
    return jsonResponse(200, {
      id: "auth-callback-user",
      email: "callback-confirmed@smarttablenyc.test",
      email_confirmed_at: "2026-07-19T12:00:00.000Z"
    });
  }
  if (target.includes("/rest/v1/profiles?select=*")) {
    return jsonResponse(200, [{
      id: "auth-callback-user",
      email: "callback-confirmed@smarttablenyc.test",
      full_name: "Callback Confirmed",
      role: "guest",
      preferred_language: "en"
    }]);
  }
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/callback", {
    access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdXRoLWNhbGxiYWNrLXVzZXIifQ.signature",
    refresh_token: "refresh-token",
    expires_in: 3600
  });
  assert.equal(response.status, 200, "Token-based Supabase confirmation callbacks must complete through the backend.");
  assert.equal(response.body.verified, true, "Confirmed callback responses must verify email-confirmed state.");
  assert.equal(response.body.profile.email_verified, true, "Callback profile must expose confirmed email state.");
});

const authCallbackTokenHashCalls = [];
await withMockedProductionCore("auth-callback-token-hash-success", async (url, options = {}) => {
  const target = String(url);
  const body = options.body ? JSON.parse(options.body) : null;
  authCallbackTokenHashCalls.push({ target, body });
  if (target.includes("/auth/v1/verify")) {
    return jsonResponse(200, {
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdXRoLXRva2VuLWhhc2gtdXNlciJ9.signature",
      refresh_token: "token-hash-refresh",
      expires_in: 3600
    });
  }
  if (target.includes("/auth/v1/user")) {
    return jsonResponse(200, {
      id: "auth-token-hash-user",
      email: "token-hash-confirmed@smarttablenyc.test",
      email_confirmed_at: "2026-07-19T12:00:00.000Z"
    });
  }
  if (target.includes("/rest/v1/profiles?select=*")) {
    return jsonResponse(200, [{
      id: "auth-token-hash-user",
      email: "token-hash-confirmed@smarttablenyc.test",
      full_name: "Token Hash Confirmed",
      role: "guest",
      preferred_language: "en"
    }]);
  }
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/callback", {
    token_hash: "email-template-token-hash",
    type: "email"
  });
  assert.equal(response.status, 200, "Token-hash Supabase confirmation callbacks must complete through /auth/v1/verify.");
  const verifyCall = authCallbackTokenHashCalls.find((call) => call.target.includes("/auth/v1/verify"));
  assert.equal(verifyCall.body?.token_hash, "email-template-token-hash", "Callback verification must preserve Supabase token_hash.");
  assert.equal(verifyCall.body?.type, "email", "Callback verification must preserve Supabase confirmation type.");
  assert.equal(response.body.verified, true);
});

await withMockedProductionCore("auth-callback-expired-code", async (url) => {
  const target = String(url);
  if (target.includes("/auth/v1/token?grant_type=pkce")) {
    return jsonResponse(403, {
      error: "access_denied",
      error_code: "otp_expired",
      error_description: "Email link is invalid or has expired"
    });
  }
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/callback", {
    code: "expired-code",
    code_verifier: "stored-code-verifier"
  });
  assert.equal(response.status, 400, "Expired Supabase callback codes must not silently redirect to the homepage.");
  assert.equal(response.body.code, "OTP_EXPIRED");
  assert.match(response.body.error, /invalid or has expired/i);
});

const resendVerificationCalls = [];
await withMockedProductionCore("auth-callback-public-resend", async (url, options = {}) => {
  const target = String(url);
  const body = options.body ? JSON.parse(options.body) : null;
  resendVerificationCalls.push({ target, body });
  if (target.includes("/auth/v1/resend")) return jsonResponse(200, {});
  if (target.includes("/rest/v1/email_logs")) return jsonResponse(201, [{ id: "auth-email-log" }]);
  return jsonResponse(200, []);
}, async (core) => {
  const response = await rawApi(core, "POST", "/auth/resend-verification", {
    email: "needs-verification@smarttablenyc.test"
  }, { "x-forwarded-for": "203.0.113.11" });
  assert.equal(response.status, 200, "Public verification resend must return a neutral safe response.");
  assert.match(response.body.message, /if a SmartTable account exists/i);
  assert.equal(response.body.cooldown_seconds, 60, "Public verification resend must return a safe client cooldown hint.");
  const resendCall = resendVerificationCalls.find((call) => call.target.includes("/auth/v1/resend"));
  assert(resendCall, "Public verification resend must call Supabase Auth resend.");
  assert(resendCall.target.includes(encodeURIComponent("https://www.smarttablenyc.com/auth/callback")), "Resent confirmation links must target /auth/callback.");
  assert.equal(resendCall.body?.type, "signup", "Verification resend must use Supabase signup confirmation emails.");
  assert.equal(resendCall.body?.options?.email_redirect_to, "https://www.smarttablenyc.com/auth/callback");
});

await withMockedProductionCore("auth-callback-public-resend-rate-limit", async (url) => {
  const target = String(url);
  if (target.includes("/auth/v1/resend")) return jsonResponse(200, {});
  if (target.includes("/rest/v1/email_logs")) return jsonResponse(201, [{ id: "auth-email-log-rate-limit" }]);
  return jsonResponse(200, []);
}, async (core) => {
  const body = { email: "rate-limited-verification@smarttablenyc.test" };
  const headers = { "x-forwarded-for": "203.0.113.12" };
  for (let index = 0; index < 3; index += 1) {
    const response = await rawApi(core, "POST", "/auth/resend-verification", body, headers);
    assert.equal(response.status, 200, "The first three verification resend requests in the window should be accepted neutrally.");
  }
  const limited = await rawApi(core, "POST", "/auth/resend-verification", body, headers);
  assert.equal(limited.status, 429, "Verification resend must be rate limited.");
  assert.equal(limited.body.code, "VERIFICATION_RESEND_RATE_LIMITED");
  assert(Number(limited.body.retry_after) > 0, "Rate-limited verification resend must include retry_after seconds.");
  assert(Number(limited.headers?.["retry-after"]) > 0, "Rate-limited verification resend must include a Retry-After header.");
});

await withMockedProductionCore("analytics-production-metadata-schema", async (url, options = {}) => {
  const target = String(url);
  const body = options.body ? JSON.parse(options.body) : null;
  if (target.includes("/rest/v1/analytics_events?select=*")) {
    assert(body.metadata?.step_key === "account", "Production analytics must store whitelisted properties in the metadata column.");
    assert(!("properties" in body), "Production analytics insert must not require a properties column.");
    assert(!("entity_type" in body) && !("entity_id" in body), "Production analytics insert must not require optional legacy columns.");
    return jsonResponse(201, [{ id: "analytics-prod", event_type: body.event_type, profile_key: body.profile_key, metadata: body.metadata }]);
  }
  return jsonResponse(404, { error: "unexpected mock request" });
}, async (core) => {
  const response = await rawApi(core, "POST", "/analytics/events", {
    profile_key: "prod-profile",
    event_type: "signup_started",
    metadata: {
      step_key: "account",
      email: "private@example.com"
    }
  });
  assert.equal(response.status, 201, "Signup analytics must save against the production metadata schema.");
  assert.equal(response.body.event.properties.step_key, "account", "Analytics response must preserve the existing properties contract.");
  assert(!("email" in response.body.event.properties), "Private analytics fields must still be stripped.");
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
  assert.equal(response.body.auth_confirmation_email?.provider, "supabase", "Supabase confirmation state must still be present when the optional welcome email fails.");
  assert.equal(response.body.auth_confirmation_email?.attempted, true, "Supabase confirmation must still be requested when the optional welcome email fails.");
  assert.equal(response.body.auth_confirmation_email?.accepted, null, "The app must not infer Supabase confirmation delivery from the optional welcome email result.");
  assert.equal(response.body.welcome_email?.provider, "resend", "Welcome email failure must be scoped to the Resend welcome_email result.");
  assert.equal(response.body.welcome_email?.accepted, false, "Failed welcome email must be explicit without poisoning confirmation state.");
  assert.equal(response.body.welcome_email?.verifiedRejection, true, "Permanent provider rejection must be explicit for user-facing warning decisions.");
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
assert(publicApp.includes("function canRenderLoginDiagnostics()"), "Login diagnostics must be behind one renderer guard.");
assert(publicApp.includes("health.login_diagnostics_enabled === true"), "Login diagnostics must depend on the server-side diagnostics flag.");
assert(publicApp.includes("health.production_runtime !== true"), "Login diagnostics must include a hard production guard.");
assert(!publicApp.includes("__smartTableLastAuthStatus"), "Login diagnostics must not expose auth status through public globals.");
assert(!publicApp.includes("__smartTableLastAuthErrorCode"), "Login diagnostics must not expose auth error codes through public globals.");
assert(!publicApp.includes("__smartTableLastSelectedRedirectRoute"), "Login diagnostics must not expose redirect decisions through public globals.");
assert(!indexHtml.includes('id="adminNav"'), "Production public navigation must not include a Super Admin entry.");
assert(!indexHtml.includes('id="restaurantNav"'), "Production public navigation must not include Partner as a primary guest-nav item.");
assert(publicApp.includes("footer_for_restaurants_link") && publicApp.includes('href: "/partner"'), "Partner route must remain intentionally reachable outside primary guest navigation.");

resetEnv({
  ...productionEnv(),
  SMARTTABLE_ENABLE_LOGIN_DIAGNOSTICS: "true"
});
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes("/rest/v1/restaurants?select=id")) return jsonResponse(200, [{ id: "restaurant" }]);
  return jsonResponse(200, []);
};
const productionDiagnosticsCore = await importCore("login-diagnostics-production-guard");
const productionDiagnosticsHealth = await rawApi(productionDiagnosticsCore, "GET", "/health");
assert.equal(productionDiagnosticsHealth.body.production_runtime, undefined, "Health endpoint should not use public-config production_runtime naming.");
assert.equal(productionDiagnosticsHealth.body.runtime_mode, "production");
assert.equal(productionDiagnosticsHealth.body.login_diagnostics_enabled, false, "Production must hide login diagnostics even when the flag is true.");

resetEnv({
  SMARTTABLE_ENV: "staging",
  SMARTTABLE_ENABLE_LOGIN_DIAGNOSTICS: "false",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PUBLIC_BASE_URL: "https://staging.smarttablenyc.test"
});
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes("/rest/v1/restaurants?select=id")) return jsonResponse(200, [{ id: "restaurant" }]);
  return jsonResponse(200, []);
};
const stagingDiagnosticsDisabledCore = await importCore("login-diagnostics-staging-disabled");
const stagingDiagnosticsDisabledHealth = await rawApi(stagingDiagnosticsDisabledCore, "GET", "/health");
assert.equal(stagingDiagnosticsDisabledHealth.body.runtime_mode, "staging");
assert.equal(stagingDiagnosticsDisabledHealth.body.login_diagnostics_enabled, false, "Staging diagnostics must default to hidden.");

resetEnv({
  SMARTTABLE_ENV: "staging",
  SMARTTABLE_ENABLE_LOGIN_DIAGNOSTICS: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PUBLIC_BASE_URL: "https://staging.smarttablenyc.test"
});
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes("/rest/v1/restaurants?select=id")) return jsonResponse(200, [{ id: "restaurant" }]);
  return jsonResponse(200, []);
};
const stagingDiagnosticsEnabledCore = await importCore("login-diagnostics-staging-enabled");
const stagingDiagnosticsEnabledHealth = await rawApi(stagingDiagnosticsEnabledCore, "GET", "/health");
assert.equal(stagingDiagnosticsEnabledHealth.body.runtime_mode, "staging");
assert.equal(stagingDiagnosticsEnabledHealth.body.login_diagnostics_enabled, true, "Staging diagnostics may be shown only with the explicit server-side flag.");

for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, originalEnv);
globalThis.fetch = originalFetch;
console.error = originalConsoleError;

console.log("Production auth flow checks passed.");
