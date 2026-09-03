import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";

const { handleApiRequest } = await import(`../src/app-core.js?restaurant-administration=${Date.now()}`);

async function rawApi(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    body,
    headers
  });
}

async function api(method, path, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.code || response.body?.error || "unknown error"}`);
  }
  return response.body;
}

function authHeaders(accessToken) {
  return { authorization: `Bearer ${accessToken}` };
}

function requestHeaders(headers, label) {
  return {
    ...headers,
    "x-request-id": `restaurant-admin-${label}-${Date.now()}`,
    "x-forwarded-for": "203.0.113.44",
    "user-agent": "SmartTable restaurant administration verification"
  };
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

function uniquePhone() {
  return `+1 212 555 ${String(Date.now()).slice(-4)}`;
}

async function loginAs(role) {
  const account = TEST_ACCOUNTS[role];
  const result = await api("POST", "/auth/login", { email: account.email, password: account.password });
  assert.ok(result.access_token, `${role} must receive an access token.`);
  return {
    profile: result.profile,
    headers: authHeaders(result.access_token)
  };
}

async function expectStatus(method, path, status, body = {}, headers = {}, message = "") {
  const response = await rawApi(method, path, body, headers);
  assert.equal(response.status, status, `${message || `${method} ${path}`} expected ${status}, received ${response.status}.`);
  return response;
}

function invitationTokenFromEmail(result, label) {
  const email = result?.emails?.[0] || {};
  const content = `${email.text || ""}\n${email.html || ""}`;
  const match = content.match(/\/partner\/invite\?token=([^"'\s<>&]+)/);
  assert.ok(match?.[1], `${label} must include a secure invitation link.`);
  return decodeURIComponent(match[1]);
}

function restaurantPayload(prefix = "restaurant-admin") {
  const stamp = Date.now();
  return {
    name: `Restaurant Admin ${stamp}`,
    legal_name: `Restaurant Admin Legal ${stamp}`,
    slug: `restaurant-admin-${stamp}`,
    email: uniqueEmail(`${prefix}-primary`),
    primary_email: uniqueEmail(`${prefix}-primary-contact`),
    reservation_email: uniqueEmail(`${prefix}-reservations`),
    address: `${stamp} Admin Verification Avenue`,
    street_address: `${stamp} Admin Verification Avenue`,
    city: "New York",
    country: "US",
    district: "Manhattan",
    state_region: "NY",
    postal_code: "10001",
    latitude: 40.7505,
    longitude: -73.9934,
    phone: uniquePhone(),
    website: `https://${prefix}-${stamp}.example.test`,
    cuisine_type: "Modern American",
    price_level: "$$",
    description: "Restaurant administration verification restaurant.",
    short_description: "Restaurant administration verification restaurant.",
    full_description: "Restaurant administration verification restaurant.",
    primary_timezone: "America/New_York",
    currency_code: "USD",
    default_language: "en",
    supported_languages: ["en", "es", "hu"],
    service_periods: [
      { day: "mon", period: "lunch", opens: "12:00", closes: "15:00" },
      { day: "mon", period: "dinner", opens: "17:00", closes: "22:00" }
    ],
    reservation_acceptance_mode: "manual",
    reservation_interval_minutes: 30,
    minimum_booking_notice_minutes: 30,
    booking_horizon_days: 30,
    default_table_duration_minutes: 90,
    min_party_size: 2,
    max_party_size: 8,
    available_party_sizes: [2, 3, 4, 5, 6, 7, 8],
    accepts_reservation_requests: true,
    visible_on_guest_site: false,
    status: "draft"
  };
}

