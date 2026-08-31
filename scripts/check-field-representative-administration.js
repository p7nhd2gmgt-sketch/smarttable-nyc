import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";

const { handleApiRequest } = await import(`../src/app-core.js?field-representative=${Date.now()}`);

async function rawApi(method, path, body = {}, headers = {}) {
  return handleApiRequest({ method, url: `/api${path}`, body, headers });
}

async function api(method, path, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.code || response.body?.error || "unknown error"}`);
  }
  return response.body;
}

async function expectStatus(method, path, status, body = {}, headers = {}, message = "") {
  const response = await rawApi(method, path, body, headers);
  assert.equal(response.status, status, `${message || `${method} ${path}`} expected ${status}, received ${response.status}.`);
  return response;
}

async function login(account) {
  const session = await api("POST", "/auth/login", { email: account.email, password: account.password });
  return { profile: session.profile, headers: { authorization: `Bearer ${session.access_token}` } };
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function restaurantPayload({ name, slug, email, marketId, city = "New York", country = "US", timezone = "America/New_York", currency = "USD" }) {
  return {
    name,
    legal_name: `${name} LLC`,
    slug,
    email,
    primary_email: email,
    reservation_email: email,
    address: `100 ${name} Avenue`,
    street_address: `100 ${name} Avenue`,
    city,
    country,
    district: city,
    state_region: city === "Budapest" ? "Budapest" : "NY",
    postal_code: city === "Budapest" ? "1051" : "10001",
    cuisine_type: "Modern European",
    price_level: "$$",
    short_description: "Field operations verification restaurant.",
    full_description: "Field operations verification restaurant profile.",
    primary_timezone: timezone,
    currency_code: currency,
    default_language: city === "Budapest" ? "hu" : "en",
    supported_languages: city === "Budapest" ? ["hu", "en"] : ["en"],
    market_id: marketId,
    service_periods: [{ day: "mon", period: "dinner", opens: "17:00", closes: "22:00" }],
    reservation_acceptance_mode: "manual",
    reservation_interval_minutes: 30,
    minimum_booking_notice_minutes: 30,
    booking_horizon_days: 30,
    default_table_duration_minutes: 90,
    min_party_size: 2,
    max_party_size: 8,
    available_party_sizes: [2, 3, 4, 5, 6, 7, 8],
    accepts_reservation_requests: true
  };
}

const superadmin = await login(TEST_ACCOUNTS.superadmin);
const admin = await login(TEST_ACCOUNTS.admin);
const guest = await login(TEST_ACCOUNTS.guest);
const partner = await login(TEST_ACCOUNTS.partner);

await expectStatus("GET", "/superadmin/field-representatives", 403, {}, admin.headers, "Regular admins must not manage field representatives.");
await expectStatus("GET", "/superadmin/field-representatives", 403, {}, guest.headers, "Guests must not manage field representatives.");
await expectStatus("GET", "/superadmin/field-representatives", 403, {}, partner.headers, "Partners must not manage field representatives.");

const team = await api("GET", "/superadmin/field-representatives", {}, superadmin.headers);
assert.ok(Array.isArray(team.markets) && team.markets.length >= 2, "Field representatives need selectable market scopes.");
const nyc = team.markets.find((market) => market.code === "nyc");
const budapest = team.markets.find((market) => market.code === "budapest");
assert.ok(nyc?.id && budapest?.id, "NYC and Budapest market scopes must be available for isolation tests.");

const invitationToken = `field-representative-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const representativeEmail = uniqueEmail("field-representative");
await expectStatus("POST", "/superadmin/field-representatives", 400, {
  email: uniqueEmail("no-territory"),
  full_name: "No Territory Representative",
  market_ids: []
}, superadmin.headers, "A field representative must have at least one territory.");
const invited = await api("POST", "/superadmin/field-representatives", {
  email: representativeEmail,
  full_name: "NYC Field Representative",
  market_ids: [nyc.id],
  can_manage_restaurants: true,
  can_manage_capacity: true,
  can_invite_partners: true,
  can_manage_partner_access: true,
  test_invitation_token: invitationToken
}, superadmin.headers);
assert.equal(invited.invitation.status, "pending", "Field representative invitation must start pending.");
assert.deepEqual(invited.invitation.market_ids, [nyc.id], "Invitation must preserve the assigned territory.");

