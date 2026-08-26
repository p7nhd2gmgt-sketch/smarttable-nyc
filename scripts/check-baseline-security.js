import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const baselineDir = new URL("supabase/baseline/basic-1.0/", root);

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

function extractSecurityDefinerFunctions(sql) {
  const matches = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?\$\$;/gi)];
  return matches
    .map((match) => ({
      name: match[1],
      body: lower(match[0])
    }))
    .filter((fn) => fn.body.includes("security definer"));
}

function extractPolicies(sql) {
  return [...sql.matchAll(/create\s+policy\s+([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)\s+for\s+(all|select|insert|update|delete)\s+([\s\S]*?);/gi)]
    .map((match) => ({
      name: match[1],
      table: match[2],
      command: match[3].toLowerCase(),
      body: lower(match[4])
    }));
}

const schemaSql = await readFile(new URL("0001_basic_1_0_schema.sql", baselineDir), "utf8");
const referenceSql = await readFile(new URL("0002_basic_1_0_required_reference_data.sql", baselineDir), "utf8");
const manifest = JSON.parse(await readFile(new URL("object-manifest.json", baselineDir), "utf8"));
const schema = lower(schemaSql);
const executableSql = lower(stripSqlComments(`${schemaSql}\n${referenceSql}`));

assertIncludesAll(schema, [
  "create table public.profiles",
  "create table public.restaurant_users",
  "create table public.partner_invitations",
  "create table public.audit_logs",
  "create table public.billing_events",
  "create table public.smarttable_schema_baselines"
], "Security-critical table set");

for (const table of Object.keys(manifest.tables || {})) {
  assertIncludes(schema, `alter table public.${table} enable row level security`, `RLS for ${table}`);
}

assertIncludesAll(schema, [
  "token_hash text not null unique",
  "expires_at timestamptz not null",
  "check (status in ('pending', 'accepted', 'expired', 'revoked'))",
  "check (restaurant_role in ('owner', 'manager', 'reservation_staff', 'marketing_staff', 'read_only'))"
], "Partner invitation token safety");

assertIncludesAll(schema, [
  "create or replace function public.is_admin",
  "create or replace function public.owns_restaurant",
  "role::text in ('admin', 'super_admin', 'superadmin')",
  "public.owns_restaurant(restaurant_id)",
  "public.owns_restaurant(id)"
], "Role and partner isolation helpers");

assertIncludesAll(schema, [
  "coalesce(r.is_test_restaurant, false) = false",
  "coalesce(o.is_test_offer, false) = false",
  "is_test_data boolean not null default false",
  "is_test_restaurant boolean not null default false",
  "is_test_offer boolean not null default false"
], "Test-data isolation");

assertIncludesAll(schema, [
  "revoke update, delete on public.audit_logs from anon, authenticated",
  "revoke update, delete on public.restaurant_status_history from anon, authenticated",
  "revoke update, delete on public.reservation_status_events from anon, authenticated",
  "revoke update, delete on public.billing_audit_events from anon, authenticated",
  "revoke update, delete on public.smarttable_schema_baselines from anon, authenticated"
], "Append-only audit/history grants");

assertIncludesAll(schema, [
  "create unique index idx_billing_events_stripe_event",
  "create unique index idx_restaurant_subscriptions_one_active_fixed",
  "billing_environment text not null default 'test'",
  "stripe_livemode boolean not null default false",
  "restaurant_subscriptions_admin_write"
], "Billing webhook and Stripe-state protection");

const securityDefinerFunctions = extractSecurityDefinerFunctions(schemaSql);
assert.ok(securityDefinerFunctions.length >= 8, "Expected SECURITY DEFINER functions were not detected.");
for (const fn of securityDefinerFunctions) {
  assert.ok(fn.body.includes("set search_path = public"), `SECURITY DEFINER function ${fn.name} must set search_path = public.`);
}

const policies = extractPolicies(schemaSql);
assert.ok(policies.length > 0, "No RLS policies detected.");
for (const policy of policies) {
  const isWrite = ["all", "insert", "update", "delete"].includes(policy.command);
  if (!isWrite) continue;
  assert.ok(!/insert_public/.test(policy.name), `Direct public insert policy is not allowed: ${policy.table}.${policy.name}`);
  assert.ok(!/^\s*(with\s+check\s*)?\(?\s*true\s*\)?\s*$/i.test(policy.body), `Overly broad write policy is not allowed: ${policy.table}.${policy.name}`);
  assert.ok(
    /public\.is_admin\(\)|public\.owns_restaurant\(|auth\.uid\(\)|auth\.role\(\)\s*=\s*'service_role'/.test(policy.body),
    `Write policy ${policy.table}.${policy.name} lacks a server-authoritative auth boundary.`
  );
}

assertNoMatches(executableSql, [
  { pattern: /\bsupabase_service_role_key\b/i, description: "service role environment variable name" },
  { pattern: /\bresend_api_key\b/i, description: "Resend secret environment variable name" },
  { pattern: /\bstripe_secret_key\b/i, description: "Stripe secret environment variable name" },
  { pattern: /\bsk_(live|test)_[a-z0-9]/i, description: "Stripe-like secret value" },
  { pattern: /\beyj[a-z0-9_-]{16,}\b/i, description: "JWT-like token" },
  { pattern: /\bpoint-of-sale\b/i, description: "point-of-sale text" },
  { pattern: /\bpoint_of_sale\b/i, description: "point_of_sale text" },
  { pattern: /\bpos\b/i, description: "POS token" },
  { pattern: /\btoast\b/i, description: "Toast provider reference" },
  { pattern: /\bsquare\b/i, description: "Square provider reference" },
  { pattern: /\bclover\b/i, description: "Clover provider reference" },
  { pattern: /\blightspeed\b/i, description: "Lightspeed provider reference" },
  { pattern: /\bmicros\b/i, description: "Micros provider reference" },
  { pattern: /\bhudson\s+hearth\b/i, description: "legacy demo restaurant" },
  { pattern: /\bcasa\s+luna\b/i, description: "legacy demo restaurant" },
  { pattern: /\bsmarttable\s+test\s+bistro\b/i, description: "test bistro seed data" }
], "Executable baseline SQL");

console.log("SmartTable BASIC 1.0 baseline security check passed.");
