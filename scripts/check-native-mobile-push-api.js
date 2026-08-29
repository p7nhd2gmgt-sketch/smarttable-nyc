import assert from "node:assert/strict";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.SMARTTABLE_ENV = "development";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";
process.env.MOBILE_PUSH_PROVIDER = "expo";
process.env.MOBILE_PUSH_TOKEN_ENCRYPTION_KEY = "11".repeat(32);
process.env.EXPO_PUSH_ACCESS_TOKEN = "";
process.env.MOBILE_PUSH_DEVICE_MUTATION_LIMIT = "100";

const { handleApiRequest } = await import(`../src/app-core.js?native-push-api=${Date.now()}`);

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

function authHeaders(accessToken) {
  return { authorization: `Bearer ${accessToken}` };
}

async function login(account, expectedRole) {
  const session = await api("POST", "/auth/login", {
    email: account.email,
    password: account.password
  });
  assert.equal(session.profile.role, expectedRole);
  return authHeaders(session.access_token);
}

async function expectStatus(method, path, expectedStatus, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  assert.equal(response.status, expectedStatus, `${method} ${path} should return ${expectedStatus}, received ${response.status}.`);
  return response.body;
}

const guestHeaders = await login(TEST_ACCOUNTS.guest, "guest");
const partnerHeaders = await login(TEST_ACCOUNTS.partner, "partner");
const adminHeaders = await login(TEST_ACCOUNTS.admin, "admin");
const superAdminHeaders = await login(TEST_ACCOUNTS.superadmin, "super_admin");

await expectStatus("GET", "/mobile/push-devices?app_kind=guest", 401);
await expectStatus("GET", "/mobile/push-devices?app_kind=guest", 403, {}, adminHeaders);
await expectStatus("GET", "/mobile/push-devices?app_kind=guest", 403, {}, superAdminHeaders);
await expectStatus("GET", "/mobile/push-devices?app_kind=partner", 403, {}, guestHeaders);
await expectStatus("GET", "/mobile/push-devices?app_kind=guest", 403, {}, partnerHeaders);

const guestDeviceId = "guest-installation-0001";
const guestToken = "ExponentPushToken[smarttable_guest_api_test]";
const guestRegistration = await api("POST", "/mobile/push-devices", {
  app_kind: "guest",
  device_id: guestDeviceId,
  platform: "ios",
  provider: "expo",
  push_token: guestToken,
  permission_status: "granted",
  app_version: "1.0.0",
  locale: "en-US",
  timezone: "America/New_York"
}, guestHeaders);

assert.equal(guestRegistration.push.enabled, true);
assert.equal(guestRegistration.push.schema_ready, true);
assert.equal(guestRegistration.device.device_id, guestDeviceId);
assert.equal(guestRegistration.device.app_kind, "guest");
assert.equal(guestRegistration.device.platform, "ios");
assert.equal(guestRegistration.device.enabled, true);
for (const secretField of ["push_token", "push_token_ciphertext", "token_hash", "user_id", "restaurant_id"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(guestRegistration.device, secretField), false, `${secretField} must never be returned to a mobile client.`);
}

const guestDevices = await api("GET", "/mobile/push-devices?app_kind=guest", {}, guestHeaders);
assert.equal(guestDevices.devices.length, 1);
assert.equal(guestDevices.devices[0].device_id, guestDeviceId);
assert.equal(JSON.stringify(guestDevices).includes(guestToken), false, "The raw Expo token must never be returned by the API.");

const ownershipRejected = await expectStatus("POST", "/mobile/push-devices", 400, {
  app_kind: "guest",
  device_id: "guest-installation-0002",
  platform: "android",
  provider: "expo",
  push_token: "ExponentPushToken[smarttable_guest_owner_test]",
  permission_status: "granted",
  user_id: "attacker-selected-user"
}, guestHeaders);
assert.equal(ownershipRejected.code, "MOBILE_PUSH_OWNERSHIP_FORBIDDEN");

const invalidToken = await expectStatus("POST", "/mobile/push-devices", 400, {
  app_kind: "guest",
  device_id: "guest-installation-0003",
  platform: "ios",
  provider: "expo",
  push_token: "not-a-provider-token",
  permission_status: "granted"
}, guestHeaders);
assert.equal(invalidToken.code, "MOBILE_PUSH_TOKEN_INVALID");

const revoked = await api("DELETE", "/mobile/push-devices", {
  app_kind: "guest",
  device_id: guestDeviceId
}, guestHeaders);
assert.equal(revoked.revoked, true);
const guestAfterRevoke = await api("GET", "/mobile/push-devices?app_kind=guest", {}, guestHeaders);
assert.equal(guestAfterRevoke.devices[0].enabled, false);

const partnerDeviceId = "partner-installation-0001";
const partnerRegistration = await api("POST", "/mobile/push-devices", {
  app_kind: "partner",
  device_id: partnerDeviceId,
  platform: "android",
  provider: "expo",
  push_token: "ExpoPushToken[smarttable_partner_api_test]",
  permission_status: "granted",
  locale: "hu",
  timezone: "America/New_York"
}, partnerHeaders);
assert.equal(partnerRegistration.device.app_kind, "partner");
assert.equal(partnerRegistration.device.platform, "android");
assert.equal(partnerRegistration.device.enabled, true);
assert.equal(Object.prototype.hasOwnProperty.call(partnerRegistration.device, "restaurant_id"), false);

const partnerDevices = await api("GET", "/mobile/push-devices?app_kind=partner", {}, partnerHeaders);
assert.equal(partnerDevices.devices.length, 1);
assert.equal(partnerDevices.devices[0].device_id, partnerDeviceId);

console.log("Native mobile push API checks passed: authentication, role binding, server-owned scope, token secrecy, validation, registration, and revocation.");
