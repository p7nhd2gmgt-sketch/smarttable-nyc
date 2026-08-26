#!/usr/bin/env node
import { chromium } from "@playwright/test";
import {
  ACCOUNT_SPECS,
  accountEmail,
  accountPassword,
  assert,
  assertProductionTarget,
  displayRole,
  loadProductionLocalEnv,
  parseArgs
} from "./production-test-accounts-common.mjs";

const ACCOUNT_ROUTES = {
  guest: {
    login: "/login",
    dashboardSelector: ".account-dashboard",
    expectedRole: "guest"
  },
  partner: {
    login: "/partner",
    dashboardSelector: "#partner-overview, #partner-reservations, .owner-focused-head",
    expectedRole: "partner"
  },
  admin: {
    login: "/admin",
    dashboardSelector: ".dashboard-head",
    expectedRole: "admin"
  },
  superadmin: {
    login: "/superadmin",
    dashboardSelector: ".dashboard-head",
    expectedRole: "super_admin"
  }
};

function storedSessionScript() {
  const raw = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      session_exists: true,
      user_id: parsed?.profile?.id || parsed?.user?.id || null,
      role: parsed?.profile?.role || null,
      email: parsed?.profile?.email || null
    };
  } catch {
    return { session_exists: false, parse_error: true };
  }
}

async function storedSession(page) {
  return page.evaluate(storedSessionScript);
}

async function waitForDashboard(page, route) {
  await page.waitForFunction(({ dashboardSelector, expectedRole }) => {
    const loginVisible = Boolean(document.querySelector("#loginForm, #guestLoginForm"));
    const dashboardVisible = Boolean(document.querySelector(dashboardSelector));
    const raw = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
    let role = "";
    try {
      role = JSON.parse(raw)?.profile?.role || "";
    } catch {
      role = "";
    }
    return !loginVisible && dashboardVisible && role === expectedRole;
  }, route, { timeout: 30_000 });
}

async function safePageState(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
    let role = "";
    let userId = "";
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      role = parsed?.profile?.role || "";
      userId = parsed?.profile?.id || parsed?.user?.id || "";
    } catch {
      role = "parse_error";
    }
    return {
      pathname: window.location.pathname,
      session_exists: Boolean(raw),
      user_id: userId,
      role,
      login_form_visible: Boolean(document.querySelector("#loginForm, #guestLoginForm")),
      account_dashboard_visible: Boolean(document.querySelector(".account-dashboard")),
      partner_dashboard_visible: Boolean(document.querySelector("#partner-overview, #partner-reservations, .owner-focused-head")),
      admin_dashboard_visible: Boolean(document.querySelector(".dashboard-head")),
      unavailable_route_visible: Boolean(document.querySelector(".unavailable-route-card")),
      page_text_excerpt: document.body?.innerText?.replace(/\s+/g, " ").slice(0, 240) || ""
    };
  }).catch((error) => ({ error: error.message }));
}

async function submitLogin(page, spec, route, env) {
  const authResult = { status: null, error_message: "", endpoint: "", response_seen: false };
  const authResponsePromise = page.waitForResponse((response) => {
    const url = response.url();
    return response.request().method() === "POST" && /\/api\/auth\/login(?:\?|$)|\/auth\/login(?:\?|$)|\/auth\/v1\/token/.test(url);
  }, { timeout: 30_000 }).then(async (response) => {
    const url = new URL(response.url());
    authResult.endpoint = `${url.origin}${url.pathname}`;
    authResult.status = response.status();
    authResult.response_seen = true;
    const payload = await response.json().catch(() => null);
    authResult.error_message = payload?.error || payload?.message || payload?.code || "";
    return authResult;
  }).catch(() => authResult);

  await page.goto(route.login, { waitUntil: "domcontentloaded" });
  const form = page.locator("form").filter({ has: page.locator('input[name="email"]') }).first();
  await form.locator('input[name="email"]').waitFor({ timeout: 10_000 });
  await form.locator('input[name="email"]').fill(accountEmail(spec));
  await form.locator('input[name="password"]').fill(accountPassword(env, spec));
  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => null),
    form.locator('button[type="submit"]').click()
  ]);
  await authResponsePromise;
  await waitForDashboard(page, route);
  return authResult;
}

async function logout(page, key) {
  if (key === "guest") {
    await page.locator("#sessionButton").click();
    await page.locator("[data-account-menu-signout]").click();
  } else {
    await page.locator("#sessionButton").click();
  }
  await page.waitForFunction(() => {
    return !window.localStorage.getItem("smarttable.session") && !window.sessionStorage.getItem("smarttable.session");
  }, null, { timeout: 20_000 });
}

async function runAccount(page, spec, env) {
  const route = ACCOUNT_ROUTES[spec.key];
  const result = {
    email: accountEmail(spec),
    role: displayRole(spec.role),
    auth_endpoint: "",
    http_auth_status: null,
    auth_error_message: "",
    session_created: false,
    role_returned: "",
    redirect_url: "",
    login: "FAIL",
    dashboard: "FAIL",
    refresh: "FAIL",
    logout: "FAIL",
    final: "FAIL",
    failure_reason: "",
    page_state: null
  };
  try {
    assert(accountPassword(env, spec), `${spec.passwordEnv} is required.`);
    const auth = await submitLogin(page, spec, route, env);
    result.auth_endpoint = auth.endpoint;
    result.http_auth_status = auth.status;
    result.auth_error_message = auth.error_message;
    result.login = "PASS";
    result.dashboard = "PASS";
    const session = await storedSession(page);
    result.session_created = Boolean(session?.session_exists);
    result.role_returned = session?.role || "";
    result.redirect_url = page.url();
    assert(session?.session_exists, "Session was not created after login.");
    assert(session.role === route.expectedRole, `Unexpected role after login: ${session.role || "none"}.`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForDashboard(page, route);
    result.refresh = "PASS";

    await logout(page, spec.key);
    await page.reload({ waitUntil: "domcontentloaded" });
    const afterLogout = await storedSession(page);
    assert(!afterLogout?.session_exists, "Session still exists after logout.");
    result.logout = "PASS";
    result.final = "PASS";
  } catch (error) {
    result.failure_reason = error.message;
    result.page_state = await safePageState(page);
  } finally {
    await page.context().clearCookies().catch(() => null);
    await page.evaluate(() => {
      window.localStorage.removeItem("smarttable.session");
      window.sessionStorage.removeItem("smarttable.session");
    }).catch(() => null);
  }
  return result;
}

async function main() {
  const args = parseArgs();
  const env = loadProductionLocalEnv();
  const target = await assertProductionTarget({ env, args, requireWrite: false, requireDeployedRef: false });

  const browser = await chromium.launch({ headless: !args.flags.has("headed") });
  const results = [];
  try {
    for (const spec of ACCOUNT_SPECS) {
      const context = await browser.newContext({ baseURL: target.targetOrigin });
      const page = await context.newPage();
      results.push(await runAccount(page, spec, env));
      await context.close();
    }
  } finally {
    await browser.close().catch(() => null);
  }

  const failed = results.filter((row) => row.final !== "PASS");
  console.log(JSON.stringify({
    status: failed.length ? "production_browser_login_check_failed" : "production_browser_login_check_passed",
    production_domain: target.targetOrigin,
    production_project_ref: target.suppliedProjectRef,
    deployed_project_refs: target.deployed.exposed_project_refs,
    secrets_printed: false,
    accounts: results
  }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