async function assertRestaurantAdministrationRuntime() {
  const guest = await loginAs("guest");
  const partner = await loginAs("partner");
  const admin = await loginAs("admin");
  const superadmin = await loginAs("superadmin");
  const adminHeaders = requestHeaders(admin.headers, "admin");
  const superadminHeaders = requestHeaders(superadmin.headers, "superadmin");

  await expectStatus("GET", "/admin/restaurants", 401, {}, {}, "Anonymous users must not access restaurant administration.");
  await expectStatus("GET", "/admin/restaurants", 403, {}, guest.headers, "Guests must not access restaurant administration.");
  await expectStatus("GET", "/admin/restaurants", 403, {}, partner.headers, "Partners must not access restaurant administration.");
  assert.ok(Array.isArray((await api("GET", "/admin/restaurants", {}, admin.headers)).restaurants), "Admins must list restaurants.");
  assert.ok(Array.isArray((await api("GET", "/admin/restaurants", {}, superadmin.headers)).restaurants), "Superadmins must list restaurants.");

  await expectStatus("POST", "/admin/restaurants", 400, {
    ...restaurantPayload("bad-timezone"),
    name: `Bad Timezone ${Date.now()}`,
    slug: `bad-timezone-${Date.now()}`,
    primary_timezone: "America/NotReal"
  }, adminHeaders, "Invalid timezone must be rejected.");
  await expectStatus("POST", "/admin/restaurants", 400, {
    ...restaurantPayload("bad-url"),
    name: `Bad URL ${Date.now()}`,
    slug: `bad-url-${Date.now()}`,
    website: "javascript:alert(1)"
  }, adminHeaders, "Unsafe URLs must be rejected.");
  await expectStatus("POST", "/admin/restaurants", 409, {
    ...restaurantPayload("overlap-hours"),
    name: `Overlap Hours ${Date.now()}`,
    slug: `overlap-hours-${Date.now()}`,
    service_periods: [
      { day: "tue", period: "one", opens: "12:00", closes: "16:00" },
      { day: "tue", period: "two", opens: "15:30", closes: "18:00" }
    ]
  }, adminHeaders, "Overlapping service periods must be rejected.");

  const basePayload = restaurantPayload();
  const created = await api("POST", "/admin/restaurants", basePayload, adminHeaders);
  const restaurant = created.restaurant;
  assert.ok(restaurant?.id, "Admin restaurant creation must return a restaurant id.");
  assert.equal(restaurant.onboarding_status, "draft", "Created restaurants must default to Draft.");
  assert.equal(restaurant.visible_on_guest_site, false, "Draft restaurants must not be publicly visible by default.");
  assert.equal(restaurant.reservation_acceptance_mode, "manual", "Reservation settings must be saved.");
  assert.equal(restaurant.primary_timezone, "America/New_York", "Structured timezone must be saved.");
  assert.ok(Array.isArray(restaurant.service_periods) && restaurant.service_periods.length === 2, "Structured service periods must be saved.");

  const incompletePayload = restaurantPayload("activation-readiness");
  const incomplete = await api("POST", "/admin/restaurants", {
    ...incompletePayload,
    name: `Activation Readiness ${Date.now()}`,
    slug: `activation-readiness-${Date.now()}`,
    address: "",
    street_address: "",
    city: "",
    country: "",
    latitude: null,
    longitude: null,
    cuisine_type: "",
    cuisine: "",
    primary_timezone: "",
    reservation_email: "",
    opening_hours: "",
    service_periods: []
  }, adminHeaders);
  await api("PATCH", "/admin/restaurants", {
    id: incomplete.restaurant.id,
    address: "",
    street_address: "",
    city: "",
    country: "",
    latitude: null,
    longitude: null,
    cuisine_type: "",
    cuisine: "",
    primary_timezone: "",
    reservation_email: "",
    opening_hours: "",
    service_periods: []
  }, adminHeaders);
  const incompleteActivation = await api("PATCH", "/admin/restaurants", {
    id: incomplete.restaurant.id,
    status: "active",
    activate_confirmed: true
  }, superadminHeaders);
  assert.equal(incompleteActivation.restaurant?.onboarding_status, "active", "Super Admin confirmation must activate an incomplete restaurant profile.");
  assert.equal(incompleteActivation.activation_readiness?.can_activate, true, "Profile completeness must remain advisory for activation.");
  assert.equal(incompleteActivation.activation_readiness?.blocking?.length, 0, "Incomplete profile details must not block activation.");
  const missingReadinessKeys = new Set((incompleteActivation.activation_readiness?.missing || []).map((item) => item.key));
  for (const recommendedKey of ["address", "city", "country", "coordinates", "cuisine", "timezone", "service_periods"]) {
    assert.ok(missingReadinessKeys.has(recommendedKey), `The advisory checklist must identify missing ${recommendedKey}.`);
  }

  await expectStatus("POST", "/admin/restaurants", 409, {
    ...basePayload,
    email: uniqueEmail("duplicate-restaurant"),
    reservation_email: uniqueEmail("duplicate-reservations")
  }, adminHeaders, "Duplicate restaurant creation must be blocked by default.");
  await expectStatus("POST", "/admin/restaurants", 400, {
    ...basePayload,
    email: uniqueEmail("duplicate-no-reason"),
    reservation_email: uniqueEmail("duplicate-no-reason-reservations"),
    duplicate_override: true
  }, adminHeaders, "Duplicate override must require a written reason.");
  const override = await api("POST", "/admin/restaurants", {
    ...basePayload,
    slug: `${basePayload.slug}-override`,
    email: uniqueEmail("duplicate-override"),
    reservation_email: uniqueEmail("duplicate-override-reservations"),
    duplicate_override: true,
    duplicate_override_reason: "Restaurant administration verification override."
  }, adminHeaders);
  assert.ok(override.restaurant?.id, "Authorized duplicate override must create the restaurant.");

  await expectStatus("PATCH", "/admin/restaurants", 400, {
    id: restaurant.id,
    status: "active",
    visible_on_guest_site: true
  }, superadminHeaders, "Activation must require explicit confirmation.");
  await expectStatus("PATCH", "/admin/restaurants", 403, {
    id: restaurant.id,
    status: "active",
    visible_on_guest_site: true,
    activate_confirmed: true
  }, adminHeaders, "Regular admins must not approve restaurant activation.");
  const activated = await api("PATCH", "/admin/restaurants", {
    id: restaurant.id,
    status: "active",
    visible_on_guest_site: true,
    activate_confirmed: true
  }, superadminHeaders);
  assert.equal(activated.restaurant.status, "approved", "Activation must map to approved public status.");
  await expectStatus("PATCH", "/admin/restaurants", 400, { id: restaurant.id, status: "suspended" }, adminHeaders, "Suspension must require a reason.");
  const suspended = await api("PATCH", "/admin/restaurants", {
    id: restaurant.id,
    status: "suspended",
    status_reason: "Restaurant administration verification suspension."
  }, adminHeaders);
  assert.equal(suspended.restaurant.onboarding_status, "suspended", "Suspension must update lifecycle status.");
  await expectStatus("PATCH", "/admin/restaurants", 400, { id: restaurant.id, status: "archived" }, adminHeaders, "Archive must require a reason.");
  const archived = await api("PATCH", "/admin/restaurants", {
    id: restaurant.id,
    status: "archived",
    status_reason: "Restaurant administration verification archive."
  }, adminHeaders);
  assert.equal(archived.restaurant.onboarding_status, "archived", "Archive must preserve the restaurant as archived data.");
  const reactivated = await api("PATCH", "/admin/restaurants", {
    id: restaurant.id,
    status: "active",
    activate_confirmed: true
  }, superadminHeaders);
  assert.equal(reactivated.restaurant.onboarding_status, "active", "Authorized reactivation must work.");

  const testRestaurant = await api("POST", "/admin/restaurants", {
    ...restaurantPayload("test-isolation"),
    name: `Test Isolation ${Date.now()}`,
    slug: `test-isolation-${Date.now()}`,
    is_test_data: true
  }, adminHeaders);
  await expectStatus("PATCH", "/admin/restaurants", 409, {
    id: testRestaurant.restaurant.id,
    status: "active",
    visible_on_guest_site: true,
    activate_confirmed: true
  }, superadminHeaders, "Test restaurants must not accidentally become public.");

  await expectStatus("POST", "/admin/restaurant-capacity", 400, {
    restaurant_id: restaurant.id,
    tables: [{ table_identifier: "T1", min_capacity: 6, max_capacity: 2 }]
  }, adminHeaders, "Minimum table capacity cannot exceed maximum capacity.");
  await expectStatus("POST", "/admin/restaurant-capacity", 409, {
    restaurant_id: restaurant.id,
    tables: [
      { table_identifier: "T1", min_capacity: 2, max_capacity: 4 },
      { table_identifier: "T1", min_capacity: 2, max_capacity: 6 }
    ]
  }, adminHeaders, "Duplicate table identifiers must be blocked.");
  const capacity = await api("POST", "/admin/restaurant-capacity", {
    restaurant_id: restaurant.id,
    dining_areas: [{ name: "Main Dining Room", code: "main", capacity: 24, status: "active" }],
    tables: [
      { table_identifier: "T1", min_capacity: 2, max_capacity: 4, seating_type: "indoor", is_accessible: true, status: "active" },
      { table_identifier: "P1", min_capacity: 2, max_capacity: 6, seating_type: "outdoor", status: "active" }
    ],
    capacity_overrides: [{ service_period_key: "mon-dinner", day_of_week: "mon", start_time: "17:00", end_time: "22:00", capacity: 20, table_capacity: 2, status: "active" }]
  }, adminHeaders);
  assert.equal(capacity.capacity.active_table_count, 2, "Valid capacity configuration must persist active tables.");
  assert.equal(capacity.capacity.automatic_table_allocation_enabled, false, "BASIC must not claim automatic table optimization.");
  await expectStatus("POST", "/admin/restaurant-capacity", 403, { restaurant_id: restaurant.id }, partner.headers, "Partners must not use admin capacity endpoint.");

  const invite = await api("POST", "/admin/partners", {
    email: uniqueEmail("restaurant-admin-partner"),
    full_name: "Restaurant Admin Partner",
    restaurant_id: restaurant.id,
    restaurant_role: "manager"
  }, adminHeaders);
  assert.equal(invite.invitation?.status, "pending", "Partner invitation must start pending.");
  const token = invitationTokenFromEmail(invite, "Restaurant admin invitation");
  const resent = await api("PATCH", "/admin/partners", { id: invite.invitation.id, action: "resend_invitation" }, adminHeaders);
  assert.equal(resent.invitation?.status, "pending", "Invitation resend must keep pending status.");
  const acceptedPassword = "Restaurant-Admin-Partner-1!";
  const accepted = await api("POST", "/auth/partner-invitation", {
    token: invitationTokenFromEmail(resent, "Resent restaurant admin invitation"),
    password: acceptedPassword,
    confirm_password: acceptedPassword,
    partner_terms_consent: true
  });
  assert.equal(accepted.invitation?.status, "accepted", "Accepted invitation must become accepted.");
  const acceptedLogin = await api("POST", "/auth/login", { email: invite.partner.email, password: acceptedPassword });
  await api("GET", "/partner/profile", {}, authHeaders(acceptedLogin.access_token));

  const roleChanged = await api("PATCH", "/admin/partners", {
    action: "change_restaurant_role",
    restaurant_id: restaurant.id,
    email: invite.partner.email,
    restaurant_role: "read_only",
    reason: "Restaurant administration verification read-only role."
  }, adminHeaders);
  assert.equal(roleChanged.restaurant_access?.role, "read_only", "Admin must be able to change restaurant role.");
  await expectStatus("PATCH", "/partner/profile", 403, {
    restaurant_id: restaurant.id,
    name: "Read only should not write"
  }, authHeaders(acceptedLogin.access_token), "read_only partner access must block profile writes.");
  const removed = await api("PATCH", "/admin/partners", {
    action: "remove_restaurant_access",
    restaurant_id: restaurant.id,
    email: invite.partner.email,
    reason: "Restaurant administration verification access removal."
  }, adminHeaders);
  assert.equal(removed.restaurant_access?.status, "revoked", "Access removal must revoke restaurant access without deleting the user.");

  const revokedInvite = await api("POST", "/admin/partners", {
    email: uniqueEmail("restaurant-admin-revoked"),
    full_name: "Restaurant Admin Revoked",
    restaurant_id: restaurant.id,
    restaurant_role: "owner"
  }, adminHeaders);
  await api("PATCH", "/admin/partners", { id: revokedInvite.invitation.id, action: "revoke_invitation" }, adminHeaders);

  const detail = await api("GET", `/admin/restaurant-detail?id=${encodeURIComponent(restaurant.id)}`, {}, admin.headers);
  assert.equal(detail.restaurant.id, restaurant.id, "Restaurant detail route must return the selected restaurant.");
  assert.equal(detail.restaurant.reservation_acceptance_mode, "manual", "Detail route must expose reservation settings.");
  assert.ok(Array.isArray(detail.dining_areas), "Detail route must expose dining areas.");
  assert.ok(Array.isArray(detail.tables), "Detail route must expose tables.");
  assert.ok(Array.isArray(detail.capacity_overrides), "Detail route must expose service-period capacity overrides.");
  assert.ok((detail.status_history || []).some((row) => row.new_status === "active"), "Detail route must expose lifecycle status history.");
  await expectStatus("GET", `/admin/restaurant-detail?id=${encodeURIComponent(restaurant.id)}`, 403, {}, guest.headers, "Guests must not access restaurant detail route.");
  await expectStatus("GET", `/admin/restaurant-detail?id=${encodeURIComponent(restaurant.id)}`, 403, {}, partner.headers, "Partners must not access restaurant detail route.");

  const audit = await api("GET", "/admin/errors", {}, admin.headers);
  const auditRows = (audit.app_errors || []).filter((item) => item.area === "audit");
  const actions = auditRows.map((item) => item.details?.action);
  for (const action of [
    "restaurant_created",
    "restaurant_duplicate_warning",
    "restaurant_created_duplicate_override",
    "restaurant_status_transition",
    "restaurant_capacity_configured",
    "partner_invitation_created",
    "partner_invitation_resent",
    "partner_invitation_revoked",
    "partner_invitation_accepted",
    "restaurant_access_change_restaurant_role",
    "restaurant_access_remove_restaurant_access"
  ]) {
    assert.ok(actions.includes(action), `Audit wiring must record ${action}.`);
  }
  const serializedAudit = JSON.stringify(auditRows);
  assert.ok(!serializedAudit.includes(token), "Audit logs must not include raw invitation tokens.");
  assert.ok(!serializedAudit.includes(acceptedPassword), "Audit logs must not include plaintext passwords.");
}

