import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readRepoFile } from "./billing-check-helpers.mjs";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";
import { createVoiceService } from "../src/voice-service.js";

const [
  appCore,
  pushService,
  publicApp,
  serviceWorker,
  migration,
  voiceMigration,
  voiceServiceSource,
  manifest,
  vercel,
  envExample,
  en,
  es,
  hu
] = await Promise.all([
  readRepoFile("src/app-core.js"),
  readRepoFile("src/push-service.js"),
  readRepoFile("public/app.js"),
  readRepoFile("public/sw.js"),
  readRepoFile("supabase/migrations/0057_partner_reservation_alerts.sql"),
  readRepoFile("supabase/migrations/0063_reservation_alert_voice_escalation.sql"),
  readRepoFile("src/voice-service.js"),
  readRepoFile("public/site.webmanifest").then(JSON.parse),
  readRepoFile("vercel.json").then(JSON.parse),
  readRepoFile(".env.example"),
  readRepoFile("public/locales/en.json").then(JSON.parse),
  readRepoFile("public/locales/es.json").then(JSON.parse),
  readRepoFile("public/locales/hu.json").then(JSON.parse)
]);

for (const table of [
  "restaurant_notification_preferences",
  "restaurant_notification_sms_recipients",
  "partner_device_subscriptions",
  "reservation_alerts",
  "reservation_alert_deliveries",
  "reservation_alert_acknowledgements"
]) {
  assert(migration.includes(`create table if not exists public.${table}`), `Migration must create ${table}.`);
  assert(migration.includes(`alter table public.${table} enable row level security`), `${table} must enable RLS.`);
}

for (const token of [
  "queued",
  "sent",
  "delivered",
  "acknowledged",
  "failed",
  "escalated",
  "dashboard",
  "push",
  "email",
  "sms",
  "supabase_realtime"
]) {
  assert(migration.includes(token), `Migration must include ${token}.`);
}

assert(migration.includes("function public.can_manage_restaurant_notifications"), "Migration must define a scoped notification-management helper.");
assert(migration.includes("public.can_manage_restaurant_notifications(restaurant_id)"), "Notification preference writes must use the scoped management helper.");

for (const unsafe of [/drop\s+table/i, /truncate\s+table/i, /delete\s+from/i]) {
  assert(!unsafe.test(migration), `Reservation alerts migration contains unsafe SQL: ${unsafe}.`);
}

for (const token of [
  "voice_call_enabled",
  "voice_call_number",
  "voice_call_delay_seconds",
  "voice_call_due_at",
  "reservation_alert_deliveries_channel_check",
  "'voice'",
  "idx_reservation_alerts_due_voice"
]) {
  assert(voiceMigration.includes(token), `Voice alert migration is missing ${token}.`);
}
for (const unsafe of [/drop\s+table/i, /truncate\s+table/i, /delete\s+from/i, /update\s+public\./i, /insert\s+into\s+public\./i]) {
  assert(!unsafe.test(voiceMigration), `Voice alert migration contains destructive or data-changing SQL: ${unsafe}.`);
}
for (const token of ["createVoiceService", "Calls.json", "VOICE_PROVIDER_NOT_CONFIGURED", "Idempotency-Key", "StatusCallbackEvent"]) {
  assert(voiceServiceSource.includes(token), `Voice provider abstraction is missing ${token}.`);
}