const password = "Field-Representative-2026!";
const accepted = await api("POST", "/auth/field-representative-invitation", {
  token: invitationToken,
  password,
  confirm_password: password,
  terms_consent: true
});
assert.equal(accepted.profile.role, "field_representative", "Accepted invitation must create the restricted role.");
const representative = await api("POST", "/auth/login", { email: representativeEmail, password });
const representativeHeaders = { authorization: `Bearer ${representative.access_token}` };
assert.equal(representative.profile.role, "field_representative", "Field representative must retain the restricted role on login.");

const context = await api("GET", "/admin/access-context", {}, representativeHeaders);
assert.equal(context.access.unrestricted, false, "Field representative access must never be unrestricted.");
assert.deepEqual(context.access.market_ids, [nyc.id], "Field representative access must remain territory scoped.");
assert.deepEqual(context.markets.map((market) => market.id), [nyc.id], "Only assigned markets should reach the client.");

const budapestRestaurant = await api("POST", "/admin/restaurants", {
  ...restaurantPayload({
    name: `Budapest Isolation ${Date.now()}`,
    slug: `budapest-isolation-${Date.now()}`,
    email: uniqueEmail("budapest-isolation"),
    marketId: budapest.id,
    city: "Budapest",
    country: "HU",
    timezone: "Europe/Budapest",
    currency: "HUF"
  }),
  status: "draft",
  visible_on_guest_site: false
}, superadmin.headers);

const listed = await api("GET", "/admin/restaurants", {}, representativeHeaders);
assert.ok(!listed.restaurants.some((restaurant) => restaurant.id === budapestRestaurant.restaurant.id), "A field representative must not list another territory's restaurants.");
await expectStatus("GET", `/admin/restaurant-detail?id=${encodeURIComponent(budapestRestaurant.restaurant.id)}`, 403, {}, representativeHeaders, "Another territory's restaurant detail must be denied.");
await expectStatus("POST", "/admin/restaurants", 403, restaurantPayload({
  name: `Outside Territory ${Date.now()}`,
  slug: `outside-territory-${Date.now()}`,
  email: uniqueEmail("outside-territory"),
  marketId: budapest.id,
  city: "Budapest",
  country: "HU",
  timezone: "Europe/Budapest",
  currency: "HUF"
}), representativeHeaders, "A field representative must not create outside the assigned territory.");

const nycPayload = restaurantPayload({
  name: `Field Operations NYC ${Date.now()}`,
  slug: `field-operations-nyc-${Date.now()}`,
  email: uniqueEmail("field-operations-nyc"),
  marketId: nyc.id
});
await expectStatus("POST", "/admin/restaurants", 403, {
  ...nycPayload,
  status: "active",
  visible_on_guest_site: true
}, representativeHeaders, "Field representatives must not publish restaurants.");
const created = await api("POST", "/admin/restaurants", nycPayload, representativeHeaders);
assert.ok(created.restaurant?.id, "Field representatives must create assigned-territory restaurant drafts.");
assert.equal(created.restaurant.visible_on_guest_site, false, "Field representative restaurants must remain hidden until approval.");
assert.equal(created.restaurant.onboarding_status, "draft", "Field representative restaurants must remain in onboarding draft.");
await expectStatus("PATCH", "/admin/restaurants", 403, {
  id: created.restaurant.id,
  status: "active",
  visible_on_guest_site: true,
  activate_confirmed: true
}, representativeHeaders, "Field representatives must not activate or publish restaurants.");
await expectStatus("POST", "/admin/restaurants", 403, {
  ...nycPayload,
  slug: `${nycPayload.slug}-override`,
  duplicate_override: true,
  duplicate_override_reason: "Attempted representative override"
}, representativeHeaders, "Duplicate override requires a platform administrator.");

