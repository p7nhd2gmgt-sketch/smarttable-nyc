import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import "../src/env-loader.js";

const root = new URL("../", import.meta.url);
const canonicalProductionBaseUrl = "https://www.smarttablenyc.com";

function clean(value) {
  return String(value || "").trim();
}

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function envFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

function parseEnvFile(source = "") {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readEnvFile(relativePath) {
  const fileUrl = new URL(relativePath, root);
  return existsSync(fileUrl) ? parseEnvFile(readFileSync(fileUrl, "utf8")) : {};
}

function loadProtectedTargetEnvironment(target) {
  const snapshot = target === "production"
    ? {
        ...readEnvFile(".env.vercel.production.local"),
        ...readEnvFile(".env.production.notifications.local"),
        ...readEnvFile(".env.local")
      }
    : {
        ...readEnvFile(".env.staging.local"),
        ...readEnvFile(".env.vercel.preview.local"),
        ...readEnvFile(".env.staging.notifications.local")
      };

  for (const [key, value] of Object.entries(snapshot)) process.env[key] = value;
}

function assertPresent(name, validator = () => true, message = "") {
  const value = clean(process.env[name]);
  assert(value, `${name} must be configured.`);
  assert(validator(value), message || `${name} has an invalid format.`);
  return { name, present: true, valid: true };
}

function printStatuses(title, statuses) {
  console.log(title);
  for (const status of statuses) console.log(`- ${status.name}: present / valid`);
}

function projectRefFromSupabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : "";
  } catch {
    return "";
  }
}

function numberInRange(name, minimum, maximum) {
  const value = Number(process.env[name]);
  assert(Number.isFinite(value) && value >= minimum && value <= maximum, `${name} must be between ${minimum} and ${maximum}.`);
}

const target = clean(argValue("target", process.env.SMARTTABLE_RESERVATION_ALERT_READINESS_TARGET || "static")).toLowerCase();
const normalizedTarget = ["prod", "live"].includes(target) ? "production" : ["preview", "test"].includes(target) ? "staging" : target;
const requireOperational = process.argv.includes("--require-operational");
assert(["static", "staging", "production"].includes(normalizedTarget), "Use --target=static, staging, or production.");

if (normalizedTarget !== "static") loadProtectedTargetEnvironment(normalizedTarget);

const [appCore, publicApp, pushService, voiceService, migration, voiceMigration, schedulerMigration, envExample, vercel] = await Promise.all([
  readFile(new URL("src/app-core.js", root), "utf8"),
  readFile(new URL("public/app.js", root), "utf8"),
  readFile(new URL("src/push-service.js", root), "utf8"),
  readFile(new URL("src/voice-service.js", root), "utf8"),
  readFile(new URL("supabase/migrations/0057_partner_reservation_alerts.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/0063_reservation_alert_voice_escalation.sql", root), "utf8"),
  readFile(new URL("supabase/migrations/0064_reservation_alert_scheduler_extensions.sql", root), "utf8"),
  readFile(new URL(".env.example", root), "utf8"),
  readFile(new URL("vercel.json", root), "utf8").then(JSON.parse)
]);

for (const token of [
  "createReservationAlertForReservation",
  "processDueReservationAlertEscalations",
  "sendPushForReservationAlert",
  "smsService.sendSms",
  "voiceService.call",
  '"/webhooks/sms/twilio"',
  '"/webhooks/voice/twilio"',
  "verifyTwilioWebhookSignature",
  "TWILIO_VOICE_STATUS_CALLBACK_URL",
  "RESERVATION_ALERT_WORKER_SECRET"
]) {
  assert(appCore.includes(token), `Reservation alert backend is missing ${token}.`);
}

for (const token of [
  "reservationAlertModal",
  "RESERVATION_ALERT_SOUND_REPEAT_MS",
  "navigator.vibrate",
  "navigator.setAppBadge",
  "registerPartnerPushDevice"
]) {
  assert(publicApp.includes(token), `Reservation alert browser experience is missing ${token}.`);
}