for (const token of [
  '"/partner/notification-settings"',
  '"/partner/reservation-alerts"',
  '"/admin/reservation-alerts"',
  '"/system/reservation-alerts/process"',
  "createReservationAlertForReservation",
  "sendPushForReservationAlert",
  "processDueReservationAlertEscalations",
  "createTestReservationAlert",
  "clientReservationAlertDelivery",
  "alertDeliveryAlreadySent",
  "smsStageDeliveryShouldSkip",
  "alert.sms_fallback_due_at && alert.sms_fallback_due_at <= now",
  "alert.sms_escalation_due_at && alert.sms_escalation_due_at <= now",
  "alert.acknowledged_at || normalizeAlertStatus(alert.status) === \"acknowledged\"",
  "scopedRateLimit(reservationAlertRateLimitBuckets",
  "RESERVATION_ALERT_SMS_MAX_ATTEMPTS",
  "RESERVATION_ALERT_PUSH_MAX_ATTEMPTS",
  "reservation_alert_test_rate_limited",
  "RESERVATION_ALERT_WORKER_SECRET",
  "smsService.sendSms",
  "pushService.sendNotification",
  "processReservationAlertVoice",
  "voiceService.call",
  "reservation-alert-voice:",
  "RESERVATION_ALERT_VOICE_MAX_ATTEMPTS",
  '"/webhooks/voice/twilio"',
  "voiceProviderWebhook",
  "updateVoiceAlertDeliveryFromProvider",
  "TWILIO_VOICE_STATUS_CALLBACK_URL"
]) {
  assert(appCore.includes(token), `Server reservation alert wiring is missing ${token}.`);
}

assert(!/partner_push[\s\S]{0,400}has_private_key/.test(appCore), "Public config must not expose private VAPID key status.");
assert(!/VAPID_PRIVATE_KEY/.test(publicApp), "Client code must not reference VAPID private key.");

for (const token of [
  "class WebPushProvider",
  "vapid_public_key",
  "webPush.sendNotification",
  "vapidDetails",
  "aes128gcm",
  "sendNotification"
]) {
  assert(pushService.includes(token), `Web Push provider is missing ${token}.`);
}

for (const token of [
  "partnerNotificationSettingsPanel",
  "reservationAlertModal",
  "registerPartnerPushDevice",
  "renewal_required",
  "subscription.unsubscribe",
  "navigator.setAppBadge",
  "serviceWorker.register",
  "navigator.vibrate",
  "RESERVATION_ALERT_VIBRATION_PATTERN",
  "data-alert-reservation-action",
  "data-acknowledge-alert",
  "data-send-test-alert",
  "partnerAlertDeliveryFailureList",
  "adminReservationAlertsPanel",
  "syncAdminReservationAlertForm",
  "RESERVATION_ALERT_SOUND_REPEAT_MS",
  "syncPartnerAlertSoundRepeater",
  "reservation_alert_voice_toggle"
]) {
  assert(publicApp.includes(token), `Partner/Admin alert UI is missing ${token}.`);
}

for (const token of [
  'addEventListener("push"',
  "showNotification",
  'addEventListener("notificationclick"',
  "requireInteraction",
  "vibrate: RESERVATION_ALERT_VIBRATION_PATTERN",
  "reservation_alert"
]) {
  assert(serviceWorker.includes(token), `Service worker is missing ${token}.`);
}

assert.equal(manifest.display, "standalone", "PWA manifest must be installable.");
assert.equal(manifest.start_url, "/partner", "Partner PWA should start on the partner dashboard.");
assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, "PWA manifest must declare at least one icon.");

for (const env of [
  "PUSH_PROVIDER",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "RESERVATION_ALERT_SMS_FALLBACK_SECONDS",
  "RESERVATION_ALERT_ESCALATION_SECONDS",
  "RESERVATION_ALERT_POLL_SECONDS",
  "RESERVATION_ALERT_TEST_LIMIT",
  "RESERVATION_ALERT_TEST_WINDOW_MS",
  "RESERVATION_ALERT_SMS_LIMIT",
  "RESERVATION_ALERT_SMS_WINDOW_MS",
  "RESERVATION_ALERT_SMS_MAX_ATTEMPTS",
  "RESERVATION_ALERT_PUSH_MAX_ATTEMPTS",
  "RESERVATION_ALERT_WORKER_SECRET",
  "CRON_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "VOICE_PROVIDER",
  "TWILIO_VOICE_FROM_NUMBER",
  "TWILIO_VOICE_STATUS_CALLBACK_URL",
  "RESERVATION_ALERT_VOICE_DELAY_SECONDS",
  "RESERVATION_ALERT_VOICE_LIMIT",
  "RESERVATION_ALERT_VOICE_WINDOW_MS",
  "RESERVATION_ALERT_VOICE_MAX_ATTEMPTS"
]) {
  assert(envExample.includes(`${env}=`), `.env.example must document ${env}.`);
}

