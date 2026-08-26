#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ACCOUNT_SPECS,
  TEST_RESTAURANT_ID,
  TEST_RESTAURANT_NAME,
  TEST_RESTAURANT_SLUG,
  accountEmail,
  accountPassword,
  assert,
  displayRole,
  loadAndValidateStagingEnv,
  passwordLogin,
  projectRoot,
  restSelect,
  supabaseRequest,
  listAuthUsers
} from "./staging-test-accounts-common.mjs";

function exactlyOne(rows, label) {
  assert(rows.length === 1, `${label} must have exactly one row; found ${rows.length}.`);
  return rows[0];
}

async function profileFor(env, email) {
  const rows = await restSelect(env, "profiles", `email=eq.${encodeURIComponent(email)}&select=id,email,role,status,is_test_data,restaurant_id`);
  return exactlyOne(rows, `Profile ${email}`);
}

async function verifyAuthAndProfiles(env) {
  const authUsers = await listAuthUsers(env);
  const accounts = [];
  for (const spec of ACCOUNT_SPECS) {
    const email = accountEmail(env, spec);
    assert(accountPassword(env, spec), `${spec.passwordEnv} must be present.`);
    const matchingAuthUsers = authUsers.filter((user) => String(user.email || "").toLowerCase() === email);
    assert(matchingAuthUsers.length === 1, `Auth user ${email} must exist exactly once; found ${matchingAuthUsers.length}.`);
    const profile = await profileFor(env, email);
    assert(profile.role === spec.role, `Profile ${email} must have role ${spec.role}.`);
    assert(profile.is_test_data === true, `Profile ${email} must be marked is_test_data=true.`);
    accounts.push({
      label: spec.label,
      email,
      role: displayRole(profile.role),
      auth_user_present: true,
      profile_present: true,
      is_test_data: profile.is_test_data === true,
      password_source: `${spec.passwordEnv} in .env.staging.local`
    });
  }
  return accounts;
}

async function verifyRestaurantAndAssignment(env) {
  const byName = await restSelect(env, "restaurants", `name=eq.${encodeURIComponent(TEST_RESTAURANT_NAME)}&select=id,name,slug,status,onboarding_status,visible_on_guest_site,is_test_data,is_test_restaurant,owner_user_id`);
  const restaurant = exactlyOne(byName, TEST_RESTAURANT_NAME);
  assert(restaurant.id === TEST_RESTAURANT_ID, "SmartTable Test Bistro must use the reserved staging UUID.");
  if (restaurant.slug !== undefined) assert(restaurant.slug === TEST_RESTAURANT_SLUG, "SmartTable Test Bistro slug must match.");
  assert(restaurant.status === "approved", "SmartTable Test Bistro database status must be approved.");
  assert((restaurant.onboarding_status || "active") === "active", "SmartTable Test Bistro lifecycle status must be active.");
  assert(restaurant.is_test_data === true, "SmartTable Test Bistro must be marked is_test_data=true.");
  assert(restaurant.is_test_restaurant === true, "SmartTable Test Bistro must be marked is_test_restaurant=true.");
  assert(restaurant.visible_on_guest_site === false, "SmartTable Test Bistro must remain hidden from ordinary public search.");

  const partnerEmail = accountEmail(env, ACCOUNT_SPECS.find((spec) => spec.key === "partner"));
  const assignments = await restSelect(
    env,
    "restaurant_users",
    `restaurant_id=eq.${encodeURIComponent(restaurant.id)}&email=eq.${encodeURIComponent(partnerEmail)}&select=restaurant_id,user_id,email,role,status,is_test_data`
  );
  const assignment = exactlyOne(assignments, "Test Bistro partner assignment");
  assert(assignment.role === "owner", "Test Bistro partner must have restaurant role owner.");
  assert(assignment.status === "active", "Test Bistro partner assignment must be active.");
  assert(assignment.is_test_data === true, "Test Bistro partner assignment must be marked is_test_data=true.");
  assert(assignment.user_id === restaurant.owner_user_id, "Restaurant owner_user_id must match the partner assignment.");

  const duplicateAssignments = await restSelect(
    env,
    "restaurant_users",
    `restaurant_id=eq.${encodeURIComponent(restaurant.id)}&email=eq.${encodeURIComponent(partnerEmail)}&select=id`
  );
  assert(duplicateAssignments.length === 1, "No duplicate Test Bistro partner assignments are allowed.");

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    database_status: restaurant.status,
    lifecycle_status: restaurant.onboarding_status,
    visible_on_guest_site: restaurant.visible_on_guest_site,
    is_test_data: restaurant.is_test_data,
    is_test_restaurant: restaurant.is_test_restaurant,
    partner_assignment: {
      email: assignment.email,
      role: assignment.role,
      status: assignment.status,
      is_test_data: assignment.is_test_data
    }
  };
}

