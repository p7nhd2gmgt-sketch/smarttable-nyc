import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);

function lower(value) {
  return String(value || "").toLowerCase();
}

function matchesAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
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

const files = (await readdir(migrationsDir))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

assert.ok(files.length > 0, "No Supabase migrations were found.");

const numbers = files.map((name) => Number(name.slice(0, 4)));
const seen = new Set();
for (let index = 0; index < numbers.length; index += 1) {
  const number = numbers[index];
  assert.ok(!seen.has(number), `Duplicate migration number ${String(number).padStart(4, "0")}.`);
  seen.add(number);
  assert.equal(number, index + 1, `Migration numbering must be contiguous at ${files[index]}.`);
}

const migrations = new Map();
const legacyUnsafeStatements = [];
for (const file of files) {
  const source = await readFile(new URL(file, migrationsDir), "utf8");
  migrations.set(file, source);
  const migrationNumber = Number(file.slice(0, 4));

  const statementSource = stripSqlComments(source);
  const normalized = lower(statementSource);
  const destructivePatterns = [
    /\bdrop\s+table\b/,
    /\bdrop\s+schema\b/,
    /\bdrop\s+database\b/,
    /(?:^|;)\s*truncate\s+(?:table\s+)?/m,
    /\bdelete\s+from\b/,
    /\balter\s+table\b[\s\S]{0,240}\bdrop\s+column\b/
  ];
  const hasDestructiveStatement = matchesAny(normalized, destructivePatterns);
  if (migrationNumber >= 51) {
    assert.ok(!hasDestructiveStatement, `${file} contains a destructive table/data operation.`);
  } else if (hasDestructiveStatement) {
    legacyUnsafeStatements.push(file);
  }

  const createTableStatements = source.match(/create\s+table\b[^;]+;/gi) || [];
  for (const statement of createTableStatements) {
    assert.ok(/create\s+table\s+if\s+not\s+exists/i.test(statement), `${file} has CREATE TABLE without IF NOT EXISTS.`);
  }

  const createIndexStatements = source.match(/create\s+(?:unique\s+)?index\b[^;]+;/gi) || [];
  for (const statement of createIndexStatements) {
    assert.ok(/create\s+(?:unique\s+)?index\s+if\s+not\s+exists/i.test(statement) || statement.includes("create unique index idx_restaurant_subscriptions_one_active_fixed"), `${file} has CREATE INDEX without IF NOT EXISTS or explicit existence guard.`);
  }

  const broadUpdates = [...statementSource.matchAll(/(^|\n)\s*update\s+public\.[\w.]+\s+set\b/gi)];
  for (const match of broadUpdates) {
    const statement = statementSource.slice(match.index || 0, statementSource.indexOf(";", match.index || 0) + 1);
    const hasWhere = /\bwhere\b/i.test(statement);
    const isKnownBackfill = /00(04|05|06|09|10|12)|0020|0035|0037|0041|0050/.test(file);
    assert.ok(hasWhere || isKnownBackfill || migrationNumber < 51, `${file} contains a broad UPDATE without an explicit WHERE.`);
  }
}

const latestRequired = [
  "0051_resend_webhook_delivery_statuses.sql",
  "0052_role_based_onboarding_foundation.sql",
  "0053_restaurant_administration_fields.sql",
  "0054_restaurant_capacity_and_lifecycle.sql",
  "0055_restaurant_admin_status_history.sql",
  "0056_fixed_monthly_restaurant_subscriptions.sql",
  "0062_partner_subscription_and_video_service_orders.sql"
];

for (const file of latestRequired) {
  assert.ok(migrations.has(file), `Required migration ${file} is missing.`);
}

if (legacyUnsafeStatements.length) {
  console.warn(`Historical migration cleanup statements detected before 0051: ${[...new Set(legacyUnsafeStatements)].join(", ")}`);
}

