#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import { chromium } from "@playwright/test";
import {
  ACCOUNT_SPECS,
  accountEmail,
  accountPassword,
  displayRole,
  loadAndValidateStagingEnv,
  projectRoot
} from "./staging-test-accounts-common.mjs";

const PORT = String(process.env.STAGING_BROWSER_LOGIN_PORT || process.env.PORT || 4196);
const cliBaseUrl = (() => {
  const index = process.argv.findIndex((arg) => arg === "--base-url");
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
})();
const headed = process.argv.includes("--headed") || process.env.STAGING_BROWSER_HEADED === "1";

const ACCOUNT_ROUTES = {
  guest: {
    login: "/login",
    expectedPath: "/account",
    direct: "/account/reservations",
    forbidden: "/admin",
    dashboardSelector: ".account-dashboard",
    expectedRole: "guest"
  },
  partner: {
    login: "/partner",
    expectedPath: "/partner",
    direct: "/partner/reservations",
    forbidden: "/admin",
    dashboardSelector: "#partner-overview, #partner-reservations, .owner-focused-head",
    expectedRole: "partner"
  },
  admin: {
    login: "/admin",
    expectedPath: "/admin",
    direct: "/admin/restaurants",
    forbidden: "/superadmin",
    dashboardSelector: ".dashboard-head",
    expectedRole: "admin"
  },
  superadmin: {
    login: "/superadmin",
    expectedPath: "/superadmin",
    direct: "/superadmin/settings",
    forbidden: "/partner",
    dashboardSelector: ".dashboard-head",
    expectedRole: "super_admin"
  }
};

function configuredStagingBaseUrl(env) {
  const candidates = [
    cliBaseUrl,
    process.env.SMARTTABLE_STAGING_SITE_URL,
    process.env.STAGING_SITE_URL,
    process.env.PLAYWRIGHT_STAGING_BASE_URL,
    process.env.PLAYWRIGHT_BASE_URL,
    env.SMARTTABLE_STAGING_SITE_URL,
    env.STAGING_SITE_URL,
    env.PLAYWRIGHT_STAGING_BASE_URL,
    env.PLAYWRIGHT_BASE_URL
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim().replace(/\/+$/, "");
    if (!value) continue;
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Configured staging site URL must be http or https.");
    return value;
  }
  return "";
}

function waitForHttp(url, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let lastError;
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if ((response.statusCode || 0) >= 200 && (response.statusCode || 0) < 500) {
          resolve();
          return;
        }
        retry(new Error(`HTTP ${response.statusCode}`));
      });
      request.setTimeout(1_500, () => request.destroy(new Error("Timed out waiting for app.")));
      request.on("error", retry);
    };
    const retry = (error) => {
      lastError = error;
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError.message})` : ""}`));
        return;
      }
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

async function startLocalStagingApp(env) {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...env,
      PORT,
      PUBLIC_BASE_URL: baseUrl,
      SMARTTABLE_ENV: "staging",
      APP_ENV: "staging",
      VERCEL_ENV: "preview"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => {
    const line = String(chunk);
    if (!/key|token|password|secret/i.test(line)) process.stdout.write(`[staging-app] ${line}`);
  });
  child.stderr.on("data", (chunk) => {
    const line = String(chunk);
    if (!/key|token|password|secret/i.test(line)) process.stderr.write(`[staging-app] ${line}`);
  });
  await waitForHttp(baseUrl);
  return { baseUrl, child, mode: "local_staging_app" };
}

function stopLocalApp(child) {
  if (child && !child.killed) child.kill();
}

async function storedSession(page) {
  return page.evaluate(() => {
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
  });
}

async function waitForDashboard(page, account) {
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
  }, account, { timeout: 30_000 });
}

async function verifyDashboard(page, route) {
  await waitForDashboard(page, route);
  const loginForms = await page.locator("#loginForm, #guestLoginForm").count();
  if (loginForms !== 0) throw new Error("Login form remained visible after authentication.");
}

