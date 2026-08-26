import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function includesAll(source, tokens, label) {
  for (const token of tokens) {
    assert.ok(source.includes(token), `${label} is missing ${token}.`);
  }
}

function notIncludesAny(source, patterns, label) {
  for (const pattern of patterns) {
    const matched = typeof pattern === "string" ? source.toLowerCase().includes(pattern.toLowerCase()) : pattern.test(source);
    assert.ok(!matched, `${label} contains unsafe token ${pattern}.`);
  }
}

function assertOrdered(source, before, after, label) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.ok(beforeIndex >= 0, `${label} is missing ${before}.`);
  assert.ok(afterIndex >= 0, `${label} is missing ${after}.`);
  assert.ok(beforeIndex < afterIndex, `${label} must place ${before} before ${after}.`);
}

const [
  migration,
  capacityMigration,
  statusHistoryMigration,
  appCore,
  app,
  envExample,
  enLocale,
  esLocale,
  huLocale,
  securityChecks,
  routeProtection,
  routeMap,
  uiReadiness,
  uiBehavior,
  e2eSpec
] = await Promise.all([
  read("supabase/migrations/0052_role_based_onboarding_foundation.sql"),
  read("supabase/migrations/0054_restaurant_capacity_and_lifecycle.sql"),
  read("supabase/migrations/0055_restaurant_admin_status_history.sql"),
  read("src/app-core.js"),
  read("public/app.js"),
  read(".env.example"),
  read("public/locales/en.json"),
  read("public/locales/es.json"),
  read("public/locales/hu.json"),
  read("scripts/check-basic-security-boundaries.js"),
  read("scripts/check-route-protection.js"),
  read("scripts/check-route-map.js"),
  read("scripts/check-basic-ui-readiness.js"),
  read("scripts/check-basic-ui-behavior.js"),
  read("e2e/smarttable-basic.spec.js")
]);

const normalizedMigration = migration.toLowerCase();
const normalizedCapacityMigration = capacityMigration.toLowerCase();
const normalizedStatusHistoryMigration = statusHistoryMigration.toLowerCase();

assert.equal((normalizedMigration.match(/\bbegin\s*;/g) || []).length, 1, "Migration must contain exactly one BEGIN.");
assert.equal((normalizedMigration.match(/\bcommit\s*;/g) || []).length, 1, "Migration must contain exactly one COMMIT.");
assert.equal((normalizedCapacityMigration.match(/\bbegin\s*;/g) || []).length, 1, "0054 capacity migration must contain exactly one BEGIN.");
assert.equal((normalizedCapacityMigration.match(/\bcommit\s*;/g) || []).length, 1, "0054 capacity migration must contain exactly one COMMIT.");
assert.equal((normalizedStatusHistoryMigration.match(/\bbegin\s*;/g) || []).length, 1, "0055 status-history migration must contain exactly one BEGIN.");
assert.equal((normalizedStatusHistoryMigration.match(/\bcommit\s*;/g) || []).length, 1, "0055 status-history migration must contain exactly one COMMIT.");

notIncludesAny(migration, [
  /\bdrop\s+table\b/i,
  /\bdrop\s+function\b/i,
  /\bdrop\s+trigger\b/i,
  /\bdrop\s+index\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\bupdate\s+public\./i,
  /\breset\b/i
], "0052 onboarding migration");

notIncludesAny(capacityMigration, [
  /\bdrop\s+table\b/i,
  /\bdrop\s+function\b/i,
  /\bdrop\s+trigger\b/i,
  /\bdrop\s+index\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\bupdate\s+public\./i,
  /\breset\b/i
], "0054 capacity migration");

notIncludesAny(statusHistoryMigration, [
  /\bdrop\s+table\b/i,
  /\bdrop\s+function\b/i,
  /\bdrop\s+trigger\b/i,
  /\bdrop\s+index\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\bupdate\s+public\./i,
  /\breset\b/i
], "0055 status-history migration");

includesAll(migration, [
  "create extension if not exists pgcrypto",
  "alter table if exists public.profiles",
  "add column if not exists is_test_data boolean not null default false",
  "alter table if exists public.restaurants",
  "add column if not exists country text",
  "add column if not exists city text",
  "add column if not exists currency_code text",
  "add column if not exists price_level text",
  "add column if not exists reservation_interval_minutes integer",
  "add column if not exists min_party_size integer",
  "add column if not exists max_party_size integer",
  "add column if not exists partner_approval_required boolean not null default true",
  "add column if not exists accepts_reservation_requests boolean not null default true",
  "add column if not exists visible_on_guest_site boolean not null default true",
  "add column if not exists reservation_provider text",
  "add column if not exists settings jsonb not null default '{}'::jsonb",
  "alter table if exists public.offers",
  "alter table if exists public.reservations",
  "alter table if exists public.restaurant_users",
  "alter table if exists public.audit_logs"
], "Additive onboarding columns");

