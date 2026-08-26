#!/usr/bin/env node
import {
  ACCOUNT_SPECS,
  TEST_RESTAURANT_ID,
  TEST_RESTAURANT_NAME,
  TEST_RESTAURANT_SLUG,
  accountEmail,
  accountPassword,
  assert,
  displayRole,
  filterPayload,
  findAuthUserByEmail,
  loadAndValidateStagingEnv,
  loadPostgrestSchema,
  restInsert,
  restPatch,
  restSelect,
  restUpsert,
  supabaseRequest,
  tableExists
} from "./staging-test-accounts-common.mjs";

function nowIso() {
  return new Date().toISOString();
}

async function createOrUpdateAuthUser(env, spec) {
  const email = accountEmail(env, spec);
  const existing = await findAuthUserByEmail(env, email);
  const metadata = {
    role: spec.role,
    is_test_data: true,
    smarttable_staging_test_account: true
  };
  if (!existing) {
    const created = await supabaseRequest(env, "/auth/v1/admin/users", {
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
      id: created?.id || created?.user?.id,
      email,
      action: "created"
    };
  }

  await supabaseRequest(env, `/auth/v1/admin/users/${existing.id}`, {
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
    id: existing.id,
    email,
    action: "updated"
  };
}

async function ensureProfile(env, schema, account, restaurantId = null) {
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
      source: "staging_test_account_setup",
      test_account_role: displayRole(account.role),
      password_source: account.passwordEnv
    },
    created_at: nowIso(),
    updated_at: nowIso()
  });
  const rows = await restUpsert(env, "profiles", "id", payload);
  return rows?.[0] || payload;
}

async function ensureGuestSupportRows(env, schema, guestAccount) {
  if (!tableExists(schema, "guests") || !tableExists(schema, "guest_profiles")) return { guest: null, guestProfile: null };

  const guestRows = await restUpsert(env, "guests", "email", filterPayload(schema, "guests", {
    user_id: guestAccount.id,
    email: guestAccount.email,
    full_name: guestAccount.fullName,
    first_name: "SmartTable",
    last_name: "Guest",
    selected_language: "en",
    email_verified: true,
    status: "active",
    metadata: {
      source: "staging_test_account_setup",
      is_test_data: true
    },
    created_at: nowIso(),
    updated_at: nowIso()
  }));
  const guest = guestRows?.[0] || null;
  if (!guest?.id) return { guest, guestProfile: null };

  const guestProfileRows = await restUpsert(env, "guest_profiles", "profile_key", filterPayload(schema, "guest_profiles", {
    guest_id: guest.id,
    user_id: guestAccount.id,
    profile_key: guestAccount.email,
    cuisine_preferences: ["Modern American"],
    food_preferences: ["staging test"],
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
      source: "staging_test_account_setup",
      is_test_data: true
    },
    created_at: nowIso(),
    updated_at: nowIso()
  }));

  return {
    guest,
    guestProfile: guestProfileRows?.[0] || null
  };
}

async function existingRestaurant(env, schema) {
  const byId = await restSelect(env, "restaurants", `id=eq.${encodeURIComponent(TEST_RESTAURANT_ID)}&select=*`);
  if (byId.length) {
    assert(byId[0].name === TEST_RESTAURANT_NAME, "Reserved SmartTable Test Bistro UUID is already used by a different restaurant.");
    return byId[0];
  }
  if (schema.tables.restaurants?.has("slug")) {
    const bySlug = await restSelect(env, "restaurants", `slug=eq.${encodeURIComponent(TEST_RESTAURANT_SLUG)}&select=*`);
    if (bySlug.length) return bySlug[0];
  }
  const byName = await restSelect(env, "restaurants", `name=eq.${encodeURIComponent(TEST_RESTAURANT_NAME)}&select=*`);
  return byName[0] || null;
}

