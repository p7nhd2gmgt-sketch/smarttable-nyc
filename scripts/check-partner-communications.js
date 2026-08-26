import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.RESEND_API_KEY = "";

const { handleApiRequest } = await import(`../src/app-core.js?partner-communications=${Date.now()}`);

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

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

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function assertNoRawGuestList(payload) {
  const text = JSON.stringify(payload);
  assert(!text.includes(TEST_ACCOUNTS.guest.email), "Partner campaign payload must not expose raw guest email addresses.");
  assert(!text.includes("emma.carter@example.com"), "Partner campaign payload must not expose reservation guest emails.");
}

const migration = await read("supabase/migrations/0047_communication_preferences_campaigns.sql");
for (const token of [
  "create table if not exists public.communication_preferences",
  "create table if not exists public.communication_consents",
  "create table if not exists public.suppression_list",
  "create table if not exists public.message_campaigns",
  "create table if not exists public.message_recipients",
  "message_campaigns_scoped",
  "message_recipients_campaign_scoped"
]) {
  assert(migration.includes(token), `Communication migration is missing ${token}.`);
}

const hardeningMigration = await read("supabase/migrations/0049_enterprise_compliance_hardening.sql");
for (const token of [
  "alter table public.message_campaigns",
  "template_variable_allowlist",
  "xss_sanitized_at",
  "recipient_snapshot_hash",
  "dead_lettered_at",
  "locked_at",
  "idx_message_recipients_dead_letter"
]) {
  assert(hardeningMigration.includes(token), `Enterprise compliance hardening migration is missing ${token}.`);
}
for (const destructive of [/drop\s+table/i, /truncate\s+table/i, /\bdelete\s+from\b/i, /drop\s+policy/i]) {
  assert(!destructive.test(migration), `Communication migration must not contain destructive operation ${destructive}.`);
}

const appCore = await read("src/app-core.js");
for (const token of [
  "guestCommunications",
  "messageCampaigns",
  "eligibleCampaignAudience",
  "marketingAllowedForProfile",
  "queueCampaignRecipientEmails",
  "notify_favorite_guests_for_offer",
  "favoriteOfferCampaignPayload",
  "recipient_snapshot_hash",
  "/guest/communications",
  "/partner/campaigns"
]) {
  assert(appCore.includes(token), `Backend communication implementation is missing ${token}.`);
}

const publicApp = await read("public/app.js");
for (const token of [
  "partnerCommunicationsPanel",
  "runPartnerCampaignAction",
  "notifyFavoriteGuestsForOffer",
  "applyPartnerCampaignFormatting",
  "/partner/campaigns",
  "/guest/communications",
  "Raw recipient lists are never shown",
  "data-notify-favorite-offer",
  "data-campaign-format"
]) {
  assert(publicApp.includes(token), `Frontend communication implementation is missing ${token}.`);
}

const guestSession = await api("POST", "/auth/login", {
  email: TEST_ACCOUNTS.guest.email,
  password: TEST_ACCOUNTS.guest.password
});
const guestHeaders = authHeaders(guestSession.access_token);

const partnerSession = await api("POST", "/auth/login", {
  email: TEST_ACCOUNTS.partner.email,
  password: TEST_ACCOUNTS.partner.password
});
const partnerHeaders = authHeaders(partnerSession.access_token);

const guestComms = await api("GET", "/guest/communications", {}, guestHeaders);
assert.equal(guestComms.preferences.transactional_email_enabled, true);
assert.equal(guestComms.preferences.marketing_email_enabled, true);
assert(Array.isArray(guestComms.consents), "Guest communications must return consent history.");

const guestCannotAccessCampaigns = await rawApi("GET", "/partner/campaigns", {}, guestHeaders);
assert.equal(guestCannotAccessCampaigns.status, 403, "Guests must not access partner campaigns.");

const partnerCampaigns = await api("GET", "/partner/campaigns", {}, partnerHeaders);
assert(Array.isArray(partnerCampaigns.templates), "Partner campaigns must return approved templates.");
assert(Array.isArray(partnerCampaigns.campaigns), "Partner campaigns must return campaign rows.");
assertNoRawGuestList(partnerCampaigns);

const crossTenantCampaign = await rawApi("POST", "/partner/campaigns", {
  action: "estimate_audience",
  restaurant_id: "10000000-0000-4000-8000-000000000002",
  name: "Cross tenant campaign",
  subject_en: "Cross tenant",
  body_en: "This should be denied."
}, partnerHeaders);
assert.equal(crossTenantCampaign.status, 403, "Partner campaigns must be tenant-scoped to the authorized restaurant.");