assert(pushService.includes("WebPushProvider") && pushService.includes("sendNotification"), "Standards-based Web Push must be implemented.");
assert(voiceService.includes("Calls.json") && voiceService.includes("Idempotency-Key"), "Twilio Voice must use bounded idempotent calls.");
assert(migration.includes("reservation_alert_deliveries") && migration.includes("enable row level security"), "Reservation alert schema and RLS must exist.");
assert(voiceMigration.includes("voice_call_enabled") && voiceMigration.includes("idx_reservation_alerts_due_voice"), "Voice escalation migration must exist.");

for (const source of [migration, voiceMigration]) {
  for (const unsafe of [/drop\s+table/i, /truncate\s+table/i, /delete\s+from/i]) {
    assert(!unsafe.test(source), `Reservation alert migrations contain unsafe SQL: ${unsafe}.`);
  }
}

assert(!(vercel.crons || []).some((cron) => cron.path === "/api/system/reservation-alerts/process"), "Reservation alerts must not rely on Vercel Hobby cron.");
assert(schedulerMigration.includes("create extension if not exists pg_net") && schedulerMigration.includes("create extension if not exists pg_cron"), "Supabase scheduler extensions must be declared.");

for (const name of [
  "PUSH_PROVIDER",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "RESERVATION_ALERT_WORKER_SECRET",
  "SMS_PROVIDER",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_STATUS_CALLBACK_URL",
  "VOICE_PROVIDER",
  "TWILIO_VOICE_FROM_NUMBER",
  "TWILIO_VOICE_STATUS_CALLBACK_URL",
  "RESERVATION_ALERT_SCHEDULER_VERIFIED",
  "TWILIO_PRODUCTION_VERIFIED",
  "WEB_PUSH_PRODUCTION_VERIFIED"
]) {
  assert(envExample.includes(`${name}=`), `.env.example must document ${name}.`);
}

if (normalizedTarget === "static") {
  console.log("Reservation alert production-readiness static checks passed.");
  console.log("Production remains blocked until the protected production configuration and operational delivery checks pass.");
  process.exit(0);
}