includesAll(migration, [
  "create table if not exists public.partner_invitations",
  "token_hash text not null unique",
  "unique (restaurant_id, email, status)",
  "status text not null default 'pending'",
  "check (status in ('pending', 'accepted', 'expired', 'revoked'))",
  "restaurant_role text not null default 'owner'",
  "check (restaurant_role in ('owner', 'manager', 'reservation_staff', 'marketing_staff', 'read_only'))",
  "expires_at timestamptz not null default (now() + interval '7 days')",
  "is_test_data boolean not null default false"
], "Partner invitation table contract");

includesAll(migration, [
  "idx_partner_invitations_restaurant_status",
  "idx_partner_invitations_email_status",
  "idx_audit_logs_impersonation_session",
  "alter table public.partner_invitations enable row level security",
  "alter table if exists public.audit_logs enable row level security",
  "create policy partner_invitations_admin_all",
  "create policy partner_invitations_restaurant_owner_read",
  "revoke update, delete on public.audit_logs from anon, authenticated"
], "Indexes, RLS, policies, and audit immutability");

includesAll(migration, [
  "create or replace function public.is_admin()",
  "create or replace function public.owns_restaurant(target_restaurant_id uuid)",
  "auth.uid()",
  "role::text in ('admin', 'super_admin', 'superadmin')",
  "role::text in ('partner', 'restaurant', 'restaurant_partner')",
  "ru.status = 'active'"
], "RBAC helper RPCs");

includesAll(capacityMigration, [
  "create table if not exists public.restaurant_dining_areas",
  "create table if not exists public.restaurant_tables",
  "create table if not exists public.restaurant_service_capacity_overrides",
  "unique (restaurant_id, code)",
  "unique (restaurant_id, table_identifier)",
  "check (min_capacity <= max_capacity)",
  "check (capacity >= 0)",
  "alter table public.restaurant_dining_areas enable row level security",
  "alter table public.restaurant_tables enable row level security",
  "alter table public.restaurant_service_capacity_overrides enable row level security",
  "create policy restaurant_dining_areas_admin_all",
  "create policy restaurant_tables_admin_all",
  "create policy restaurant_capacity_overrides_admin_all",
  "public.owns_restaurant(restaurant_id)"
], "Restaurant capacity migration contract");

includesAll(statusHistoryMigration, [
  "create table if not exists public.restaurant_status_history",
  "restaurant_id uuid not null references public.restaurants(id) on delete cascade",
  "previous_status text",
  "new_status text not null",
  "reason text",
  "actor_user_id uuid references auth.users(id) on delete set null",
  "changed_fields jsonb not null default '[]'::jsonb",
  "create index if not exists idx_restaurant_status_history_restaurant_created",
  "alter table public.restaurant_status_history enable row level security",
  "create policy restaurant_status_history_admin_read",
  "create policy restaurant_status_history_admin_insert",
  "create policy restaurant_status_history_partner_read",
  "restaurant_dining_areas_set_updated_at",
  "restaurant_tables_set_updated_at",
  "restaurant_capacity_overrides_set_updated_at",
  "revoke update, delete on public.restaurant_status_history"
], "Restaurant status-history migration contract");

assertOrdered(
  migration,
  "create or replace function public.is_admin()",
  "create policy partner_invitations_admin_all",
  "Function/policy order"
);
assertOrdered(
  migration,
  "create or replace function public.owns_restaurant(target_restaurant_id uuid)",
  "create policy partner_invitations_restaurant_owner_read",
  "Function/policy order"
);

includesAll(appCore, [
  "function normalizeRole(role)",
  "function normalizeRestaurantUserRole(role)",
  "function requireRestaurantAccessRole(",
  "function effectivePartnerInvitationStatus(",
  "function partnerAdminListRows(",
  "async function createRestaurantOnboardingPartnerAccess(",
  "DUPLICATE_RESTAURANT_POSSIBLE",
  "IMPERSONATION_READ_ONLY",
  "IMPERSONATION_WRITE_CONFIRMATION_REQUIRED",
  "partner_invitations",
  "restaurant_users",
  "previous_value",
  "new_value",
  "request_id",
  "success"
], "Server-side RBAC/onboarding implementation");

includesAll(appCore, [
  "function validateRestaurantLifecycleTransition(",
  "RESTAURANT_ACTIVATION_CONFIRMATION_REQUIRED",
  "RESTAURANT_STATUS_REASON_REQUIRED",
  "function sanitizedDiningAreas(",
  "function sanitizedRestaurantTables(",
  "DUPLICATE_TABLE_IDENTIFIER",
  "function adminRestaurantDetail(",
  "function adminRestaurantCapacity(",
  "function createRestaurantStatusHistory(",
  "restaurant_status_history",
  "restaurant_capacity_configured",
  "function restaurantAccessPatchForAction(",
  "restaurant_access_${action}",
  "RESTAURANT_TIMEZONE_INVALID",
  "SERVICE_PERIOD_OVERLAP",
  "RESTAURANT_URL_INVALID"
], "Restaurant capacity, detail, lifecycle, and partner access implementation");

