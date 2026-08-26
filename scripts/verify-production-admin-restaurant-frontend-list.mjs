#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  ACCOUNT_SPECS,
  accountEmail,
  accountPassword,
  assert,
  assertProductionTarget,
  loadProductionLocalEnv,
  parseArgs,
  projectRoot
} from "./production-test-accounts-common.mjs";

function envFlagEnabled(value = "") {
  return String(value || "").trim().toLowerCase() === "true";
}

function isoStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function qaRestaurantPayload() {
  const stamp = isoStamp();
  return {
    name: `SmartTable QA Frontend Visible ${stamp}`,
    slug: `smarttable-qa-frontend-visible-${stamp.toLowerCase()}`,
    email: `qa-frontend-visible+${stamp}@smarttable.com`,
    address: `405 QA Frontend View ${stamp}`,
    city: "New York",
    country: "US",
    district: "Manhattan",
    cuisine_type: "Modern American",
    short_description: "Temporary production QA record for admin frontend list visibility.",
    full_description: "Temporary production QA record created through the SmartTable Admin UI to prove immediate frontend list refresh.",
    status: "draft"
  };
}

function parseVisibleRestaurantCount(text = "") {
  const match = String(text || "").match(/\d+/);
  return match ? Number(match[0]) : null;
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

async function loginAsAdmin(page, env) {
  const admin = ACCOUNT_SPECS.find((spec) => spec.key === "admin");
  assert(admin, "Production admin account spec is missing.");
  assert(accountPassword(env, admin), `${admin.passwordEnv} is required.`);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const form = page.locator("form").filter({ has: page.locator('input[name="email"]') }).first();
  await form.locator('input[name="email"]').waitFor({ timeout: 20_000 });
  await form.locator('input[name="email"]').fill(accountEmail(admin));
  await form.locator('input[name="password"]').fill(accountPassword(env, admin));
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/auth\/login(?:\?|$)/.test(response.url()), { timeout: 30_000 }),
    form.locator('button[type="submit"]').click()
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

async function visibleCount(page) {
  const text = await page.locator(".restaurant-list-summary span").first().innerText({ timeout: 10_000 });
  return parseVisibleRestaurantCount(text);
}

async function setIncompatibleFilters(page) {
  await page.locator('#adminRestaurantFilters [name="status"]').selectOption("active");
  await page.locator('#adminRestaurantFilters [name="testData"]').selectOption("production");
  await page.waitForTimeout(250);
}

async function filterState(page) {
  return page.evaluate(() => {
    const form = document.querySelector("#adminRestaurantFilters");
    if (!form) return null;
    return Object.fromEntries([...form.querySelectorAll("[name]")].map((field) => [field.name, field.value]));
  });
}

async function adminApiGet(page, path) {
  return page.evaluate(async (requestPath) => {
    const raw = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
    let accessToken = "";
    try {
      accessToken = JSON.parse(raw)?.access_token || "";
    } catch {
      accessToken = "";
    }
    const response = await fetch(`/api${requestPath}`, {
      cache: "no-store",
      headers: {
        "cache-control": "no-store",
        authorization: `Bearer ${accessToken}`
      }
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, body };
  }, path);
}

async function currentAdminRestaurantList(page) {
  const response = await adminApiGet(page, `/admin/restaurants?fresh=${Date.now()}`);
  assert(response.ok, `Admin restaurants API returned HTTP ${response.status}.`);
  return response.body.restaurants || [];
}

async function forceDuplicatePayloadFromExistingRestaurant(page, payload) {
  const restaurants = await currentAdminRestaurantList(page);
  const duplicateSource = restaurants.find((restaurant) =>
    restaurant.id
    && restaurant.address
    && !String(restaurant.name || "").startsWith("SmartTable QA Frontend Visible")
  ) || restaurants.find((restaurant) => restaurant.id && restaurant.address);
  if (!duplicateSource?.address) return { payload, duplicateSource: null };
  return {
    payload: {
      ...payload,
      address: duplicateSource.address,
      city: duplicateSource.city || payload.city,
      country: duplicateSource.country || payload.country,
      district: duplicateSource.district || payload.district
    },
    duplicateSource: {
      id: duplicateSource.id,
      name: duplicateSource.name,
      address: duplicateSource.address
    }
  };
}

async function fillRestaurantForm(page, payload) {
  const form = page.locator("#restaurantForm");
  await form.locator("details.restaurant-create-options").evaluate((details) => {
    details.open = true;
  });
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
  await form.locator('[name="is_test_data"]').check();
}

async function createRestaurantThroughUi(page, payload, overrideReason) {
  const postResponses = [];
  const responseListener = (response) => {
    const request = response.request();
    if (request.method() === "POST"
      && response.url().includes("/api/admin/restaurants")
      && (request.postData() || "").includes(payload.name)) {
      postResponses.push(response);
    }
  };
  page.on("response", responseListener);
  const dialogPromise = page.waitForEvent("dialog", { timeout: 10_000 })
    .then(async (dialog) => {
      const message = dialog.message();
      await dialog.accept(overrideReason);
      return { appeared: true, message };
    })
    .catch(() => ({ appeared: false, message: "" }));
  const finalResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST"
      && response.status() === 201
      && response.url().includes("/api/admin/restaurants")
      && (request.postData() || "").includes(payload.name);
  }, { timeout: 30_000 });
  await page.locator('#restaurantForm button[type="submit"]').click();
  const [response, duplicateDialog] = await Promise.all([finalResponsePromise, dialogPromise]);
  await page.waitForTimeout(250);
  page.off("response", responseListener);
  const body = await response.json().catch(() => ({}));
  const postResults = [];
  for (const postResponse of postResponses) {
    const postBody = await postResponse.json().catch(() => ({}));
    const postData = postResponse.request().postData() || "";
    postResults.push({
      status: postResponse.status(),
      url: postResponse.url(),
      duplicate_override: postData.includes('"duplicate_override":true'),
      override_reason_included: postData.includes(overrideReason),
      code: postBody.code || "",
      restaurant_id: postBody?.restaurant?.id || ""
    });
  }
  return {
    status: response.status(),
    url: response.url(),
    restaurantId: body?.restaurant?.id || "",
    statusValue: body?.restaurant?.status || "",
    lifecycleStatus: body?.restaurant?.lifecycle_status || body?.restaurant?.onboarding_status || "",
    returnedName: body?.restaurant?.name || "",
    persisted: body?.persisted === true,
    duplicateDialog,
    postResults
  };
}

