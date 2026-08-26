import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.RESEND_API_KEY = "";
process.env.SMS_PROVIDER = "twilio";
process.env.SMS_QUIET_HOURS_START = "00:00";
process.env.SMS_QUIET_HOURS_END = "23:59";

const { handleApiRequest } = await import(`../src/app-core.js?enterprise-communications=${Date.now()}`);

async function api(path, { method = "GET", token = "", body = {} } = {}) {
  const result = await handleApiRequest({
    method,
    url: `/api${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body
  });
  return result;
}

async function login(email, password) {
  const result = await api("/auth/login", {
    method: "POST",
    body: { email, password }
  });
  assert.equal(result.status, 200, `login failed for ${email}: ${JSON.stringify(result.body)}`);
  return result.body.access_token || result.body.token;
}

function assertNoRawPhonePayload(payload) {
  const serialized = JSON.stringify(payload);
  assert(!/\+1\s?\d{3}\s?\d{3}\s?\d{4}/.test(serialized), "response exposed a raw E.164 phone number");
  assert(!/2125550103|2125551042|2125551043/.test(serialized), "response exposed raw phone digits");
}

const migration = readFileSync("supabase/migrations/0048_sms_system_notifications.sql", "utf8");
for (const table of [
  "sms_campaigns",
  "sms_recipients",
  "sms_delivery_logs",
  "sms_provider_events",
  "system_message_campaigns",
  "system_message_recipients",
  "notifications"
]) {
  assert(migration.includes(`create table if not exists public.${table}`), `migration missing ${table}`);
}
assert(migration.includes("alter table public.notifications enable row level security"), "notifications RLS missing");
assert(migration.includes("public.is_admin()"), "admin RLS should use existing is_admin helper");

const hardeningMigration = readFileSync("supabase/migrations/0049_enterprise_compliance_hardening.sql", "utf8");
for (const token of [
  "alter table public.audit_logs",
  "alter table public.email_queue",
  "alter table public.sms_recipients",
  "alter table public.system_message_recipients",
  "alter table public.billing_events",
  "dead_lettered_at",
  "locked_at",
  "retention_expires_at",
  "template_variable_allowlist",
  "idx_billing_events_lock_retry"
]) {
  assert(hardeningMigration.includes(token), `compliance hardening migration missing ${token}`);
}

const envExample = readFileSync(".env.example", "utf8");
for (const key of [
  "SMS_PROVIDER=",
  "TWILIO_ACCOUNT_SID=",
  "TWILIO_AUTH_TOKEN=",
  "TWILIO_MESSAGING_SERVICE_SID=",
  "SMS_DAILY_SEND_LIMIT=",
  "SMS_MONTHLY_SEND_LIMIT=",
  "SMS_TEST_RECIPIENT_ALLOWLIST=",
  "BUSINESS_MAILING_ADDRESS="
]) {
  assert(envExample.includes(key), `.env.example missing ${key}`);
}

const appJs = readFileSync("public/app.js", "utf8");
assert(!appJs.includes("SMS is not implemented and requires separate consent."), "guest account still labels SMS as not implemented");
assert(appJs.includes("/partner/sms-campaigns"), "partner SMS campaign endpoint is not wired in UI");
assert(appJs.includes("/admin/system-messages"), "admin system message endpoint is not wired in UI");
assert(appJs.includes("/notifications"), "generic notification endpoint is not wired in UI");
assert(appJs.includes("test_send"), "admin broadcast diagnostic test send is not wired in UI");
assert(appJs.includes("trialing_partners"), "admin broadcast subscription-status filters are missing");
assert(appJs.includes("retry_failed"), "partner SMS failed-recipient retry action is not wired in UI");

const appCore = readFileSync("src/app-core.js", "utf8");
for (const token of [
  "sanitizeCampaignText",
  "CAMPAIGN_TEMPLATE_VARIABLE_ALLOWLIST",
  "marketingEmailFooterText",
  "createAuditLog",
  "sms_campaign_retry_failed",
  "system_message_test_send",
  "stripe_billing_portal_created"
]) {
  assert(appCore.includes(token), `enterprise backend hardening missing ${token}`);
}

for (const lang of ["en", "es", "hu"]) {
  const locale = JSON.parse(readFileSync(`public/locales/${lang}.json`, "utf8"));
  for (const key of [
    "partner_billing_title",
    "partner_communications_title",
    "sms_campaign_title",
    "admin_broadcast_title",
    "campaign_test_recipient_label",
    "sms_campaign_retry_failed"
  ]) {
    assert(locale[key], `${lang} locale missing ${key}`);
  }
}

const guestToken = await login(TEST_ACCOUNTS.guest.email, TEST_ACCOUNTS.guest.password);
const partnerToken = await login(TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
const adminToken = await login(TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);

const forbidden = await api("/partner/sms-campaigns", { token: guestToken });
assert.equal(forbidden.status, 403, "guest should not access partner SMS campaigns");

const partnerForbiddenBroadcast = await api("/admin/system-messages", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "estimate_audience",
    name: "Unauthorized broadcast",
    category: "service_announcement",
    channels: ["in_app"],
    audience_role: "guests",
    title_en: "Nope",
    body_en: "Nope"
  }
});
assert.equal(partnerForbiddenBroadcast.status, 403, "partners must not access Super Admin broadcast tools");

const comms = await api("/guest/communications", {
  method: "PATCH",
  token: guestToken,
  body: {
    marketing_sms_enabled: true,
    transactional_sms_enabled: true,
    in_app_enabled: true,
    timezone: "America/New_York",
    source: "enterprise_communications_check"
  }
});
assert.equal(comms.status, 200, "guest SMS preferences should save");
assert.equal(comms.body.preferences.marketing_sms_enabled, true, "marketing SMS preference not persisted");

const estimate = await api("/partner/sms-campaigns", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "estimate_audience",
    name: "Regression SMS",
    body_en: "A SmartTable table is available.",
    audience_followers: true,
    audience_reservations: true
  }
});
assert.equal(estimate.status, 200, `SMS estimate failed: ${JSON.stringify(estimate.body)}`);
assert.equal(estimate.body.raw_phone_lists_exposed, false, "SMS estimate should not expose raw phone lists");
assertNoRawPhonePayload(estimate.body);
assert.equal(estimate.body.quiet_hour_delayed_count, estimate.body.audience_count, "quiet-hour policy must be applied during SMS audience estimation");

const saveSms = await api("/partner/sms-campaigns", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "save_draft",
    name: "Regression SMS draft",
    body_en: "A SmartTable table is available.",
    audience_followers: true,
    audience_reservations: true
  }
});
assert.equal(saveSms.status, 201, `SMS draft save failed: ${JSON.stringify(saveSms.body)}`);
assertNoRawPhonePayload(saveSms.body);

const smsProviderFailure = await api("/partner/sms-campaigns", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "test_sms",
    test_phone: "+12125550199",
    name: "Provider failure SMS",
    body_en: "A SmartTable test SMS."
  }
});
assert.equal(smsProviderFailure.status, 502, "unconfigured SMS provider must fail truthfully for test sends");
assert.equal(smsProviderFailure.body.accepted, false, "SMS provider failure must not be reported as accepted");

const unsafeSmsDraft = await api("/partner/sms-campaigns", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "save_draft",
    name: "Unsafe SMS draft",
    body_en: "Hello <script>alert('xss')</script> {{guest_name}}",
    audience_followers: true
  }
});
assert.equal(unsafeSmsDraft.status, 201, `safe SMS draft should save after sanitization: ${JSON.stringify(unsafeSmsDraft.body)}`);
assert(!String(unsafeSmsDraft.body.campaign.body_en).toLowerCase().includes("<script"), "SMS draft body must strip script tags server-side");

const unsafeSmsVariable = await api("/partner/sms-campaigns", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "save_draft",
    name: "Unsafe SMS variable",
    body_en: "Hello {{password}}",
    audience_followers: true
  }
});
assert.equal(unsafeSmsVariable.status, 400, "SMS campaign drafts must reject disallowed template variables");

const stop = await api("/webhooks/sms/twilio", {
  method: "POST",
  body: {
    From: "+12125550103",
    To: "+12125550000",
    Body: "STOP",
    MessageSid: "SM-demo-stop"
  }
});
assert.equal(stop.status, 200, "STOP webhook should be accepted in development mode");
assert(String(stop.body).includes("unsubscribed"), "STOP webhook should return an unsubscribe acknowledgement");

const help = await api("/webhooks/sms/twilio", {
  method: "POST",
  body: {
    From: "+12125550103",
    To: "+12125550000",
    Body: "HELP",
    MessageSid: "SM-demo-help"
  }
});
assert.equal(help.status, 200, "HELP webhook should be accepted in development mode");
assert(String(help.body).includes("SmartTable SMS support"), "HELP webhook should return a support acknowledgement");

const postStopEstimate = await api("/partner/sms-campaigns", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "estimate_audience",
    name: "Post STOP SMS",
    body_en: "A SmartTable table is available.",
    audience_followers: true,
    audience_reservations: true
  }
});
assert.equal(postStopEstimate.status, 200, "post-STOP SMS estimate should still respond safely");
assert(postStopEstimate.body.audience_count <= estimate.body.audience_count, "STOP suppression should not increase audience size");

const adminEstimate = await api("/admin/system-messages", {
  method: "POST",
  token: adminToken,
  body: {
    action: "estimate_audience",
    name: "System regression",
    category: "service_announcement",
    channels: ["in_app"],
    audience_role: "guests",
    title_en: "SmartTable update",
    body_en: "This is an in-app regression notification."
  }
});
assert.equal(adminEstimate.status, 200, `system audience estimate failed: ${JSON.stringify(adminEstimate.body)}`);
assert.equal(adminEstimate.body.raw_personal_data_exposed, false, "system estimate should not expose personal recipient data");

const adminMarketingEmailEstimate = await api("/admin/system-messages", {
  method: "POST",
  token: adminToken,
  body: {
    action: "estimate_audience",
    name: "Marketing email consent regression",
    category: "marketing_announcement",
    channels: ["email"],
    audience_role: "guests",
    title_en: "Marketing update",
    body_en: "This marketing email must require consent."
  }
});
assert.equal(adminMarketingEmailEstimate.status, 200, "admin marketing email estimate should respond safely");
assert.equal(adminMarketingEmailEstimate.body.raw_personal_data_exposed, false, "admin marketing email estimate should not expose recipient data");

const unsafeBroadcastVariable = await api("/admin/system-messages", {
  method: "POST",
  token: adminToken,
  body: {
    action: "save_draft",
    name: "Unsafe broadcast variable",
    category: "service_announcement",
    channels: ["in_app"],
    audience_role: "guests",
    title_en: "System update",
    body_en: "Internal value {{password}}"
  }
});
assert.equal(unsafeBroadcastVariable.status, 400, "system broadcasts must reject disallowed template variables");

const activePartnerEstimate = await api("/admin/system-messages", {
  method: "POST",
  token: adminToken,
  body: {
    action: "estimate_audience",
    name: "Active partner regression",
    category: "partner_announcement",
    channels: ["in_app"],
    audience_role: "active_partners",
    title_en: "Partner update",
    body_en: "This is an active-partner regression notification."
  }
});
assert.equal(activePartnerEstimate.status, 200, "active partner subscription audience should estimate safely");
assert(activePartnerEstimate.body.recipient_count >= 1, "active partner audience should use subscription status data");

const testSend = await api("/admin/system-messages", {
  method: "POST",
  token: adminToken,
  body: {
    action: "test_send",
    name: "Diagnostic test",
    category: "service_announcement",
    channels: ["in_app"],
    test_recipient: TEST_ACCOUNTS.guest.email,
    title_en: "Diagnostic update",
    body_en: "This is a one-recipient diagnostic notification."
  }
});
assert.equal(testSend.status, 200, `diagnostic test send failed: ${JSON.stringify(testSend.body)}`);
assert.equal(testSend.body.test_send, true, "diagnostic test send must be marked as a test");
assert.equal(testSend.body.raw_personal_data_exposed, false, "diagnostic test send should not expose personal recipient data");

const emailProviderFailure = await api("/admin/system-messages", {
  method: "POST",
  token: adminToken,
  body: {
    action: "test_send",
    name: "Diagnostic email failure",
    category: "service_announcement",
    channels: ["email"],
    test_recipient: TEST_ACCOUNTS.guest.email,
    title_en: "Email provider failure",
    body_en: "This one-recipient diagnostic email must fail truthfully when Resend is not configured."
  }
});
assert.equal(emailProviderFailure.status, 207, "unconfigured email provider must return a truthful partial/failure result for diagnostic test sends");
assert(emailProviderFailure.body.failed_count > 0, "email provider failure must not be reported as accepted");

const scheduledSms = await api("/partner/sms-campaigns", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "schedule",
    name: "Scheduled quiet-hours SMS",
    body_en: "A scheduled SmartTable SMS.",
    scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    audience_followers: true,
    audience_reservations: true
  }
});
assert.equal(scheduledSms.status, 200, "SMS scheduling should succeed with valid consent-scoped audience");
assert.equal(scheduledSms.body.campaign.status, "scheduled", "scheduled SMS campaigns must remain scheduled until processed");
assert.equal(scheduledSms.body.campaign.recipients.every((recipient) => recipient.status === "delayed"), true, "quiet-hour SMS recipients must be delayed instead of sent immediately");

const retryQuietSms = await api("/partner/sms-campaigns", {
  method: "POST",
  token: partnerToken,
  body: {
    action: "retry_failed",
    id: scheduledSms.body.campaign.id
  }
});
assert.equal(retryQuietSms.status, 200, "SMS retry should be available for delayed recipients");
assert.equal(retryQuietSms.body.raw_phone_lists_exposed, false, "SMS retry response must not expose raw phone lists");

const sendSystem = await api("/admin/system-messages", {
  method: "POST",
  token: adminToken,
  body: {
    action: "send_now",
    name: "System regression",
    category: "service_announcement",
    channels: ["in_app"],
    audience_role: "guests",
    title_en: "SmartTable update",
    body_en: "This is an in-app regression notification."
  }
});
assert.equal(sendSystem.status, 200, `system message send failed: ${JSON.stringify(sendSystem.body)}`);

const notifications = await api("/notifications", { token: guestToken });
assert.equal(notifications.status, 200, "guest notification center should load");
assert(notifications.body.notifications.some((item) => item.title === "SmartTable update"), "system notification was not visible to guest");

const markAll = await api("/notifications", {
  method: "PATCH",
  token: guestToken,
  body: { read_all: true }
});
assert.equal(markAll.status, 200, "mark-all notifications should succeed");
assert.equal(markAll.body.unread_count, 0, "mark-all should clear unread system notifications");

console.log("Enterprise communications checks passed.");