const migration51 = lower(migrations.get("0051_resend_webhook_delivery_statuses.sql"));
assertIncludesAll(migration51, [
  "alter table if exists public.email_logs",
  "email_logs_status_check",
  "alter table if exists public.email_queue",
  "email_queue_status_check",
  "delivered",
  "bounced",
  "complained"
], "0051 email delivery status migration");

const migration52 = lower(migrations.get("0052_role_based_onboarding_foundation.sql"));
assertIncludesAll(migration52, [
  "create table if not exists public.partner_invitations",
  "token_hash text not null unique",
  "check (status in ('pending', 'accepted', 'expired', 'revoked'))",
  "check (restaurant_role in ('owner', 'manager', 'reservation_staff', 'marketing_staff', 'read_only'))",
  "alter table public.partner_invitations enable row level security",
  "create or replace function public.is_admin()",
  "create or replace function public.owns_restaurant",
  "create policy partner_invitations_admin_all",
  "create policy partner_invitations_restaurant_owner_read",
  "revoke update, delete on public.audit_logs"
], "0052 RBAC/onboarding migration");

const migration53 = lower(migrations.get("0053_restaurant_administration_fields.sql"));
assertIncludesAll(migration53, [
  "slug text",
  "reservation_acceptance_mode",
  "service_periods",
  "idx_restaurants_slug_unique",
  "restaurants_reservation_acceptance_mode_check"
], "0053 restaurant administration fields migration");

const migration54 = lower(migrations.get("0054_restaurant_capacity_and_lifecycle.sql"));
assertIncludesAll(migration54, [
  "create table if not exists public.restaurant_dining_areas",
  "create table if not exists public.restaurant_tables",
  "create table if not exists public.restaurant_service_capacity_overrides",
  "check (min_capacity <= max_capacity)",
  "unique (restaurant_id, table_identifier)",
  "enable row level security",
  "public.owns_restaurant(restaurant_id)"
], "0054 restaurant capacity migration");

const migration55 = lower(migrations.get("0055_restaurant_admin_status_history.sql"));
assertIncludesAll(migration55, [
  "create table if not exists public.restaurant_status_history",
  "previous_status text",
  "new_status text not null",
  "reason text",
  "changed_fields jsonb",
  "enable row level security",
  "revoke update, delete on public.restaurant_status_history"
], "0055 restaurant status history migration");

const migration56 = lower(migrations.get("0056_fixed_monthly_restaurant_subscriptions.sql"));
assertIncludesAll(migration56, [
  "create table if not exists public.restaurant_billing_accounts",
  "create table if not exists public.billing_access_overrides",
  "create table if not exists public.billing_audit_events",
  "stripe_event_id",
  "idx_restaurant_subscriptions_one_active_fixed",
  "enable row level security",
  "stripe_livemode",
  "billing_environment"
], "0056 fixed monthly subscription migration");

const migration62 = lower(migrations.get("0062_partner_subscription_and_video_service_orders.sql"));
assertIncludesAll(migration62, [
  "create table if not exists public.video_service_orders",
  "amount_cents in (29900, 49900)",
  "monthly_price_cents = 14900",
  "video_service_orders_scoped_read",
  "revoke all on public.video_service_orders from authenticated",
  "grant select on public.video_service_orders to authenticated",
  "grant all on public.video_service_orders to service_role"
], "0062 launch billing catalog migration");

const all = lower([...migrations.values()].join("\n"));
for (const object of [
  "public.profiles",
  "public.restaurants",
  "public.offers",
  "public.reservations",
  "public.restaurant_users",
  "public.audit_logs",
  "public.email_logs",
  "public.email_queue",
  "public.restaurant_dining_areas",
  "public.restaurant_tables",
  "public.restaurant_status_history",
  "public.restaurant_billing_accounts",
  "public.video_service_orders"
]) {
  assertIncludes(all, object, `Migration chain object dependency ${object}`);
}

console.log("Migration chain checks passed.");
