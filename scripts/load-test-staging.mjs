import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  ACCOUNT_SPECS,
  loadAndValidateStagingEnv,
  projectRoot
} from "./staging-test-accounts-common.mjs";

const PRODUCTION_PROJECT_REFS = new Set(["kkcmfolzrdvzrnmehkd"]);
const PRODUCTION_HOSTNAMES = new Set([
  "smarttablenyc.com",
  "www.smarttablenyc.com"
]);
const LOAD_METHOD = "GET";

export const SAFE_GET_ROUTES = Object.freeze({
  public: [
    "/api/public/config",
    "/api/public/restaurants?lang=en",
    "/api/public/offers?lang=en",
    "/api/public/food-feed?lang=en&limit=20",
    "/api/public/restaurants/newest?lang=en",
    "/api/public/content?lang=en"
  ],
  partner: [
    "/api/auth/me",
    "/api/partner/profile",
    "/api/partner/stats",
    "/api/partner/reservations?status=pending&page=1&page_size=25",
    "/api/partner/offers",
    "/api/partner/reviews?page=1&page_size=20",
    "/api/partner/analytics?date_range=30_days",
    "/api/partner/notification-settings"
  ]
});

const PROFILES = Object.freeze({
  smoke: { users: 10, requestsPerUser: 2, concurrency: 5, partnerShare: 0.25 },
  "100": { users: 100, requestsPerUser: 3, concurrency: 20, partnerShare: 0.3 },
  "300": { users: 300, requestsPerUser: 4, concurrency: 50, partnerShare: 0.35 },
  "1000": { users: 1000, requestsPerUser: 4, concurrency: 100, partnerShare: 0.45 },
  "3000": { users: 3000, requestsPerUser: 3, concurrency: 150, partnerShare: 0.35 }
});

const DEFAULT_THRESHOLDS = Object.freeze({
  maximumErrorRate: 0.01,
  maximumP95Ms: 2500,
  maximumP99Ms: 5000
});

function parseArguments(argv) {
  const parsed = { profile: "smoke", baseUrl: "", confirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--confirm-staging-load-test") parsed.confirmed = true;
    else if (argument.startsWith("--profile=")) parsed.profile = argument.slice("--profile=".length);
    else if (argument === "--profile") parsed.profile = argv[index += 1] || "";
    else if (argument.startsWith("--base-url=")) parsed.baseUrl = argument.slice("--base-url=".length);
    else if (argument === "--base-url") parsed.baseUrl = argv[index += 1] || "";
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Object.hasOwn(PROFILES, parsed.profile)) {
    throw new Error(`Unknown load profile: ${parsed.profile}`);
  }
  if (parsed.profile !== "smoke" && !parsed.confirmed) {
    throw new Error("Non-smoke profiles require --confirm-staging-load-test.");
  }
  return parsed;
}

function configuredBaseUrl(env, cliValue) {
  const candidates = [
    cliValue,
    process.env.SMARTTABLE_STAGING_SITE_URL,
    env.SMARTTABLE_STAGING_SITE_URL,
    process.env.STAGING_SITE_URL,
    env.STAGING_SITE_URL,
    process.env.PLAYWRIGHT_STAGING_BASE_URL,
    env.PLAYWRIGHT_STAGING_BASE_URL,
    process.env.PLAYWRIGHT_BASE_URL,
    env.PLAYWRIGHT_BASE_URL
  ];
  const selected = candidates.find((value) => String(value || "").trim());
  if (!selected) {
    throw new Error("A staging application URL is required via --base-url or SMARTTABLE_STAGING_SITE_URL.");
  }
  const url = new URL(String(selected).trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("The staging URL must use HTTP or HTTPS.");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The staging URL must not include credentials, query parameters, or fragments.");
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Remote staging load tests require HTTPS.");
  }
  if (PRODUCTION_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new Error("Production domains are forbidden for staging load tests.");
  }
  return url.origin;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return Math.round(sorted[index]);
}

function safeErrorCode(error) {
  if (error?.name === "AbortError") return "REQUEST_TIMEOUT";
  return String(error?.code || error?.name || "REQUEST_FAILED").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80);
}