async function submitLogin(page, spec, route, env) {
  const authResult = { status: null, error_message: "", response_seen: false };
  const loginFormSelector = spec.key === "guest" ? "#guestLoginForm" : "#loginForm";
  const loginForm = page.locator(loginFormSelector);
  const authResponsePromise = page.waitForResponse((response) => {
    const url = response.url();
    return response.request().method() === "POST" && /\/api\/auth\/login(?:\?|$)|\/auth\/login(?:\?|$)/.test(url);
  }, { timeout: 30_000 }).then(async (response) => {
    authResult.status = response.status();
    authResult.response_seen = true;
    const payload = await response.json().catch(() => null);
    authResult.error_message = payload?.error || payload?.message || payload?.code || "";
    return authResult;
  }).catch(() => authResult);
  await page.goto(route.login, { waitUntil: "domcontentloaded" });
  await loginForm.locator('input[name="email"]').waitFor({ timeout: 8_000 }).catch(async () => {
    const bodyText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
    if (/deployment protection|vercel/i.test(bodyText)) {
      throw new Error("Vercel Deployment Protection is shown instead of the SmartTable login form.");
    }
    throw new Error("SmartTable login email field was not rendered.");
  });
  await loginForm.locator('input[name="email"]').fill(accountEmail(env, spec));
  await loginForm.locator('input[name="password"]').fill(accountPassword(env, spec));
  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => null),
    loginForm.locator('button[type="submit"]').click()
  ]);
  await authResponsePromise;
  await verifyDashboard(page, route);
  return authResult;
}

async function acknowledgeBlockingReservationAlerts(page) {
  let acknowledgedCount = 0;
  while (acknowledgedCount < 5) {
    const backdrop = page.locator(".reservation-alert-backdrop");
    if (!(await backdrop.isVisible().catch(() => false))) return acknowledgedCount;

    const acknowledgeButton = backdrop.locator("[data-acknowledge-alert]");
    const alertId = await acknowledgeButton.getAttribute("data-acknowledge-alert");
    if (!alertId) throw new Error("Visible reservation alert is missing its acknowledgement identifier.");
    const acknowledgeResponse = page.waitForResponse((response) => {
      const url = response.url();
      return response.request().method() === "PATCH" && /\/api\/partner\/reservation-alerts(?:\?|$)/.test(url);
    }, { timeout: 30_000 });
    await acknowledgeButton.click();
    const response = await acknowledgeResponse;
    if (!response.ok()) throw new Error(`Reservation alert acknowledgement failed with HTTP ${response.status()}.`);
    acknowledgedCount += 1;
    await page.waitForFunction((previousAlertId) => {
      const current = document.querySelector("[data-acknowledge-alert]");
      return !current || current.getAttribute("data-acknowledge-alert") !== previousAlertId;
    }, alertId, { timeout: 20_000 });
  }
  if (await page.locator(".reservation-alert-backdrop").isVisible().catch(() => false)) {
    throw new Error("More than five reservation alerts blocked staging logout.");
  }
  return acknowledgedCount;
}

async function logout(page, key) {
  let acknowledgedAlertCount = 0;
  if (key === "guest") {
    await page.locator("#sessionButton").click();
    await page.locator("[data-account-menu-signout]").click();
  } else {
    if (key === "partner") acknowledgedAlertCount = await acknowledgeBlockingReservationAlerts(page);
    await page.locator("#sessionButton").click();
  }
  await page.waitForFunction(() => {
    return !window.localStorage.getItem("smarttable.session") && !window.sessionStorage.getItem("smarttable.session");
  }, null, { timeout: 20_000 });
  return acknowledgedAlertCount;
}

