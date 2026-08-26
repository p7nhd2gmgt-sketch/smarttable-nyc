#!/usr/bin/env node
import {
  ACCOUNT_SPECS,
  TEST_RESTAURANT_ID,
  TEST_RESTAURANT_NAME,
  TEST_RESTAURANT_SLUG,
  accountEmail,
  accountPassword,
  assert,
  assertProductionTarget,
  displayRole,
  filterPayload,
  findAuthUserByEmail,
  hasColumn,
  loadPostgrestSchema,
  loadProductionLocalEnv,
  parseArgs,
  restDelete,
  restInsert,
  restPatch,
  restSelect,
  restUpsert,
  tableExists,
  supabaseRequest
} from "./production-test-accounts-common.mjs";

function nowIso() {
  return new Date().toISOString();
}

function requirePasswords(env) {
  const missing = ACCOUNT_SPECS
    .filter((spec) => !accountPassword(env, spec))
    .map((spec) => spec.passwordEnv);
  assert(!missing.length, `Missing required password environment variables: ${missing.join(", ")}`);
}

async function createOrUpdateAuthUser(config, env, spec) {
  const email = accountEmail(spec);
  const existing = await findAuthUserByEmail(config, email);
  const metadata = {
    role: spec.role,
    is_test_data: true,
    smarttable_production_test_account: true
  };
  if (!existing) {
    const created = await supabaseRequest(config, "/auth/v1/admin/users", {
      method: "POST",
      body: {
        email,
        password: accountPassword(env, spec),
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: metadata
      }
    });
    return {
      ...spec,
      id: created?.id || created?.user?.id,
      email,
      action: "created"
    };
  }

  await supabaseRequest(config, `/auth/v1/admin/users/${existing.id}`, {
    method: "PUT",
    body: {
      password: accountPassword(env, spec),
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata || {}),
        ...metadata
      },
      app_metadata: {
        ...(existing.app_metadata || {}),
        ...metadata
      }
    }
  });
  return {
    ...spec,
    id: existing.id,
    email,
    action: "updated"
  };
}

async function ensureProfile(config, schema, account, restaurantId = null) {
  const payload = filterPayload(schema, "profiles", {
    id: account.id,
    restaurant_id: restaurantId,
    email: account.email,
    full_name: account.fullName,
    phone: null,
    role: account.role,
    preferred_language: "en",
    status: "active",
    is_test_data: true,
    invited_at: account.role === "partner" ? nowIso() : null,
    invitation_status: account.role === "partner" ? "accepted" : null,
    metadata: {
      source: "production_test_account_setup",
      test_account_role: displayRole(account.role),
      password_source: account.passwordEnv
    },
    created_at: nowIso(),
    updated_at: nowIso()
  });
  const rows = await restUpsert(config, "profiles", "id", payload);
  return rows?.[0] || payload;
}

async function ensureGuestSupportRows(config, schema, guestAccount) {
  if (!tableExists(schema, "guests") || !tableExists(schema, "guest_profiles")) return;
  const guestRows = await restUpsert(config, "guests", "email", filterPayload(schema, "guests", {
    user_id: guestAccount.id,
    email: guestAccount.email,
    full_name: guestAccount.fullName,
    first_name: "SmartTable",
    last_name: "Guest",
    selected_language: "en",
    email_verified: true,
    status: "active",
    metadata: {
      source: "production_test_account_setup",
      is_test_data: true
    },
    created_at: nowIso(),
    updated_at: nowIso()
  }));
  const guest = guestRows?.[0] || null;
  if (!guest?.id) return;
  await restUpsert(config, "guest_profiles", "profile_key", filterPayload(schema, "guest_profiles", {
    guest_id: guest.id,
    user_id: guestAccount.id,
    profile_key: guestAccount.email,
    cuisine_preferences: ["Modern American"],
    food_preferences: ["production test"],
    drink_preferences: [],
    dietary_needs: [],
    atmosphere_preferences: ["casual"],
    dining_occasions: ["testing"],
    dining_companions: ["friends"],
    typical_party_size: "2",
    preferred_days: ["fri", "sat"],
    preferred_times: ["dinner"],
    spending_range: "$$",
    selected_discount_levels: ["20", "30"],
    minimum_interesting_discount: 20,
    notification_preferences: ["email"],
    notification_frequency: "important",
    metadata: {
      source: "production_test_account_setup",
      is_test_data: true
    },
    created_at: nowIso(),
    updated_at: nowIso()
  }));
}

