#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertEnvFileIgnored, readStagingEnvFile } from "./staging-test-accounts-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const migrationPath = path.join(projectRoot, "supabase", "migrations", "0068_native_mobile_push.sql");
const linkedProjectPath = path.join(projectRoot, "supabase", ".temp", "project-ref");
const productionRefNames = [
  "PRODUCTION_SUPABASE_PROJECT_REF",
  "SMARTTABLE_PRODUCTION_SUPABASE_PROJECT_REF",
  "SUPABASE_PRODUCTION_PROJECT_REF",
  "SUPABASE_PROD_PROJECT_REF"
];

function clean(value = "") {
  return String(value || "").trim();
}

function projectRefFromUrl(value = "") {
  const parsed = new URL(clean(value));
  if (parsed.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) {
    throw new Error("SUPABASE_URL must be an HTTPS Supabase project origin.");
  }
  return parsed.hostname.split(".")[0];
}

function assertStagingIdentity(env) {
  const stagingRef = clean(env.STAGING_SUPABASE_PROJECT_REF);
  const linkedRef = clean(fs.readFileSync(linkedProjectPath, "utf8"));
  const urlRef = projectRefFromUrl(env.SUPABASE_URL);
  if (!stagingRef || stagingRef !== linkedRef || stagingRef !== urlRef) {
    throw new Error("Staging project identity mismatch; refusing database access.");
  }
  for (const name of productionRefNames) {
    if (clean(env[name]) && clean(env[name]) === stagingRef) {
      throw new Error("The verified staging reference matches a production reference; refusing database access.");
    }
  }
  if (/^production$/i.test(clean(env.SMARTTABLE_ENV)) || /^production$/i.test(clean(env.VERCEL_ENV))) {
    throw new Error("Production environment markers are forbidden for this staging operation.");
  }
  return stagingRef;
}

function extractSnapshot(result) {
  if (Array.isArray(result) && result[0]?.snapshot) {
    return typeof result[0].snapshot === "string" ? JSON.parse(result[0].snapshot) : result[0].snapshot;
  }
  const statement = Array.isArray(result) ? result.find((entry) => Array.isArray(entry?.result)) : null;
  const row = statement?.result?.[0];
  const snapshot = row?.snapshot || row?.[0] || null;
  return typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
}

assertEnvFileIgnored();
const { values: env } = readStagingEnvFile();
const stagingRef = assertStagingIdentity(env);
const accessToken = clean(env.SUPABASE_ACCESS_TOKEN);
if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required for the verified staging project.");

const endpoint = `https://api.supabase.com/v1/projects/${stagingRef}/database/query`;
async function query(sql) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  });
  const responseText = await response.text();
  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    body = { message: "Non-JSON database response" };
  }
  if (!response.ok) {
    throw new Error(`Staging database query failed (${response.status}): ${body?.message || body?.error || "unknown error"}`);
  }
  return body;
}

const inventorySql = `
select json_build_object(
  'core_rows', (
    select json_object_agg(table_name, row_count)
    from (
      select 'restaurants' as table_name, count(*)::bigint as row_count from public.restaurants
      union all select 'profiles', count(*)::bigint from public.profiles
      union all select 'offers', count(*)::bigint from public.offers
      union all select 'reservations', count(*)::bigint from public.reservations
    ) counts
  ),
  'core_ids', json_build_object(
    'restaurants', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.restaurants),
    'profiles', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.profiles),
    'offers', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.offers),
    'reservations', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.reservations)
  ),
  'tables', json_build_object(
    'mobile_push_devices', to_regclass('public.mobile_push_devices') is not null,
    'mobile_push_deliveries', to_regclass('public.mobile_push_deliveries') is not null
  ),
  'row_counts', json_build_object(
    'mobile_push_devices', coalesce((select n_live_tup::bigint from pg_stat_user_tables where schemaname='public' and relname='mobile_push_devices'), 0),
    'mobile_push_deliveries', coalesce((select n_live_tup::bigint from pg_stat_user_tables where schemaname='public' and relname='mobile_push_deliveries'), 0)
  ),
  'columns', (
    select coalesce(json_agg(json_build_object('table', table_name, 'column', column_name) order by table_name, ordinal_position), '[]'::json)
    from information_schema.columns
    where table_schema='public' and table_name in ('mobile_push_devices', 'mobile_push_deliveries')
  ),
  'constraints', (
    select coalesce(json_agg(json_build_object('table', c.relname, 'name', con.conname, 'definition', pg_get_constraintdef(con.oid)) order by c.relname, con.conname), '[]'::json)
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('mobile_push_devices', 'mobile_push_deliveries')
  ),
  'indexes', (
    select coalesce(json_agg(json_build_object('table', tablename, 'name', indexname) order by tablename, indexname), '[]'::json)
    from pg_indexes
    where schemaname='public' and tablename in ('mobile_push_devices', 'mobile_push_deliveries')
  ),
  'rls', (
    select coalesce(json_object_agg(relname, relrowsecurity), '{}'::json)
    from pg_class
    where oid in (to_regclass('public.mobile_push_devices'), to_regclass('public.mobile_push_deliveries'))
  ),
  'policies', (
    select coalesce(json_agg(json_build_object('table', tablename, 'name', policyname)), '[]'::json)
    from pg_policies
    where schemaname='public' and tablename in ('mobile_push_devices', 'mobile_push_deliveries')
  ),
  'grants', (
    select coalesce(json_agg(json_build_object('table', table_name, 'grantee', grantee, 'privilege', privilege_type) order by table_name, grantee, privilege_type), '[]'::json)
    from information_schema.role_table_grants
    where table_schema='public'
      and table_name in ('mobile_push_devices', 'mobile_push_deliveries')
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  )
) as snapshot;
`;