const isProduction = normalizedTarget === "production";
const expectedBaseUrl = isProduction ? canonicalProductionBaseUrl : clean(process.env.PUBLIC_BASE_URL);
const productionProjectRef = clean(process.env.PRODUCTION_SUPABASE_PROJECT_REF || process.env.SMARTTABLE_PRODUCTION_SUPABASE_PROJECT_REF);
const stagingProjectRef = clean(process.env.STAGING_SUPABASE_PROJECT_REF);
const supabaseProjectRef = projectRefFromSupabaseUrl(process.env.SUPABASE_URL);
const statuses = [
  assertPresent("PUBLIC_BASE_URL", (value) => isProduction ? value.replace(/\/$/, "") === canonicalProductionBaseUrl : /^https:\/\//.test(value), "PUBLIC_BASE_URL does not match the target environment."),
  assertPresent("SUPABASE_URL", (value) => Boolean(projectRefFromSupabaseUrl(value)), "SUPABASE_URL must be a valid Supabase project URL."),
  assertPresent("PUSH_PROVIDER", (value) => value === "webpush", "PUSH_PROVIDER must be webpush."),
  assertPresent("VAPID_PUBLIC_KEY", (value) => value.length >= 40, "VAPID_PUBLIC_KEY has an invalid format."),
  assertPresent("VAPID_PRIVATE_KEY", (value) => value.length >= 30, "VAPID_PRIVATE_KEY has an invalid format."),
  assertPresent("VAPID_SUBJECT", (value) => /^(mailto:|https:\/\/)/.test(value), "VAPID_SUBJECT must be a mailto or HTTPS contact."),
  assertPresent("RESERVATION_ALERT_WORKER_SECRET", (value) => value.length >= 32, "RESERVATION_ALERT_WORKER_SECRET must contain at least 32 characters."),
  assertPresent("SMS_PROVIDER", (value) => value === "twilio", "SMS_PROVIDER must be twilio."),
  assertPresent("VOICE_PROVIDER", (value) => value === "twilio", "VOICE_PROVIDER must be twilio."),
  assertPresent("TWILIO_ACCOUNT_SID", (value) => /^AC[A-Za-z0-9]{20,}$/.test(value), "TWILIO_ACCOUNT_SID has an invalid format."),
  assertPresent("TWILIO_AUTH_TOKEN", (value) => value.length >= 20, "TWILIO_AUTH_TOKEN has an invalid format."),
  assertPresent("TWILIO_MESSAGING_SERVICE_SID", (value) => /^MG[A-Za-z0-9]{20,}$/.test(value), "TWILIO_MESSAGING_SERVICE_SID has an invalid format."),
  assertPresent("TWILIO_VOICE_FROM_NUMBER", (value) => /^\+[1-9]\d{7,14}$/.test(value), "TWILIO_VOICE_FROM_NUMBER must be E.164 formatted."),
  assertPresent("TWILIO_STATUS_CALLBACK_URL", (value) => value === `${expectedBaseUrl.replace(/\/$/, "")}/api/webhooks/sms/twilio`, "Twilio SMS callback URL does not match this deployment."),
  assertPresent("TWILIO_VOICE_STATUS_CALLBACK_URL", (value) => value === `${expectedBaseUrl.replace(/\/$/, "")}/api/webhooks/voice/twilio`, "Twilio Voice callback URL does not match this deployment.")
];

assert(supabaseProjectRef, "The target Supabase project reference could not be derived.");
if (isProduction) {
  assert(productionProjectRef, "Production project reference must be configured in the protected environment.");
  assert.equal(supabaseProjectRef, productionProjectRef, "SUPABASE_URL does not match the verified production project reference.");
  assert.notEqual(supabaseProjectRef, stagingProjectRef, "Production reservation alerts must not use the staging Supabase project.");
  assert(["production", "prod"].includes(clean(process.env.SMARTTABLE_ENV || process.env.APP_ENV).toLowerCase()), "Production runtime mode must be production.");
} else if (stagingProjectRef) {
  assert.equal(supabaseProjectRef, stagingProjectRef, "SUPABASE_URL does not match the verified staging project reference.");
  assert.notEqual(supabaseProjectRef, productionProjectRef, "Staging reservation alerts must not use the production Supabase project.");
}

numberInRange("RESERVATION_ALERT_SMS_FALLBACK_SECONDS", 30, 3600);
numberInRange("RESERVATION_ALERT_ESCALATION_SECONDS", 60, 86400);
numberInRange("RESERVATION_ALERT_VOICE_DELAY_SECONDS", 60, 86400);
numberInRange("RESERVATION_ALERT_SMS_MAX_ATTEMPTS", 1, 5);
numberInRange("RESERVATION_ALERT_PUSH_MAX_ATTEMPTS", 1, 5);
numberInRange("RESERVATION_ALERT_VOICE_MAX_ATTEMPTS", 1, 5);

if (requireOperational) {
  assert(envFlag(process.env.RESERVATION_ALERT_SCHEDULER_VERIFIED), "The external one-minute reservation alert scheduler has not been verified.");
  assert(envFlag(process.env.TWILIO_PRODUCTION_VERIFIED), "A controlled production Twilio SMS and Voice delivery has not been verified.");
  assert(envFlag(process.env.WEB_PUSH_PRODUCTION_VERIFIED), "A controlled production Web Push delivery has not been verified.");
}

printStatuses(`Reservation alert ${normalizedTarget} configuration readiness`, statuses);
console.log(`- Supabase target identity: verified ${normalizedTarget}`);
console.log(`- One-minute scheduler operational proof: ${envFlag(process.env.RESERVATION_ALERT_SCHEDULER_VERIFIED) ? "verified" : "pending"}`);
console.log(`- Web Push operational proof: ${envFlag(process.env.WEB_PUSH_PRODUCTION_VERIFIED) ? "verified" : "pending"}`);
console.log(`- Twilio SMS/Voice operational proof: ${envFlag(process.env.TWILIO_PRODUCTION_VERIFIED) ? "verified" : "pending"}`);
console.log(`Reservation alert ${normalizedTarget} readiness checks passed${requireOperational ? " including operational delivery gates" : " at configuration level"}.`);
