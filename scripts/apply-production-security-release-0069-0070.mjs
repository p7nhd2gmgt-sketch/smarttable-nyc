#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assert,
  deployedProductionSnapshot,
  loadProductionLocalEnv,
  parseArgs,
  productionSupabaseConfig,
  STAGING_PROJECT_REF
} from "./production-test-accounts-common.mjs";
import { assertEnvFileIgnored, readStagingEnvFile } from "./staging-test-accounts-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const migrationNames = ["0069_security_hardening.sql", "0070_distributed_api_rate_limits.sql"];
const args = parseArgs();
const clean = (value = "") => String(value || "").trim().replace(/^['"]|['"]$/g, "");
const localHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim();
const localStatus = execFileSync("git", ["status", "--porcelain"], { cwd: projectRoot, encoding: "utf8" }).trim();

function extractSnapshot(result) {
  if (Array.isArray(result) && result[0]?.snapshot) {
    return typeof result[0].snapshot === "string" ? JSON.parse(result[0].snapshot) : result[0].snapshot;
  }
  const statement = Array.isArray(result) ? result.find((entry) => Array.isArray(entry?.result)) : null;
  const snapshot = statement?.result?.[0]?.snapshot || statement?.result?.[0]?.[0] || null;
  return typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
}

async function managementQuery(endpoint, accessToken, sql) {
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
    throw new Error(`Production database query failed (${response.status}): ${body?.message || body?.error || "unknown error"}`);
  }
  return body;
}

const productionEnv = loadProductionLocalEnv();
const production = productionSupabaseConfig(productionEnv);
const suppliedProjectRef = clean(args.values["project-ref"]);
assert(suppliedProjectRef, "--project-ref=<verified-production-ref> is required.");
assert(suppliedProjectRef !== STAGING_PROJECT_REF, "Refusing to target the staging Supabase project.");
assert(production.projectRef === suppliedProjectRef, "Local production Supabase project ref does not match --project-ref.");

const deployed = await deployedProductionSnapshot("https://www.smarttablenyc.com");
assert(deployed.health_runtime_mode === "production", "Production health endpoint must report runtime=production.");
assert(deployed.health_environment === "production", "Production health endpoint must report environment=production.");
assert(deployed.exposed_project_refs.length > 0, "The deployed production project ref is not verifiable.");
assert(deployed.exposed_project_refs.every((ref) => ref === suppliedProjectRef), "Deployed production project ref differs from --project-ref.");

assertEnvFileIgnored();
const { values: stagingControlEnv } = readStagingEnvFile();
const accessToken = clean(stagingControlEnv.SUPABASE_ACCESS_TOKEN);
assert(accessToken, "SUPABASE_ACCESS_TOKEN is required for the approved production rollout.");

const migrationSources = migrationNames.map((name) => ({
  name,
  sql: fs.readFileSync(path.join(projectRoot, "supabase", "migrations", name), "utf8")
}));
const securitySql = migrationSources[0].sql;
const limiterSql = migrationSources[1].sql;
assert(!/\b(?:truncate\s+(?:table\s+)?|delete\s+from|drop\s+(?:table|view))\b/i.test(securitySql), "0069 contains destructive or row-changing SQL.");
assert(!/\b(?:truncate\s+(?:table\s+)?|delete\s+from|drop\s+(?:table|view)|disable\s+row\s+level\s+security)\b/i.test(limiterSql), "0070 contains destructive or RLS-disabling SQL.");
assert(!/\b(?:insert\s+into|update)\s+public\.(?:restaurants|profiles|offers|reservations|restaurant_reviews)\b/i.test(`${securitySql}\n${limiterSql}`), "Core production business rows must not be changed by this release.");

const inventorySql = `
select json_build_object(
  'core_rows', (
    select json_object_agg(table_name, row_count)
    from (
      select 'restaurants' as table_name, count(*)::bigint as row_count from public.restaurants
      union all select 'profiles', count(*)::bigint from public.profiles
      union all select 'offers', count(*)::bigint from public.offers
      union all select 'reservations', count(*)::bigint from public.reservations
      union all select 'restaurant_reviews', count(*)::bigint from public.restaurant_reviews
      union all select 'auth_users', count(*)::bigint from auth.users
    ) counts
  ),
  'core_ids', json_build_object(
    'restaurants', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.restaurants),
    'profiles', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.profiles),
    'offers', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.offers),
    'reservations', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.reservations),
    'restaurant_reviews', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from public.restaurant_reviews),
    'auth_users', (select md5(coalesce(string_agg(id::text, '|' order by id::text), '')) from auth.users)
  ),
  'prerequisites', json_build_object(
    'profiles', to_regclass('public.profiles') is not null,
    'restaurants', to_regclass('public.restaurants') is not null,
    'offers', to_regclass('public.offers') is not null,
    'reservations', to_regclass('public.reservations') is not null,
    'restaurant_followers', to_regclass('public.restaurant_followers') is not null,
    'restaurant_reviews', to_regclass('public.restaurant_reviews') is not null,
    'is_admin', to_regprocedure('public.is_admin()') is not null
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
  ),
  'limiter_table', to_regclass('public.api_rate_limits') is not null,
  'limiter_rls', coalesce((
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'api_rate_limits'
  ), false),
  'limiter_rpc', to_regprocedure('public.consume_api_rate_limit(text,text,integer,integer)') is not null,
  'unsafe_limiter_table_grants', (
    select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'api_rate_limits'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'unsafe_limiter_rpc_grants', (
    select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'consume_api_rate_limit'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'service_limiter_rpc_grants', (
    select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'consume_api_rate_limit'
      and grantee = 'service_role' and privilege_type = 'EXECUTE'
  ),
  'migration_history', (
    select coalesce(json_agg(version order by version), '[]'::json)
    from supabase_migrations.schema_migrations
    where version in ('0069', '0070', '202608290069', '202608290070')
  ),
  'migration_history_columns', (
    select coalesce(json_agg(column_name order by ordinal_position), '[]'::json)
    from information_schema.columns
    where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
  ),
  'migration_history_column_details', (
    select coalesce(json_agg(json_build_object(
      'name', column_name,
      'nullable', is_nullable,
      'defaulted', column_default is not null,
      'type', data_type
    ) order by ordinal_position), '[]'::json)
    from information_schema.columns
    where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
  ),
  'recent_migration_history', (
    select coalesce(json_agg(version order by version desc), '[]'::json)
    from (
      select version from supabase_migrations.schema_migrations order by version desc limit 12
    ) recent
  )
) as snapshot;
`;

const endpoint = `https://api.supabase.com/v1/projects/${suppliedProjectRef}/database/query`;
const before = extractSnapshot(await managementQuery(endpoint, accessToken, inventorySql));
assert(before, "Could not read the production preflight snapshot.");
assert(Object.values(before.prerequisites || {}).every(Boolean), "Production schema prerequisites are incomplete.");

const checksums = Object.fromEntries(migrationSources.map(({ name, sql }) => [name, crypto.createHash("sha256").update(sql).digest("hex")]));
console.log(JSON.stringify({
  phase: "preflight",
  production_identity_verified: true,
  origin: deployed.origin,
  deployed_commit: deployed.health_commit || null,
  deployed_build_id: deployed.health_build_id || null,
  local_head: localHead,
  local_worktree_clean: !localStatus,
  migrations: migrationNames,
  checksums,
  core_row_counts: before.core_rows,
  core_id_fingerprints_recorded: true,
  prerequisites: before.prerequisites,
  existing_security_hardening: Boolean(before.profile_trigger && before.unsafe_sensitive_grants === 0 && before.unsafe_admin_rpc_grants === 0),
  existing_distributed_limiter: Boolean(before.limiter_table && before.limiter_rls && before.limiter_rpc),
  migration_history: before.migration_history,
  migration_history_columns: before.migration_history_columns,
  migration_history_column_details: before.migration_history_column_details,
  recent_migration_history: before.recent_migration_history,
  destructive_business_data_sql: false
}, null, 2));

if (!args.flags.has("apply")) process.exit(0);
assert(args.flags.has("confirm-production-security-release"), "Apply requires --confirm-production-security-release.");
const expectedCommit = clean(args.values["expected-commit"]);
assert(expectedCommit, "Apply requires --expected-commit=<approved-release-commit>.");
assert(expectedCommit === localHead, "--expected-commit must equal the currently checked out Git commit.");
assert(!localStatus, "Production apply requires a clean Git worktree.");

const transactionSql = `begin;
${securitySql}
${limiterSql}
insert into supabase_migrations.schema_migrations (
  version, statements, name, created_by, idempotency_key
) values (
  '0069',
  array[$migration_0069$${securitySql}$migration_0069$]::text[],
  'security_hardening',
  'smarttable-security-release',
  '${checksums["0069_security_hardening.sql"]}'
) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (
  version, statements, name, created_by, idempotency_key
) values (
  '0070',
  array[$migration_0070$${limiterSql}$migration_0070$]::text[],
  'distributed_api_rate_limits',
  'smarttable-security-release',
  '${checksums["0070_distributed_api_rate_limits.sql"]}'
) on conflict (version) do nothing;
commit;`;
await managementQuery(endpoint, accessToken, transactionSql);
const after = extractSnapshot(await managementQuery(endpoint, accessToken, inventorySql));
assert(after, "Could not read the production post-apply snapshot.");
assert(JSON.stringify(before.core_rows) === JSON.stringify(after.core_rows), "Core row counts changed while applying 0069/0070.");
assert(JSON.stringify(before.core_ids) === JSON.stringify(after.core_ids), "Core row identifiers changed while applying 0069/0070.");
assert(after.profile_trigger, "Profile security trigger is missing after 0069.");
assert(after.unsafe_sensitive_grants === 0, "Unsafe direct sensitive table grants remain after 0069.");
assert(after.unsafe_admin_rpc_grants === 0, "Unsafe admin RPC grants remain after 0069.");
assert(after.limiter_table && after.limiter_rls && after.limiter_rpc, "Distributed limiter schema is incomplete after 0070.");
assert(after.unsafe_limiter_table_grants === 0 && after.unsafe_limiter_rpc_grants === 0, "Direct client limiter grants remain after 0070.");
assert(after.service_limiter_rpc_grants >= 1, "The service role cannot execute the distributed limiter RPC.");
assert(Array.isArray(after.migration_history) && after.migration_history.includes("0069") && after.migration_history.includes("0070"), "0069/0070 are missing from the migration history.");

console.log(JSON.stringify({
  phase: "verified",
  production_identity_verified: true,
  migrations: migrationNames,
  expected_release_commit: expectedCommit,
  core_row_counts_unchanged: true,
  core_id_fingerprints_unchanged: true,
  profile_security_trigger: true,
  unsafe_sensitive_grants: 0,
  unsafe_admin_rpc_grants: 0,
  limiter_table: true,
  limiter_rls: true,
  limiter_rpc: true,
  direct_client_limiter_grants: 0,
  service_role_execute: true,
  migration_history: after.migration_history,
  production_touched: true
}, null, 2));
