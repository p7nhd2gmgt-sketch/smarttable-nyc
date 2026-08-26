import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_FEATURE_REGISTRY,
  DEFAULT_PLATFORM_SETTINGS
} from "../public/shared-contracts.js";
import { handleApiRequest } from "../src/app-core.js";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const requiredCommands = [
  ["run", "typecheck"],
  ["run", "lint"],
  ["run", "check:secrets"],
  ["test"],
  ["run", "build"],
  ["run", "test:e2e"],
  ["run", "check:basic-security-boundaries"],
  ["run", "check:basic-ui-readiness"],
  ["run", "check:basic-ui-behavior"],
  ["run", "check:basic-feature-completeness"],
  ["run", "check:route-protection"],
  ["run", "check:routes"],
  ["run", "check:public-experience"],
  ["run", "check:reservation-lifecycle"],
  ["run", "check:onboarding-migration"],
  ["run", "check:restaurant-administration"],
  ["run", "check:email"],
  ["run", "check:billing"],
  ["run", "check:stripe-webhook"],
  ["run", "check:subscription-access"],
  ["run", "check:billing-ui"],
  ["run", "check:billing-production-readiness"],
  ["run", "check:analytics"],
  ["run", "check:migration-chain"],
  ["run", "check:accessibility-readiness"]
];

async function readProjectFile(relativePath) {
  return await readFile(new URL(relativePath, root), "utf8");
}

function runCommand(args) {
  const label = `${npmCommand} ${args.join(" ")}`;
  console.log(`\n[release-audit] Running ${label}`);
  const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : npmCommand;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", npmCommand, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: rootPath,
    stdio: "inherit",
    shell: false,
    env: { ...process.env }
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  assert.equal(result.status, 0, `${label} failed with exit code ${result.status}.`);
}

function includesAll(source, tokens, label) {
  for (const token of tokens) {
    assert(source.includes(token), `${label} is missing ${token}.`);
  }
}

function excludesAll(source, tokens, label) {
  for (const token of tokens) {
    assert(!source.includes(token), `${label} must not include ${token}.`);
  }
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist.`);
  const bodyStart = source.indexOf("{", start);
  assert(bodyStart >= 0, `${name} must have a body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }
  throw new Error(`${name} function body could not be parsed.`);
}

async function api(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
}