async function verifyGuestSupportRows(env) {
  const guestSpec = ACCOUNT_SPECS.find((spec) => spec.key === "guest");
  const guestEmail = accountEmail(env, guestSpec);
  const profile = await profileFor(env, guestEmail);
  const guests = await restSelect(env, "guests", `email=eq.${encodeURIComponent(guestEmail)}&select=id,user_id,email,status,email_verified`);
  const guest = exactlyOne(guests, "Guest support row");
  assert(guest.user_id === profile.id, "Guest support row must point to the guest auth/profile id.");
  assert(guest.status === "active", "Guest support row must be active.");
  assert(guest.email_verified === true, "Guest support row must be marked email_verified=true for staging login.");

  const guestProfiles = await restSelect(env, "guest_profiles", `guest_id=eq.${encodeURIComponent(guest.id)}&select=id,guest_id,user_id,profile_key`);
  assert(guestProfiles.length >= 1, "Guest account must have at least one guest_profiles row.");
  assert(guestProfiles.some((row) => row.user_id === profile.id && row.profile_key === guestEmail), "Guest profile must be linked to the guest auth/profile id.");
  return {
    guest_row_present: true,
    guest_profile_present: true,
    email_verified: guest.email_verified === true
  };
}

async function verifyAuthLoginsAndRls(env) {
  const sessions = {};
  for (const spec of ACCOUNT_SPECS) {
    const session = await passwordLogin(env, accountEmail(env, spec), accountPassword(env, spec));
    assert(session?.access_token, `${spec.label} must be able to sign in with the staging password.`);
    sessions[spec.key] = session.access_token;
  }

  const restaurantUsersQuery = "/rest/v1/restaurant_users?select=restaurant_id,email,role,status";
  const guestRows = await supabaseRequest(env, restaurantUsersQuery, { service: false, token: sessions.guest });
  assert(Array.isArray(guestRows) && guestRows.length === 0, "Guest must not read restaurant_users assignments.");

  const partnerRows = await supabaseRequest(env, restaurantUsersQuery, { service: false, token: sessions.partner });
  assert(Array.isArray(partnerRows), "Partner restaurant_users read must return an array.");
  assert(partnerRows.length >= 1, "Partner must read at least its own Test Bistro assignment.");
  assert(partnerRows.every((row) => row.restaurant_id === TEST_RESTAURANT_ID), "Partner must not read another restaurant assignment.");
  assert(partnerRows.some((row) => row.email === accountEmail(env, ACCOUNT_SPECS.find((spec) => spec.key === "partner")) && row.role === "owner"), "Partner must read its own owner assignment.");

  const adminRows = await supabaseRequest(env, restaurantUsersQuery, { service: false, token: sessions.admin });
  assert(Array.isArray(adminRows) && adminRows.length >= 1, "Admin must be able to read restaurant assignments.");

  const superadminRows = await supabaseRequest(env, restaurantUsersQuery, { service: false, token: sessions.superadmin });
  assert(Array.isArray(superadminRows) && superadminRows.length >= 1, "Superadmin must be able to read restaurant assignments.");

  return {
    guest_restaurant_users_visible: guestRows.length,
    partner_restaurant_users_all_scoped_to_test_bistro: true,
    admin_can_read_restaurant_assignments: adminRows.length >= 1,
    superadmin_can_read_restaurant_assignments: superadminRows.length >= 1
  };
}

function verifyRouteBoundarySourceGuards() {
  const appCore = readFileSync(path.join(projectRoot, "src/app-core.js"), "utf8");
  const publicApp = readFileSync(path.join(projectRoot, "public/app.js"), "utf8");
  assert(publicApp.includes('area === "superadmin"') && publicApp.includes('role === "super_admin"'), "Public route mapping must gate superadmin routes by super_admin role.");
  assert(appCore.includes("You cannot change your own role."), "Server must reject self role changes.");
  assert(appCore.includes("Only Super Admin can assign administrator roles."), "Server must restrict administrator role assignment to Super Admin.");
  assert(appCore.includes("restaurant_users") && appCore.includes("status=eq.active"), "Server must use active restaurant_users assignments for partner scoping.");
  return {
    guest_partner_admin_superadmin_routes_have_source_guards: true,
    self_promotion_guard_present: true,
    superadmin_assignment_guard_present: true,
    partner_restaurant_scope_guard_present: true
  };
}

async function main() {
  const { env, projectRef, linkedProjectName } = loadAndValidateStagingEnv({ requireAnonKey: true });
  const accounts = await verifyAuthAndProfiles(env);
  const restaurant = await verifyRestaurantAndAssignment(env);
  const guestSupport = await verifyGuestSupportRows(env);
  const authAndRls = await verifyAuthLoginsAndRls(env);
  const sourceBoundaryGuards = verifyRouteBoundarySourceGuards();

  console.log(JSON.stringify({
    status: "staging_test_accounts_check_passed",
    staging_project_ref: projectRef,
    linked_project_name: linkedProjectName,
    secrets_printed: false,
    password_variables_present: ACCOUNT_SPECS.map((spec) => spec.passwordEnv),
    accounts,
    guest_support: guestSupport,
    restaurant,
    security_checks: {
      auth_login_succeeds_for_all_four_accounts: true,
      ...authAndRls,
      ...sourceBoundaryGuards
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
