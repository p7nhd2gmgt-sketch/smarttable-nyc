import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";

const { handleApiRequest } = await import(`../src/app-core.js?basic-security-boundaries=${Date.now()}`);

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

async function loginAs(email, password, expectedRole) {
  const result = await api("POST", "/auth/login", { email, password });
  assert.ok(result.access_token, `${email} must receive an access token.`);
  assert.equal(result.profile.role, expectedRole, `${email} must have role ${expectedRole}.`);
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

function registryCanShow(feature, { platformMode, aiDemoVisibility, audience }) {
  if (!feature) return false;
  if (!Array.isArray(feature.modes) || !feature.modes.includes(platformMode)) return false;
  if (feature.audiences && !feature.audiences.includes("all") && !feature.audiences.includes(audience)) return false;
  if (feature.status === "working") return true;
  if (feature.status === "demo") return platformMode === "ai_concierge" && aiDemoVisibility === true;
  return false;
}

async function assertPublicRoutesArePublic() {
  for (const path of ["/public/config", "/public/offers?lang=en", "/public/content", "/system/feature-status"]) {
    const response = await rawApi("GET", path);
    assert.ok(response.status < 400, `Public BASIC endpoint ${path} must be accessible without authentication.`);
  }
}

async function assertProtectedApiBoundaries() {
  const guest = await loginAs("guest@smarttable.com", "guest123", "guest");
  const partner = await loginAs("owner@hudsonhearth.com", "restaurant123", "partner");
  const admin = await loginAs("ops@smarttable.com", "admin123", "admin");
  const superAdmin = await loginAs("admin@smarttable.com", "admin123", "super_admin");

  await expectStatus("GET", "/guest/account", 401, {}, {}, "Logged-out users must not access guest account routes.");
  await expectStatus("GET", "/partner/profile", 401, {}, {}, "Logged-out users must not access partner routes.");
  await expectStatus("GET", "/admin/stats", 401, {}, {}, "Logged-out users must not access admin routes.");

  assert.ok((await api("GET", "/guest/account", {}, guest.headers)).profile, "Guests must access their own guest account.");
  await expectStatus("GET", "/guest/account", 403, {}, partner.headers, "Partners must not access guest account data as a guest.");
  await expectStatus("GET", "/partner/profile", 403, {}, guest.headers, "Guests must not access partner profile routes.");
  await expectStatus("GET", "/partner/reservations", 403, {}, guest.headers, "Guests must not access partner reservation routes.");
  await expectStatus("GET", "/admin/stats", 403, {}, guest.headers, "Guests must not access admin routes.");

  const partnerProfile = await api("GET", "/partner/profile", {}, partner.headers);
  assert.equal(partnerProfile.restaurant.id, partner.profile.restaurant_id, "Partner profile must be scoped to the partner restaurant.");
  await expectStatus("GET", "/partner/profile?restaurant_id=not-their-restaurant", 403, {}, partner.headers, "Partners must not access another restaurant profile.");
  await expectStatus("GET", "/partner/reservations?restaurant_id=not-their-restaurant", 403, {}, partner.headers, "Partners must not list another restaurant reservation data.");
  await expectStatus("GET", "/admin/stats", 403, {}, partner.headers, "Partners must not access admin routes.");

  assert.ok((await api("GET", "/admin/stats", {}, admin.headers)).stats, "Regular admins must access admin dashboard data.");
  const regularAdminSettings = await api("GET", "/admin/settings/platform-mode", {}, admin.headers);
  assert.equal(regularAdminSettings.can_edit, false, "Regular admins may view current mode but must not edit platform mode.");
  await expectStatus("PATCH", "/admin/settings/platform-mode", 403, { platform_mode: "ai_concierge" }, admin.headers, "Regular admins must not change Super Admin settings.");
  await expectStatus("PATCH", "/admin/settings/platform-mode", 403, { platform_mode: "ai_concierge" }, partner.headers, "Partners must not change Super Admin settings.");
  await expectStatus("PATCH", "/admin/settings/platform-mode", 403, { platform_mode: "ai_concierge" }, guest.headers, "Guests must not change Super Admin settings.");

  const superAdminSettings = await api("GET", "/admin/settings/platform-mode", {}, superAdmin.headers);
  assert.equal(superAdminSettings.can_edit, true, "Super Admin must have edit permission for platform mode settings.");
}

async function assertResolvedReservationsCannotReplay() {
  const lifecycleSource = await readFile(new URL("../scripts/check-reservation-lifecycle.js", import.meta.url), "utf8");
  for (const token of [
    "Repeated acceptance must be idempotent.",
    "Repeated acceptance must not trigger duplicate emails.",
    "Accepted reservations must not be declined later.",
    "Completed reservations must not be reopened as pending.",
    "Repeated guest cancellation must be blocked.",
    "Partner must not modify another restaurant's reservation.",
    "Super Admin cancellation must require explicit confirmation."
  ]) {
    assert.ok(lifecycleSource.includes(token), `Reservation lifecycle replay protection coverage is missing: ${token}`);
  }
}

async function assertFrontendDirectRouteGuards() {
  const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  for (const token of [
    "function currentProtectedAreaRoute()",
    "function guardProtectedAreaRoute(",
    "function hasProtectedAreaAccess(",
    "function renderForbiddenRoute(",
    "function currentAiRoute()",
    "function aiRouteAccess(",
    "function renderUnavailableRoute(",
    "ai_route_unavailable_basic",
    'path.startsWith("/account/")',
    'path.startsWith("/partner/")',
    'path.startsWith("/admin/")',
    '"/ai-concierge"',
    '"/partner/ai-demand"',
    '"/admin/ai-controls"'
  ]) {
    assert.ok(appSource.includes(token), `Frontend direct-route guard is missing ${token}.`);
  }
}

async function assertBasicModeHidesAiDirectRoutes() {
  const config = await api("GET", "/public/config");
  assert.equal(config.platform_mode, "basic", "BASIC security check expects platform mode to remain basic.");
  assert.equal(registryCanShow(config.feature_registry["ai.concierge"], {
    platformMode: config.platform_mode,
    aiDemoVisibility: true,
    audience: "guest"
  }), false, "BASIC mode must not expose guest AI Concierge even if demo visibility were enabled.");
  assert.equal(registryCanShow(config.feature_registry["ai.partnerDemand"], {
    platformMode: config.platform_mode,
    aiDemoVisibility: true,
    audience: "partner"
  }), false, "BASIC mode must not expose Partner AI Demand through direct route visibility.");
  assert.equal(registryCanShow(config.feature_registry["ai.adminAIControls"], {
    platformMode: config.platform_mode,
    aiDemoVisibility: true,
    audience: "admin"
  }), false, "BASIC mode must not expose Admin AI controls through direct route visibility.");
}

await assertPublicRoutesArePublic();
await assertProtectedApiBoundaries();
await assertResolvedReservationsCannotReplay();
await assertFrontendDirectRouteGuards();
await assertBasicModeHidesAiDirectRoutes();

console.log("BASIC security and role-boundary checks passed.");
