import { readFile } from "node:fs/promises";
import { handleApiRequest } from "../src/app-core.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function apiRaw(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    body,
    headers
  });
}

async function api(method, path, body = {}, headers = {}) {
  const response = await apiRaw(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.error || "unknown error"}`);
  }
  return response.body;
}

async function loginAs(email, password) {
  const result = await api("POST", "/auth/login", { email, password });
  assert(result.access_token, `${email} must be able to log in for route-protection checks.`);
  return {
    profile: result.profile,
    headers: { authorization: `Bearer ${result.access_token}` }
  };
}

function expectStatus(response, status, message) {
  assert(response.status === status, `${message} Expected ${status}, received ${response.status}.`);
}

async function assertApiRouteProtection() {
  const guest = await loginAs("guest@smarttable.com", "guest123");
  const partner = await loginAs("owner@hudsonhearth.com", "restaurant123");
  const admin = await loginAs("ops@smarttable.com", "admin123");
  const superAdmin = await loginAs("admin@smarttable.com", "admin123");

  assert(guest.profile.role === "guest", "Demo guest must retain the guest role.");
  assert(partner.profile.role === "partner", "Demo partner must retain the partner role.");
  assert(admin.profile.role === "admin", "Regular admin must retain the admin role.");
  assert(superAdmin.profile.role === "super_admin", "Super Admin must retain the super_admin role.");

  expectStatus(await apiRaw("GET", "/guest/account"), 401, "Logged-out users must not access guest account data.");
  expectStatus(await apiRaw("GET", "/partner/profile"), 401, "Logged-out users must not access partner profile data.");
  expectStatus(await apiRaw("GET", "/admin/stats"), 401, "Logged-out users must not access admin stats.");

  expectStatus(await apiRaw("GET", "/partner/profile", {}, guest.headers), 403, "Guests must not access partner routes.");
  expectStatus(await apiRaw("GET", "/partner/reservations", {}, guest.headers), 403, "Guests must not access partner reservations.");
  expectStatus(await apiRaw("GET", "/admin/stats", {}, guest.headers), 403, "Guests must not access admin routes.");
  expectStatus(await apiRaw("GET", "/admin/restaurants", {}, partner.headers), 403, "Partners must not access admin routes.");

  const partnerProfile = await api("GET", "/partner/profile", {}, partner.headers);
  assert(partnerProfile.restaurant?.id === partner.profile.restaurant_id, "Partners must see only their linked restaurant profile.");

  expectStatus(
    await apiRaw("GET", "/partner/profile?restaurant_id=not-their-restaurant", {}, partner.headers),
    403,
    "Partners must not request another restaurant profile by restaurant_id."
  );
  expectStatus(
    await apiRaw("GET", "/partner/reservations?restaurant_id=not-their-restaurant", {}, partner.headers),
    403,
    "Partners must not request another restaurant reservation list by restaurant_id."
  );

  const adminStats = await api("GET", "/admin/stats", {}, admin.headers);
  assert(adminStats.stats, "Regular admins must access admin stats.");

  const adminSettings = await api("GET", "/admin/settings/platform-mode", {}, admin.headers);
  assert(adminSettings.can_edit === false, "Regular admins may view but not edit platform mode.");
  expectStatus(
    await apiRaw("PATCH", "/admin/settings/platform-mode", { platform_mode: "ai_concierge" }, admin.headers),
    403,
    "Regular admins must not receive Super Admin platform-mode permission."
  );

  const superAdminSettings = await api("GET", "/admin/settings/platform-mode", {}, superAdmin.headers);
  assert(superAdminSettings.can_edit === true, "Super Admin must be allowed to edit platform mode settings.");
}

async function assertFrontendRouteGuards() {
  const appSource = await read("public/app.js");
  for (const token of [
    "function currentProtectedAreaRoute()",
    "function guardProtectedAreaRoute(",
    "function renderForbiddenRoute(",
    "function hasProtectedAreaAccess(",
    'path.startsWith("/account/")',
    'path.startsWith("/partner/")',
    'path.startsWith("/admin/")',
    '"/account/reservations"',
    '"/account/favorites"',
    '"/account/security"'
  ]) {
    assert(appSource.includes(token), `Frontend route protection is missing ${token}.`);
  }
}

await assertApiRouteProtection();
await assertFrontendRouteGuards();

console.log("Route protection checks passed.");