async function findTestRestaurant(config, schema) {
  if (hasColumn(schema, "restaurants", "slug")) {
    const bySlug = await restSelect(config, "restaurants", `slug=eq.${encodeURIComponent(TEST_RESTAURANT_SLUG)}&select=*`);
    if (bySlug.length > 1) throw new Error("More than one SmartTable Test Bistro row exists for the approved slug.");
    return bySlug[0] || null;
  }
  const byName = await restSelect(config, "restaurants", `name=eq.${encodeURIComponent(TEST_RESTAURANT_NAME)}&select=*`);
  if (byName.length > 1) throw new Error("More than one SmartTable Test Bistro row exists for the approved test name.");
  return byName[0] || null;
}

async function ensureRestaurant(config, schema, partnerAccount, superadminAccount) {
  const existing = await findTestRestaurant(config, schema);
  const hasPublicVisibilityColumn = hasColumn(schema, "restaurants", "visible_on_guest_site");
  const restaurantPayload = filterPayload(schema, "restaurants", {
    id: existing?.id || TEST_RESTAURANT_ID,
    name: TEST_RESTAURANT_NAME,
    legal_name: "SmartTable Test Bistro LLC (Production Test Data)",
    slug: TEST_RESTAURANT_SLUG,
    email: "test-bistro@smarttable.com",
    contact_email: "test-bistro@smarttable.com",
    primary_email: "test-bistro@smarttable.com",
    reservation_email: "test-bistro@smarttable.com",
    phone: "+12125550100",
    website: "https://smarttablenyc.com",
    address: "123 Production Test Avenue, New York, NY 10001",
    street_address: "123 Production Test Avenue",
    district: "Manhattan",
    neighborhood: "Manhattan",
    city: "New York",
    state_region: "NY",
    postal_code: "10001",
    country: "US",
    cuisine: "Modern American",
    cuisine_type: "Modern American",
    price_range: "$$",
    price_level: "$$",
    description: "Production-only SmartTable test restaurant for account and role verification. No public guest reservations are created from this record.",
    short_description: "Production-only test restaurant.",
    full_description: "Production-only SmartTable Test Bistro record used for approved account and RBAC verification.",
    primary_timezone: "America/New_York",
    timezone: "America/New_York",
    currency_code: "USD",
    default_language: "en",
    supported_languages: ["en", "es", "hu"],
    owner_user_id: partnerAccount.id,
    status: hasPublicVisibilityColumn ? "approved" : "pending",
    onboarding_status: "active",
    visible_on_guest_site: false,
    is_test_data: true,
    is_test_restaurant: true,
    accepts_reservation_requests: true,
    reservation_provider: "internal_test",
    partner_approval_required: true,
    auto_confirmation: false,
    min_party_size: 1,
    max_party_size: 8,
    settings: {
      source: "production_test_account_setup",
      is_test_data: true,
      no_real_reservation: true,
      public_search_excluded: true
    },
    billing_plan: "complimentary_test",
    billing_status: "active",
    created_by: superadminAccount.id,
    updated_by: superadminAccount.id,
    sort_order: 9999,
    created_at: nowIso(),
    updated_at: nowIso()
  });

  const rows = existing
    ? await restPatch(config, "restaurants", `id=eq.${encodeURIComponent(existing.id)}`, restaurantPayload)
    : await restInsert(config, "restaurants", restaurantPayload);
  return rows?.[0] || restaurantPayload;
}