assert(appCore.includes("process.env.RESERVATION_ALERT_WORKER_SECRET || process.env.CRON_SECRET"), "Alert worker should support the module secret and Vercel CRON_SECRET fallback.");
assert(!(vercel.crons || []).some((cron) => cron.path === "/api/system/reservation-alerts/process"), "Reservation alert scheduling must not rely on Vercel Hobby cron.");

const requiredKeys = [
  "admin_nav_reservation_alerts",
  "reservation_alert_title",
  "reservation_alert_no_auto_accept_note",
  "reservation_alert_acknowledge_button",
  "reservation_alert_settings_title",
  "reservation_alert_push_toggle",
  "reservation_alert_sms_toggle",
  "reservation_alert_voice_toggle",
  "reservation_alert_voice_number",
  "reservation_alert_voice_delay",
  "reservation_alert_voice_configured",
  "reservation_alert_voice_not_configured",
  "reservation_alert_register_device",
  "reservation_alert_send_test",
  "reservation_alert_ios_instruction",
  "admin_reservation_alerts_title",
  "admin_alert_restaurants_without_push",
  "reservation_alert_no_deliveries",
  "reservation_alert_delivery_failures_title",
  "reservation_alert_delivery_failures_empty",
  "reservation_alert_delivery_failure_status"
];

for (const [locale, messages] of Object.entries({ en, es, hu })) {
  for (const key of requiredKeys) {
    assert(typeof messages[key] === "string" && messages[key].trim(), `${locale}.json must define ${key}.`);
  }
}

process.env.SMARTTABLE_ENV = "test";
process.env.PUBLIC_BASE_URL = "http://localhost:4173";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";
process.env.PUSH_PROVIDER = "disabled";
process.env.VOICE_PROVIDER = "twilio";
process.env.TWILIO_ACCOUNT_SID = "AC_reservation_alert_check";
process.env.TWILIO_AUTH_TOKEN = "twilio-redacted-check-token";
process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_reservation_alert_check";
process.env.TWILIO_VOICE_FROM_NUMBER = "+12125550111";
process.env.TWILIO_VOICE_STATUS_CALLBACK_URL = "http://localhost:4173/api/webhooks/voice/twilio";
process.env.RESERVATION_ALERT_WORKER_SECRET = "reservation-alert-check-secret";

const twilioSmsRequests = [];
const twilioVoiceRequests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes("api.twilio.com")) {
    const isVoiceCall = String(url).endsWith("/Calls.json");
    const target = isVoiceCall ? twilioVoiceRequests : twilioSmsRequests;
    target.push({
      url: String(url),
      body: String(options.body || ""),
      authorizationFormat: String(options.headers?.Authorization || options.headers?.authorization || "").startsWith("Basic ") ? "Basic <redacted>" : "missing",
      idempotencyConfigured: Boolean(options.headers?.["Idempotency-Key"])
    });
    const prefix = isVoiceCall ? "CA" : "SM";
    return new Response(JSON.stringify({ sid: `${prefix}${String(target.length).padStart(30, "0")}`, status: "queued" }), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  }
  return originalFetch(url, options);
};

const voiceCheckService = createVoiceService({
  provider: "twilio",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: process.env.TWILIO_VOICE_FROM_NUMBER,
  environment: "test",
  fetchImpl: globalThis.fetch
});
const voiceCheckResult = await voiceCheckService.call({
  to: "+12125550112",
  twiml: "<Response><Say>New reservation request. Open SmartTable to respond.</Say></Response>",
  idempotencyKey: "reservation-alert-voice-check"
});
assert.equal(voiceCheckResult.ok, true, "Configured Twilio Voice provider should accept a bounded test call request.");
assert.equal(twilioVoiceRequests.length, 1, "Voice provider should create exactly one Twilio call request.");
assert(twilioVoiceRequests[0].body.includes("Twiml="), "Voice provider request must contain TwiML.");
assert.equal(twilioVoiceRequests[0].idempotencyConfigured, true, "Voice calls must include an idempotency key.");
assert.equal(twilioVoiceRequests[0].authorizationFormat, "Basic <redacted>", "Voice provider must authenticate without exposing credentials.");