async function assertReleaseEvidence() {
  const [
    packageJsonSource,
    appSource,
    appCore,
    serverSource,
    indexHtml,
    robotsTxt,
    sitemapXml,
    vercelJson,
    enLocale,
    esLocale,
    huLocale,
    envExample,
    migrationChainCheck,
    operationsChecklist,
    manualQaChecklist,
    releaseManifest
  ] = await Promise.all([
    readProjectFile("package.json"),
    readProjectFile("public/app.js"),
    readProjectFile("src/app-core.js"),
    readProjectFile("server.js"),
    readProjectFile("public/index.html"),
    readProjectFile("public/robots.txt"),
    readProjectFile("public/sitemap.xml"),
    readProjectFile("vercel.json"),
    readProjectFile("public/locales/en.json"),
    readProjectFile("public/locales/es.json"),
    readProjectFile("public/locales/hu.json"),
    readProjectFile(".env.example"),
    readProjectFile("scripts/check-migration-chain.js"),
    readProjectFile("SMARTTABLE_BASIC_1_0_OPERATIONS_CHECKLIST.md"),
    readProjectFile("SMARTTABLE_BASIC_1_0_MANUAL_QA.md"),
    readProjectFile("SMARTTABLE_BASIC_RELEASE_MANIFEST.md")
  ]);

  const packageJson = JSON.parse(packageJsonSource);
  assert.equal(packageJson.scripts["check:basic-feature-completeness"], "node scripts/check-basic-feature-completeness.js", "package.json must expose check:basic-feature-completeness.");
  assert.equal(packageJson.scripts["check:basic-release-audit"], "node scripts/check-basic-release-audit.js", "package.json must expose check:basic-release-audit.");

  assert.equal(DEFAULT_PLATFORM_SETTINGS.platform_mode, "basic", "BASIC must be the default release mode.");
  assert.equal(DEFAULT_PLATFORM_SETTINGS.ai_demo_visibility, false, "AI demo visibility must be off by default.");
  for (const [featureKey, feature] of Object.entries(PLATFORM_FEATURE_REGISTRY)) {
    if (feature.modes.includes("basic") && feature.status === "working") {
      assert(Array.isArray(feature.required_backend_support) && feature.required_backend_support.length, `${featureKey} must have backend evidence.`);
    }
    if (feature.status !== "working") {
      assert.equal(feature.public_visibility, false, `${featureKey} is not working and must not be public-visible.`);
    }
  }

  const publicShell = [indexHtml, functionBody(appSource, "renderGuest")].join("\n");
  excludesAll(publicShell, [
    "Coming soon",
    "Super Admin",
    "demo credentials",
    "AI Demand",
    "SmartTable AI",
    "Stripe",
    "OpenTable",
    "Resy",
    "SevenRooms"
  ], "Public BASIC shell");

  excludesAll(appSource, [
    "window.location.href = button.dataset.openNotificationUrl",
    "dangerouslySetInnerHTML",
    "eval(",
    "new Function("
  ], "Browser security surface");
  includesAll(appSource, [
    "function safeInternalNavigationUrl",
    "function canShowFeature(",
    "function guardProtectedAreaRoute(",
    "function setButtonPending(",
    "function updateMeta()"
  ], "Browser release safeguards");
  includesAll(appCore, [
    "function safeInternalActionUrl",
    "function runtimeHealthPayload",
    "database_reachable",
    "email_configured",
    "production_configuration_issues",
    "stripeDiagnostics",
    "requestIdFromHeaders",
    "logSafeServerEvent",
    "requireProfile(headers",
    "csrfOriginError",
    "mutationRateLimit",
    "verifyStripeWebhookSignature"
  ], "Server release safeguards");

  includesAll(serverSource, [
    "function routeMeta",
    "function injectSeo",
    "function serveRobots",
    "function serveSitemap",
    "function isNoIndexPath",
    "process.env.PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL"
  ], "SEO server support");
  for (const privatePath of ["/admin", "/partner", "/restaurant", "/account", "/login", "/signup/check-email", "/signup/welcome", "/forgot-password", "/reset-password", "/verify-email", "/auth/callback"]) {
    assert(serverSource.includes(`"${privatePath}"`), `${privatePath} must receive noindex metadata.`);
    assert(robotsTxt.includes(`Disallow: ${privatePath}`), `${privatePath} must be disallowed in robots.txt.`);
  }
  includesAll(indexHtml, [
    "<title>",
    "<meta name=\"description\"",
    "<meta name=\"robots\"",
    "property=\"og:title\"",
    "property=\"og:description\"",
    "property=\"og:image\"",
    "<link rel=\"canonical\"",
    "<link rel=\"icon\"",
    "type=\"application/ld+json\""
  ], "Base public metadata");
  assert(sitemapXml.includes("https://www.smarttablenyc.com/"), "Sitemap must use the production canonical host.");

  includesAll(vercelJson, [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy"
  ], "Vercel security headers");

  for (const [localeName, source] of [["en", enLocale], ["es", esLocale], ["hu", huLocale]]) {
    const messages = JSON.parse(source);
    for (const key of [
      "homepage_hero_title",
      "homepage_hero_subtitle",
      "homepage_hero_primary_cta",
      "homepage_hero_secondary_cta",
      "restaurants_seo_title",
      "restaurants_seo_description",
      "offers_seo_title",
      "offers_seo_description",
      "route_forbidden_title",
      "app_error_title"
    ]) {
      assert(String(messages[key] || "").trim(), `${localeName}.json is missing release key ${key}.`);
    }
  }

  includesAll(envExample, [
    "PUBLIC_BASE_URL=",
    "SUPABASE_URL=",
    "SUPABASE_ANON_KEY=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "EMAIL_FROM=",
    "RESEND_API_KEY=",
    "RESEND_WEBHOOK_SECRET=",
    "STRIPE_SECRET_KEY=",
    "STRIPE_WEBHOOK_SECRET="
  ], ".env.example release prerequisites");

  includesAll(migrationChainCheck, [
    "0051_resend_webhook_delivery_statuses.sql",
    "0052_role_based_onboarding_foundation.sql",
    "0053_restaurant_administration_fields.sql",
    "0054_restaurant_capacity_and_lifecycle.sql",
    "0055_restaurant_admin_status_history.sql",
    "0056_fixed_monthly_restaurant_subscriptions.sql"
  ], "Migration dependency checks");

  includesAll(operationsChecklist, [
    "Deployment Prerequisites",
    "Required Migrations",
    "Required Environment Variables",
    "Resend Setup",
    "Stripe Setup",
    "Supabase Setup",
    "Rollback Steps",
    "Health Check",
    "Smoke Test",
    "Manual QA",
    "Incident Contacts"
  ], "Operations checklist");
  includesAll(manualQaChecklist, [
    "## Public",
    "## Guest",
    "## Partner",
    "## Admin",
    "## Superadmin",
    "## Restaurant Administration",
    "## Reservations",
    "## Email",
    "## Billing",
    "## Analytics",
    "## Mobile",
    "## Accessibility",
    "## Security",
    "## Operations",
    "| Account/Role | Action | Expected Result | Pass/Fail | Notes |"
  ], "Manual QA checklist");
  includesAll(releaseManifest, [
    "## A. Enabled and fully functional",
    "## B. Hidden because external configuration is missing",
    "## C. Hidden because manual QA is incomplete",
    "## D. Admin-only",
    "## E. Test-only",
    "## F. Future/non-BASIC",
    "## G. Known low-risk limitations",
    "## H. Blocking issues",
    "## I. Required staging steps",
    "## J. Required production steps",
    "Stripe test Checkout",
    "Resend staging/production configuration",
    "Full browser manual QA",
    "Production smoke test",
    "POS integrations | Prohibited"
  ], "BASIC release manifest");

  const health = await api("GET", "/health");
  assert([200, 503].includes(health.status), "Health endpoint must return an explicit health status.");
  assert("database_reachable" in health.body, "Health must report database reachability.");
  assert("email_configured" in health.body, "Health must report email configuration.");
  assert("production_configuration_issues" in health.body, "Health must report production configuration issues.");
  assert(!JSON.stringify(health.body).match(/SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|STRIPE_SECRET_KEY|WEBHOOK_SECRET|authorization/i), "Health must not expose secrets or secret names.");

  const publicConfig = await api("GET", "/public/config");
  assert.equal(publicConfig.status, 200, "Public config must be reachable.");
  assert.equal(publicConfig.body.platform_mode, "basic", "Public config must report BASIC mode for release audit.");
  assert(!JSON.stringify(publicConfig.body).match(/SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|STRIPE_SECRET_KEY|WEBHOOK_SECRET|authorization/i), "Public config must not expose secrets.");

  const publicOffers = await api("GET", "/public/offers?lang=en");
  assert.equal(publicOffers.status, 200, "Public offers must be reachable.");
  assert(!(publicOffers.body.offers || []).some((offer) => offer.restaurant_name === "SmartTable Test Bistro" || offer.slug === "smarttable-test-bistro"), "Test/demo restaurant offers must not leak publicly without test mode.");

  for (const file of [
    "SMARTTABLE_BASIC_1_0_OPERATIONS_CHECKLIST.md",
    "SMARTTABLE_BASIC_1_0_MANUAL_QA.md",
    "SMARTTABLE_BASIC_RELEASE_MANIFEST.md",
    "scripts/check-basic-feature-completeness.js",
    "scripts/check-basic-release-audit.js"
  ]) {
    assert(existsSync(new URL(file, root)), `${file} must exist.`);
  }
}

for (const command of requiredCommands) {
  runCommand(command);
}

await assertReleaseEvidence();

console.log("BASIC 1.0 release audit checks passed.");
