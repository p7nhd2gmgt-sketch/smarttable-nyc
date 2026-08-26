import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const baselineDir = new URL("../supabase/baseline/basic-1.0/", import.meta.url);

const files = {
  schema: "0001_basic_1_0_schema.sql",
  referenceData: "0002_basic_1_0_required_reference_data.sql",
  manifest: "object-manifest.json",
  readme: "README.md",
  checksums: "SHA256SUMS"
};

function normalize(value) {
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

function countTopLevelTransactions(sql) {
  const withoutComments = stripSqlComments(sql);
  const beginCount = (withoutComments.match(/(^|\s)begin\s*;/gi) || []).length;
  const commitCount = (withoutComments.match(/(^|\s)commit\s*;/gi) || []).length;
  return { beginCount, commitCount };
}

function extractCreateTableNames(sql) {
  return [...sql.matchAll(/create\s+table\s+public\.([a-z0-9_]+)\s*\(/gi)].map((match) => match[1]);
}

function extractPolicies(sql) {
  return [...sql.matchAll(/create\s+policy\s+([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)\s+for\s+(all|select|insert|update|delete)\s+([\s\S]*?);/gi)]
    .map((match) => ({
      name: match[1],
      table: match[2],
      command: match[3].toLowerCase(),
      body: normalize(match[4])
    }));
}

const schemaSql = await readFile(new URL(files.schema, baselineDir), "utf8");
const referenceSql = await readFile(new URL(files.referenceData, baselineDir), "utf8");
const manifest = JSON.parse(await readFile(new URL(files.manifest, baselineDir), "utf8"));
const readme = await readFile(new URL(files.readme, baselineDir), "utf8");
const checksums = await readFile(new URL(files.checksums, baselineDir), "utf8");

const schema = normalize(schemaSql);
const reference = normalize(referenceSql);
const executableSql = `${schemaSql}\n${referenceSql}`;
const executableSqlWithoutComments = normalize(stripSqlComments(executableSql));

assert.equal(manifest.baseline?.name, "smarttable-basic", "Manifest baseline name mismatch.");
assert.equal(manifest.baseline?.version, "1.0", "Manifest baseline version mismatch.");
assert.equal(manifest.baseline?.normal_migration_chain_modified, false, "Manifest must record that the normal migration chain is unchanged.");
assertIncludes(readme, "Fresh-Environment Baseline", "README");
assertIncludes(readme, "The normal historical migration chain", "README");

for (const line of checksums.split(/\r?\n/).filter(Boolean)) {
  const match = /^([a-f0-9]{64})\s+(.+)$/.exec(line.trim());
  assert.ok(match, `Invalid checksum line: ${line}`);
  const [, expectedHash, fileName] = match;
  assert.ok(Object.values(files).includes(fileName), `Checksum references unexpected file ${fileName}.`);
  assert.notEqual(fileName, files.checksums, "Checksum file must not include itself.");
  const fileBuffer = await readFile(new URL(fileName, baselineDir));
  const actualHash = createHash("sha256").update(fileBuffer).digest("hex");
  assert.equal(actualHash, expectedHash, `Checksum mismatch for ${fileName}.`);
}

for (const [label, sql] of [
  ["schema baseline", schemaSql],
  ["reference data baseline", referenceSql]
]) {
  const { beginCount, commitCount } = countTopLevelTransactions(sql);
  assert.equal(beginCount, 1, `${label} must contain exactly one top-level BEGIN.`);
  assert.equal(commitCount, 1, `${label} must contain exactly one top-level COMMIT.`);
}

assertIncludesAll(schema, [
  "fresh-environment only",
  "raise exception 'smarttable basic 1.0 baseline is fresh-environment only",
  "create extension if not exists pgcrypto",
  "create type public.profile_role",
  "create type public.restaurant_status",
  "create type public.offer_status",
  "create type public.reservation_status"
], "Schema baseline safety/header");

assertNoMatches(executableSqlWithoutComments, [
  { pattern: /\bdrop\s+table\b/i, description: "DROP TABLE" },
  { pattern: /\bdrop\s+schema\b/i, description: "DROP SCHEMA" },
  { pattern: /\bdrop\s+database\b/i, description: "DROP DATABASE" },
  { pattern: /\btruncate\b/i, description: "TRUNCATE" },
  { pattern: /\bdelete\s+from\b/i, description: "DELETE FROM" },
  { pattern: /\balter\s+table\b[\s\S]{0,240}\bdrop\s+column\b/i, description: "ALTER TABLE ... DROP COLUMN" },
  { pattern: /\bhudson\s+hearth\b/i, description: "legacy Hudson Hearth demo data" },
  { pattern: /\bcasa\s+luna\b/i, description: "legacy Casa Luna demo data" },
  { pattern: /\bsmarttable\s+test\s+bistro\b/i, description: "SmartTable Test Bistro seed data" },
  { pattern: /\bpoint-of-sale\b/i, description: "point-of-sale reference" },
  { pattern: /\bpoint_of_sale\b/i, description: "point_of_sale reference" },
  { pattern: /\bpos\b/i, description: "POS reference" },
  { pattern: /\btoast\b/i, description: "Toast provider reference" },
  { pattern: /\bsquare\b/i, description: "Square provider reference" },
  { pattern: /\bclover\b/i, description: "Clover provider reference" },
  { pattern: /\blightspeed\b/i, description: "Lightspeed provider reference" },
  { pattern: /\bmicros\b/i, description: "Micros provider reference" },
  { pattern: /\bmobility_provider_integrations\b/i, description: "obsolete integration table" },
  { pattern: /\bintegration_connections\b/i, description: "obsolete integration table" },
  { pattern: /\bintegration_error_logs\b/i, description: "obsolete integration table" },
  { pattern: /\bmanual_performance_uploads\b/i, description: "obsolete integration table" },
  { pattern: /\bimported_reservations\b/i, description: "obsolete imported reservations table" },
  { pattern: /\bimported_guests\b/i, description: "obsolete imported guests table" },
  { pattern: /\breservation_sources\b/i, description: "obsolete reservation source table" },
  { pattern: /\bsupabase_service_role_key\b/i, description: "service role variable name in executable SQL" },
  { pattern: /\bresend_api_key\b/i, description: "Resend secret variable name in executable SQL" },
  { pattern: /\bstripe_secret_key\b/i, description: "Stripe secret variable name in executable SQL" },
  { pattern: /\bsk_(live|test)_[a-z0-9]/i, description: "Stripe-like secret value" }
], "Executable baseline SQL");

const requiredTables = Object.keys(manifest.tables || {}).sort();

const createdTables = new Set(extractCreateTableNames(schemaSql));
for (const table of requiredTables) {
  assert.ok(createdTables.has(table), `Schema baseline does not create public.${table}.`);
  assertIncludes(schema, `alter table public.${table} enable row level security`, `RLS enablement for ${table}`);
}
for (const table of createdTables) {
  assert.ok(requiredTables.includes(table), `Schema baseline creates public.${table}, but it is missing from object-manifest.json.`);
}

for (const policy of extractPolicies(schemaSql)) {
  const isWrite = ["all", "insert", "update", "delete"].includes(policy.command);
  if (!isWrite) continue;
  assert.ok(!/insert_public/.test(policy.name), `Direct public insert policy is not allowed: ${policy.table}.${policy.name}.`);
  assert.ok(!/^\s*(with\s+check\s*)?\(?\s*true\s*\)?\s*$/i.test(policy.body), `Overly broad write policy is not allowed: ${policy.table}.${policy.name}.`);
}

const requiredViews = [
  "public.public_restaurant_cards",
  "public.public_available_offers",
  "public.reservation_overview",
  "public.public_markets"
];
assertIncludesAll(schema, requiredViews.map((view) => `create or replace view ${view}`), "Required views");

const requiredFunctions = [
  "public.handle_new_user",
  "public.is_admin",
  "public.owns_restaurant",
  "public.create_reservation",
  "public.update_reservation_status",
  "public.admin_dashboard_stats",
  "public.partner_dashboard_stats",
  "public.track_restaurant_view"
];
assertIncludesAll(schema, requiredFunctions.map((fn) => `create or replace function ${fn}`), "Required helper/RPC functions");

for (const indexName of manifest.indexes || []) {
  assertIncludes(schema, `index ${indexName}`, `Manifest index ${indexName}`);
}

for (const triggerName of manifest.triggers || []) {
  assertIncludes(schema, `create trigger ${triggerName}`, `Manifest trigger ${triggerName}`);
}

for (const constraintName of manifest.constraints || []) {
  assertIncludes(schema, `constraint ${constraintName}`, `Manifest constraint ${constraintName}`);
}

for (const [groupName, values] of Object.entries(manifest.required_reference_data || {})) {
  for (const value of values) {
    assertIncludes(reference, `'${String(value).toLowerCase()}'`, `Required reference data group ${groupName}`);
  }
}

assertIncludesAll(schema, [
  "coalesce(r.is_test_restaurant, false) = false",
  "coalesce(o.is_test_offer, false) = false",
  "status = 'approved'",
  "visible_on_guest_site = true"
], "Public test-data isolation");

assertIncludesAll(schema, [
  "token_hash text not null unique",
  "check (restaurant_role in ('owner', 'manager', 'reservation_staff', 'marketing_staff', 'read_only'))",
  "revoke update, delete on public.audit_logs",
  "revoke update, delete on public.restaurant_status_history",
  "revoke update, delete on public.smarttable_schema_baselines",
  "create table public.smarttable_schema_baselines",
  "checksum text not null",
  "verification_status text not null",
  "unique (restaurant_id, table_identifier)",
  "check (min_capacity <= max_capacity)",
  "create unique index idx_billing_events_stripe_event",
  "idx_restaurant_subscriptions_one_active_fixed"
], "RBAC, restaurant administration, and billing constraints");

assertIncludesAll(reference, [
  "'nyc'",
  "'new york city'",
  "'usd'",
  "'america/new_york'",
  "'active'",
  "'budapest'",
  "'huf'",
  "'europe/budapest'",
  "'draft'",
  "'platform_mode'",
  "'basic'",
  "'public_test_data_visible'",
  "'trial'",
  "'basic'",
  "'professional'",
  "'enterprise'",
  "'complimentary_test'"
], "Required reference data");

assert.ok(manifest.tables && typeof manifest.tables === "object", "Manifest must include table inventory.");
for (const table of requiredTables) {
  assert.ok(Object.hasOwn(manifest.tables, table), `Manifest table inventory is missing ${table}.`);
}
assert.ok(Array.isArray(manifest.views) && manifest.views.includes("public_available_offers"), "Manifest must include public_available_offers.");
assert.ok(Array.isArray(manifest.functions) && manifest.functions.includes("create_reservation"), "Manifest must include create_reservation.");
assert.equal(manifest.security?.rls_enabled_for_all_manifest_tables, true, "Manifest must record RLS for all manifest tables.");
assert.ok(manifest.excludes?.legacy_demo_data?.includes("SmartTable Test Bistro"), "Manifest must record SmartTable Test Bistro as excluded legacy/test data.");

console.log("SmartTable BASIC 1.0 baseline audit passed.");