const { handleApiRequest } = await import(`../src/app-core.js?reservation-alerts=${Date.now()}`);

async function rawApi(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    body,
    headers
  });
}

const unsignedVoiceCallback = await rawApi("POST", "/webhooks/voice/twilio", {
  CallSid: "CA_unknown_reservation_alert_check",
  CallStatus: "completed"
});
assert.equal(unsignedVoiceCallback.status, 401, "Twilio Voice callbacks must reject missing signatures.");

const voiceCallbackBody = {
  CallSid: "CA_unknown_reservation_alert_check",
  CallStatus: "completed"
};
const voiceCallbackSignedData = Object.keys(voiceCallbackBody)
  .sort()
  .reduce(
    (value, key) => `${value}${key}${voiceCallbackBody[key]}`,
    process.env.TWILIO_VOICE_STATUS_CALLBACK_URL
  );
const voiceCallbackSignature = crypto
  .createHmac("sha1", process.env.TWILIO_AUTH_TOKEN)
  .update(voiceCallbackSignedData)
  .digest("base64");
const signedVoiceCallback = await rawApi("POST", "/webhooks/voice/twilio", voiceCallbackBody, {
  "x-twilio-signature": voiceCallbackSignature
});
assert.equal(signedVoiceCallback.status, 200, "Valid Twilio Voice callbacks must be accepted without exposing provider data.");