async function runAccount(page, spec, env) {
  const route = ACCOUNT_ROUTES[spec.key];
  const result = {
    email: accountEmail(env, spec),
    role: displayRole(spec.role),
    submitted_email: accountEmail(env, spec),
    http_auth_status: null,
    auth_error_message: "",
    session_created: false,
    redirect_url: "",
    role_returned: "",
    dashboard_rendered: false,
    login: "FAIL",
    dashboard: "FAIL",
    refresh: "FAIL",
    direct_route: "FAIL",
    forbidden_route: "FAIL",
    logout: "FAIL",
    staging_alerts_acknowledged_before_logout: 0,
    final: "FAIL",
    failure_reason: ""
  };
  try {
    const authResult = await submitLogin(page, spec, route, env);
    result.http_auth_status = authResult.status;
    result.auth_error_message = authResult.error_message;
    result.login = "PASS";
    result.dashboard = "PASS";
    result.dashboard_rendered = true;
    const session = await storedSession(page);
    result.session_created = Boolean(session?.session_exists);
    result.redirect_url = page.url();
    result.role_returned = session?.role || "";
    if (!session?.session_exists || session.role !== route.expectedRole) {
      throw new Error(`Unexpected stored role after login: ${session?.role || "none"}.`);
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await verifyDashboard(page, route);
    result.refresh = "PASS";

    await page.goto(route.direct, { waitUntil: "domcontentloaded" });
    await verifyDashboard(page, route);
    result.direct_route = "PASS";

    await page.goto(route.forbidden, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.includes("You do not have access") || document.querySelector(".unavailable-route-card"), null, { timeout: 20_000 });
    const forbiddenLoginForms = await page.locator("#loginForm, #guestLoginForm").count();
    if (forbiddenLoginForms !== 0) throw new Error("Forbidden route rendered a login form instead of an access-denied state.");
    result.forbidden_route = "PASS";

    await page.goto(route.direct, { waitUntil: "domcontentloaded" });
    await verifyDashboard(page, route);
    result.staging_alerts_acknowledged_before_logout = await logout(page, spec.key);
    await page.reload({ waitUntil: "domcontentloaded" });
    const sessionAfterLogout = await storedSession(page);
    if (sessionAfterLogout?.session_exists) throw new Error("Session still exists after logout.");
    result.logout = "PASS";
    result.final = "PASS";
  } catch (error) {
    result.failure_reason = error.message;
    result.page_state = await page.evaluate(() => {
      const rawSession = window.localStorage.getItem("smarttable.session") || window.sessionStorage.getItem("smarttable.session") || "";
      let session = null;
      try {
        const parsed = rawSession ? JSON.parse(rawSession) : null;
        session = parsed ? {
          session_exists: true,
          user_id: parsed?.profile?.id || parsed?.user?.id || null,
          role: parsed?.profile?.role || null,
          email: parsed?.profile?.email || null
        } : null;
      } catch {
        session = { session_exists: false, parse_error: true };
      }
      return {
        path: window.location.pathname,
        hash: window.location.hash,
        session,
        login_form_visible: Boolean(document.querySelector("#loginForm, #guestLoginForm")),
        account_dashboard_visible: Boolean(document.querySelector(".account-dashboard")),
        partner_dashboard_visible: Boolean(document.querySelector("#partner-overview, #partner-reservations, .owner-focused-head")),
        admin_dashboard_visible: Boolean(document.querySelector(".dashboard-head")),
        forbidden_visible: Boolean(document.querySelector(".unavailable-route-card")),
        text_excerpt: document.body.innerText.replace(/\s+/g, " ").slice(0, 700)
      };
    }).catch(() => null);
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
  const { env, projectRef, linkedProjectName } = loadAndValidateStagingEnv({ requireAnonKey: true });
  let local = null;
  const configuredBaseUrl = configuredStagingBaseUrl(env);
  const target = configuredBaseUrl
    ? { baseUrl: configuredBaseUrl, child: null, mode: "configured_staging_site" }
    : await startLocalStagingApp(env);
  local = target.child;

  const browser = await chromium.launch({ headless: !headed });
  const results = [];
  try {
    for (const spec of ACCOUNT_SPECS) {
      const context = await browser.newContext({ baseURL: target.baseUrl });
      const page = await context.newPage();
      results.push(await runAccount(page, spec, env));
      await context.close();
    }
  } finally {
    await browser.close().catch(() => null);
    stopLocalApp(local);
  }

  const failed = results.filter((row) => row.final !== "PASS");
  const acknowledgedAlertCount = results.reduce((total, row) => total + Number(row.staging_alerts_acknowledged_before_logout || 0), 0);
  console.log(JSON.stringify({
    status: failed.length ? "staging_browser_login_check_failed" : "staging_browser_login_check_passed",
    staging_project_ref: projectRef,
    linked_project_name: linkedProjectName,
    browser_target_mode: target.mode,
    browser_target_origin: new URL(target.baseUrl).origin,
    headed,
    secrets_printed: false,
    staging_writes_performed: acknowledgedAlertCount > 0,
    staging_write_scope: acknowledgedAlertCount > 0 ? "reservation_alert_acknowledgements_only" : "none",
    staging_alert_acknowledgement_count: acknowledgedAlertCount,
    accounts: results
  }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
