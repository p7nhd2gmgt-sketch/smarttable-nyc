import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("public/app.js");
const css = read("public/styles.css");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceForFunction(name) {
  const start = app.indexOf(`function ${name}`);
  assert(start >= 0, `${name} must exist.`);
  const next = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, next > start ? next : undefined);
}

function sourceBetween(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  assert(start >= 0, `${startMarker} must exist.`);
  const end = app.indexOf(endMarker, start + startMarker.length);
  assert(end > start, `${endMarker} must exist after ${startMarker}.`);
  return app.slice(start, end);
}

const statCardSource = sourceForFunction("statCard");
for (const expected of ["data-kpi-card", "stat-card__label", "stat-card__value", "stat-card__description", "aria-label"]) {
  assert(statCardSource.includes(expected), `statCard must render ${expected}.`);
}
const visibleTranslationSource = sourceForFunction("visibleTranslation");
assert(visibleTranslationSource.includes("!value.trim()"), "visibleTranslation must reject blank KPI translation values.");
const kpiStatCardSource = sourceForFunction("kpiStatCard");
assert(kpiStatCardSource.includes("visibleTranslation(labelKey"), "kpiStatCard must use visibleTranslation for labels.");
assert(kpiStatCardSource.includes("visibleTranslation(descriptionKey"), "kpiStatCard must use visibleTranslation for descriptions.");

for (const expected of [".stat-card__label", ".stat-card__value", ".stat-card__description"]) {
  assert(css.includes(expected), `${expected} styles must exist.`);
}
assert(/min-height:\s*138px/.test(css), "KPI cards must have enough height for label, value, and description.");

const partnerOverview = sourceBetween("function basicPartnerOverviewPanel", "function analyticsFormatValue");
for (const expected of [
  "partner_kpi_today_reservations",
  "partner_kpi_today_reservations_desc",
  "partner_kpi_active_offers",
  "partner_kpi_active_offers_desc",
  "partner_kpi_pending_requests",
  "partner_kpi_pending_requests_desc",
  "partner_kpi_today_guests",
  "partner_kpi_today_guests_desc",
  "partner_kpi_confirmed_reservations",
  "partner_kpi_confirmed_reservations_desc",
  "partner_kpi_declined_or_cancelled",
  "partner_kpi_declined_or_cancelled_desc"
]) {
  assert(partnerOverview.includes(expected), `Partner marketplace overview must include ${expected}.`);
}

const reservationLeads = sourceForFunction("partnerTodayReservationLeadsPanel");
for (const expected of [
  "partner_kpi_pending_requests",
  "partner_kpi_pending_requests_desc",
  "partner_leads_total_requests",
  "partner_leads_total_requests_desc"
]) {
  assert(reservationLeads.includes(expected), `Reservation leads KPI summary must include ${expected}.`);
}

const partnerKpis = sourceForFunction("partnerKpiCards");
for (const expected of [
  "partner_kpi_profile_views",
  "partner_kpi_total_reservations",
  "partner_kpi_confirmed_reservations",
  "partner_kpi_declined_requests",
  "partner_kpi_favorites",
  "partner_kpi_conversion",
  "partner_kpi_revenue_recovered",
  "partner_kpi_active_offers"
]) {
  assert(partnerKpis.includes(expected), `Partner KPI cards must include ${expected}.`);
}

const adminStatsStart = app.indexOf('id="admin-stats"');
assert(adminStatsStart >= 0, "Admin stats grid must exist.");
const adminStatsSource = app.slice(adminStatsStart, adminStatsStart + 5000);
for (const expected of [
  "admin_kpi_total_restaurants",
  "admin_kpi_total_restaurants_desc",
  "admin_kpi_pending_approvals",
  "admin_kpi_pending_approvals_desc",
  "admin_kpi_partner_accounts",
  "admin_kpi_partner_accounts_desc",
  "admin_kpi_active_offers",
  "admin_kpi_active_offers_desc",
  "admin_kpi_total_reservations",
  "admin_kpi_total_reservations_desc",
  "admin_kpi_profile_views",
  "admin_kpi_profile_views_desc",
  "admin_kpi_favorites",
  "admin_kpi_favorites_desc",
  "admin_kpi_favorites_week",
  "admin_kpi_favorites_week_desc",
  "admin_kpi_favorites_month",
  "admin_kpi_favorites_month_desc"
]) {
  assert(adminStatsSource.includes(expected), `Admin KPI cards must include ${expected}.`);
}
assert(!adminStatsSource.includes('statCard("Restaurants"'), "Admin stats must not use hard-coded English labels.");

const requiredLocaleKeys = [
  "partner_kpi_profile_views",
  "partner_kpi_profile_views_desc",
  "partner_kpi_total_reservations",
  "partner_kpi_total_reservations_desc",
  "partner_kpi_today_reservations",
  "partner_kpi_today_reservations_desc",
  "partner_kpi_pending_requests",
  "partner_kpi_pending_requests_desc",
  "partner_kpi_today_guests",
  "partner_kpi_today_guests_desc",
  "partner_kpi_confirmed_reservations",
  "partner_kpi_confirmed_reservations_desc",
  "partner_kpi_declined_requests",
  "partner_kpi_declined_requests_desc",
  "partner_kpi_declined_or_cancelled",
  "partner_kpi_declined_or_cancelled_desc",
  "partner_kpi_favorites",
  "partner_kpi_favorites_desc",
  "partner_kpi_favorites_week",
  "partner_kpi_favorites_week_desc",
  "partner_kpi_favorites_month",
  "partner_kpi_favorites_month_desc",
  "partner_kpi_conversion",
  "partner_kpi_conversion_desc",
  "partner_kpi_revenue_recovered",
  "partner_kpi_revenue_recovered_desc",
  "partner_kpi_active_offers",
  "partner_kpi_active_offers_desc",
  "partner_leads_total_requests",
  "partner_leads_total_requests_desc",
  "admin_kpi_total_restaurants",
  "admin_kpi_total_restaurants_desc",
  "admin_kpi_pending_approvals",
  "admin_kpi_pending_approvals_desc",
  "admin_kpi_partner_accounts",
  "admin_kpi_partner_accounts_desc",
  "admin_kpi_active_offers",
  "admin_kpi_active_offers_desc",
  "admin_kpi_total_reservations",
  "admin_kpi_total_reservations_desc",
  "admin_kpi_profile_views",
  "admin_kpi_profile_views_desc",
  "admin_kpi_favorites",
  "admin_kpi_favorites_desc",
  "admin_kpi_favorites_week",
  "admin_kpi_favorites_week_desc",
  "admin_kpi_favorites_month",
  "admin_kpi_favorites_month_desc"
];

for (const locale of ["en", "es", "hu"]) {
  const messages = JSON.parse(read(`public/locales/${locale}.json`));
  for (const key of requiredLocaleKeys) {
    assert(typeof messages[key] === "string" && messages[key].trim(), `${locale}.json missing ${key}.`);
  }
}

console.log("Dashboard KPI label checks passed.");