const audience = await api("POST", "/partner/campaigns", {
  action: "estimate_audience",
  name: "Consent audit campaign",
  subject_en: "SmartTable offer",
  body_en: "A new opted-in campaign test."
}, partnerHeaders);
assert.equal(audience.audience_count, 1, "Demo campaign audience should include one opted-in favorite guest.");
assertNoRawGuestList(audience);

await api("PATCH", "/guest/communications", {
  marketing_email_enabled: false,
  in_app_enabled: true,
  preferred_language: "hu",
  timezone: "America/New_York",
  source: "automated_check"
}, guestHeaders);
const disabledAudience = await api("POST", "/partner/campaigns", {
  action: "estimate_audience",
  name: "Consent disabled campaign",
  subject_en: "SmartTable offer",
  body_en: "This should not have recipients."
}, partnerHeaders);
assert.equal(disabledAudience.audience_count, 0, "Marketing opt-out must remove the guest from partner campaign audience.");

await api("PATCH", "/guest/communications", {
  marketing_email_enabled: true,
  in_app_enabled: true,
  preferred_language: "hu",
  timezone: "America/New_York",
  source: "automated_check"
}, guestHeaders);

const partnerOffers = await api("GET", "/partner/offers", {}, partnerHeaders);
const favoriteAlertOffer = (partnerOffers.offers || []).find((offer) => offer.status === "active" && Number(offer.available_tables || offer.seat_count || 0) > Number(offer.reserved_tables || 0));
assert(favoriteAlertOffer?.id, "Partner must have an active offer for the favorite-guest alert check.");

const favoriteAlert = await api("POST", "/partner/campaigns", {
  action: "notify_favorite_guests_for_offer",
  offer_id: favoriteAlertOffer.id
}, partnerHeaders);
assert.equal(favoriteAlert.queued_count, 1, "Favorite-guest offer alert must queue one email for the opted-in favorite guest.");
assert.equal(favoriteAlert.campaign.audience_definition.source, "favorite_offer_alert", "Favorite-guest alert campaigns must be auditable by source.");
assert.equal(favoriteAlert.campaign.audience_definition.reservations, false, "Favorite-guest offer alerts must not include unrelated reservation audiences.");
assert.equal(favoriteAlert.campaign.recipient_snapshot_hash, undefined, "Internal recipient snapshot hashes must not be exposed for favorite-guest alerts.");
assertNoRawGuestList(favoriteAlert);

const favoriteAlertAgain = await api("POST", "/partner/campaigns", {
  action: "notify_favorite_guests_for_offer",
  offer_id: favoriteAlertOffer.id
}, partnerHeaders);
assert.equal(favoriteAlertAgain.duplicate_prevented, true, "Repeated favorite-guest offer alerts must not queue duplicate sends.");
assert.equal(favoriteAlertAgain.queued_count, 0, "Duplicate favorite-guest offer alerts must not create another email queue batch.");
assertNoRawGuestList(favoriteAlertAgain);

const scheduled = await api("POST", "/partner/campaigns", {
  action: "schedule",
  name: "Scheduled opted-in partner campaign",
  subject_en: "Scheduled SmartTable offer",
  body_en: "A scheduled SmartTable offer is available for opted-in guests.",
  scheduled_at: new Date(Date.now() - 60_000).toISOString(),
  audience_followers: true,
  audience_reservations: true
}, partnerHeaders);
assert.equal(scheduled.campaign.status, "scheduled", "Scheduled campaigns must remain scheduled until a backend processor queues them.");
assert.equal(scheduled.campaign.recipient_count, 1, "Scheduling must snapshot the eligible opted-in audience.");
assertNoRawGuestList(scheduled);

const processedScheduled = await api("POST", "/partner/campaigns", {
  action: "process_scheduled",
  limit: 10
}, partnerHeaders);
assert.equal(processedScheduled.processed.length, 1, "Backend scheduled-campaign processor must process due restaurant campaigns.");
assert.equal(processedScheduled.processed[0].queued_count, 1, "Backend scheduled-campaign processor must queue one email for the opted-in recipient.");
assertNoRawGuestList(processedScheduled);

const processedAgain = await api("POST", "/partner/campaigns", {
  action: "process_scheduled",
  limit: 10
}, partnerHeaders);
assert.equal(processedAgain.processed.length, 0, "Scheduled campaign processing must be idempotent after a campaign leaves scheduled status.");

