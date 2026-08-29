#!/usr/bin/env node
import {
  ACCOUNT_SPECS,
  accountEmail,
  accountPassword,
  assert,
  loadAndValidateStagingEnv,
  passwordLogin,
  supabaseRequest
} from "./staging-test-accounts-common.mjs";

const { env, projectRef } = loadAndValidateStagingEnv({ requireAnonKey: true });

async function expectDenied(label, operation) {
  try {
    await operation();
  } catch (error) {
    assert([401, 403, 404].includes(Number(error.status)), `${label} returned unexpected HTTP ${error.status || "unknown"}.`);
    return { label, denied: true, status: Number(error.status) };
  }
  throw new Error(`${label} was unexpectedly allowed.`);
}

async function login(specKey) {
  const spec = ACCOUNT_SPECS.find((item) => item.key === specKey);
  const session = await passwordLogin(env, accountEmail(env, spec), accountPassword(env, spec));
  assert(session?.access_token, `${specKey} staging login did not return an access token.`);
  return session.access_token;
}

const [guestToken, partnerToken, adminToken] = await Promise.all([
  login("guest"),
  login("partner"),
  login("admin")
]);

const restaurants = await supabaseRequest(env, "/rest/v1/restaurants?select=id&limit=2");
assert(Array.isArray(restaurants) && restaurants.length > 0, "Service-role restaurant control query failed.");
const foreignRestaurantId = restaurants.find((row) => row.id !== "10000000-0000-4000-8000-000000000123")?.id || restaurants[0].id;

const results = [];
results.push(await expectDenied("anonymous -> profiles SELECT", () => supabaseRequest(env, "/rest/v1/profiles?select=id&limit=1", { service: false })));
results.push(await expectDenied("guest -> partner assignments SELECT", () => supabaseRequest(env, "/rest/v1/restaurant_users?select=id&limit=1", { service: false, token: guestToken })));
results.push(await expectDenied("guest -> admin notifications SELECT", () => supabaseRequest(env, "/rest/v1/admin_notifications_overview?select=id&limit=1", { service: false, token: guestToken })));
results.push(await expectDenied("partner A -> restaurant B UPDATE", () => supabaseRequest(env, `/rest/v1/restaurants?id=eq.${encodeURIComponent(foreignRestaurantId)}`, {
  method: "PATCH",
  service: false,
  token: partnerToken,
  headers: { Prefer: "return=representation" },
  body: { short_description: "unauthorized-cross-tenant-probe" }
})));
results.push(await expectDenied("partner A -> restaurant B reservations SELECT", () => supabaseRequest(env, `/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(foreignRestaurantId)}&select=id&limit=1`, { service: false, token: partnerToken })));
results.push(await expectDenied("partner -> admin RPC", () => supabaseRequest(env, "/rest/v1/rpc/admin_dashboard_stats", { method: "POST", service: false, token: partnerToken, body: {} })));
results.push(await expectDenied("admin -> direct admin RPC", () => supabaseRequest(env, "/rest/v1/rpc/admin_dashboard_stats", { method: "POST", service: false, token: adminToken, body: {} })));
results.push(await expectDenied("guest -> self role escalation", () => supabaseRequest(env, "/rest/v1/profiles?role=eq.guest", {
  method: "PATCH",
  service: false,
  token: guestToken,
  headers: { Prefer: "return=representation" },
  body: { role: "super_admin" }
})));

const serviceControl = await supabaseRequest(env, "/rest/v1/profiles?select=id,role&limit=1");
assert(Array.isArray(serviceControl), "Service-role control read failed after hardening.");

console.log(JSON.stringify({
  staging_identity_verified: Boolean(projectRef),
  migration: "0069_security_hardening.sql",
  direct_client_probes: results,
  service_role_control: "PASS",
  production_touched: false
}, null, 2));