async function requestJson(baseUrl, route, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || LOAD_METHOD,
      headers: {
        Accept: "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { response, body, bytes: Buffer.byteLength(text) };
  } finally {
    clearTimeout(timer);
  }
}

function assertHealth(health, expectedProjectRef, baseUrl) {
  if (!health.response.ok || !health.body?.ok) {
    throw new Error(`Staging health check failed with HTTP ${health.response.status}.`);
  }
  const runtime = String(health.body.runtime_mode || health.body.environment || "").toLowerCase();
  const hostname = new URL(baseUrl).hostname;
  const local = ["localhost", "127.0.0.1"].includes(hostname);
  const previewHost = hostname.endsWith(".vercel.app");
  const allowedRuntime = local
    ? ["development", "staging", "preview"].includes(runtime)
    : ["staging", "preview"].includes(runtime) || (!runtime && previewHost);
  if (!allowedRuntime || runtime === "production") {
    throw new Error(`Target runtime is not staging (reported: ${runtime || "unknown"}).`);
  }
  const actualProjectRef = String(health.body.supabase_project_ref || "").trim();
  if (!actualProjectRef || actualProjectRef !== expectedProjectRef) {
    throw new Error("Application health project ref does not match STAGING_SUPABASE_PROJECT_REF.");
  }
  if (PRODUCTION_PROJECT_REFS.has(actualProjectRef)) {
    throw new Error("Production Supabase project refs are forbidden for staging load tests.");
  }
  return {
    runtime,
    projectRef: actualProjectRef,
    buildId: String(health.body.build_id || health.body.version || "unknown")
  };
}

async function createPartnerSession(baseUrl, env) {
  const partner = ACCOUNT_SPECS.find((account) => account.key === "partner");
  const email = String(env[partner.emailEnv] || partner.email).trim().toLowerCase();
  const password = String(env[partner.passwordEnv] || "");
  const result = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { email, password }
  });
  if (!result.response.ok || !result.body?.access_token) {
    throw new Error(`One-time staging partner login failed with HTTP ${result.response.status}.`);
  }
  const role = String(result.body.profile?.role || "").toLowerCase();
  if (!["partner", "owner", "restaurant_owner"].includes(role)) {
    throw new Error("The staging load-test account is not a partner account.");
  }
  return result.body.access_token;
}

function selectRoute(userIndex, requestIndex, partnerShare) {
  const partnerThreshold = Math.round(partnerShare * 100);
  const partnerRequest = ((userIndex * 37 + requestIndex * 17) % 100) < partnerThreshold;
  const collection = partnerRequest ? SAFE_GET_ROUTES.partner : SAFE_GET_ROUTES.public;
  return {
    authenticated: partnerRequest,
    route: collection[(userIndex + requestIndex) % collection.length]
  };
}

async function executeRequest({ baseUrl, token, userIndex, requestIndex, profile }) {
  const target = selectRoute(userIndex, requestIndex, profile.partnerShare);
  const startedAt = performance.now();
  try {
    const result = await requestJson(baseUrl, target.route, {
      token: target.authenticated ? token : ""
    });
    return {
      route: target.route.split("?")[0],
      authenticated: target.authenticated,
      status: result.response.status,
      ok: result.response.ok,
      durationMs: Math.round(performance.now() - startedAt),
      bytes: result.bytes,
      errorCode: result.response.ok ? null : `HTTP_${result.response.status}`
    };
  } catch (error) {
    return {
      route: target.route.split("?")[0],
      authenticated: target.authenticated,
      status: 0,
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      bytes: 0,
      errorCode: safeErrorCode(error)
    };
  }
}

