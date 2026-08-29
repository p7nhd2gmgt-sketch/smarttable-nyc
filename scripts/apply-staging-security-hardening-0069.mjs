#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertEnvFileIgnored, readStagingEnvFile } from "./staging-test-accounts-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const migrationName = "0069_security_hardening.sql";
const migrationPath = path.join(projectRoot, "supabase", "migrations", migrationName);
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
  'profile_trigger', exists(
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_protect_security_fields'
      and not tgisinternal
  ),
  'unsafe_sensitive_grants', (
    select count(*)::int
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'profiles', 'restaurants', 'restaurant_users', 'reservations',
        'reservation_overview', 'offers', 'restaurant_reviews_overview',
        'admin_notifications_overview', 'audit_logs', 'payment_events', 'subscriptions'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'unsafe_admin_rpc_grants', (
    select count(*)::int
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'admin_dashboard_stats'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  )
) as snapshot;
`;

const migrationSql = fs.readFileSync(migrationPath, "utf8");
const checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");
const dataMutation = /\b(?:truncate\s+(?:table\s+)?|delete\s+from|insert\s+into|drop\s+(?:table|view))\b/i;
if (dataMutation.test(migrationSql)) {
  throw new Error("Migration contains prohibited destructive or row-changing SQL.");
}

const before = extractSnapshot(await query(inventorySql));
if (!before) throw new Error("Could not read the staging preflight snapshot.");
console.log(JSON.stringify({
  phase: "preflight",
  staging_identity_verified: true,
  migration: migrationName,
  checksum,
  core_row_counts: before.core_rows,
  core_id_fingerprints_recorded: true,
  destructive_or_row_changing_sql: false,
  existing_profile_security_trigger: before.profile_trigger,
  existing_unsafe_sensitive_grants: before.unsafe_sensitive_grants,
  existing_unsafe_admin_rpc_grants: before.unsafe_admin_rpc_grants
}, null, 2));

if (!process.argv.includes("--apply")) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  process.exit(0);
}
if (!process.argv.includes("--confirm-staging-security-hardening")) {
  throw new Error("Apply requires --confirm-staging-security-hardening.");
}

await query(migrationSql);
const after = extractSnapshot(await query(inventorySql));
if (!after) throw new Error("Could not read the staging verification snapshot.");
if (JSON.stringify(before.core_rows) !== JSON.stringify(after.core_rows)) {
  throw new Error("Core row counts changed while applying migration 0069.");
}
if (JSON.stringify(before.core_ids) !== JSON.stringify(after.core_ids)) {
  throw new Error("Existing core row identifiers changed while applying migration 0069.");
}
if (!after.profile_trigger) throw new Error("Profile security trigger is missing after migration 0069.");
if (after.unsafe_sensitive_grants !== 0) throw new Error("Unsafe direct sensitive table grants remain after migration 0069.");
if (after.unsafe_admin_rpc_grants !== 0) throw new Error("Unsafe admin RPC grants remain after migration 0069.");

console.log(JSON.stringify({
  phase: "verified",
  staging_identity_verified: true,
  migration: migrationName,
  checksum,
  core_row_counts_unchanged: true,
  core_id_fingerprints_unchanged: true,
  profile_security_trigger: true,
  unsafe_sensitive_grants: 0,
  unsafe_admin_rpc_grants: 0,
  production_touched: false
}, null, 2));