async function assertRestaurantAdministrationStaticContracts() {
  const [appCore, app, routeProtection, routeMap, en, es, hu, migration54, migration55] = await Promise.all([
    readFile(new URL("../src/app-core.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-route-protection.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-route-map.js", import.meta.url), "utf8"),
    readFile(new URL("../public/locales/en.json", import.meta.url), "utf8"),
    readFile(new URL("../public/locales/es.json", import.meta.url), "utf8"),
    readFile(new URL("../public/locales/hu.json", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/0054_restaurant_capacity_and_lifecycle.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/0055_restaurant_admin_status_history.sql", import.meta.url), "utf8")
  ]);

  for (const token of [
    'if (pathname === "/admin/restaurants") return await adminRestaurants',
    'if (pathname === "/admin/restaurant-detail") return await adminRestaurantDetail',
    'if (pathname === "/admin/restaurant-capacity") return await adminRestaurantCapacity',
    'const { profile } = await requireProfile(headers, ["admin"])',
    "function validateRestaurantLifecycleTransition(",
    "function createRestaurantStatusHistory(",
    "function restaurantAccessPatchForAction(",
    "function validateServicePeriods(",
    "SERVICE_PERIOD_OVERLAP",
    "TEST_RESTAURANT_PUBLIC_VISIBILITY_BLOCKED",
    "RESTAURANT_ACTIVATION_SUPER_ADMIN_REQUIRED",
    "RESTAURANT_URL_INVALID",
    "RESTAURANT_TIMEZONE_INVALID"
  ]) {
    assert.ok(appCore.includes(token), `Server restaurant administration contract missing ${token}.`);
  }

  for (const token of [
    "restaurantAdminPanel",
    "adminRestaurantFilters",
    "restaurantWizardField",
    "restaurantWizardTextarea",
    "restaurant_quick_create_title",
    "restaurant_create_draft_button",
    "restaurantProfileSetupForm",
    "restaurantHoursSetupForm",
    "restaurantReservationSetupForm",
    "data-service-period-row",
    "restaurantCapacityForm",
    "restaurantDetailPanel",
    "restaurantSystemStatusPanel",
    "restaurantActivationConfirmationMessage",
    "restaurant_activate_incomplete_confirm",
    "data-restaurant-access-action",
    "api(\"/admin/restaurants\"",
    "api(\"/admin/restaurant-capacity\"",
    "api(\"/admin/partners\""
  ]) {
    assert.ok(app.includes(token), `Admin restaurant UI contract missing ${token}.`);
  }

  for (const source of [routeProtection, routeMap]) {
    for (const route of ["/admin/restaurants", "/admin/restaurant-detail", "/admin/restaurant-capacity"]) {
      assert.ok(source.includes(route), `Route checks must include ${route}.`);
    }
  }

  for (const [label, locale] of [["en", en], ["es", es], ["hu", hu]]) {
    for (const key of [
      "restaurant_quick_create_title",
      "restaurant_create_draft_button",
      "restaurant_service_periods_title",
      "restaurant_tab_tables_capacity",
      "restaurant_tab_partner_access",
      "restaurant_status_history_title",
      "restaurant_system_status_title",
      "restaurant_access_reason_prompt",
      "restaurant_activation_confirm_label",
      "restaurant_activate_incomplete_confirm",
      "restaurant_activation_advisory_count",
      "restaurant_activation_super_admin_only",
      "restaurant_lifecycle_actions_hint"
    ]) {
      assert.ok(locale.includes(`"${key}"`), `${label} locale missing ${key}.`);
    }
  }

  for (const [label, migration] of [["0054", migration54], ["0055", migration55]]) {
    for (const forbidden of [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bdelete\s+from\b/i, /\bupdate\s+public\./i]) {
      assert.ok(!forbidden.test(migration), `${label} migration must not contain ${forbidden}.`);
    }
  }
  assert.ok(migration54.includes("create table if not exists public.restaurant_tables"), "0054 must define restaurant tables.");
  assert.ok(migration54.includes("check (min_capacity <= max_capacity)"), "0054 must enforce table capacity constraints.");
  assert.ok(migration55.includes("create table if not exists public.restaurant_status_history"), "0055 must define status history.");
  assert.ok(migration55.includes("restaurant_status_history_admin_insert"), "0055 must enforce status-history RLS.");
}

await assertRestaurantAdministrationRuntime();
await assertRestaurantAdministrationStaticContracts();

console.log("Restaurant administration checks passed.");
