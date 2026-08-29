import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createMobilePushService,
  isExpoPushToken
} from "../src/push-service.js";

const validToken = "ExponentPushToken[smarttable_test_device_123]";

assert.equal(isExpoPushToken(validToken), true);
assert.equal(isExpoPushToken("not-a-provider-token"), false);

const disabled = createMobilePushService({ provider: "disabled" });
const disabledStatus = disabled.getStatus();
assert.equal(disabledStatus.enabled, false);
assert.equal(disabledStatus.accepts_native_tokens, false);
assert.equal(disabledStatus.native_token_endpoint, "/api/mobile/push-devices");

let invalidFetchCalls = 0;
const invalidService = createMobilePushService({
  provider: "expo",
  fetchImpl: async () => {
    invalidFetchCalls += 1;
    throw new Error("Invalid tokens must be rejected before network access.");
  }
});
const invalid = await invalidService.sendNotification({ token: "invalid" });
assert.equal(invalid.sent, false);
assert.equal(invalid.errorCode, "INVALID_EXPO_PUSH_TOKEN");
assert.equal(invalidFetchCalls, 0);

const requests = [];
const service = createMobilePushService({
  provider: "expo",
  accessToken: "test-access-token",
  fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (String(url).includes("getReceipts")) {
      return new Response(JSON.stringify({
        data: {
          "ticket-1": { status: "ok" },
          "ticket-expired": { status: "error", details: { error: "DeviceNotRegistered" } }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: { status: "ok", id: "ticket-1" } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
});

const serviceStatus = service.getStatus();
assert.equal(serviceStatus.provider, "expo");
assert.equal(serviceStatus.enabled, true);
assert.equal(serviceStatus.accepts_native_tokens, true);
assert.equal(serviceStatus.native_token_endpoint, "/api/mobile/push-devices");

const sent = await service.sendNotification({
  token: validToken,
  title: "Reservation update",
  body: "Open SmartTable for details.",
  data: {
    version: 1,
    app: "guest",
    entity: "reservation",
    entity_id: "00000000-0000-4000-8000-000000000001",
    path: "/reservation/00000000-0000-4000-8000-000000000001",
    url: "smarttable://reservation/00000000-0000-4000-8000-000000000001"
  },
  channelId: "reservation-alerts",
  ttl: 600
});
assert.equal(sent.sent, true);
assert.equal(sent.provider_message_id, "ticket-1");
assert.equal(requests.length, 1);
assert.equal(requests[0].url, "https://exp.host/--/api/v2/push/send");
assert.equal(requests[0].options.headers.authorization, "Bearer test-access-token");
const providerPayload = JSON.parse(requests[0].options.body);
assert.equal(providerPayload.to, validToken);
assert.equal(providerPayload.channelId, "reservation-alerts");
assert.equal(providerPayload.ttl, 600);
assert.equal(providerPayload.data.app, "guest");
assert.equal("guest_email" in providerPayload.data, false);
assert.equal("guest_phone" in providerPayload.data, false);

const receiptResult = await service.getReceipts(["ticket-1", "ticket-expired", "ticket-1"]);
assert.equal(Object.keys(receiptResult.receipts).length, 2);
assert.deepEqual(JSON.parse(requests[1].options.body), { ids: ["ticket-1", "ticket-expired"] });

const expiredService = createMobilePushService({
  provider: "expo",
  fetchImpl: async () => new Response(JSON.stringify({
    data: { status: "error", message: "The device is no longer registered.", details: { error: "DeviceNotRegistered" } }
  }), { status: 200, headers: { "content-type": "application/json" } })
});
const expired = await expiredService.sendNotification({ token: validToken });
assert.equal(expired.status, "expired");
assert.equal(expired.errorCode, "PUSH_DEVICE_NOT_REGISTERED");

const appCore = readFileSync(new URL("../src/app-core.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0068_native_mobile_push.sql", import.meta.url), "utf8");

assert.match(appCore, /pathname === "\/mobile\/push-devices"/);
assert.match(appCore, /createCipheriv\("aes-256-gcm"/);
assert.match(appCore, /processMobilePushReceipts\(\)/);
assert.match(appCore, /DeviceNotRegistered/);
assert.match(appCore, /requestedAppKind !== expectedAppKind/);
assert.match(appCore, /MOBILE_PUSH_RATE_LIMITED/);
assert.match(appCore, /const NATIVE_PUSH_COPY/);
assert.match(appCore, /nativePushCopy\(\{/);
assert.match(appCore, /Foglalás megerősítve/);
assert.match(appCore, /Reserva confirmada/);
assert.match(appCore, /currentPartnerPushAccess\(device, restaurantId\)/);
assert.match(appCore, /PUSH_PARTNER_ACCESS_REVOKED/);
assert.match(appCore, /revokeAllNativeMobilePushForUser\(profile\.id, "PUSH_ACCOUNT_DELETED"\)/);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all privileges on table public\.mobile_push_devices from public, anon, authenticated/i);
assert.match(migration, /grant select, insert, update, delete on table public\.mobile_push_devices to service_role/i);

console.log("Native mobile push checks passed: provider adapter, privacy-safe payload, token validation, receipts, encrypted storage contract, role binding, and RLS grants.");