includesAll(app, [
  '"/superadmin"',
  '"/superadmin/settings"',
  "data-restaurant-partner-mode",
  "partner_access_mode",
  "restaurant_partner_access_invite_new",
  "restaurant_partner_access_assign_existing",
  "pending_review",
  "archived",
  "restaurantCapacityForm",
  "restaurantDetailPanel",
  "restaurantCapacityForm",
  "data-restaurant-access-action",
  "partner.invitation_id || partner.id",
  "data-view-as-partner",
  "data-view-as-guest"
], "Frontend RBAC/onboarding implementation");

for (const [name, locale] of [["English", enLocale], ["Spanish", esLocale], ["Hungarian", huLocale]]) {
  includesAll(locale, [
    "restaurant_quick_create_title",
    "restaurant_partner_access_mode_label",
    "restaurant_partner_access_none",
    "restaurant_partner_access_invite_new",
    "restaurant_partner_access_assign_existing",
    "restaurant_partner_access_note",
    "restaurant_status_pending_review",
    "restaurant_status_archived",
    "restaurant_service_periods_title",
    "restaurant_dining_areas_label",
    "restaurant_tables_label",
    "restaurant_capacity_overrides_label",
    "restaurant_table_allocation_note",
    "restaurant_activation_confirm_label",
    "restaurant_tab_tables_capacity",
    "restaurant_tab_partner_access",
    "restaurant_status_history_title",
    "restaurant_status_history_empty",
    "restaurant_system_status_title",
    "restaurant_capacity_saved_toast",
    "restaurant_status_reason_required",
    "restaurant_role_reservation_staff",
    "restaurant_role_marketing_staff",
    "restaurant_role_read_only",
    "partner_invitation_password_note",
    "partner_invitation_resend_button",
    "partner_invitation_revoke_button"
  ], `${name} locale`);
}

const requiredTestEnvVars = [
  "SMARTTABLE_TEST_GUEST_EMAIL",
  "SMARTTABLE_TEST_GUEST_PASSWORD",
  "SMARTTABLE_TEST_PARTNER_EMAIL",
  "SMARTTABLE_TEST_PARTNER_PASSWORD",
  "SMARTTABLE_TEST_ADMIN_EMAIL",
  "SMARTTABLE_TEST_ADMIN_PASSWORD",
  "SMARTTABLE_TEST_SUPERADMIN_EMAIL",
  "SMARTTABLE_TEST_SUPERADMIN_PASSWORD"
];

for (const variable of requiredTestEnvVars) {
  assert.ok(new RegExp(`^${variable}=\\s*$`, "m").test(envExample), `.env.example must document ${variable} without a value.`);
}

const publicSources = [app, appCore].join("\n");
for (const variable of requiredTestEnvVars) {
  assert.ok(!app.includes(variable), `public/app.js must not expose ${variable}.`);
}
assert.ok(!publicSources.includes("__SMARTTABLE_GENERATED_TEST_PASSWORDS\""), "Generated test passwords must not be exposed to public UI sources.");

includesAll(securityChecks, [
  "reservation_staff",
  "marketing_staff",
  "DUPLICATE_RESTAURANT_POSSIBLE",
  "IMPERSONATION_READ_ONLY",
  "revoked"
], "Basic security boundary checks");

includesAll(appCore, [
  'normalizeRestaurantUserRole(restaurant.partner_access_role || "read_only")',
  'requireRestaurantAccessRole(restaurant, ["owner", "manager"]);',
  'requireRestaurantAccessRole(restaurant, ["owner", "manager", "marketing_staff"]);',
  'requireRestaurantAccessRole(restaurant, ["owner", "manager", "reservation_staff"]);',
  "IMPERSONATION_WRITE_CONFIRMATION_REQUIRED"
], "Restaurant-level role write gates");

includesAll(routeProtection, [
  'path.startsWith("/superadmin/")',
  'area === "superadmin"',
  "super_admin",
  "Guests must not access partner routes.",
  "Partners must not access admin routes.",
  "Regular admins must not receive Super Admin"
], "Route protection checks");

includesAll(routeMap, [
  "/superadmin",
  "/superadmin/settings",
  "/admin/restaurants",
  "/partner"
], "Route map checks");

includesAll(uiReadiness + uiBehavior, [
  "data-restaurant-partner-mode",
  "partner_access_mode",
  "partner.invitation_id || partner.id"
], "BASIC UI readiness and behavior checks");

includesAll(e2eSpec, [
  "/superadmin",
  "Contact",
  "Language",
  "Book great restaurants for less"
], "E2E public/protected smoke coverage");

console.log("Onboarding migration readiness checks passed.");
