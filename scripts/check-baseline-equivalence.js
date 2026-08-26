import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const baselineDir = new URL("supabase/baseline/basic-1.0/", root);
const migrationsDir = new URL("supabase/migrations/", root);

function lower(value) {
  return String(value || "").toLowerCase();
}

function stripSqlComments(source = "") {
  return String(source || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function assertIncludes(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing ${token}.`);
}

function assertIncludesAll(source, tokens, label) {
  for (const token of tokens) assertIncludes(source, token, label);
}

function assertNoMatches(source, patterns, label) {
  for (const { pattern, description } of patterns) {
    assert.ok(!pattern.test(source), `${label} contains forbidden content: ${description}.`);
  }
}

const baselineCheck = spawnSync("node", ["scripts/check-basic-baseline.js"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});
assert.equal(baselineCheck.status, 0, baselineCheck.stderr || baselineCheck.stdout || "Baseline audit failed.");

const schemaSql = await readFile(new URL("0001_basic_1_0_schema.sql", baselineDir), "utf8");
const referenceSql = await readFile(new URL("0002_basic_1_0_required_reference_data.sql", baselineDir), "utf8");
const manifest = JSON.parse(await readFile(new URL("object-manifest.json", baselineDir), "utf8"));
const appCore = lower(await readFile(new URL("src/app-core.js", root), "utf8"));
const schema = lower(schemaSql);
const reference = lower(referenceSql);
const baselineSql = lower(`${schemaSql}\n${referenceSql}`);
const executableSql = lower(stripSqlComments(`${schemaSql}\n${referenceSql}`));

const migrationExpectations = [
  {
    file: "0050_multi_market_foundation.sql",
    baselineTokens: [
      "create table public.markets",
      "market_id uuid not null default",
      "references public.markets(id) on delete restrict",
      "'budapest'",
      "'europe/budapest'"
    ]
  },
  {
    file: "0051_resend_webhook_delivery_statuses.sql",
    baselineTokens: [
      "delivery_status text",
      "provider_message_id text",
      "status text not null default 'queued'",
      "delivered",
      "bounced",
      "complained"
    ]
  },
  {
    file: "0052_role_based_onboarding_foundation.sql",
    baselineTokens: [
      "create table public.partner_invitations",
      "token_hash text not null unique",
      "create table public.restaurant_users",
      "reservation_staff",
      "marketing_staff",
      "read_only"
    ]
  },
  {
    file: "0053_restaurant_administration_fields.sql",
    baselineTokens: [
      "slug text",
      "reservation_acceptance_mode",
      "service_periods jsonb",
      "onboarding_status text",
      "duplicate_override_reason text"
    ]
  },
  {
    file: "0054_restaurant_capacity_and_lifecycle.sql",
    baselineTokens: [
      "create table public.restaurant_dining_areas",
      "create table public.restaurant_tables",
      "create table public.restaurant_service_capacity_overrides",
      "check (min_capacity <= max_capacity)",
      "unique (restaurant_id, table_identifier)"
    ]
  },
  {
    file: "0055_restaurant_admin_status_history.sql",
    baselineTokens: [
      "create table public.restaurant_status_history",
      "previous_status text",
      "new_status text not null",
      "changed_fields jsonb"
    ]
  },
  {
    file: "0056_fixed_monthly_restaurant_subscriptions.sql",
    baselineTokens: [
      "create table public.restaurant_billing_accounts",
      "create table public.restaurant_subscriptions",
      "create table public.billing_events",
      "create table public.billing_access_overrides",
      "idx_restaurant_subscriptions_one_active_fixed",
      "stripe_event_id text not null"
    ]
  }
];

for (const expectation of migrationExpectations) {
  const migration = lower(await readFile(new URL(expectation.file, migrationsDir), "utf8"));
  assert.ok(migration.length > 0, `${expectation.file} must be readable.`);
  assertIncludesAll(baselineSql, expectation.baselineTokens, `Baseline final-state coverage for ${expectation.file}`);
}

const appExpectedObjects = [
  "public_available_offers",
  "public_restaurant_cards",
  "reservation_overview",
  "create_reservation",
  "update_reservation_status",
  "track_restaurant_view",
  "admin_dashboard_stats",
  "partner_dashboard_stats",
  "restaurant_billing_accounts",
  "restaurant_subscriptions",
  "partner_invitations",
  "restaurant_users",
  "restaurant_status_history",
  "restaurant_tables",
  "analytics_events",
  "email_queue",
  "email_logs"
];

for (const object of appExpectedObjects) {
  assert.ok(schema.includes(object), `Baseline schema is missing app-required object ${object}.`);
}

for (const object of ["public_available_offers", "public_restaurant_cards", "reservation_overview"]) {
  assert.ok(appCore.includes(object), `Application no longer references expected object ${object}; update equivalence expectations if intentional.`);
}

assertIncludesAll(schema, [
  "create table public.smarttable_schema_baselines",
  "baseline_name text not null",
  "baseline_version text not null",
  "checksum text not null",
  "applied_environment text not null",
  "verification_status text not null"
], "Baseline metadata structure");

assertIncludesAll(reference, [
  "'nyc'",
  "'active'",
  "'budapest'",
  "'draft'",
  "'platform_mode'",
  "'basic'",
  "'public_test_data_visible'",
  "'trial'",
  "'complimentary_test'"
], "Required static rows");

assertNoMatches(executableSql, [
  { pattern: /\bhudson\s+hearth\b/i, description: "legacy Hudson Hearth demo seed" },
  { pattern: /\bcasa\s+luna\b/i, description: "legacy Casa Luna demo seed" },
  { pattern: /\bsmarttable\s+test\s+bistro\b/i, description: "SmartTable Test Bistro seed" },
  { pattern: /\bpoint-of-sale\b/i, description: "point-of-sale text" },
  { pattern: /\bpoint_of_sale\b/i, description: "point_of_sale text" },
  { pattern: /\bpos\b/i, description: "POS token" },
  { pattern: /\bmobility_provider_integrations\b/i, description: "obsolete integration table" },
  { pattern: /\bintegration_connections\b/i, description: "obsolete integration table" },
  { pattern: /\bmanual_performance_uploads\b/i, description: "obsolete integration table" },
  { pattern: /\bimported_reservations\b/i, description: "obsolete imported reservations table" },
  { pattern: /\bimported_guests\b/i, description: "obsolete imported guests table" },
  { pattern: /\breservation_sources\b/i, description: "obsolete reservation source table" },
  { pattern: /\bdrop\s+table\b/i, description: "DROP TABLE" },
  { pattern: /\btruncate\b/i, description: "TRUNCATE" },
  { pattern: /\bdelete\s+from\b/i, description: "DELETE FROM" }
], "Executable baseline SQL");

assert.equal(manifest.baseline?.historical_migrations_preserved, "0001-0056", "Manifest must record historical coverage through 0056.");
assert.equal(manifest.baseline?.normal_migration_chain_modified, false, "Manifest must record that historical migrations are unchanged.");
assert.equal(manifest.security?.test_data_publicly_excluded_by_views, true, "Manifest must record test-data public isolation.");
assert.equal(manifest.security?.reservation_capacity_update_locked_in_rpc, true, "Manifest must record reservation capacity locking.");

console.log("SmartTable BASIC 1.0 baseline equivalence check passed.");
