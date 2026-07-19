import { readFile } from "node:fs/promises";
import { handleApiRequest } from "../src/app-core.js";
import { createPushService } from "../src/push-service.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function api(method, path, body = {}, headers = {}) {
  const response = await handleApiRequest({
    method,
    url: `/api${path}`,
    body,
    headers
  });
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.error || "unknown error"}`);
  }
  return response.body;
}

const [serverCore, publicApp, sharedContracts, migration, docs] = await Promise.all([
  read("src/app-core.js"),
  read("public/app.js"),
  read("public/shared-contracts.js"),
  read("supabase/migrations/0034_scale_readiness_feature_flags_booking.sql"),
  read("docs/SmartTable-Scale-Architecture.md").catch(() => "")
]);
const layoutShells = await read("public/shared/layout-shells.js");
const [guestLayout, partnerLayout, adminLayout] = await Promise.all([
  read("public/guest/layout.js"),
  read("public/partner/layout.js"),
  read("public/admin/layout.js")
]);

for (const token of [
  "feature_flags",
  "const bookingSources",
  "const bookingStatuses",
  "function decorateReservationRow",
  "function offerConditionPayload"
]) {
  assert(serverCore.includes(token), `Backend architecture foundation is missing ${token}.`);
}

for (const token of [
  "function isFeatureFlagEnabled",
  "feature_flag_disabled_label",
  "adminDashboardLayout",
  "guestHeroLayout",
  "partnerDashboardLayout"
]) {
  assert(publicApp.includes(token), `Frontend feature-flag wiring is missing ${token}.`);
}

for (const token of [
  "appAreaShell",
  "dashboardLayoutShell",
  "heroLayoutShell",
  "data-app-area",
  "data-dashboard-area"
]) {
  assert(layoutShells.includes(token), `Layout shell module is missing ${token}.`);
}

assert(guestLayout.includes('appAreaShell("guest"'), "Guest layout must render under the guest app area.");
assert(partnerLayout.includes('area: "partner"'), "Partner layout must render under the partner app area.");
assert(adminLayout.includes('area: "admin"'), "Admin layout must render under the admin app area.");

for (const token of [
  "DEFAULT_FEATURE_FLAGS",
  "PLATFORM_FEATURE_REGISTRY",
  "BOOKING_SOURCES",
  "BOOKING_STATUSES",
  "normalizeFeatureFlagSettings",
  "normalizePlatformSettings"
]) {
  assert(sharedContracts.includes(token), `Shared contract module is missing ${token}.`);
}

for (const token of [
  "booking_source",
  "booking_status",
  "structured_conditions",
  "idx_restaurant_reviews_one_per_reservation",
  "push_subscriptions",
  "push_delivery_logs"
]) {
  assert(migration.includes(token), `Scale-readiness migration is missing ${token}.`);
}

assert(docs.includes("Feature Flag System"), "Architecture documentation must include the Feature Flag System section.");
assert(docs.includes("Booking Engine Foundation"), "Architecture documentation must include the Booking Engine Foundation section.");
assert(docs.includes("SmartTable integrates with reservation systems only"), "Documentation must preserve the reservation-systems-only integration statement.");

const config = await api("GET", "/public/config");
assert(config.platform_mode === "basic", "Default platform mode must remain basic.");
assert(config.feature_flags?.reservations === true, "Reservations feature flag must be enabled by default.");
assert(config.feature_flags?.push_notification === false, "Push notifications must be disabled by default.");
assert(config.feature_registry?.["ai.concierge"]?.flag_key === "ai_concierge", "AI Concierge must be governed by the ai_concierge feature flag.");

const offers = await api("GET", "/public/offers?lang=en");
const offer = (offers.offers || []).find((item) => item.offer_id && Number(item.available_tables || 0) > 0);
assert(offer, "At least one offer is required for booking-engine metadata checks.");
const reservation = await api("POST", "/reservations", {
  offer_id: offer.offer_id,
  guest_name: "Architecture Check",
  guest_email: `architecture-check-${Date.now()}@example.com`,
  guest_phone: "+1 212 555 0199",
  party_size: 2,
  reservation_date: offer.reservation_date || offer.offer_date,
  reservation_time: offer.start_time || offer.offer_time,
  notes: "Automated architecture foundation check."
});
assert(reservation.reservation?.booking_source === "SMARTTABLE", "Reservation responses must expose booking_source.");
assert(reservation.reservation?.booking_status === "pending", "Reservation responses must expose canonical booking_status.");

const push = createPushService().getStatus();
assert(push.enabled === false && push.status === "disabled", "Push service must auto-disable without a configured provider.");

console.log("Architecture foundation checks passed.");