const capacity = await api("POST", "/admin/restaurant-capacity", {
  restaurant_id: created.restaurant.id,
  dining_areas: [{ name: "Main Room", code: "main", capacity: 20, status: "active" }],
  tables: [{ table_identifier: "T1", min_capacity: 2, max_capacity: 4, status: "active" }],
  capacity_overrides: []
}, representativeHeaders);
assert.equal(capacity.capacity.active_table_count, 1, "Authorized field representatives must configure restaurant capacity.");
await expectStatus("POST", "/admin/restaurant-capacity", 403, {
  restaurant_id: budapestRestaurant.restaurant.id,
  tables: []
}, representativeHeaders, "Capacity changes outside the assigned territory must be denied.");

const partnerInvite = await api("POST", "/admin/partners", {
  email: uniqueEmail("field-rep-partner"),
  full_name: "Invited Restaurant Partner",
  restaurant_id: created.restaurant.id,
  restaurant_role: "owner"
}, representativeHeaders);
assert.equal(partnerInvite.invitation.status, "pending", "Field representatives with permission must invite restaurant partners.");
await expectStatus("POST", "/admin/partners", 403, {
  email: uniqueEmail("outside-market-partner"),
  full_name: "Outside Market Partner",
  restaurant_id: budapestRestaurant.restaurant.id,
  restaurant_role: "owner"
}, representativeHeaders, "Partner invitations outside the assigned territory must be denied.");

await expectStatus("GET", "/admin/offers", 403, {}, representativeHeaders, "Field representatives must not inherit unrelated platform-admin routes.");
await expectStatus("GET", "/superadmin/field-representatives", 403, {}, representativeHeaders, "Field representatives must not manage their own role or peers.");

await api("PATCH", "/superadmin/field-representatives", {
  action: "update_access",
  id: representative.profile.id,
  market_ids: [nyc.id],
  can_manage_restaurants: true,
  can_manage_capacity: true,
  can_invite_partners: true,
  can_manage_partner_access: false
}, superadmin.headers);
assert.ok(Array.isArray((await api("GET", "/admin/partners", {}, representativeHeaders)).partners), "Invite-only representatives may read their scoped partner list.");
await expectStatus("PATCH", "/admin/partners", 403, {
  action: "revoke_invitation",
  id: partnerInvite.invitation.id
}, representativeHeaders, "Invite permission alone must not grant partner-access mutation.");

await api("PATCH", "/superadmin/field-representatives", {
  action: "suspend",
  id: representative.profile.id
}, superadmin.headers);
await expectStatus("GET", "/admin/access-context", 403, {}, representativeHeaders, "Suspended field representative access must stop immediately.");

const [migration, appSource, coreSource] = await Promise.all([
  readFile(new URL("../supabase/migrations/0071_field_representative_access.sql", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app-core.js", import.meta.url), "utf8")
]);
for (const token of [
  "field_representative_assignments",
  "field_representative_markets",
  "field_representative_invitations",
  "enable row level security",
  "field_rep_assignments_self_read",
  "field_rep_markets_self_read"
]) assert.ok(migration.includes(token), `Migration is missing ${token}.`);
assert.ok(!migration.includes("references public.markets"), "Field representative migration must remain compatible with BASIC deployments that predate public.markets.");
for (const token of [
  "fieldRepresentativeTeamPanel",
  "renderFieldRepresentativeInvitation",
  "field-representative-invite",
  "field_rep_duplicate_requires_super_admin"
]) assert.ok(appSource.includes(token), `Field representative UI is missing ${token}.`);
for (const token of [
  "restrictedRestaurantMutation",
  "scopedRestaurantRows",
  "RESTAURANT_SCOPE_UNAVAILABLE",
  "assertFieldRepresentativeRestaurant",
  "FIELD_REPRESENTATIVE_RESTRICTED_FIELD",
  "/superadmin/field-representatives",
  "/auth/field-representative-invitation"
]) assert.ok(coreSource.includes(token), `Field representative backend is missing ${token}.`);

console.log("Field representative administration checks passed.");