async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function summarize(results, elapsedMs, profileName, profile, target) {
  const durations = results.map((result) => result.durationMs);
  const failures = results.filter((result) => !result.ok);
  const byRoute = {};
  for (const result of results) {
    byRoute[result.route] ||= { requests: 0, failures: 0, durations: [], statuses: {} };
    const item = byRoute[result.route];
    item.requests += 1;
    item.failures += result.ok ? 0 : 1;
    item.durations.push(result.durationMs);
    item.statuses[result.status || result.errorCode] = (item.statuses[result.status || result.errorCode] || 0) + 1;
  }
  const routes = Object.fromEntries(Object.entries(byRoute).map(([route, item]) => [route, {
    requests: item.requests,
    failures: item.failures,
    errorRate: Number((item.failures / item.requests).toFixed(4)),
    p50Ms: percentile(item.durations, 0.5),
    p95Ms: percentile(item.durations, 0.95),
    p99Ms: percentile(item.durations, 0.99),
    statuses: item.statuses
  }]));
  const metrics = {
    requests: results.length,
    successes: results.length - failures.length,
    failures: failures.length,
    errorRate: Number((failures.length / Math.max(1, results.length)).toFixed(4)),
    elapsedMs: Math.round(elapsedMs),
    requestsPerSecond: Number((results.length / Math.max(0.001, elapsedMs / 1000)).toFixed(2)),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    responseBytes: results.reduce((sum, result) => sum + result.bytes, 0)
  };
  const gates = {
    errorRate: metrics.errorRate <= DEFAULT_THRESHOLDS.maximumErrorRate,
    p95: metrics.p95Ms <= DEFAULT_THRESHOLDS.maximumP95Ms,
    p99: metrics.p99Ms <= DEFAULT_THRESHOLDS.maximumP99Ms
  };
  return {
    generatedAt: new Date().toISOString(),
    target,
    profile: { name: profileName, ...profile },
    thresholds: DEFAULT_THRESHOLDS,
    metrics,
    routes,
    gates,
    passed: Object.values(gates).every(Boolean)
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const { env, projectRef } = loadAndValidateStagingEnv({ requireAnonKey: false });
  if (PRODUCTION_PROJECT_REFS.has(projectRef)) {
    throw new Error("Production Supabase project refs are forbidden for staging load tests.");
  }
  const baseUrl = configuredBaseUrl(env, args.baseUrl);
  const health = assertHealth(await requestJson(baseUrl, "/api/health"), projectRef, baseUrl);
  const partnerToken = await createPartnerSession(baseUrl, env);
  const profile = PROFILES[args.profile];
  const tasks = [];
  for (let userIndex = 0; userIndex < profile.users; userIndex += 1) {
    for (let requestIndex = 0; requestIndex < profile.requestsPerUser; requestIndex += 1) {
      tasks.push(() => executeRequest({
        baseUrl,
        token: partnerToken,
        userIndex,
        requestIndex,
        profile
      }));
    }
  }

  console.log(`SmartTable staging load test: ${args.profile}`);
  console.log(`Target host: ${new URL(baseUrl).hostname}`);
  console.log(`Staging project ref: ${health.projectRef}`);
  console.log(`Runtime: ${health.runtime}`);
  console.log(`Build: ${health.buildId}`);
  console.log(`Simulated users: ${profile.users}; requests: ${tasks.length}; concurrency: ${profile.concurrency}`);

  const startedAt = performance.now();
  const results = await runPool(tasks, profile.concurrency);
  const report = summarize(results, performance.now() - startedAt, args.profile, profile, {
    hostname: new URL(baseUrl).hostname,
    runtime: health.runtime,
    projectRef: health.projectRef,
    buildId: health.buildId
  });

  const outputDirectory = path.join(projectRoot, "test-results", "load");
  await mkdir(outputDirectory, { recursive: true });
  const timestamp = report.generatedAt.replace(/[:.]/g, "-");
  const outputPath = path.join(outputDirectory, `smarttable-staging-${args.profile}-${timestamp}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Requests: ${report.metrics.requests}; failures: ${report.metrics.failures}; error rate: ${(report.metrics.errorRate * 100).toFixed(2)}%`);
  console.log(`Latency p50/p95/p99: ${report.metrics.p50Ms}/${report.metrics.p95Ms}/${report.metrics.p99Ms} ms`);
  console.log(`Throughput: ${report.metrics.requestsPerSecond} req/s`);
  console.log(`Report: ${path.relative(projectRoot, outputPath)}`);
  console.log(`Result: ${report.passed ? "PASS" : "FAIL"}`);
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Staging load test refused or failed: ${String(error?.message || error).slice(0, 500)}`);
  process.exitCode = 1;
});
