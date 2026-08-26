#!/usr/bin/env node
import { chromium } from "@playwright/test";
import {
  ACCOUNT_SPECS,
  accountEmail,
  accountPassword,
  assert,
  assertProductionTarget,
  hasColumn,
  loadPostgrestSchema,
  loadProductionLocalEnv,
  parseArgs,
  restDelete,
  restSelect,
  tableExists
} from "./production-test-accounts-common.mjs";

const CHILD_TABLES = [
  "restaurant_service_capacity_overrides",
  "restaurant_tables",
  "restaurant_dining_areas",
  "restaurant_images",
  "restaurant_social_links",
  "restaurant_hours",
  "restaurant_hour_exceptions",
  "restaurant_service_periods",
  "restaurant_reservation_settings",
  "restaurant_status_history",
  "restaurant_users",
  "partner_invitations",
  "offers",
  "reservations"
];

function envFlagEnabled(value = "") {
  return String(value || "").trim().toLowerCase() === "true";
}

function isoStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function qaRestaurantPayload() {
  const stamp = isoStamp();
  return {
    name: `SmartTable QA Admin Visibility ${stamp}`,
    slug: `smarttable-qa-admin-visibility-${stamp.toLowerCase()}`,
    email: `qa-admin-visibility+${stamp}@smarttable.com`,
    address: "404 QA Visibility Way",
    city: "New York",
    country: "US",
    district: "Manhattan",
    cuisine_type: "Modern American",
    short_description: "Temporary production QA record for admin restaurant list verification.",
    full_description: "Temporary production QA record created through the SmartTable Admin UI and removed by the verifier.",
    status: "draft"
  };
}

function safeRestaurantSummary(row = {}, schema = null) {
  const has = (column) => !schema || hasColumn(schema, "restaurants", column);
  return {
    id: row.id || null,
    name: row.name || null,
    slug: has("slug") ? row.slug || null : "column_absent",
    status: row.status || null,
    lifecycle_status: row.lifecycle_status || row.onboarding_status || null,
    approval_status: row.approval_status || row.status || null,
    city: row.city || null,
    country: row.country || null,
    restaurant_type: row.restaurant_type || row.type || null,
    visible_on_guest_site: has("visible_on_guest_site") ? row.visible_on_guest_site === true : "column_absent",
    is_test_data: has("is_test_data") ? row.is_test_data === true : "column_absent",
    is_test_restaurant: has("is_test_restaurant") ? row.is_test_restaurant === true : "column_absent",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

async function loginAsAdmin(page, env) {
  const admin = ACCOUNT_SPECS.find((spec) => spec.key === "admin");
  assert(admin, "Production admin account spec is missing.");
  assert(accountPassword(env, admin), `${admin.passwordEnv} is required.`);

  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const form = page.locator("form").filter({ has: page.locator('input[name="email"]') }).first();
  await form.locator('input[name="email"]').waitFor({ timeout: 20_000 });
  await form.locator('input[name="email"]').fill(accountEmail(admin));
  await form.locator('input[name="password"]').fill(accountPassword(env, admin));
  const authResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === "POST" && /\/api\/auth\/login(?:\?|$)|\/auth\/v1\/token/.test(response.url());
  }, { timeout: 30_000 });
  await Promise.all([
    form.locator('button[type="submit"]').click(),
    authResponsePromise
  ]);
  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
    try {
      const session = raw ? JSON.parse(raw) : null;
      return session?.access_token && ["admin", "super_admin"].includes(session?.profile?.role);
    } catch {
      return false;
    }
  }, null, { timeout: 30_000 });
}

async function clearBrowserStateOnce(context, page) {
  await context.clearCookies().catch(() => null);
  await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.caches?.keys?.().then((keys) => keys.forEach((key) => window.caches.delete(key))).catch(() => null);
    window.navigator.serviceWorker?.getRegistrations?.().then((registrations) => registrations.forEach((registration) => registration.unregister())).catch(() => null);
  }).catch(() => null);
}