const migrationSql = fs.readFileSync(migrationPath, "utf8");
const checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");
const prohibited = /\b(?:drop\s+(?:table|view|function)|truncate\s+(?:table\s+)?|delete\s+from|update\s+[^;]+\s+set|insert\s+into)\b/i;
if (prohibited.test(migrationSql)) throw new Error("Migration contains prohibited destructive or data-changing SQL.");

const before = extractSnapshot(await query(inventorySql));
if (!before) throw new Error("Could not read the staging preflight snapshot.");
console.log(JSON.stringify({
  phase: "preflight",
  staging_identity_verified: true,
  migration: "0068_native_mobile_push.sql",
  checksum,
  core_row_counts: before.core_rows,
  core_id_fingerprints_recorded: true,
  existing_push_tables: before.tables,
  existing_push_rows: before.row_counts,
  destructive_or_data_changing_sql: false
}, null, 2));

if (!process.argv.includes("--apply")) {
  // Let the HTTP client close cleanly on Windows after the read-only preflight.
  await new Promise((resolve) => setTimeout(resolve, 1000));
} else {
if (!process.argv.includes("--confirm-staging-native-push")) {
  throw new Error("Apply requires --confirm-staging-native-push.");
}

await query(migrationSql);
const after = extractSnapshot(await query(inventorySql));
if (!after) throw new Error("Could not read the staging verification snapshot.");
if (JSON.stringify(before.core_rows) !== JSON.stringify(after.core_rows)) {
  throw new Error("Core row counts changed while applying migration 0068.");
}
if (JSON.stringify(before.core_ids) !== JSON.stringify(after.core_ids)) {
  throw new Error("Existing core row identifiers changed while applying migration 0068.");
}
if (!after.tables?.mobile_push_devices || !after.tables?.mobile_push_deliveries) {
  throw new Error("Native push tables are missing after migration 0068.");
}

const requiredColumns = {
  mobile_push_devices: [
    "id", "user_id", "restaurant_id", "device_id", "app_kind", "platform", "provider",
    "push_token_ciphertext", "token_hash", "enabled", "permission_status", "app_version", "locale",
    "timezone", "last_registered_at", "last_active_at", "last_success_at", "last_failure_at",
    "failure_count", "last_error_code", "created_at", "updated_at"
  ],
  mobile_push_deliveries: [
    "id", "device_id", "user_id", "restaurant_id", "app_kind", "notification_type", "entity_type",
    "entity_id", "provider", "provider_message_id", "idempotency_key", "status", "error_code",
    "attempt_number", "sent_at", "delivered_at", "created_at", "updated_at"
  ]
};
const installedColumns = new Set(after.columns.map((item) => `${item.table}.${item.column}`));
for (const [table, columns] of Object.entries(requiredColumns)) {
  for (const column of columns) {
    if (!installedColumns.has(`${table}.${column}`)) throw new Error(`Missing native push column: ${table}.${column}`);
  }
}

for (const table of Object.keys(requiredColumns)) {
  if (!after.rls?.[table]) throw new Error(`RLS is not enabled on ${table}.`);
  const unsafe = after.grants.filter((grant) => grant.table === table && ["PUBLIC", "anon", "authenticated"].includes(grant.grantee));
  if (unsafe.length) throw new Error(`Unsafe client grants remain on ${table}.`);
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    if (!after.grants.some((grant) => grant.table === table && grant.grantee === "service_role" && grant.privilege === privilege)) {
      throw new Error(`Missing service_role ${privilege} grant on ${table}.`);
    }
  }
}
if (after.policies.length) throw new Error("Native push tables must not expose direct client RLS policies.");

const indexNames = new Set(after.indexes.map((item) => item.name));
for (const name of [
  "mobile_push_devices_token_lookup_idx",
  "mobile_push_devices_user_active_idx",
  "mobile_push_devices_restaurant_active_idx",
  "mobile_push_deliveries_ticket_idx"
]) {
  if (!indexNames.has(name)) throw new Error(`Missing native push index: ${name}`);
}

console.log(JSON.stringify({
  phase: "verified",
  staging_identity_verified: true,
  migration: "0068_native_mobile_push.sql",
  core_row_counts_unchanged: true,
  existing_core_row_ids_unchanged: true,
  native_push_tables_ready: true,
  rls_enabled: after.rls,
  direct_client_policies: after.policies.length,
  unsafe_client_grants: 0,
  push_row_counts: after.row_counts
}, null, 2));
}
