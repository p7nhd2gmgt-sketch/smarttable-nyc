import { readFile } from "node:fs/promises";
import { handleApiRequest } from "../src/app-core.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requiredTranslationKeys = [
  "platformMode.title",
  "platformMode.basic",
  "platformMode.aiConcierge",
  "platformMode.currentMode",
  "platformMode.switchSuccess",
  "platformMode.switchConfirmation",
  "platformMode.openAIExperience",
  "platformMode.openPartnerAI",
  "platformMode.aiDemoVisibility",
  "platformMode.showPublicBadge",
  "platformMode.previewGuest",
  "platformMode.previewPartner",
  "platformMode.demo",
  "platformMode.preview"
];

async function api(method, path, body = {}, headers = {}) {
  const response = await apiRaw(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.error || "unknown error"}`);
  }
  return response.body;
}

async function apiRaw(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
}

async function loginAs(email, password) {
  const login = await api("POST", "/auth/login", { email, password });
  assert(login.access_token, `${email} login is required for platform mode checks.`);
  return { authorization: `Bearer ${login.access_token}` };
}

async function adminDataSnapshot(headers) {
  const [restaurants, offers, reservations] = await Promise.all([
    api("GET", "/admin/restaurants", {}, headers),
    api("GET", "/admin/offers", {}, headers),
    api("GET", "/admin/reservations", {}, headers)
  ]);
  return {
    restaurants: restaurants.restaurants?.length || 0,
    offers: offers.offers?.length || 0,
    reservations: reservations.reservations?.length || 0
  };
}

function canShowFromRegistry(registry, featureKey, { platformMode, aiDemoVisibility, audience }) {
  const feature = registry?.[featureKey];
  if (!feature) return false;
  if (!Array.isArray(feature.modes) || !feature.modes.includes(platformMode)) return false;
  const status = String(feature.status || "disabled");
  if (status === "disabled" || status === "hidden") return false;
  if (audience) {
    const audiences = feature.audiences || ["all"];
    if (!audiences.includes("all") && !audiences.includes(audience)) return false;
  }
  if (status === "demo") return platformMode === "ai_concierge" && aiDemoVisibility === true;
  return status === "working";
}

async function assertPlatformTranslations() {
  for (const locale of ["en", "es", "hu"]) {
    const messages = JSON.parse(await readFile(new URL(`../public/locales/${locale}.json`, import.meta.url), "utf8"));
    for (const key of requiredTranslationKeys) {
      assert(Object.hasOwn(messages, key), `${locale}.json must define ${key}.`);
      assert(String(messages[key] || "").trim(), `${locale}.json must not leave ${key} empty.`);
    }
  }
  const hu = JSON.parse(await readFile(new URL("../public/locales/hu.json", import.meta.url), "utf8"));
  assert(hu["platformMode.title"] === "Platform mód", "Hungarian Platform Mode label must be translated.");
  assert(hu["platformMode.basic"] === "Alap foglalási piactér", "Hungarian Basic mode label must be translated.");
  assert(hu["platformMode.aiConcierge"] === "AI Concierge verzió", "Hungarian AI Concierge label must be translated.");
  assert(hu["platformMode.currentMode"] === "Jelenlegi mód", "Hungarian current mode label must be translated.");
  assert(hu["platformMode.switchSuccess"] === "Váltás sikeres", "Hungarian switch success label must be translated.");
  assert(hu["platformMode.openAIExperience"] === "AI Concierge megnyitása", "Hungarian guest AI open label must be translated.");
  assert(hu["platformMode.openPartnerAI"] === "Partner AI Demand megnyitása", "Hungarian partner AI open label must be translated.");
  assert(hu["platformMode.aiDemoVisibility"] === "AI demó láthatósága", "Hungarian AI Demo Visibility label must be translated.");
  assert(hu["platformMode.previewGuest"] === "Vendég AI előnézet", "Hungarian guest AI preview label must be translated.");
  assert(hu["platformMode.previewPartner"] === "Partner AI előnézet", "Hungarian partner AI preview label must be translated.");
  assert(hu["platformMode.demo"] === "Demó", "Hungarian demo label must be translated.");
  assert(hu["platformMode.preview"] === "Előnézet", "Hungarian preview label must be translated.");
}

async function assertFrontendWiring() {
  const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert(appSource.includes("function isBasicMode()"), "Frontend must expose isBasicMode().");
  assert(appSource.includes("function isAIConciergeMode()"), "Frontend must expose isAIConciergeMode().");
  assert(appSource.includes("function canShowFeature("), "Frontend must expose canShowFeature(featureKey).");
  assert(appSource.includes("status === \"demo\""), "Frontend feature visibility must handle demo feature status.");
  assert(appSource.includes("isAiDemoVisible()"), "Frontend feature visibility must check AI Demo Visibility.");
  assert(appSource.includes("platformModePanel()"), "Admin Platform Mode panel must be rendered.");
  assert(appSource.includes("platformModeQuickPanel()"), "Super Admin dashboard must show a quick Platform Mode control.");
  assert(appSource.includes("data-platform-mode-choice"), "Platform Mode control must use visible selectable choices.");
  assert(appSource.includes("data-platform-setting-toggle"), "Platform settings must expose visible AI Demo and AI badge toggles.");
  assert(appSource.includes("platformHeaderModeControl()"), "Super Admin header must expose a compact Platform Mode control.");
  assert(appSource.includes("platformMode.switchSuccess"), "Mode switching must show a translated success message.");
  assert(appSource.includes("platformMode.switchConfirmation"), "Header mode switching must ask for translated confirmation.");
  assert(appSource.includes("platformMode.currentMode"), "Admin header must use the translated current mode label.");
  assert(appSource.includes("canShowFeature(featureKey"), "Frontend must centralize feature visibility logic.");
  assert(appSource.includes("function currentAiRoute()"), "Frontend must map direct AI paths and hash routes.");
  assert(appSource.includes("function renderUnavailableRoute("), "Frontend must render unavailable AI route states.");
  assert(appSource.includes("guestAiConciergeHomepageEntry()"), "Guest homepage must render a major AI Concierge entry in AI mode.");
  assert(appSource.includes("data-ai-concierge-entry"), "Guest AI Concierge homepage entry must be identifiable.");
  assert(appSource.includes("partnerAiDemandEntryCard()"), "Partner dashboard must render a prominent AI Demand entry in AI mode.");
  assert(appSource.includes("href=\"#partner-ai-demand\""), "Partner AI Demand must be reachable from a visible dashboard button.");
  assert(appSource.includes("aiExperiencePreviewPanel()"), "Super Admin must expose an AI Experience Preview section.");
  assert(appSource.includes("platformMode.previewGuest"), "Super Admin preview must use translated Guest AI preview copy.");
  assert(appSource.includes("platformMode.previewPartner"), "Super Admin preview must use translated Partner AI preview copy.");
  assert(appSource.includes("platformMode.demo"), "Demo feature labels must use translated Platform Mode copy.");
  assert(appSource.includes("platformMode.preview"), "Preview feature labels must use translated Platform Mode copy.");
  assert(appSource.includes("/ai-concierge"), "Frontend must recognize the /ai-concierge route.");
  assert(appSource.includes("/ai-preferences"), "Frontend must recognize the /ai-preferences route.");
  assert(appSource.includes("/partner/ai-demand"), "Frontend must recognize the /partner/ai-demand route.");
  assert(appSource.includes("/admin/ai-controls"), "Frontend must recognize the /admin/ai-controls route.");
  assert(appSource.includes("renderBasicPartner("), "Partner dashboard must have a BASIC rendering path.");
  assert(appSource.includes("partner_nav_ai_demand"), "Partner dashboard must expose an AI Demand navigation label in AI mode.");
  assert(appSource.includes("admin-ai-controls"), "Admin AI controls must have a visible route target in AI mode.");
  assert(appSource.includes("admin-ai-preview"), "Admin AI preview must have a visible route target in AI mode.");

  for (const key of requiredTranslationKeys) {
    assert(appSource.includes(key), `Frontend must use translation key ${key}.`);
  }

  const indexSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert(indexSource.includes("aiConciergeNav"), "Guest header must include an AI Concierge navigation entry point.");
}

await assertPlatformTranslations();
await assertFrontendWiring();

const login = await api("POST", "/auth/login", { email: "admin@smarttable.com", password: "admin123" });
assert(login.access_token, "Super Admin login is required to test platform mode switching.");
const adminHeaders = { authorization: `Bearer ${login.access_token}` };

const regularAdminHeaders = await loginAs("ops@smarttable.com", "admin123");
const regularAdminSettings = await api("GET", "/admin/settings/platform-mode", {}, regularAdminHeaders);
assert(regularAdminSettings.can_edit === false, "Regular admins may see the current platform mode but cannot edit it.");
const regularAdminPatch = await apiRaw("PATCH", "/admin/settings/platform-mode", { platform_mode: "ai_concierge", ai_demo_visibility: true }, regularAdminHeaders);
assert(regularAdminPatch.status === 403, "Regular admins must not be able to change platform mode.");

const superAdminSettings = await api("GET", "/admin/settings/platform-mode", {}, adminHeaders);
assert(superAdminSettings.can_edit === true, "Super Admin must see editable Platform Mode settings.");
assert(superAdminSettings.feature_registry?.["ai.adminAIControls"]?.status === "working", "Admin AI controls must be a working AI_CONCIERGE feature.");

const resetToBasic = await api("PATCH", "/admin/settings/platform-mode", { platform_mode: "basic", ai_demo_visibility: false, show_ai_mode_badge: true }, adminHeaders);
assert(resetToBasic.platform_mode === "basic", "Super Admin must be able to reset the platform to Basic mode for checks.");
assert(resetToBasic.ai_demo_visibility === false, "AI Demo Visibility should be controllable and off after reset.");
const baselineSnapshot = await adminDataSnapshot(adminHeaders);

const config = await api("GET", "/public/config");
assert(config.platform_mode === "basic", "Default platform mode must be basic.");
assert(config.ai_demo_visibility === false, "Public config must expose AI Demo Visibility as off after reset.");
assert(config.show_ai_mode_badge === true, "Public config must expose the public AI badge setting.");
assert(config.feature_registry?.["basic.reservations"]?.status === "working", "Basic reservations feature must be registered as working.");
assert(config.feature_registry?.["ai.concierge"]?.modes?.includes("ai_concierge"), "AI concierge feature must be limited to ai_concierge mode.");
assert(canShowFromRegistry(config.feature_registry, "ai.concierge", { platformMode: "basic", aiDemoVisibility: true, audience: "guest" }) === false, "BASIC mode must hide guest AI Concierge even if demo visibility is on.");
assert(canShowFromRegistry(config.feature_registry, "ai.partnerDemand", { platformMode: "basic", aiDemoVisibility: true, audience: "partner" }) === false, "BASIC mode must hide Partner AI Demand even if demo visibility is on.");

const status = await api("GET", "/system/feature-status");
assert(status.platform_mode === "basic", "Feature status endpoint must report basic mode by default.");
assert(status.feature_registry?.["ai.partnerDemand"], "Feature status endpoint must expose the platform feature registry.");

const offersPayload = await api("GET", "/public/offers?lang=en");
const offer = (offersPayload.offers || []).find((item) => Number(item.available_tables || 0) > 0 && Number(item.max_party_size || 4) >= 2);
assert(offer, "At least one public offer with availability is required for the BASIC reservation flow check.");

const reservationPayload = await api("POST", "/reservations", {
  offer_id: offer.offer_id,
  guest_name: "Platform Mode Check",
  guest_email: "platform-mode-check@example.com",
  guest_phone: "+1 212 555 0199",
  party_size: 2,
  reservation_date: offer.offer_date,
  reservation_time: offer.start_time || offer.offer_time,
  notes: "Automated BASIC mode reservation flow check.",
  lang: "en"
});
assert(reservationPayload.reservation?.status === "pending", "BASIC guest reservation request must create a pending reservation.");
const afterReservationSnapshot = await adminDataSnapshot(adminHeaders);
assert(afterReservationSnapshot.restaurants === baselineSnapshot.restaurants, "BASIC reservation flow must not alter restaurant records.");
assert(afterReservationSnapshot.offers === baselineSnapshot.offers, "BASIC reservation flow must not alter offer records.");
assert(afterReservationSnapshot.reservations >= baselineSnapshot.reservations + 1, "BASIC reservation flow must add one reservation lead.");

const partnerLogin = await api("POST", "/auth/login", { email: "owner@hudsonhearth.com", password: "restaurant123" });
assert(partnerLogin.access_token, "Partner login is required to verify platform mode permissions.");
const forbidden = await apiRaw("PATCH", "/admin/settings/platform-mode", { platform_mode: "ai_concierge", ai_demo_visibility: true }, { authorization: `Bearer ${partnerLogin.access_token}` });
assert(forbidden.status === 403, "Non-super-admin users must not be able to change platform mode.");

const switchedToAiNoDemo = await api("PATCH", "/admin/settings/platform-mode", { platform_mode: "ai_concierge", ai_demo_visibility: false, show_ai_mode_badge: true }, adminHeaders);
assert(switchedToAiNoDemo.platform_mode === "ai_concierge", "Super Admin must be able to switch to AI Concierge mode with demo features off.");
const aiNoDemoConfig = await api("GET", "/public/config");
assert(aiNoDemoConfig.platform_mode === "ai_concierge", "AI Concierge mode must persist immediately after switching.");
assert(aiNoDemoConfig.ai_demo_visibility === false, "Demo features must remain off until AI Demo Visibility is enabled.");
assert(canShowFromRegistry(aiNoDemoConfig.feature_registry, "ai.adminAIControls", { platformMode: "ai_concierge", aiDemoVisibility: false, audience: "admin" }) === true, "Working AI admin controls must remain available in AI_CONCIERGE mode.");
assert(canShowFromRegistry(aiNoDemoConfig.feature_registry, "ai.concierge", { platformMode: "ai_concierge", aiDemoVisibility: false, audience: "guest" }) === false, "Demo guest AI Concierge must stay hidden when AI Demo Visibility is off.");

const switchedToAi = await api("PATCH", "/admin/settings/platform-mode", { platform_mode: "ai_concierge", ai_demo_visibility: true, show_ai_mode_badge: true }, adminHeaders);
assert(switchedToAi.platform_mode === "ai_concierge", "Admin must be able to switch to AI Concierge mode.");
assert(switchedToAi.ai_demo_visibility === true, "Super Admin must be able to enable AI Demo Visibility.");
const aiConfig = await api("GET", "/public/config");
assert(aiConfig.platform_mode === "ai_concierge", "AI Concierge mode must become visible through public config after switching.");
assert(aiConfig.ai_demo_visibility === true, "AI Demo Visibility must become visible through public config after switching.");
assert(canShowFromRegistry(aiConfig.feature_registry, "ai.concierge", { platformMode: "ai_concierge", aiDemoVisibility: true, audience: "guest" }) === true, "AI Concierge navigation may appear in AI_CONCIERGE mode when demo visibility is enabled.");
assert(canShowFromRegistry(aiConfig.feature_registry, "ai.partnerDemand", { platformMode: "ai_concierge", aiDemoVisibility: true, audience: "partner" }) === true, "Partner AI Demand may appear in AI_CONCIERGE mode when demo visibility is enabled.");
assert(canShowFromRegistry(aiConfig.feature_registry, "ai.adminAIControls", { platformMode: "ai_concierge", aiDemoVisibility: true, audience: "admin" }) === true, "Working AI admin controls must appear in AI_CONCIERGE mode.");

const persistedAiSettings = JSON.parse(await readFile(new URL("../data/app-settings.json", import.meta.url), "utf8"));
assert(persistedAiSettings.platform_mode === "ai_concierge", "Platform mode must be persisted to durable app settings.");
assert(persistedAiSettings.ai_demo_visibility === true, "AI Demo Visibility must be persisted to durable app settings.");

const notifications = await api("GET", "/admin/notifications", {}, adminHeaders);
assert((notifications.notifications || []).some((item) => item.type === "platform_settings_changed" && String(item.message || "").includes("AI Concierge")), "Platform mode switch must create an admin notification.");
const monitoring = await api("GET", "/admin/errors", {}, adminHeaders);
assert((monitoring.app_errors || []).some((item) => item.area === "audit" && item.details?.action === "platform_settings_changed" && item.details?.metadata?.platform_settings?.platform_mode === "ai_concierge"), "Platform mode switch must be recorded in the activity/audit log.");

const afterSwitchSnapshot = await adminDataSnapshot(adminHeaders);
assert(afterSwitchSnapshot.restaurants === afterReservationSnapshot.restaurants, "Switching platform mode must not delete restaurants.");
assert(afterSwitchSnapshot.offers === afterReservationSnapshot.offers, "Switching platform mode must not delete offers.");
assert(afterSwitchSnapshot.reservations === afterReservationSnapshot.reservations, "Switching platform mode must not delete reservations.");

const switchedToBasic = await api("PATCH", "/admin/settings/platform-mode", { platform_mode: "basic", ai_demo_visibility: false, show_ai_mode_badge: true }, adminHeaders);
assert(switchedToBasic.platform_mode === "basic", "Admin must be able to switch back to Basic mode.");
const finalConfig = await api("GET", "/public/config");
assert(finalConfig.platform_mode === "basic", "Switching back to BASIC must update public config immediately.");
assert(canShowFromRegistry(finalConfig.feature_registry, "ai.concierge", { platformMode: "basic", aiDemoVisibility: false, audience: "guest" }) === false, "Returning to BASIC must hide guest AI Concierge.");
assert(canShowFromRegistry(finalConfig.feature_registry, "ai.partnerDemand", { platformMode: "basic", aiDemoVisibility: false, audience: "partner" }) === false, "Returning to BASIC must hide Partner AI Demand.");
const persistedBasicSettings = JSON.parse(await readFile(new URL("../data/app-settings.json", import.meta.url), "utf8"));
assert(persistedBasicSettings.platform_mode === "basic", "Final BASIC mode must be persisted to durable app settings.");

console.log("Platform mode checks passed.");