async function adminRestaurantsViaBrowserApi(page) {
  return page.evaluate(async () => {
    const raw = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
    let accessToken = "";
    try {
      accessToken = JSON.parse(raw)?.access_token || "";
    } catch {
      accessToken = "";
    }
    const response = await fetch("/api/admin/restaurants", {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`
      }
    });
    const body = await response.json().catch(() => ({}));
    return {
      status: response.status,
      count: Array.isArray(body.restaurants) ? body.restaurants.length : 0,
      restaurants: (body.restaurants || []).map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        status: restaurant.status,
        lifecycle_status: restaurant.lifecycle_status || restaurant.onboarding_status || null,
        city: restaurant.city || null,
        country: restaurant.country || null,
        is_test_data: restaurant.is_test_data === true,
        is_test_restaurant: restaurant.is_test_restaurant === true
      }))
    };
  });
}

async function adminFilterState(page) {
  return page.evaluate(() => {
    const form = document.querySelector("#adminRestaurantFilters");
    if (!form) return null;
    return Object.fromEntries([...form.querySelectorAll("[name]")].map((field) => [field.name, field.value]));
  });
}

async function setIncompatibleFilters(page) {
  await page.locator('#adminRestaurantFilters [name="status"]').selectOption("active");
  await page.locator('#adminRestaurantFilters [name="testData"]').selectOption("production");
  await page.waitForTimeout(250);
}

async function fillRestaurantForm(page, payload) {
  const form = page.locator("#restaurantForm");
  await form.locator('[name="name"]').fill(payload.name);
  await form.locator('[name="slug"]').fill(payload.slug);
  await form.locator('[name="email"]').fill(payload.email);
  await form.locator('[name="reservation_email"]').fill(payload.email);
  await form.locator('[name="address"]').fill(payload.address);
  await form.locator('[name="city"]').fill(payload.city);
  await form.locator('[name="country"]').fill(payload.country);
  await form.locator('[name="district"]').fill(payload.district);
  await form.locator('[name="cuisine_type"]').fill(payload.cuisine_type);
  await form.locator('[name="short_description"]').fill(payload.short_description);
  await form.locator('[name="full_description"]').fill(payload.full_description);
  await form.locator('[name="status"]').selectOption(payload.status);
  await form.locator('[name="is_test_data"]').check();
}

async function createRestaurantThroughUi(page, payload) {
  const createResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST"
      && response.url().includes("/api/admin/restaurants")
      && (request.postData() || "").includes(payload.name);
  }, { timeout: 30_000 });
  await page.locator('#restaurantForm button[type="submit"]').click();
  const response = await createResponsePromise;
  const body = await response.json().catch(() => ({}));
  return {
    url: response.url().replace(/\?.*$/, ""),
    status: response.status(),
    body
  };
}

async function waitForRestaurantVisible(page, id, name) {
  await page.waitForFunction(({ id: restaurantId, name: restaurantName }) => {
    const row = document.querySelector(`[data-restaurant-row="${CSS.escape(restaurantId)}"]`);
    return Boolean(row && row.querySelector('input[data-field="name"]')?.value === restaurantName);
  }, { id, name }, { timeout: 30_000 });
}

async function safePageState(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
    let role = "";
    let sessionPresent = false;
    try {
      const session = raw ? JSON.parse(raw) : null;
      role = session?.profile?.role || "";
      sessionPresent = Boolean(session?.access_token);
    } catch {
      role = "parse_error";
    }
    return {
      pathname: window.location.pathname,
      hash: window.location.hash,
      session_present: sessionPresent,
      role,
      login_form_visible: Boolean(document.querySelector("#loginForm, #guestLoginForm")),
      admin_dashboard_visible: Boolean(document.querySelector(".dashboard-head")),
      restaurant_form_present: Boolean(document.querySelector("#restaurantForm")),
      restaurant_form_visible: Boolean(document.querySelector("#restaurantForm")?.offsetParent),
      admin_restaurants_panel_present: Boolean(document.querySelector("#admin-restaurants")),
      page_text_excerpt: document.body?.innerText?.replace(/\s+/g, " ").slice(0, 420) || ""
    };
  }).catch((error) => ({ error: error.message }));
}

async function cleanupQaRestaurant(config, schema, id, name) {
  const result = {
    attempted: Boolean(id),
    child_tables_cleaned: [],
    restaurant_deleted: false,
    remaining_restaurant_rows: null,
    errors: []
  };
  if (!id) return result;
  for (const table of CHILD_TABLES) {
    if (!tableExists(schema, table)) continue;
    try {
      await restDelete(config, table, `restaurant_id=eq.${encodeURIComponent(id)}`);
      result.child_tables_cleaned.push(table);
    } catch (error) {
      result.errors.push({ table, message: error.safeBody?.message || error.message });
    }
  }
  try {
    await restDelete(config, "restaurants", `id=eq.${encodeURIComponent(id)}&name=eq.${encodeURIComponent(name)}`);
    result.restaurant_deleted = true;
  } catch (error) {
    result.errors.push({ table: "restaurants", message: error.safeBody?.message || error.message });
  }
  const remaining = await restSelect(config, "restaurants", `id=eq.${encodeURIComponent(id)}&select=id,name`).catch(() => []);
  result.remaining_restaurant_rows = remaining.length;
  return result;
}

async function main() {
  const args = parseArgs();
  const env = loadProductionLocalEnv();
  assert(args.flags.has("confirm-production-admin-restaurant-qa"), "--confirm-production-admin-restaurant-qa is required for production QA writes.");
  assert(envFlagEnabled(env.SMARTTABLE_PRODUCTION_ADMIN_QA_ENABLED), "SMARTTABLE_PRODUCTION_ADMIN_QA_ENABLED=true is required for production QA writes.");
  const target = await assertProductionTarget({ env, args, requireWrite: false, requireDeployedRef: true });
  const schema = await loadPostgrestSchema(target.supabase);
  const payload = qaRestaurantPayload();

  const report = {
    status: "production_admin_restaurant_create_list_failed",
    production_domain: target.targetOrigin,
    production_project_ref: target.suppliedProjectRef,
    deployed_project_refs: target.deployed.exposed_project_refs,
    deployed_build_id: target.deployed.health_build_id || target.deployed.config_build_id || null,
    secrets_printed: false,
    qa_restaurant_name: payload.name,
    before: {},
    create_api: {},
    database_row: null,
    partner_assignment: null,
    list_api_after_create: {},
    browser_visible_after_create: false,
    filters_before_create: null,
    filters_after_create: null,
    cleanup: null
  };

  let browser;
  let context;
  let page;
  let createdId = "";
  try {
    browser = await chromium.launch({ headless: !args.flags.has("headed") });
    context = await browser.newContext({ baseURL: target.targetOrigin });
    page = await context.newPage();
    await clearBrowserStateOnce(context, page);
    await loginAsAdmin(page, env);
    await page.goto("/admin/restaurants", { waitUntil: "networkidle" });
    await page.locator("#restaurantForm").waitFor({ timeout: 30_000 }).catch(async (error) => {
      report.failure_state = await safePageState(page);
      throw error;
    });

    const beforeApi = await adminRestaurantsViaBrowserApi(page);
    report.before = {
      admin_list_api_status: beforeApi.status,
      admin_list_count: beforeApi.count
    };
    report.filters_before_create = await adminFilterState(page);

    await setIncompatibleFilters(page);
    report.filters_before_create = await adminFilterState(page);
    await fillRestaurantForm(page, payload);

    const createApi = await createRestaurantThroughUi(page, payload);
    createdId = createApi.body?.restaurant?.id || "";
    report.create_api = {
      url: createApi.url,
      status: createApi.status,
      returned_restaurant_id: createdId,
      returned_status: createApi.body?.restaurant?.status || null,
      returned_lifecycle_status: createApi.body?.restaurant?.lifecycle_status || createApi.body?.restaurant?.onboarding_status || null
    };
    assert(createApi.status === 201, `Restaurant create API returned HTTP ${createApi.status}.`);
    assert(createdId, "Restaurant create API did not return a restaurant ID.");

    const dbRows = await restSelect(target.supabase, "restaurants", `id=eq.${encodeURIComponent(createdId)}&select=*`);
    assert(dbRows.length === 1, `Production database row count for created restaurant must be 1; found ${dbRows.length}.`);
    report.database_row = safeRestaurantSummary(dbRows[0], schema);

    if (tableExists(schema, "restaurant_users")) {
      const assignmentColumns = ["id", "restaurant_id", "user_id", "email", "role", "status"].filter((column) => hasColumn(schema, "restaurant_users", column)).join(",");
      const assignments = await restSelect(target.supabase, "restaurant_users", `restaurant_id=eq.${encodeURIComponent(createdId)}&select=${assignmentColumns}`).catch(() => []);
      report.partner_assignment = {
        count: assignments.length,
        rows: assignments.map((row) => ({ email: row.email || null, role: row.role || null, status: row.status || null }))
      };
    }

    const listAfter = await adminRestaurantsViaBrowserApi(page);
    report.list_api_after_create = {
      status: listAfter.status,
      count: listAfter.count,
      includes_created_id: listAfter.restaurants.some((restaurant) => restaurant.id === createdId)
    };
    assert(report.list_api_after_create.includes_created_id, "Admin list API does not include the created restaurant ID.");

    await waitForRestaurantVisible(page, createdId, payload.name);
    report.browser_visible_after_create = true;
    report.filters_after_create = await adminFilterState(page);

    await context.close();
    context = null;
    report.status = "production_admin_restaurant_create_list_passed";
  } catch (error) {
    report.error_message = error.message;
    if (page && !report.failure_state) report.failure_state = await safePageState(page);
  } finally {
    if (context) await context.close().catch(() => null);
    if (browser) await browser.close().catch(() => null);
    report.cleanup = await cleanupQaRestaurant(target.supabase, schema, createdId, payload.name);
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "production_admin_restaurant_create_list_passed" || report.cleanup?.remaining_restaurant_rows !== 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