const unsafeDraft = await api("POST", "/partner/campaigns", {
  action: "save_draft",
  name: "Sanitized campaign",
  subject_en: "Safe SmartTable offer",
  body_en: "Hello <script>alert('xss')</script> {{guest_name}}",
  audience_followers: true
}, partnerHeaders);
assert(!String(unsafeDraft.campaign.body_en).toLowerCase().includes("<script"), "Campaign draft body must strip script tags server-side.");
assert(String(unsafeDraft.campaign.body_en).includes("{{guest_name}}"), "Allowed campaign template variable should be preserved.");

const rejectedVariable = await rawApi("POST", "/partner/campaigns", {
  action: "save_draft",
  name: "Unsafe variable campaign",
  subject_en: "Unsafe SmartTable offer",
  body_en: "Hello {{password}}",
  audience_followers: true
}, partnerHeaders);
assert.equal(rejectedVariable.status, 400, "Campaign drafts must reject disallowed template variables.");
assert.match(rejectedVariable.body.error, /Unsupported template variable/, "Disallowed template variable error should be explicit and safe.");

const draft = await api("POST", "/partner/campaigns", {
  action: "save_draft",
  name: "Automated partner campaign",
  subject_en: "New SmartTable offer",
  subject_es: "Nueva oferta SmartTable",
  subject_hu: "Új SmartTable ajánlat",
  preheader_en: "A consent-scoped message.",
  body_en: "A new SmartTable offer is available for opted-in guests.",
  body_es: "Hay una nueva oferta de SmartTable para clientes suscritos.",
  body_hu: "Új SmartTable ajánlat érhető el feliratkozott vendégeknek.",
  audience_followers: true,
  audience_reservations: true
}, partnerHeaders);
assert(draft.campaign.id, "Saving a draft must return a campaign ID.");
assert.equal(draft.campaign.status, "draft");
assert.equal(draft.campaign.subject_hu, "Új SmartTable ajánlat", "Hungarian campaign content must remain UTF-8 safe.");

const testEmailProviderFailure = await rawApi("POST", "/partner/campaigns", {
  action: "test_email",
  test_email: TEST_ACCOUNTS.guest.email,
  name: "Provider failure test",
  subject_en: "Provider failure",
  body_en: "This test email must fail truthfully when Resend is not configured."
}, partnerHeaders);
assert.equal(testEmailProviderFailure.status, 502, "Unconfigured Resend provider must fail test emails truthfully.");
assert.equal(testEmailProviderFailure.body.accepted, false, "Provider failure must not be reported as accepted.");

const queued = await api("POST", "/partner/campaigns", {
  action: "send_now",
  id: draft.campaign.id,
  name: "Automated partner campaign",
  subject_en: "New SmartTable offer",
  body_en: "A new SmartTable offer is available for opted-in guests.",
  audience_followers: true,
  audience_reservations: true
}, partnerHeaders);
assert.equal(queued.campaign.recipient_count, 1, "Queued campaign must snapshot exactly one opted-in recipient.");
assert.equal(queued.queued_count, 1, "Queued campaign must create one email queue record.");
assert.equal(queued.campaign.recipient_snapshot_hash, undefined, "Internal recipient snapshot hashes must not be exposed to partner clients.");
assertNoRawGuestList(queued);

const queuedAgain = await api("POST", "/partner/campaigns", {
  action: "send_now",
  id: draft.campaign.id,
  name: "Automated partner campaign",
  subject_en: "New SmartTable offer",
  body_en: "A new SmartTable offer is available for opted-in guests.",
  audience_followers: true,
  audience_reservations: true
}, partnerHeaders);
assert.equal(queuedAgain.campaign.recipient_count, 1, "Repeated campaign queueing must not duplicate recipient snapshots.");

const invalidTestEmail = await rawApi("POST", "/partner/campaigns", {
  action: "test_email",
  test_email: "not-an-email",
  name: "Invalid test",
  subject_en: "Invalid",
  body_en: "Invalid"
}, partnerHeaders);
assert.equal(invalidTestEmail.status, 400, "Campaign test email requires an explicit valid recipient.");

const adminSession = await api("POST", "/auth/login", {
  email: TEST_ACCOUNTS.superadmin.email,
  password: TEST_ACCOUNTS.superadmin.password
});
const adminCampaigns = await api("GET", "/admin/campaigns", {}, authHeaders(adminSession.access_token));
assert(Array.isArray(adminCampaigns.campaigns), "Admin campaign center must list campaigns.");
assertNoRawGuestList(adminCampaigns);

console.log("Partner communications checks passed.");