async function ensurePartnerAssignment(config, schema, restaurant, partnerAccount, adminAccount) {
  const rows = await restSelect(
    config,
    "restaurant_users",
    `restaurant_id=eq.${encodeURIComponent(restaurant.id)}&email=eq.${encodeURIComponent(partnerAccount.email)}&select=*`
  );
  const keep = rows.find((row) => row.status === "active" && row.role === "owner") || rows[0] || null;
  const duplicateRows = rows.filter((row) => keep?.id && row.id !== keep.id);
  const unsafeDuplicates = duplicateRows.filter((row) => row.is_test_data !== true);
  assert(!unsafeDuplicates.length, "Duplicate partner assignments exist but are not clearly marked test data; refusing to delete them automatically.");
  for (const row of duplicateRows) {
    await restDelete(config, "restaurant_users", `id=eq.${encodeURIComponent(row.id)}&is_test_data=eq.true`);
  }

  const payload = filterPayload(schema, "restaurant_users", {
    restaurant_id: restaurant.id,
    user_id: partnerAccount.id,
    email: partnerAccount.email,
    full_name: partnerAccount.fullName,
    role: "owner",
    status: "active",
    invited_by: adminAccount.id,
    accepted_at: nowIso(),
    is_test_data: true,
    metadata: {
      source: "production_test_account_setup",
      restaurant: TEST_RESTAURANT_NAME,
      password_source: partnerAccount.passwordEnv
    },
    created_at: nowIso(),
    updated_at: nowIso()
  });
  const updated = keep
    ? await restPatch(config, "restaurant_users", `id=eq.${encodeURIComponent(keep.id)}`, payload)
    : await restInsert(config, "restaurant_users", payload);
  return updated?.[0] || payload;
}

async function main() {
  const args = parseArgs();
  const env = loadProductionLocalEnv();
  requirePasswords(env);
  const target = await assertProductionTarget({ env, args, requireWrite: true, requireDeployedRef: false });
  const schema = await loadPostgrestSchema(target.supabase);
  for (const table of ["profiles", "restaurants", "restaurant_users"]) {
    assert(tableExists(schema, table), `Required production table is missing: ${table}`);
  }

  const authAccounts = [];
  for (const spec of ACCOUNT_SPECS) {
    const account = await createOrUpdateAuthUser(target.supabase, env, spec);
    assert(account.id, `Supabase did not return an auth user ID for ${spec.label}.`);
    authAccounts.push(account);
  }

  const guest = authAccounts.find((account) => account.key === "guest");
  const partner = authAccounts.find((account) => account.key === "partner");
  const admin = authAccounts.find((account) => account.key === "admin");
  const superadmin = authAccounts.find((account) => account.key === "superadmin");
  assert(admin.role === "admin", "Admin account role must remain admin.");
  assert(superadmin.role === "super_admin", "Superadmin account role must be super_admin.");

  const restaurant = await ensureRestaurant(target.supabase, schema, partner, superadmin);
  await ensureProfile(target.supabase, schema, guest);
  await ensureProfile(target.supabase, schema, admin);
  await ensureProfile(target.supabase, schema, superadmin);
  await ensureProfile(target.supabase, schema, partner, restaurant.id);
  await ensureGuestSupportRows(target.supabase, schema, guest);
  const assignment = await ensurePartnerAssignment(target.supabase, schema, restaurant, partner, admin);

  console.log(JSON.stringify({
    status: "production_test_accounts_setup_complete",
    production_domain: target.targetOrigin,
    production_project_ref: target.suppliedProjectRef,
    deployed_project_refs: target.deployed.exposed_project_refs,
    secrets_printed: false,
    accounts: authAccounts.map((account) => ({
      label: account.label,
      email: account.email,
      role: displayRole(account.role),
      action: account.action,
      password_source: `${account.passwordEnv} protected local environment variable`
    })),
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      status: restaurant.status,
      visible_on_guest_site: restaurant.visible_on_guest_site === true,
      is_test_data: restaurant.is_test_data === true,
      is_test_restaurant: restaurant.is_test_restaurant === true
    },
    partner_assignment: {
      email: assignment.email,
      role: assignment.role,
      status: assignment.status,
      is_test_data: assignment.is_test_data === true
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
