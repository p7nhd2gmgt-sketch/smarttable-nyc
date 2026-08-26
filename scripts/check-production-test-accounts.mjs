#!/usr/bin/env node
import {
  ACCOUNT_SPECS,
  TEST_RESTAURANT_NAME,
  TEST_RESTAURANT_SLUG,
  accountEmail,
  assert,
  assertProductionTarget,
  displayRole,
  findAuthUserByEmail,
  hasColumn,
  loadProductionLocalEnv,
  loadPostgrestSchema,
  parseArgs,
  restSelect
} from "./production-test-accounts-common.mjs";

function exactlyOne(rows, label) {
  assert(rows.length === 1, `${label} must have exactly one row; found ${rows.length}.`);
  return rows[0];
}

function selectList(schema, tableName, columns) {
  return columns.filter((column) => hasColumn(schema, tableName, column)).join(",");
}

async function main() {
  const args = parseArgs();
  const env = loadProductionLocalEnv();
  const target = await assertProductionTarget({ env, args, requireWrite: false, requireDeployedRef: false });
  const schema = await loadPostgrestSchema(target.supabase);

  const accounts = [];
  for (const spec of ACCOUNT_SPECS) {
    const email = accountEmail(spec);
    const authUser = await findAuthUserByEmail(target.supabase, email);
    assert(authUser, `Auth user is missing: ${email}`);
    const profileSelect = selectList(schema, "profiles", ["id", "email", "role", "status", "is_test_data", "restaurant_id"]);
    const profile = exactlyOne(
      await restSelect(target.supabase, "profiles", `email=eq.${encodeURIComponent(email)}&select=${profileSelect}`),
      `Profile ${email}`
    );
    assert(profile.role === spec.role, `Profile ${email} must have role ${spec.role}.`);
    if (hasColumn(schema, "profiles", "is_test_data")) assert(profile.is_test_data === true, `Profile ${email} must be marked is_test_data=true.`);
    accounts.push({
      email,
      role: displayRole(profile.role),
      auth_user_exists: true,
      profile_exists: true,
      is_test_data: hasColumn(schema, "profiles", "is_test_data") ? profile.is_test_data === true : "column_absent"
    });
  }

  const restaurantFilter = hasColumn(schema, "restaurants", "slug")
    ? `slug=eq.${encodeURIComponent(TEST_RESTAURANT_SLUG)}`
    : `name=eq.${encodeURIComponent(TEST_RESTAURANT_NAME)}`;
  const restaurant = exactlyOne(await restSelect(target.supabase, "restaurants", `${restaurantFilter}&select=*`), TEST_RESTAURANT_NAME);
  assert(restaurant.name === TEST_RESTAURANT_NAME, "SmartTable Test Bistro slug points to an unexpected restaurant name.");
  if (hasColumn(schema, "restaurants", "visible_on_guest_site")) {
    assert(restaurant.visible_on_guest_site === false, "SmartTable Test Bistro must not be visible on the guest site.");
  } else {
    assert(restaurant.status !== "approved", "SmartTable Test Bistro must use a non-approved status when production has no visibility flag.");
  }
  if (hasColumn(schema, "restaurants", "is_test_data")) assert(restaurant.is_test_data === true, "SmartTable Test Bistro must be marked is_test_data=true.");
  if (hasColumn(schema, "restaurants", "is_test_restaurant")) assert(restaurant.is_test_restaurant === true, "SmartTable Test Bistro must be marked is_test_restaurant=true.");

  const partnerEmail = accountEmail(ACCOUNT_SPECS.find((spec) => spec.key === "partner"));
  const assignments = await restSelect(
    target.supabase,
    "restaurant_users",
    `restaurant_id=eq.${encodeURIComponent(restaurant.id)}&email=eq.${encodeURIComponent(partnerEmail)}&select=${selectList(schema, "restaurant_users", ["id", "restaurant_id", "user_id", "email", "role", "status", "is_test_data"])}`
  );
  const assignment = exactlyOne(assignments, "Test Bistro owner assignment");
  assert(assignment.role === "owner", "Test Bistro partner assignment must have restaurant role owner.");
  assert(assignment.status === "active", "Test Bistro partner assignment must be active.");
  if (hasColumn(schema, "restaurant_users", "is_test_data")) assert(assignment.is_test_data === true, "Test Bistro partner assignment must be marked is_test_data=true.");

  console.log(JSON.stringify({
    status: "production_test_accounts_check_passed",
    production_domain: target.targetOrigin,
    production_project_ref: target.suppliedProjectRef,
    deployed_project_refs: target.deployed.exposed_project_refs,
    secrets_printed: false,
    accounts,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      status: restaurant.status,
      lifecycle_status: restaurant.onboarding_status || null,
      visible_on_guest_site: restaurant.visible_on_guest_site === true,
      is_test_data: hasColumn(schema, "restaurants", "is_test_data") ? restaurant.is_test_data === true : "column_absent",
      is_test_restaurant: hasColumn(schema, "restaurants", "is_test_restaurant") ? restaurant.is_test_restaurant === true : "column_absent"
    },
    partner_assignment: {
      email: assignment.email,
      role: assignment.role,
      status: assignment.status,
      is_test_data: hasColumn(schema, "restaurant_users", "is_test_data") ? assignment.is_test_data === true : "column_absent"
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
