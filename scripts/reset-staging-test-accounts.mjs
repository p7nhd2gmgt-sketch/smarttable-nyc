#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  ACCOUNT_SPECS,
  TEST_RESTAURANT_ID,
  TEST_RESTAURANT_NAME,
  accountEmail,
  assert,
  displayRole,
  findAuthUserByEmail,
  loadAndValidateStagingEnv,
  loadPostgrestSchema,
  projectRoot,
  restSelect,
  supabaseRequest,
  tableColumns,
  tableExists
} from "./staging-test-accounts-common.mjs";

const TEST_ACCOUNT_KEYS = new Set(ACCOUNT_SPECS.map((spec) => spec.key));

function encodeValue(value) {
  return encodeURIComponent(String(value));
}

function inFilter(values) {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  if (!unique.length) return "";
  return `in.(${unique.map(encodeValue).join(",")})`;
}

function hasColumn(schema, table, column) {
  return tableColumns(schema, table).has(column);
}

async function safeDelete(env, schema, table, filter, results, reason) {
  if (!tableExists(schema, table) || !filter) return;
  await supabaseRequest(env, `/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  results.push({ table, filter: filter.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[email-redacted]"), reason });
}

async function deleteByColumn(env, schema, table, column, values, results, reason) {
  if (!hasColumn(schema, table, column)) return;
  const filter = inFilter(values);
  if (!filter) return;
  await safeDelete(env, schema, table, `${column}=${filter}`, results, reason);
}

async function collectRowsByColumn(env, schema, table, column, values, select = "*") {
  if (!hasColumn(schema, table, column)) return [];
  const filter = inFilter(values);
  if (!filter) return [];
  return restSelect(env, table, `${column}=${filter}&select=${encodeURIComponent(select)}`).catch(() => []);
}

async function deleteAuthUser(env, userId) {
  await supabaseRequest(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE"
  });
}

function runSetup() {
  const result = spawnSync(process.execPath, ["scripts/setup-staging-test-accounts.mjs"], {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`setup-staging-test-accounts.mjs failed with exit code ${result.status ?? "unknown"}.`);
  }
}

async function main() {
  const { env, projectRef, linkedProjectName } = loadAndValidateStagingEnv({ generatePasswords: true });
  const schema = await loadPostgrestSchema(env);
  for (const table of ["profiles", "restaurants", "restaurant_users"]) {
    assert(tableExists(schema, table), `Required staging table is missing: ${table}`);
  }

  const emails = ACCOUNT_SPECS.map((spec) => accountEmail(env, spec));
  const passwordSources = ACCOUNT_SPECS.map((spec) => spec.passwordEnv);
  const authUsers = [];
  for (const spec of ACCOUNT_SPECS) {
    assert(TEST_ACCOUNT_KEYS.has(spec.key), `Unexpected account spec key: ${spec.key}`);
    const user = await findAuthUserByEmail(env, accountEmail(env, spec));
    if (user?.id) authUsers.push({ ...spec, id: user.id, email: user.email || accountEmail(env, spec) });
  }

  const authUserIds = authUsers.map((user) => user.id);
  const deletedRelations = [];

  const restaurantRows = [
    ...(await collectRowsByColumn(env, schema, "restaurants", "id", [TEST_RESTAURANT_ID], "id,name")),
    ...(await collectRowsByColumn(env, schema, "restaurants", "name", [TEST_RESTAURANT_NAME], "id,name"))
  ];
  const restaurantIds = [...new Set(restaurantRows.filter((row) => row.name === TEST_RESTAURANT_NAME).map((row) => row.id).filter(Boolean))];

  const guestRowsByEmail = await collectRowsByColumn(env, schema, "guests", "email", emails, "id,user_id,email");
  const guestIds = guestRowsByEmail.map((row) => row.id).filter(Boolean);

  await deleteByColumn(env, schema, "guest_profiles", "guest_id", guestIds, deletedRelations, "staging guest profile reset");
  await deleteByColumn(env, schema, "guest_profiles", "user_id", authUserIds, deletedRelations, "staging guest profile reset");
  await deleteByColumn(env, schema, "guest_profiles", "profile_key", emails, deletedRelations, "staging guest profile reset");

  for (const table of [
    "communication_preferences",
    "communication_consents",
    "user_legal_consents",
    "data_export_requests",
    "security_events",
    "favorites",
    "guest_favorites",
    "notification_preferences",
    "notifications"
  ]) {
    await deleteByColumn(env, schema, table, "user_id", authUserIds, deletedRelations, "staging account relation reset");
    await deleteByColumn(env, schema, table, "email", emails, deletedRelations, "staging account relation reset");
  }

  await deleteByColumn(env, schema, "partner_invitations", "email", emails, deletedRelations, "staging partner invitation reset");
  await deleteByColumn(env, schema, "partner_invitations", "restaurant_id", restaurantIds, deletedRelations, "staging Test Bistro invitation reset");

  await deleteByColumn(env, schema, "restaurant_users", "user_id", authUserIds, deletedRelations, "staging restaurant assignment reset");
  await deleteByColumn(env, schema, "restaurant_users", "email", emails, deletedRelations, "staging restaurant assignment reset");
  await deleteByColumn(env, schema, "restaurant_users", "restaurant_id", restaurantIds, deletedRelations, "staging Test Bistro assignment reset");

  await deleteByColumn(env, schema, "guests", "id", guestIds, deletedRelations, "staging guest reset");
  await deleteByColumn(env, schema, "guests", "user_id", authUserIds, deletedRelations, "staging guest reset");
  await deleteByColumn(env, schema, "guests", "email", emails, deletedRelations, "staging guest reset");

  await deleteByColumn(env, schema, "profiles", "id", authUserIds, deletedRelations, "staging profile reset");
  await deleteByColumn(env, schema, "profiles", "email", emails, deletedRelations, "staging profile reset");

  const deletedAuthUsers = [];
  for (const user of authUsers) {
    await deleteAuthUser(env, user.id);
    deletedAuthUsers.push({
      email: accountEmail(env, user),
      role: displayRole(user.role),
      deleted: true
    });
  }

  runSetup();

  console.log(JSON.stringify({
    status: "staging_test_accounts_reset_complete",
    staging_project_ref: projectRef,
    linked_project_name: linkedProjectName,
    secrets_printed: false,
    password_sources: passwordSources.map((name) => `${name} in .env.staging.local`),
    deleted_auth_users: deletedAuthUsers,
    relation_cleanup_count: deletedRelations.length,
    restaurant_reset_scope: {
      name: TEST_RESTAURANT_NAME,
      id: TEST_RESTAURANT_ID,
      restaurant_record_deleted: false,
      assignment_recreated_by_setup: true
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