async function archiveQaRestaurantViaAppApi(page, restaurantId) {
  if (!restaurantId) return { attempted: false };
  return page.evaluate(async (id) => {
    const raw = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
    let accessToken = "";
    try {
      accessToken = JSON.parse(raw)?.access_token || "";
    } catch {
      accessToken = "";
    }
    const response = await fetch("/api/admin/restaurants", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        id,
        status: "archived",
        status_reason: "Temporary QA frontend screenshot record archived after verification."
      })
    });
    const body = await response.json().catch(() => ({}));
    return {
      attempted: true,
      status: response.status,
      ok: response.ok,
      lifecycle_status: body?.restaurant?.lifecycle_status || body?.restaurant?.onboarding_status || ""
    };
  }, restaurantId).catch((error) => ({ attempted: true, ok: false, error: error.message }));
}

async function main() {
  const args = parseArgs();
  const env = loadProductionLocalEnv();
  assert(args.flags.has("confirm-production-admin-frontend-qa"), "--confirm-production-admin-frontend-qa is required for production QA writes.");
  assert(envFlagEnabled(env.SMARTTABLE_PRODUCTION_ADMIN_QA_ENABLED), "SMARTTABLE_PRODUCTION_ADMIN_QA_ENABLED=true is required for production QA writes.");
  const target = await assertProductionTarget({ env, args, requireWrite: false, requireDeployedRef: true });
  let payload = qaRestaurantPayload();
  const overrideReason = `Production frontend QA duplicate override ${isoStamp()}`;
  const screenshotDir = path.join(projectRoot, ".tmp", "screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `${payload.slug}.png`);

  const report = {
    status: "production_admin_frontend_list_failed",
    production_domain: target.targetOrigin,
    production_project_ref: target.suppliedProjectRef,
    deployed_build_id: target.deployed.health_build_id || target.deployed.config_build_id || null,
    secrets_printed: false,
    manual_refresh_used: false,
    qa_restaurant_name: payload.name,
    entered_payload: null,
    duplicate_source: null,
    created_restaurant_id: "",
    count_before: null,
    count_after: null,
    api_count_before: null,
    filters_before_create: null,
    filters_after_create: null,
    current_page_before_create: null,
    page_containing_created_row: null,
    duplicate_dialog: null,
    post_create_requests: [],
    post_create_response: null,
    persisted_row_verification: null,
    get_after_create_response: null,
    rendered_restaurant_rows: null,
    page_summary_after_create: "",
    row_visible_without_refresh: false,
    row_highlighted: false,
    screenshot_path: screenshotPath,
    archive_result: null
  };

  let browser;
  let context;
  let page;
  try {
    browser = await chromium.launch({ headless: !args.flags.has("headed") });
    context = await browser.newContext({ baseURL: target.targetOrigin, viewport: { width: 1440, height: 1100 } });
    page = await context.newPage();
    await clearBrowserStateOnce(context, page);
    await loginAsAdmin(page, env);
    await page.goto("/admin/restaurants", { waitUntil: "networkidle" });
    await page.locator("#restaurantForm").waitFor({ timeout: 30_000 });

    const duplicatePayload = await forceDuplicatePayloadFromExistingRestaurant(page, payload);
    payload = duplicatePayload.payload;
    report.qa_restaurant_name = payload.name;
    report.duplicate_source = duplicatePayload.duplicateSource;
    report.entered_payload = {
      name: payload.name,
      slug: payload.slug,
      email: payload.email,
      address: payload.address,
      city: payload.city,
      country: payload.country,
      district: payload.district,
      cuisine_type: payload.cuisine_type,
      status: payload.status,
      is_test_data: true
    };
    report.api_count_before = (await currentAdminRestaurantList(page)).length;
    report.count_before = await visibleCount(page);
    await setIncompatibleFilters(page);
    report.filters_before_create = await filterState(page);
    report.current_page_before_create = await page.locator(".restaurant-list-summary").innerText({ timeout: 10_000 }).catch(() => "");
    await fillRestaurantForm(page, payload);
    const freshListResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === "GET"
        && response.url().includes("/api/admin/restaurants")
        && response.url().includes("fresh=");
    }, { timeout: 30_000 });
    const create = await createRestaurantThroughUi(page, payload, overrideReason);
    report.created_restaurant_id = create.restaurantId;
    report.created_status = create.statusValue;
    report.created_lifecycle_status = create.lifecycleStatus;
    report.duplicate_dialog = create.duplicateDialog;
    report.post_create_requests = create.postResults;
    report.post_create_response = {
      url: create.url,
      http_status: create.status,
      restaurant_id: create.restaurantId,
      restaurant_name: create.returnedName,
      persisted: create.persisted
    };
    assert(create.status === 201, `Restaurant create API returned HTTP ${create.status}.`);
    assert(create.restaurantId, "Restaurant create API did not return a restaurant ID.");
    assert(create.persisted, "Restaurant create API did not confirm persisted=true.");
    assert(create.duplicateDialog.appeared, "Duplicate override dialog did not appear.");
    assert(create.postResults.filter((item) => item.status === 409 && item.code === "DUPLICATE_RESTAURANT_POSSIBLE").length === 1, "Expected exactly one duplicate warning response.");
    assert(create.postResults.filter((item) => item.duplicate_override).length === 1, "Expected exactly one final duplicate override create request.");
    assert(create.postResults.some((item) => item.duplicate_override && item.override_reason_included), "Final override request did not include the override reason.");

    const freshListResponse = await freshListResponsePromise;
    const freshListBody = await freshListResponse.json().catch(() => ({}));
    const freshRestaurants = Array.isArray(freshListBody.restaurants) ? freshListBody.restaurants : [];
    report.get_after_create_response = {
      url: freshListResponse.url(),
      http_status: freshListResponse.status(),
      restaurant_count: freshRestaurants.length,
      includes_created_id: freshRestaurants.some((restaurant) => String(restaurant.id || "") === String(create.restaurantId))
    };
    assert(report.get_after_create_response.http_status === 200, `Fresh restaurant list returned HTTP ${report.get_after_create_response.http_status}.`);
    assert(report.get_after_create_response.includes_created_id, "Fresh restaurant list API did not include the created restaurant ID.");
    const detail = await adminApiGet(page, `/admin/restaurant-detail?id=${encodeURIComponent(create.restaurantId)}&fresh=${Date.now()}`);
    report.persisted_row_verification = {
      http_status: detail.status,
      exists: Boolean(detail.body?.restaurant?.id),
      id: detail.body?.restaurant?.id || "",
      name: detail.body?.restaurant?.name || "",
      status: detail.body?.restaurant?.status || "",
      lifecycle_status: detail.body?.restaurant?.lifecycle_status || "",
      created_at: detail.body?.restaurant?.created_at || "",
      archived_or_deleted: ["archived", "deleted"].includes(String(detail.body?.restaurant?.lifecycle_status || "").toLowerCase()),
      dining_area_count: Array.isArray(detail.body?.dining_areas) ? detail.body.dining_areas.length : null,
      table_count: Array.isArray(detail.body?.tables) ? detail.body.tables.length : null,
      partner_assignment_count: Array.isArray(detail.body?.partner_access) ? detail.body.partner_access.length : null
    };
    assert(report.persisted_row_verification.exists, "Created restaurant detail readback did not find the returned ID.");

    const row = page.locator(`[data-restaurant-row="${create.restaurantId}"]`);
    await row.waitFor({ timeout: 30_000 });
    await page.waitForFunction(({ id, name }) => {
      const rowElement = document.querySelector(`[data-restaurant-row="${CSS.escape(id)}"]`);
      return Boolean(rowElement && rowElement.querySelector('input[data-field="name"]')?.value === name);
    }, { id: create.restaurantId, name: payload.name }, { timeout: 30_000 });
    report.row_visible_without_refresh = true;
    report.row_highlighted = await row.evaluate((element) => element.classList.contains("admin-created-restaurant-highlight"));
    report.filters_after_create = await filterState(page);
    report.count_after = await visibleCount(page);
    report.page_summary_after_create = await page.locator(".restaurant-list-summary").innerText({ timeout: 10_000 });
    report.page_containing_created_row = report.page_summary_after_create;
    report.rendered_restaurant_rows = await page.locator("[data-restaurant-row]").count();
    assert(report.count_after === report.count_before + 1, `Visible restaurant count did not increase by 1 (${report.count_before} -> ${report.count_after}).`);
    assert(report.rendered_restaurant_rows > 0, "No restaurant rows were rendered in the admin UI.");
    assert(report.row_highlighted, "Created restaurant row was visible but not highlighted.");

    await page.locator(".restaurant-list-summary").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    report.archive_result = await archiveQaRestaurantViaAppApi(page, create.restaurantId);
    report.status = "production_admin_frontend_list_passed";
  } catch (error) {
    report.error_message = error.message;
  } finally {
    if (context) await context.close().catch(() => null);
    if (browser) await browser.close().catch(() => null);
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "production_admin_frontend_list_passed") process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
