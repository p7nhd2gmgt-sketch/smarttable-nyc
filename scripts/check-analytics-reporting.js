import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";
process.env.BILLING_ENFORCEMENT_MODE = "off";

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [serverSource, publicApp, en, es, hu, packageJson] = await Promise.all([
  read("src/app-core.js"),
  read("public/app.js"),
  read("public/locales/en.json").then(JSON.parse),
  read("public/locales/es.json").then(JSON.parse),
  read("public/locales/hu.json").then(JSON.parse),
  read("package.json").then(JSON.parse)
]);

const { handleApiRequest } = await import(`../src/app-core.js?analytics-reporting=${Date.now()}`);

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

function authHeaders(accessToken) {
  return { authorization: `Bearer ${accessToken}` };
}

async function loginAs(account, expectedRole) {
  const result = await api("POST", "/auth/login", {
    email: account.email,
    password: account.password
  });
  assert.ok(result.access_token, `${expectedRole} must receive an access token.`);
  assert.equal(result.profile.role, expectedRole, `${expectedRole} login must return the expected role.`);
  return {
    profile: result.profile,
    headers: authHeaders(result.access_token)
  };
}

function uniqueEmail(prefix = "analytics") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
}

function futureDate(days = 1) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function weekdayForDate(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

function signupPayload(index = 0) {
  return {
    first_name: "Analytics",
    last_name: `Guest ${index}`,
    email: uniqueEmail(`analytics-guest-${index}`),
    password: "Strong!12345",
    confirm_password: "Strong!12345",
    phone: "+1 212 555 0199",
    city: "New York",
    region: "NY",
    postal_code: "10014",
    preferred_neighborhoods: ["West Village", "SoHo"],
    travel_distance_miles: "5",
    transportation_method: "Walking",
    transportation_methods: ["Walking", "Public transportation"],
    cuisines: ["American"],
    food_categories: ["Dinner"],
    dietary_needs: ["No restrictions"],
    drink_preferences: ["Wine"],
    dining_experiences: ["Casual dining"],
    companions: ["Partner"],
    party_size: "2",
    preferred_days: ["Friday"],
    preferred_time_windows: ["Dinner"],
    booking_lead_time: "1-2 days",
    dining_duration: "60-90 minutes",
    discovery_preference: "A balance of both",
    selection_priorities: ["Food quality", "Discount"],
    new_restaurant_recommendations: "Yes",
    new_menu_item_recommendations: "No",
    excluded_categories: ["No exclusions"],
    spending_range: "$35-$50",
    discount_levels: ["20%"],
    consider_no_discount_match: "Sometimes",
    notification_preferences: ["Reservation status updates"],
    notification_channels: ["Email"],
    notification_frequency: "Immediately",
    event_recommendations_interest: "No",
    future_calendar_interest: "No",
    transactional_email_consent: true,
    sms_consent: false,
    marketing_consent: false,
    allergy_acknowledgement: false,
    privacy_consent: true,
    terms_consent: true,
    preferred_language: "en"
  };
}

async function createGuest(index = 0) {
  const payload = signupPayload(index);
  const result = await api("POST", "/auth/signup-guest", payload);
  return {
    payload,
    profile: result.profile,
    headers: authHeaders(result.access_token)
  };
}

async function assertStatus(method, path, status, body = {}, headers = {}, message = "") {
  const response = await rawApi(method, path, body, headers);
  assert.equal(response.status, status, `${message || `${method} ${path}`} expected ${status}, received ${response.status}.`);
  return response;
}

function assertNoGuestPii(value, label) {
  const text = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? Buffer.from(value).toString("utf8")
    : JSON.stringify(value);
  assert.ok(!/@example\.(test|com)/i.test(text), `${label} must not expose guest email addresses.`);
  assert.ok(!/\+1\s*212\s*555/i.test(text), `${label} must not expose guest phone numbers.`);
  assert.ok(!/Strong!12345|password|confirm_password/i.test(text), `${label} must not expose passwords or password fields.`);
}

function responseBodyBuffer(response) {
  const body = response.body;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8");
}

function assertChartArray(analytics, key) {
  assert.ok(Array.isArray(analytics.charts?.[key]), `Analytics chart ${key} must be an array.`);
}

async function assertStaticContracts() {
  for (const token of [
    "async function partnerAnalytics",
    "async function adminAnalytics",
    "buildRestaurantAnalytics",
    "buildRuleBasedRestaurantRecommendations",
    "analyticsExportResponse",
    "writeXlsxFile",
    "filterAnalyticsRowsForQuery",
    "restaurantMatchesAdminAnalyticsFilters",
    "loadRestaurantAnalyticsRowsByRestaurant",
    "paginateAnalyticsOffers",
    "Revenue is not tracked in SmartTable BASIC",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv"
  ]) {
    assert(serverSource.includes(token), `Server analytics implementation is missing ${token}.`);
  }

  const partnerRouteStart = serverSource.indexOf("async function partnerAnalytics");
  const adminRouteStart = serverSource.indexOf("async function adminAnalytics");
  const analyticsRouteSource = serverSource.slice(partnerRouteStart, serverSource.indexOf("function safeFileName", partnerRouteStart));
  const adminRouteSource = serverSource.slice(adminRouteStart, serverSource.indexOf("function safeFileName", adminRouteStart));
  assert(analyticsRouteSource.includes('requireProfile(headers, ["partner", "admin"])'), "Partner analytics must require partner/admin authentication.");
  assert(analyticsRouteSource.includes('requireProfile(headers, ["admin"])'), "Admin analytics must require admin authentication.");
  assert(analyticsRouteSource.includes("getPartnerRestaurant(profile, query)"), "Partner analytics must resolve restaurant access server-side.");
  assert(analyticsRouteSource.includes("analyticsExportResponse"), "Exports must be generated by the authenticated server endpoint.");
  assert(adminRouteSource.includes("loadRestaurantAnalyticsRowsByRestaurant(restaurants || [])"), "Admin analytics must use bulk restaurant analytics loading.");
  assert(!/restaurants\s*\|\|\s*\[\]\)\.map\(async/.test(adminRouteSource), "Admin analytics must avoid per-restaurant async query bundles.");
  assert(adminRouteStart > partnerRouteStart, "Admin analytics function should be present after partner analytics helpers.");

  const exportStart = serverSource.indexOf("function analyticsMetricExportLabel");
  assert(exportStart >= 0, "Analytics export helper block must be present.");
  const exportSource = serverSource.slice(exportStart, serverSource.indexOf("async function partnerAnalytics", exportStart));
  for (const forbidden of ["STRIPE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "TWILIO_AUTH_TOKEN"]) {
    assert(!exportSource.includes(forbidden), `Analytics export code must not reference protected secret ${forbidden}.`);
  }

  for (const token of [
    "partnerAnalyticsPanel",
    "adminAnalyticsPanel",
    "analyticsHealthScorePanel",
    "analyticsRecommendationsPanel",
    "partnerAnalyticsFiltersPanel",
    "adminAnalyticsFiltersPanel",
    "downloadAnalyticsReport",
    "offerAnalyticsTable(analytics.offer_analytics || [], analytics.offer_pagination || {})",
    "data-analytics-page",
    "sessionAuthHeaders(currentSession())",
    'api(`/partner/analytics${queryStringFromFilters(state.partnerAnalyticsFilters)}`)',
    'api(`/admin/analytics${queryStringFromFilters(analyticsFilters)}`)',
    "partner_nav_analytics",
    "admin_nav_analytics"
  ]) {
    assert(publicApp.includes(token), `Analytics UI is missing ${token}.`);
  }

  const partnerPanelStart = publicApp.indexOf("function partnerAnalyticsPanel");
  const partnerPanelEnd = publicApp.indexOf("function adminAnalyticsPanel", partnerPanelStart);
  const partnerPanel = publicApp.slice(partnerPanelStart, partnerPanelEnd);
  const offerTableStart = publicApp.indexOf("function offerAnalyticsTable");
  const offerTableEnd = publicApp.indexOf("function analyticsHealthScorePanel", offerTableStart);
  const offerTable = publicApp.slice(offerTableStart, offerTableEnd);
  const adminPanelStart = publicApp.indexOf("function adminAnalyticsPanel");
  const adminPanelEnd = publicApp.indexOf("function bindAnalyticsControls", adminPanelStart);
  const adminPanel = publicApp.slice(adminPanelStart, adminPanelEnd);
  assert(partnerPanel.includes("offerAnalyticsTable"), "Partner analytics must display offer analytics.");
  assert(!offerTable.includes("analytics_revenue_placeholder") && !offerTable.includes("revenue_placeholder"), "BASIC offer analytics must not display placeholder revenue columns.");
  assert(adminPanel.includes("isBasicMode()") && adminPanel.includes("revenue_placeholder"), "Admin analytics must gate future revenue placeholders outside BASIC.");
  assert(!adminPanel.includes("analytics_revenue_placeholder"), "BASIC admin analytics must not render a placeholder revenue label directly.");
  assert(!/SmartTable AI|AI Demand|aiDemand|estimated_revenue_recovered/.test(partnerPanel), "BASIC analytics panel must not surface AI or fake recovered revenue claims.");
  assert(partnerPanel.includes("analyticsRecommendationsPanel") && publicApp.includes("analytics_rule_based_label"), "Recommendations must be clearly labeled rule-based.");

  const requiredLocaleKeys = [
    "partner_nav_analytics",
    "admin_nav_analytics",
    "partner_analytics_title",
    "admin_analytics_title",
    "superadmin_analytics_title",
    "analytics_todays_reservations",
    "analytics_total_reservations",
    "analytics_reservation_conversion_rate",
    "analytics_average_booking_lead_time",
    "analytics_filter_date",
    "analytics_filter_from",
    "analytics_filter_to",
    "analytics_export_csv",
    "analytics_export_excel",
    "analytics_export_pdf",
    "analytics_export_invalid_response",
    "analytics_export_empty_file",
    "analytics_offer_pagination_label",
    "analytics_page_status",
    "pagination_previous",
    "pagination_next",
    "analytics_health_title",
    "analytics_recommendations_title",
    "analytics_rule_based_label",
    "analytics_reservations_by_city",
    "analytics_largest_cities"
  ];

  for (const [locale, messages] of Object.entries({ en, es, hu })) {
    for (const key of requiredLocaleKeys) {
      assert(typeof messages[key] === "string" && messages[key].trim(), `${locale}.json must define ${key}.`);
    }
  }

  assert(packageJson.scripts["check:analytics"] === "node scripts/check-analytics-reporting.js", "package.json must expose check:analytics.");
  assert(packageJson.scripts["check:analytics-reporting"] === "node scripts/check-analytics-reporting.js", "package.json must keep the compatibility analytics-reporting check.");
}

async function assertRuntimeAnalytics() {
  const guest = await loginAs(TEST_ACCOUNTS.guest, "guest");
  const partner = await loginAs(TEST_ACCOUNTS.partner, "partner");
  const admin = await loginAs(TEST_ACCOUNTS.admin, "admin");
  const superadmin = await loginAs(TEST_ACCOUNTS.superadmin, "super_admin");
  const partnerProfile = await api("GET", "/partner/profile", {}, partner.headers);
  const restaurantId = partnerProfile.restaurant.id;
  const offerDate = futureDate(2);
  const rangeQuery = `date_range=custom&from=${encodeURIComponent(futureDate(0))}&to=${encodeURIComponent(futureDate(5))}`;
  const bulkOffer = await api("POST", "/partner/offers", {
    title_en: "=HYPERLINK(\"https://evil.test\",\"Analytics regression dinner\")",
    description_en: "High-capacity offer for analytics reporting checks.",
    offer_date: offerDate,
    start_time: "19:00",
    end_time: "21:00",
    discount_type: "percent",
    discount_value: 20,
    available_tables: 40,
    reserved_tables: 0,
    min_party_size: 2,
    max_party_size: 8,
    status: "active",
    valid_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  }, partner.headers);
  const offerId = bulkOffer.offer.id;
  const datasetSize = 26;
  const createdReservations = [];
  for (let index = 0; index < datasetSize; index += 1) {
    const analyticsGuest = await createGuest(index);
    const result = await api("POST", "/reservations", {
      offer_id: offerId,
      reservation_date: offerDate,
      reservation_time: "19:00",
      party_size: 2 + (index % 4),
      notes: "Analytics reporting regression reservation.",
      guest_name: analyticsGuest.profile.full_name,
      guest_email: analyticsGuest.profile.email,
      guest_phone: analyticsGuest.payload.phone,
      guest_language: "en"
    }, analyticsGuest.headers);
    createdReservations.push(result.reservation);
  }
  for (const reservation of createdReservations.slice(0, 6)) {
    await api("PATCH", "/partner/reservations", {
      id: reservation.reservation_id,
      status: "accepted"
    }, partner.headers);
  }

  await assertStatus("GET", "/partner/analytics", 401, {}, {}, "Anonymous users must not access partner analytics.");
  await assertStatus("GET", "/partner/analytics", 403, {}, guest.headers, "Guests must not access partner analytics.");
  await assertStatus("GET", "/partner/analytics?restaurant_id=10000000-0000-4000-8000-000000000002", 403, {}, partner.headers, "Partners must not view another restaurant's analytics.");
  await assertStatus("GET", "/admin/analytics", 401, {}, {}, "Anonymous users must not access admin analytics.");
  await assertStatus("GET", "/admin/analytics", 403, {}, guest.headers, "Guests must not access admin analytics.");
  await assertStatus("GET", "/admin/analytics", 403, {}, partner.headers, "Partners must not access admin analytics.");

  const analytics = (await api("GET", `/partner/analytics?${rangeQuery}&offer_id=${encodeURIComponent(offerId)}&offer_page_size=10`, {}, partner.headers)).analytics;
  assert.equal(analytics.privacy, "aggregate_only_no_guest_pii", "Partner analytics must be explicitly aggregate-only.");
  assert.equal(analytics.restaurant_id, restaurantId, "Partner analytics must be scoped to the assigned restaurant.");
  assert.equal(analytics.cards.total_reservations, datasetSize, "Partner analytics must count the generated large dataset.");
  assert.equal(analytics.offer_pagination.page_size, 10, "Partner analytics must honor offer analytics page size.");
  assert.ok(analytics.offer_pagination.total >= 1, "Partner analytics must return offer pagination totals.");
  for (const key of [
    "daily_reservations",
    "weekly_reservations",
    "monthly_reservations",
    "offer_performance",
    "top_performing_offers",
    "reservation_heatmap",
    "reservation_hour_distribution",
    "reservation_day_distribution",
    "profile_views",
    "favorites_trend",
    "returning_guest_trend"
  ]) {
    assertChartArray(analytics, key);
  }
  assert.ok(analytics.charts.daily_reservations.some((row) => row.date === offerDate && row.count === datasetSize), "Daily reservations chart must aggregate the large dataset.");
  assert.ok(analytics.charts.reservation_hour_distribution.some((row) => Number(row.hour) === 19 && row.count === datasetSize), "Hour distribution must aggregate the selected hour.");
  assert.ok(analytics.charts.reservation_day_distribution.some((row) => Number(row.day) === weekdayForDate(offerDate) && row.count === datasetSize), "Day distribution must aggregate the selected weekday.");
  assert.ok(analytics.health_score.score >= 0 && analytics.health_score.score <= 100, "Health Score must stay within 0-100.");
  assert.ok(["A+", "A", "B", "C", "D", "E"].includes(analytics.health_score.grade), "Health Score must expose a valid grade.");
  assert.ok((analytics.health_score.components || []).some((component) => component.key === "profile_completeness"), "Health Score must include profile completeness.");
  assert.ok((analytics.recommendations || []).length > 0, "Rule-based recommendations must be returned.");
  assert.ok(analytics.recommendations.every((item) => item.source === "rules"), "Recommendations must be rule-based, not AI.");
  assertNoGuestPii(analytics, "Partner analytics");

  const acceptedAnalytics = (await api("GET", `/partner/analytics?${rangeQuery}&offer_id=${encodeURIComponent(offerId)}&reservation_status=accepted`, {}, partner.headers)).analytics;
  assert.equal(acceptedAnalytics.cards.total_reservations, 6, "Reservation status filter must be applied server-side.");
  const partySizeAnalytics = (await api("GET", `/partner/analytics?${rangeQuery}&offer_id=${encodeURIComponent(offerId)}&party_size=4`, {}, partner.headers)).analytics;
  assert.equal(partySizeAnalytics.cards.total_reservations, createdReservations.filter((row) => Number(row.party_size) === 4).length, "Party-size filter must be applied server-side.");
  const hourAnalytics = (await api("GET", `/partner/analytics?${rangeQuery}&offer_id=${encodeURIComponent(offerId)}&hour=19`, {}, partner.headers)).analytics;
  assert.equal(hourAnalytics.cards.total_reservations, datasetSize, "Hour filter must be applied server-side.");

  const csvResponse = await rawApi("GET", `/partner/analytics/export?${rangeQuery}&offer_id=${encodeURIComponent(offerId)}&format=csv&hour=19&weekday=${weekdayForDate(offerDate)}&party_size=4`, {}, partner.headers);
  assert.equal(csvResponse.status, 200, "CSV export must succeed.");
  assert.ok(String(csvResponse.headers?.["content-type"] || "").includes("text/csv"), "CSV export must return text/csv.");
  assert.ok(/attachment; filename="smarttable-.*-analytics-\d{4}-\d{2}-\d{2}\.csv"/.test(String(csvResponse.headers?.["content-disposition"] || "")), "CSV export must use a safe attachment filename.");
  const csvBuffer = responseBodyBuffer(csvResponse);
  assert.equal(csvBuffer.subarray(0, 3).toString("hex"), "efbbbf", "CSV export must include a UTF-8 BOM.");
  const csvText = csvBuffer.toString("utf8");
  assert.ok(csvText.includes("\"Section\",\"Name\",\"Value\",\"Details\""), "CSV export must include readable headers.");
  assert.ok(csvText.includes("Reservations"), "CSV export must include reservations rows.");
  assert.ok(csvText.includes("Party size: 4"), "CSV export must include the selected party-size filtered data.");
  assert.ok(!csvText.includes(",\"=HYPERLINK"), "CSV export must not include unescaped formula content.");
  assert.ok(csvText.includes("'=HYPERLINK"), "CSV export must prefix formula-like text values.");
  assertNoGuestPii(csvBuffer, "CSV export");

  const excelResponse = await rawApi("GET", `/partner/analytics/export?${rangeQuery}&offer_id=${encodeURIComponent(offerId)}&format=xlsx`, {}, partner.headers);
  assert.equal(excelResponse.status, 200, "XLSX export must succeed.");
  assert.ok(String(excelResponse.headers?.["content-type"] || "").includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "XLSX export must return a real workbook MIME type.");
  assert.ok(/\.xlsx"/.test(String(excelResponse.headers?.["content-disposition"] || "")), "XLSX export filename must end in .xlsx.");
  const excelBuffer = responseBodyBuffer(excelResponse);
  assert.equal(excelBuffer.subarray(0, 2).toString("utf8"), "PK", "XLSX export must be a zip-based workbook.");
  const workbookZip = await JSZip.loadAsync(excelBuffer);
  const workbookXml = await workbookZip.file("xl/workbook.xml")?.async("string");
  assert.ok(workbookXml?.includes("Summary") && workbookXml.includes("Reservations") && workbookXml.includes("Offers") && workbookXml.includes("Daily analytics"), "XLSX export must include all required sheets.");
  assertNoGuestPii(excelBuffer, "XLSX export");

  const pdfResponse = await rawApi("GET", `/partner/analytics/export?${rangeQuery}&offer_id=${encodeURIComponent(offerId)}&format=pdf`, {}, partner.headers);
  assert.equal(pdfResponse.status, 200, "PDF export must succeed.");
  assert.ok(String(pdfResponse.headers?.["content-type"] || "").includes("application/pdf"), "PDF export must return application/pdf.");
  const pdfBuffer = responseBodyBuffer(pdfResponse);
  assert.ok(pdfBuffer.length > 500, "PDF export must not be empty.");
  assert.equal(pdfBuffer.subarray(0, 5).toString("utf8"), "%PDF-", "PDF export must start with a PDF signature.");
  assertNoGuestPii(pdfBuffer, "PDF export");

  const emptyCsvResponse = await rawApi("GET", "/partner/analytics/export?date_range=custom&from=2099-01-01&to=2099-01-02&format=csv", {}, partner.headers);
  assert.equal(emptyCsvResponse.status, 200, "Empty-result CSV export must still succeed.");
  assert.ok(responseBodyBuffer(emptyCsvResponse).toString("utf8").includes("No data for selected filters"), "Empty-result export must include a clear no-data message.");

  const adminAnalytics = (await api("GET", `/admin/analytics?${rangeQuery}&restaurant_id=${encodeURIComponent(restaurantId)}&offer_id=${encodeURIComponent(offerId)}`, {}, admin.headers)).analytics;
  assert.equal(adminAnalytics.cards.total_reservations, datasetSize, "Admin analytics must include authorized restaurant analytics.");
  assert.equal(adminAnalytics.platform, null, "Regular admin analytics must not include superadmin platform analytics.");
  assertNoGuestPii(adminAnalytics, "Admin analytics");

  const superadminAnalytics = await api("GET", `/admin/analytics?scope=superadmin&${rangeQuery}`, {}, superadmin.headers);
  assert.equal(superadminAnalytics.scope, "superadmin", "Superadmin analytics must expose superadmin scope only to superadmins.");
  assert.ok(superadminAnalytics.analytics.platform, "Superadmin analytics must include global platform rollups.");
  assert.ok(Array.isArray(superadminAnalytics.analytics.platform.top_restaurants), "Superadmin analytics must include top restaurants.");
  assertNoGuestPii(superadminAnalytics.analytics, "Superadmin analytics");
}

await assertStaticContracts();
await assertRuntimeAnalytics();

console.log("Analytics reporting checks passed.");