async function ensureRestaurant(env, schema, partnerAccount, superadminAccount) {
  const existing = await existingRestaurant(env, schema);
  const id = existing?.id || TEST_RESTAURANT_ID;
  const restaurantPayload = filterPayload(schema, "restaurants", {
    id,
    name: TEST_RESTAURANT_NAME,
    legal_name: "SmartTable Test Bistro LLC (Staging Test Data)",
    slug: TEST_RESTAURANT_SLUG,
    email: "test-bistro@smarttable.com",
    contact_email: "test-bistro@smarttable.com",
    primary_email: "test-bistro@smarttable.com",
    reservation_email: "test-bistro@smarttable.com",
    phone: "+12125550100",
    website: "https://smarttablenyc.com",
    address: "123 Staging Test Avenue, New York, NY 10001",
    street_address: "123 Staging Test Avenue",
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
    description: "Staging-only SmartTable demonstration restaurant for role, onboarding, and partner assignment testing. No real reservations are created.",
    description_en: "Staging-only SmartTable demonstration restaurant for role, onboarding, and partner assignment testing. No real reservations are created.",
    description_es: "Restaurante de demostracion exclusivo de staging para probar roles, onboarding y asignacion de partner. No se crean reservas reales.",
    description_hu: "Csak staging kornyezetben hasznalt SmartTable tesztetterem szerepkorok, onboarding es partner-hozzarendeles tesztelesehez. Nem jon letre valodi foglalas.",
    short_description: "Staging-only test restaurant.",
    full_description: "Staging-only SmartTable Test Bistro record used for RBAC, onboarding, and partner assignment testing.",
    primary_timezone: "America/New_York",
    timezone: "America/New_York",
    currency_code: "USD",
    default_language: "en",
    supported_languages: ["en", "es", "hu"],
    owner_user_id: partnerAccount.id,
    status: "approved",
    onboarding_status: "active",
    visible_on_guest_site: false,
    is_test_data: true,
    is_test_restaurant: true,
    accepts_reservation_requests: true,
    reservation_provider: "internal_test",
    partner_approval_required: true,
    auto_confirmation: false,
    reservation_interval_minutes: 30,
    booking_interval_minutes: 30,
    minimum_advance_minutes: 30,
    maximum_booking_window_days: 30,
    booking_horizon_days: 30,
    minimum_booking_notice_minutes: 30,
    default_table_duration_minutes: 90,
    grace_period_minutes: 15,
    min_party_size: 1,
    max_party_size: 8,
    available_party_sizes: [1, 2, 3, 4, 5, 6, 7, 8],
    same_day_reservations_enabled: true,
    special_requests_enabled: true,
    cancellation_policy: "Staging test reservations may be cancelled during QA.",
    no_show_policy: "Staging test data only.",
    confirmation_message: "This is a staging test reservation. No real restaurant reservation is created.",
    arrival_instructions: "Staging-only test data; no public arrival instructions apply.",
    restaurant_total_capacity: 48,
    capacity: 48,
    table_capacity: 12,
    settings: {
      source: "staging_test_account_setup",
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
    ? await restPatch(env, "restaurants", `id=eq.${encodeURIComponent(id)}`, restaurantPayload)
    : await restInsert(env, "restaurants", restaurantPayload);
  return rows?.[0] || { ...restaurantPayload, id };
}

async function ensurePartnerAssignment(env, schema, restaurant, partnerAccount, adminAccount) {
  const existing = await restSelect(
    env,
    "restaurant_users",
    `restaurant_id=eq.${encodeURIComponent(restaurant.id)}&email=eq.${encodeURIComponent(partnerAccount.email)}&select=*`
  );
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
      source: "staging_test_account_setup",
      restaurant: TEST_RESTAURANT_NAME,
      password_source: partnerAccount.passwordEnv
    },
    created_at: nowIso(),
    updated_at: nowIso()
  });
  const rows = existing.length
    ? await restPatch(env, "restaurant_users", `id=eq.${encodeURIComponent(existing[0].id)}`, payload)
    : await restInsert(env, "restaurant_users", payload);
  return rows?.[0] || payload;
}

async function main() {
  const { env, projectRef, linkedProjectName, generatedPasswordVariables } = loadAndValidateStagingEnv({ generatePasswords: true });
  const schema = await loadPostgrestSchema(env);
  for (const table of ["profiles", "restaurants", "restaurant_users"]) {
    assert(tableExists(schema, table), `Required table is missing from staging schema: ${table}`);
  }

  const authAccounts = [];
  for (const spec of ACCOUNT_SPECS) {
    const result = await createOrUpdateAuthUser(env, spec);
    assert(result.id, `Supabase did not return an auth user id for ${spec.label}.`);
    authAccounts.push({ ...spec, ...result });
  }

  const admin = authAccounts.find((account) => account.key === "admin");
  const superadmin = authAccounts.find((account) => account.key === "superadmin");
  const partner = authAccounts.find((account) => account.key === "partner");
  const guest = authAccounts.find((account) => account.key === "guest");
  assert(admin.role === "admin", "Admin account role must remain admin.");
  assert(superadmin.role === "super_admin", "Superadmin account role must be super_admin.");

  const restaurant = await ensureRestaurant(env, schema, partner, superadmin);
  await ensureProfile(env, schema, guest);
  await ensureProfile(env, schema, admin);
  await ensureProfile(env, schema, superadmin);
  await ensureProfile(env, schema, partner, restaurant.id);
  await ensureGuestSupportRows(env, schema, guest);
  const assignment = await ensurePartnerAssignment(env, schema, restaurant, partner, admin);

  console.log(JSON.stringify({
    status: "staging_test_accounts_setup_complete",
    staging_project_ref: projectRef,
    linked_project_name: linkedProjectName,
    generated_password_variables: generatedPasswordVariables,
    secrets_printed: false,
    accounts: authAccounts.map((account) => ({
      label: account.label,
      email: account.email,
      role: displayRole(account.role),
      action: account.action,
      password_source: `${account.passwordEnv} in .env.staging.local`
    })),
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      database_status: restaurant.status,
      lifecycle_status: restaurant.onboarding_status || (restaurant.status === "approved" ? "active" : restaurant.status),
      is_test_data: restaurant.is_test_data === true,
      is_test_restaurant: restaurant.is_test_restaurant === true,
      visible_on_guest_site: restaurant.visible_on_guest_site === true
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