async function api(method, path, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.code || response.body?.error || "unknown error"}`);
  }
  return response.body;
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

async function loginAs(credentials) {
  const result = await api("POST", "/auth/login", {
    email: credentials.email,
    password: credentials.password
  });
  assert(result.access_token, `${credentials.email} must receive an access token.`);
  return { profile: result.profile, headers: authHeaders(result.access_token) };
}

const partner = await loginAs(TEST_ACCOUNTS.partner);
const partnerProfile = await api("GET", "/partner/profile", {}, partner.headers);
const settings = await api("GET", "/partner/notification-settings", {}, partner.headers);
assert(settings.preferences.dashboard_popup_enabled, "Dashboard alerts should be enabled by default.");
assert.equal(settings.preferences.email_enabled, true, "Transactional reservation email alerts should remain enabled by default.");
assert.equal(settings.preferences.primary_sms_number_configured, false, "Demo SMS fallback should not expose a phone number.");

const guest = await loginAs(TEST_ACCOUNTS.guest);
const unauthorizedSettings = await rawApi("PATCH", "/partner/notification-settings", {
  sms_fallback_enabled: true,
  primary_sms_number: "+12125550100"
}, guest.headers);
assert.equal(unauthorizedSettings.status, 403, "Guests must not change restaurant notification settings.");

const restaurantId = partnerProfile.restaurant?.id || partner.profile?.restaurant_id;
assert(restaurantId, "Partner profile must expose the assigned restaurant id.");

const admin = await loginAs(TEST_ACCOUNTS.admin);
const adminSettings = await api("PATCH", "/admin/reservation-alerts", {
  restaurant_id: restaurantId,
  dashboard_popup_enabled: true,
  sound_enabled: true,
  push_enabled: true,
  email_enabled: true,
  sms_fallback_enabled: true,
  primary_sms_number: "+12125550103",
  sms_fallback_delay_seconds: 60,
  voice_call_enabled: true,
  voice_call_number: "+12125550104",
  voice_call_delay_seconds: 600,
  notification_language: "en"
}, admin.headers);
assert.equal(adminSettings.preferences.voice_call_enabled, true, "Admin should be able to enable restaurant voice escalation.");
assert.equal(adminSettings.preferences.voice_call_number_configured, true, "Admin should be able to store a restaurant voice recipient server-side.");
assert(!String(adminSettings.preferences.voice_call_number || "").includes("2125550104"), "Admin responses must mask the full voice number.");

const unauthorizedAdminSettings = await rawApi("PATCH", "/admin/reservation-alerts", {
  restaurant_id: restaurantId,
  voice_call_enabled: true
}, guest.headers);
assert.equal(unauthorizedAdminSettings.status, 403, "Guests must not change admin-managed restaurant notification settings.");

const publicRestaurants = await api("GET", "/public/restaurants?lang=en", {}, partner.headers).catch(() => ({ restaurants: [] }));
const otherRestaurant = (publicRestaurants.restaurants || []).find((restaurant) => restaurant.id && restaurant.id !== restaurantId);
if (otherRestaurant) {
  const crossRestaurantAlerts = await rawApi("GET", `/partner/reservation-alerts?restaurant_id=${encodeURIComponent(otherRestaurant.id)}`, {}, partner.headers);
  assert.equal(crossRestaurantAlerts.status, 403, "Partner must not read another restaurant's alert feed.");
}

const deviceRegistration = await api("POST", "/partner/notification-settings", {
  action: "register_push_device",
  device_installation_id: "reservation-alert-check-installation",
  device_name: "Reservation alert check device",
  device_type: "desktop",
  permission_status: "granted",
  subscription: {
    endpoint: "https://push.example.test/smarttable-alert-check",
    keys: {
      p256dh: "BD6oLFp6gbs_5l4OFLfsw6zT6yQJjSXmw6Fk0Hfh0tJ9wUhEKunwGJ7-Dkd9C3hMlLZYIrbQoRqeXUWo3gziNWw",
      auth: "R3NlcnZhdGlvbl9hbGVydF9jaGVjaw"
    }
  }
}, partner.headers);
assert.equal(deviceRegistration.device.status, "active", "Partner should be able to register a restaurant push device.");

const renewedDeviceRegistration = await api("POST", "/partner/notification-settings", {
  action: "register_push_device",
  device_installation_id: "reservation-alert-check-installation",
  device_name: "Reservation alert check device",
  device_type: "desktop",
  permission_status: "granted",
  subscription: {
    endpoint: "https://push.example.test/smarttable-alert-check-renewed",
    keys: {
      p256dh: "BD6oLFp6gbs_5l4OFLfsw6zT6yQJjSXmw6Fk0Hfh0tJ9wUhEKunwGJ7-Dkd9C3hMlLZYIrbQoRqeXUWo3gziNWw",
      auth: "R3NlcnZhdGlvbl9hbGVydF9jaGVjaw"
    }
  }
}, partner.headers);
assert.equal(renewedDeviceRegistration.device.id, deviceRegistration.device.id, "Renewing a browser push endpoint must update the existing device record.");

const smsSettings = await api("PATCH", "/partner/notification-settings", {
  sms_fallback_enabled: true,
  primary_sms_number: "+12125550100",
  escalation_sms_number: "+12125550101",
  sms_fallback_delay_seconds: 30,
  sms_escalation_delay_seconds: 60,
  voice_call_enabled: true,
  voice_call_number: "+12125550102",
  voice_call_delay_seconds: 480,
  notification_language: "en"
}, partner.headers);
assert.equal(smsSettings.preferences.primary_sms_number_configured, true, "Primary SMS recipient should be stored server-side.");
assert(!String(smsSettings.preferences.primary_sms_number || "").includes("2125550100"), "Partner settings response must mask the full SMS number.");
assert.equal(smsSettings.preferences.voice_call_number_configured, true, "Voice recipient should be stored server-side.");
assert(!String(smsSettings.preferences.voice_call_number || "").includes("2125550102"), "Partner settings response must mask the full voice number.");

const offers = await api("GET", "/partner/offers", {}, partner.headers);
const offer = (offers.offers || []).find((item) => item.status === "active") || offers.offers?.[0];
assert(offer, "Partner demo restaurant must have an offer for reservation alert testing.");

const reservation = await api("POST", "/reservations", {
  offer_id: offer.id || offer.offer_id,
  reservation_date: offer.offer_date,
  reservation_time: offer.start_time || offer.offer_time,
  party_size: 2,
  notes: "Reservation alert check.",
  guest_name: "Alert Check Guest",
  guest_email: `reservation-alert-${Date.now()}@example.com`,
  guest_phone: "+1 212 555 0199",
  guest_language: "en"
});

assert(reservation.reservation?.reservation_id || reservation.reservation?.id, "Reservation response must include a reservation id.");
assert.equal(reservation.reservation_alert?.status, "sent", "Creating a reservation should create a sent dashboard alert.");

const alerts = await api("GET", "/partner/reservation-alerts", {}, partner.headers);
assert(alerts.pending_count >= 1, "Partner alert feed must include an unacknowledged alert.");
const alert = alerts.alerts.find((item) => (item.reservation_id || "") === (reservation.reservation.reservation_id || reservation.reservation.id));
assert(alert, "Reservation alert feed must include the newly created reservation alert.");
assert(alert.payload.reference, "Alert payload should include the reservation reference.");
assert(alert.payload.dashboard_url?.startsWith("/partner/reservations?reservation="), "Push and dashboard payload should use an authenticated partner deep link.");
assert(!("guest_email" in alert.payload), "Alert payload must not include guest email.");
assert(!("guest_phone" in alert.payload), "Alert payload must not include guest phone.");
assert(!("guest_name" in alert.payload), "Alert payload must not include guest name.");

const pushDelivery = (alerts.deliveries || []).find((delivery) => delivery.reservation_id === alert.reservation_id && delivery.channel === "push");
assert(pushDelivery, "Registered push devices should create a push delivery attempt.");
assert.equal(pushDelivery.status, "failed", "Disabled push provider should record a failed attempt without blocking the reservation.");
assert(!("endpoint" in pushDelivery), "Partner delivery summaries must not expose raw push endpoints.");
assert.equal(twilioSmsRequests.length, 0, "SMS fallback must not send before the configured delay.");

await api("PATCH", "/partner/reservation-alerts", {
  action: "acknowledge",
  alert_id: alert.id
}, partner.headers);
const acknowledged = await api("GET", "/partner/reservation-alerts?include_acknowledged=true", {}, partner.headers);
const acknowledgedAlert = acknowledged.alerts.find((item) => item.id === alert.id);
assert(acknowledgedAlert?.acknowledged_at, "Acknowledging an alert must mark only the alert acknowledged.");

const reservationRows = await api("GET", "/partner/reservations", {}, partner.headers);
const pendingReservation = reservationRows.reservations.find((item) => item.reservation_id === alert.reservation_id);
assert.equal(pendingReservation.status, "pending", "Acknowledging an alert must not accept the reservation.");

const processed = await api("GET", "/system/reservation-alerts/process", {}, {
  authorization: "Bearer reservation-alert-check-secret"
});
assert.equal(processed.ok, true, "Alert worker endpoint must accept authenticated scheduler requests.");
assert.equal(twilioSmsRequests.length, 0, "Acknowledged alerts must not send SMS fallback messages.");
assert.equal(twilioVoiceRequests.length, 1, "Acknowledged alerts must not place an escalation call.");

for (let index = 0; index < 3; index += 1) {
  const response = await rawApi("POST", "/partner/notification-settings", {
    action: "send_test_alert"
  }, partner.headers);
  assert.equal(response.status, 202, "Authorized test alert sends should be allowed within the rate limit.");
}
const rateLimitedTestAlert = await rawApi("POST", "/partner/notification-settings", {
  action: "send_test_alert"
}, partner.headers);
assert.equal(rateLimitedTestAlert.status, 429, "Test reservation alerts must be rate-limited.");

assert(twilioSmsRequests.every((request) => request.authorizationFormat === "Basic <redacted>"), "Twilio requests must use an Authorization header without exposing credentials in test output.");

console.log("Reservation alert checks passed.");
