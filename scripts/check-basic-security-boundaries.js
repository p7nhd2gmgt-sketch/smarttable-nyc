import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.RESEND_API_KEY = "";

const { handleApiRequest } = await import(`../src/app-core.js?basic-security-boundaries=${Date.now()}`);

async function rawApi(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    body,
    headers
  });
}

async function api(method, path, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.code || response.body?.error || "unknown error"}`);
  }
  return response.body;
}

function authHeaders(accessToken) {
  return { authorization: `Bearer ${accessToken}` };
}

function requestHeaders(headers, label) {
  return {
    ...headers,
    "x-request-id": `rbac-${label}-${Date.now()}`,
    "x-forwarded-for": "203.0.113.42",
    "user-agent": "SmartTable RBAC automated verification"
  };
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

function invitationTokenFromEmail(result, label) {
  const email = result?.emails?.[0] || {};
  const content = `${email.text || ""}\n${email.html || ""}`;
  const match = content.match(/\/partner\/invite\?token=([^"'\s<>&]+)/);
  assert.ok(match?.[1], `${label} must include a secure partner invitation link in the email payload.`);
  return decodeURIComponent(match[1]);
}

async function loginAs(email, password, expectedRole) {
  const result = await api("POST", "/auth/login", { email, password });
  assert.ok(result.access_token, `${email} must receive an access token.`);
  assert.equal(result.profile.role, expectedRole, `${email} must have role ${expectedRole}.`);
  return {
    profile: result.profile,
    headers: authHeaders(result.access_token)
  };
}

async function expectStatus(method, path, status, body = {}, headers = {}, message = "") {
  const response = await rawApi(method, path, body, headers);
  assert.equal(response.status, status, `${message || `${method} ${path}`} expected ${status}, received ${response.status}.`);
  return response;
}

function registryCanShow(feature, { platformMode, aiDemoVisibility, audience }) {
  if (!feature) return false;
  if (!Array.isArray(feature.modes) || !feature.modes.includes(platformMode)) return false;
  if (feature.audiences && !feature.audiences.includes("all") && !feature.audiences.includes(audience)) return false;
  if (feature.status === "working") return true;
  if (feature.status === "demo") return platformMode === "ai_concierge" && aiDemoVisibility === true;
  return false;
}

async function assertPublicRoutesArePublic() {
  for (const path of ["/public/config", "/public/offers?lang=en", "/public/content", "/system/feature-status"]) {
    const response = await rawApi("GET", path);
    assert.ok(response.status < 400, `Public BASIC endpoint ${path} must be accessible without authentication.`);
  }
}

async function assertProtectedApiBoundaries() {
  const guest = await loginAs(TEST_ACCOUNTS.guest.email, TEST_ACCOUNTS.guest.password, "guest");
  const partner = await loginAs(TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password, "partner");
  const admin = await loginAs(TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password, "admin");
  const superAdmin = await loginAs(TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password, "super_admin");
  const adminAuditHeaders = requestHeaders(admin.headers, "admin");
  const superAdminAuditHeaders = requestHeaders(superAdmin.headers, "superadmin");

  await expectStatus("GET", "/guest/account", 401, {}, {}, "Logged-out users must not access guest account routes.");
  await expectStatus("GET", "/partner/profile", 401, {}, {}, "Logged-out users must not access partner routes.");
  await expectStatus("GET", "/admin/stats", 401, {}, {}, "Logged-out users must not access admin routes.");

  assert.ok((await api("GET", "/guest/account", {}, guest.headers)).profile, "Guests must access their own guest account.");
  await expectStatus("GET", "/guest/account", 403, {}, partner.headers, "Partners must not access guest account data as a guest.");
  await expectStatus("GET", "/partner/profile", 403, {}, guest.headers, "Guests must not access partner profile routes.");
  await expectStatus("GET", "/partner/reservations", 403, {}, guest.headers, "Guests must not access partner reservation routes.");
  await expectStatus("GET", "/admin/stats", 403, {}, guest.headers, "Guests must not access admin routes.");

  const partnerProfile = await api("GET", "/partner/profile", {}, partner.headers);
  assert.equal(partnerProfile.restaurant.id, partner.profile.restaurant_id, "Partner profile must be scoped to the partner restaurant.");
  await expectStatus("GET", "/partner/profile?restaurant_id=not-their-restaurant", 403, {}, partner.headers, "Partners must not access another restaurant profile.");
  await expectStatus("GET", "/partner/reservations?restaurant_id=not-their-restaurant", 403, {}, partner.headers, "Partners must not list another restaurant reservation data.");
  await expectStatus("GET", "/admin/stats", 403, {}, partner.headers, "Partners must not access admin routes.");

  assert.ok((await api("GET", "/admin/stats", {}, admin.headers)).stats, "Regular admins must access admin dashboard data.");
  const regularAdminSettings = await api("GET", "/admin/settings/platform-mode", {}, admin.headers);
  assert.equal(regularAdminSettings.can_edit, false, "Regular admins may view current mode but must not edit platform mode.");
  await expectStatus("PATCH", "/admin/settings/platform-mode", 403, { platform_mode: "ai_concierge" }, admin.headers, "Regular admins must not change Super Admin settings.");
  await expectStatus("PATCH", "/admin/settings/platform-mode", 403, { platform_mode: "ai_concierge" }, partner.headers, "Partners must not change Super Admin settings.");
  await expectStatus("PATCH", "/admin/settings/platform-mode", 403, { platform_mode: "ai_concierge" }, guest.headers, "Guests must not change Super Admin settings.");

  const superAdminSettings = await api("GET", "/admin/settings/platform-mode", {}, superAdmin.headers);
  assert.equal(superAdminSettings.can_edit, true, "Super Admin must have edit permission for platform mode settings.");

  const uniqueRestaurantPayload = {
    name: `RBAC Unique Draft ${Date.now()}`,
    slug: `rbac-unique-draft-${Date.now()}`,
    email: uniqueEmail("rbac-unique-restaurant"),
    address: "303 RBAC Unique Draft Avenue",
    city: "New York",
    country: "US",
    latitude: 40.7505,
    longitude: -73.9934,
    phone: "+1 212 555 0303",
    website: `https://rbac-unique-${Date.now()}.example.test`,
    cuisine_type: "Regression",
    description: "Unique draft restaurant for duplicate-flow regression coverage.",
    reservation_email: uniqueEmail("rbac-reservations"),
    service_periods: [{ day: "mon", period: "dinner", opens: "17:00", closes: "22:00" }],
    status: "draft"
  };
  await expectStatus("POST", "/admin/restaurants", 400, {
    ...uniqueRestaurantPayload,
    name: `RBAC Invalid Timezone ${Date.now()}`,
    slug: `rbac-invalid-timezone-${Date.now()}`,
    primary_timezone: "Not/A_Real_Timezone"
  }, adminAuditHeaders, "Invalid restaurant timezones must be rejected server-side.");
  await expectStatus("POST", "/admin/restaurants", 400, {
    ...uniqueRestaurantPayload,
    name: `RBAC Unsafe URL ${Date.now()}`,
    slug: `rbac-unsafe-url-${Date.now()}`,
    website: "javascript:alert(1)"
  }, adminAuditHeaders, "Unsafe restaurant URLs must be rejected server-side.");
  await expectStatus("POST", "/admin/restaurants", 400, {
    ...uniqueRestaurantPayload,
    name: `RBAC Unsafe Image ${Date.now()}`,
    slug: `rbac-unsafe-image-${Date.now()}`,
    cover_image: "data:text/html,<script>alert(1)</script>"
  }, adminAuditHeaders, "Unsafe restaurant image URLs must be rejected server-side.");
  await expectStatus("POST", "/admin/restaurants", 409, {
    ...uniqueRestaurantPayload,
    name: `RBAC Overlap Hours ${Date.now()}`,
    slug: `rbac-overlap-hours-${Date.now()}`,
    service_periods: [
      { day: "mon", period: "early", opens: "17:00", closes: "20:00" },
      { day: "mon", period: "late", opens: "19:30", closes: "22:00" }
    ]
  }, adminAuditHeaders, "Overlapping service periods must be rejected server-side.");
  const uniqueDraft = await api("POST", "/admin/restaurants", uniqueRestaurantPayload, adminAuditHeaders);
  assert.equal(uniqueDraft.restaurant?.onboarding_status, "draft", "Unique admin-created restaurants must start as Draft.");
  assert.equal(uniqueDraft.restaurant?.visible_on_guest_site, false, "Draft restaurants must not become public by default.");
  const restaurantList = await api("GET", "/admin/restaurants", {}, admin.headers);
  const listedUnique = (restaurantList.restaurants || []).find((item) => item.id === uniqueDraft.restaurant.id);
  assert.equal(listedUnique?.lifecycle_status, "draft", "Admin restaurant list must expose lifecycle status.");
  assert.equal(typeof listedUnique?.assigned_partner_count, "number", "Admin restaurant list must expose assigned partner count.");
  assert.equal(typeof listedUnique?.active_offer_count, "number", "Admin restaurant list must expose active offer count.");
  assert.equal(typeof listedUnique?.upcoming_reservation_count, "number", "Admin restaurant list must expose upcoming reservation count.");
  await expectStatus("PATCH", "/admin/restaurants", 400, { id: uniqueDraft.restaurant.id, status: "active", visible_on_guest_site: true }, superAdminAuditHeaders, "Restaurant activation must require explicit confirmation.");
  await expectStatus("PATCH", "/admin/restaurants", 403, { id: uniqueDraft.restaurant.id, status: "active", visible_on_guest_site: true, activate_confirmed: true }, adminAuditHeaders, "Regular admins must not approve restaurant activation.");
  const activated = await api("PATCH", "/admin/restaurants", { id: uniqueDraft.restaurant.id, status: "active", visible_on_guest_site: true, activate_confirmed: true }, superAdminAuditHeaders);
  assert.equal(activated.restaurant?.status, "approved", "Activating a restaurant must map to the existing approved public status.");
  assert.equal(activated.restaurant?.onboarding_status, "active", "Activating a restaurant must store active onboarding status.");
  await expectStatus("PATCH", "/admin/restaurants", 400, { id: uniqueDraft.restaurant.id, status: "suspended" }, adminAuditHeaders, "Suspending a restaurant must require an audit reason.");
  const suspended = await api("PATCH", "/admin/restaurants", { id: uniqueDraft.restaurant.id, status: "suspended", status_reason: "Security regression suspension." }, adminAuditHeaders);
  assert.equal(suspended.restaurant?.status, "suspended", "Suspending a restaurant must persist suspended status.");
  await expectStatus("PATCH", "/admin/restaurants", 400, { id: uniqueDraft.restaurant.id, status: "archived" }, adminAuditHeaders, "Archiving a restaurant must require an audit reason.");
  const archived = await api("PATCH", "/admin/restaurants", { id: uniqueDraft.restaurant.id, status: "archived", status_reason: "Security regression archive." }, adminAuditHeaders);
  assert.equal(archived.restaurant?.onboarding_status, "archived", "Archiving a restaurant must persist archived lifecycle status.");
  const reactivated = await api("PATCH", "/admin/restaurants", { id: uniqueDraft.restaurant.id, status: "active", activate_confirmed: true }, superAdminAuditHeaders);
  assert.equal(reactivated.restaurant?.onboarding_status, "active", "Archived restaurants must be safely reactivatable by Super Admin.");
  const detail = await api("GET", `/admin/restaurant-detail?id=${encodeURIComponent(uniqueDraft.restaurant.id)}`, {}, admin.headers);
  assert.equal(detail.restaurant?.id, uniqueDraft.restaurant.id, "Admin restaurant detail endpoint must return the selected restaurant.");
  assert.equal(detail.system_status?.automatic_table_allocation_enabled, false, "BASIC must not claim automatic exact table assignment.");
  assert.ok((detail.status_history || []).some((row) => row.new_status === "active"), "Restaurant status transitions must create status-history rows.");
  await expectStatus("GET", `/admin/restaurant-detail?id=${encodeURIComponent(uniqueDraft.restaurant.id)}`, 403, {}, partner.headers, "Partners must not access admin restaurant detail endpoint.");
  const testDraft = await api("POST", "/admin/restaurants", {
    ...uniqueRestaurantPayload,
    name: `RBAC Test Visibility ${Date.now()}`,
    slug: `rbac-test-visibility-${Date.now()}`,
    email: uniqueEmail("rbac-test-visibility"),
    reservation_email: uniqueEmail("rbac-test-visibility-reservations"),
    address: `505 Test Visibility Avenue ${Date.now()}`,
    phone: `+1 212 555 ${String(Date.now()).slice(-4)}`,
    website: `https://rbac-test-visibility-${Date.now()}.example.test`,
    is_test_data: true,
    visible_on_guest_site: false
  }, adminAuditHeaders);
  await expectStatus("PATCH", "/admin/restaurants", 409, {
    id: testDraft.restaurant.id,
    status: "active",
    visible_on_guest_site: true,
    activate_confirmed: true
  }, superAdminAuditHeaders, "Test restaurants must not accidentally become public.");
  await expectStatus("POST", "/admin/restaurant-capacity", 400, {
    restaurant_id: uniqueDraft.restaurant.id,
    dining_areas: [{ name: "Main", code: "main", capacity: 20, status: "active" }],
    tables: [
      { table_identifier: "A1", min_capacity: 4, max_capacity: 2, status: "active" }
    ],
    capacity_overrides: []
  }, adminAuditHeaders, "Invalid table capacity must be rejected.");
  await expectStatus("POST", "/admin/restaurant-capacity", 409, {
    restaurant_id: uniqueDraft.restaurant.id,
    dining_areas: [{ name: "Main", code: "main", capacity: 20, status: "active" }],
    tables: [
      { table_identifier: "A1", min_capacity: 2, max_capacity: 4, status: "active" },
      { table_identifier: "A1", min_capacity: 2, max_capacity: 4, status: "active" }
    ],
    capacity_overrides: []
  }, adminAuditHeaders, "Duplicate table identifiers within one restaurant must be rejected.");
  await expectStatus("POST", "/admin/restaurant-capacity", 400, {
    restaurant_id: uniqueDraft.restaurant.id,
    dining_areas: [{ name: "Main", code: "main", capacity: 20, status: "active" }],
    tables: [
      { table_identifier: "A1", min_capacity: 2, max_capacity: 4, status: "active" }
    ],
    capacity_overrides: [{ service_period_key: "bad-window", day_of_week: "mon", start_time: "22:00", end_time: "17:00", capacity: 10, table_capacity: 1, status: "active" }]
  }, adminAuditHeaders, "Invalid service-period capacity windows must be rejected.");
  const capacityConfig = await api("POST", "/admin/restaurant-capacity", {
    restaurant_id: uniqueDraft.restaurant.id,
    dining_areas: [{ name: "Main", code: "main", capacity: 20, status: "active" }],
    tables: [
      { table_identifier: "A1", min_capacity: 2, max_capacity: 4, seating_type: "indoor", is_accessible: true, status: "active" },
      { table_identifier: "A2", min_capacity: 2, max_capacity: 6, seating_type: "outdoor", status: "active" }
    ],
    capacity_overrides: [{ service_period_key: "mon-dinner", day_of_week: "mon", start_time: "17:00", end_time: "22:00", capacity: 10, table_capacity: 2, status: "active" }]
  }, adminAuditHeaders);
  assert.equal(capacityConfig.capacity?.active_table_count, 2, "Valid capacity configuration must persist active tables.");
  assert.equal(capacityConfig.capacity?.automatic_table_allocation_enabled, false, "Capacity config must preserve BASIC non-optimization behavior.");
  const auditHistory = await api("GET", `/admin/audit-logs?restaurant_id=${encodeURIComponent(uniqueDraft.restaurant.id)}`, {}, admin.headers);
  assert(Array.isArray(auditHistory.audit_logs), "Admin restaurant audit-history endpoint must return an audit log array.");
  const duplicateOfUnique = await expectStatus("POST", "/admin/restaurants", 409, {
    ...uniqueRestaurantPayload,
    email: uniqueEmail("rbac-duplicate-restaurant")
  }, adminAuditHeaders, "Duplicate normalized name/address creation must be blocked by default.");
  assert.equal(duplicateOfUnique.body?.code, "DUPLICATE_RESTAURANT_POSSIBLE", "Duplicate restaurant flow must return the documented warning code.");
  await expectStatus("POST", "/admin/restaurants", 403, uniqueRestaurantPayload, partner.headers, "Partners must not create restaurants through the admin endpoint.");
  await expectStatus("POST", "/admin/restaurants", 403, { ...uniqueRestaurantPayload, duplicate_override: true, duplicate_override_reason: "Unauthorized override." }, partner.headers, "Unauthorized users must not override duplicate restaurant warnings.");

  const invitedPartner = await api("POST", "/admin/partners", {
    email: uniqueEmail("security-invite"),
    full_name: "Security Boundary Invite",
    restaurant_id: partner.profile.restaurant_id,
    restaurant_role: "reservation_staff"
  }, adminAuditHeaders);
  const firstInvitationToken = invitationTokenFromEmail(invitedPartner, "Initial invitation");
  assert.equal(invitedPartner.invitation?.status, "pending", "Admin partner creation must create a pending invitation instead of requiring a temporary password.");
  assert.equal(invitedPartner.invitation?.restaurant_role, "reservation_staff", "Restaurant-level role must be stored on the invitation.");
  assert.ok(invitedPartner.invitation?.id, "Pending partner invitation must expose an admin-safe invitation id for resend/revoke actions.");
  const pendingPartnerRows = await api("GET", "/admin/partners", {}, admin.headers);
  const pendingInvitationRow = (pendingPartnerRows.partners || []).find((item) => item.invitation_id === invitedPartner.invitation.id || item.email === invitedPartner.partner.email);
  assert.equal(pendingInvitationRow?.invitation_status, "pending", "Admin partner table must show pending invitation status.");
  assert.equal(pendingInvitationRow?.invitation_id, invitedPartner.invitation.id, "Invitation actions must target the invitation id, not the partner profile id.");
  await expectStatus("PATCH", "/admin/partners", 403, { id: invitedPartner.invitation.id, action: "resend_invitation" }, guest.headers, "Guests must not resend partner invitations.");
  await expectStatus("PATCH", "/admin/partners", 403, { id: invitedPartner.invitation.id, action: "revoke_invitation" }, partner.headers, "Partners must not revoke partner invitations through admin controls.");
  const resentInvitation = await api("PATCH", "/admin/partners", { id: invitedPartner.invitation.id, action: "resend_invitation" }, adminAuditHeaders);
  const resentInvitationToken = invitationTokenFromEmail(resentInvitation, "Resent invitation");
  assert.equal(resentInvitation.invitation?.status, "pending", "Admins must be able to resend pending partner invitations.");
  assert.notEqual(resentInvitationToken, firstInvitationToken, "Resending an invitation must rotate the secure token.");
  await expectStatus("POST", "/auth/partner-invitation", 410, {
    token: firstInvitationToken,
    password: "Partner-Invite-Old-1!",
    confirm_password: "Partner-Invite-Old-1!"
  }, {}, "A stale invitation token from before resend must be rejected safely.");
  const revokedInvitation = await api("PATCH", "/admin/partners", { id: invitedPartner.invitation.id, action: "revoke_invitation" }, adminAuditHeaders);
  assert.equal(revokedInvitation.invitation?.status, "revoked", "Admins must be able to revoke pending partner invitations.");
  const revokedPartnerRows = await api("GET", "/admin/partners", {}, admin.headers);
  const revokedInvitationRow = (revokedPartnerRows.partners || []).find((item) => item.invitation_id === invitedPartner.invitation.id || item.email === invitedPartner.partner.email);
  assert.equal(revokedInvitationRow?.invitation_status, "revoked", "Admin partner table must show revoked invitation status.");
  await expectStatus("POST", "/auth/partner-invitation", 410, {
    token: resentInvitationToken,
    password: "Partner-Invite-Revoked-1!",
    confirm_password: "Partner-Invite-Revoked-1!"
  }, {}, "A revoked invitation token must not be accepted.");
  await expectStatus("PATCH", "/admin/partners", 403, { id: admin.profile.id, role: "superadmin" }, admin.headers, "Admins must not change their own role.");
  await expectStatus("PATCH", "/admin/partners", 403, { id: invitedPartner.partner.id, role: "superadmin" }, admin.headers, "Regular admins must not promote partners to Super Admin.");

  const validInvitationEmail = uniqueEmail("accepted-invite");
  const validInvitation = await api("POST", "/admin/partners", {
    email: validInvitationEmail,
    full_name: "Accepted Invitation Partner",
    restaurant_id: partner.profile.restaurant_id,
    restaurant_role: "owner"
  }, adminAuditHeaders);
  const validInvitationToken = invitationTokenFromEmail(validInvitation, "Valid invitation");
  const invitationPreview = await api("GET", `/auth/partner-invitation?token=${encodeURIComponent(validInvitationToken)}`);
  assert.equal(invitationPreview.invitation?.status, "pending", "A valid invitation must be previewable before acceptance.");
  const acceptedPassword = "Accepted-Partner-Invite-1!";
  await expectStatus("POST", "/auth/partner-invitation", 400, {
    token: validInvitationToken,
    password: acceptedPassword,
    confirm_password: acceptedPassword
  }, {}, "Partner invitation acceptance must require Partner Terms and Privacy Policy consent.");
  const acceptedInvitation = await api("POST", "/auth/partner-invitation", {
    token: validInvitationToken,
    password: acceptedPassword,
    confirm_password: acceptedPassword,
    partner_terms_consent: true
  });
  assert.equal(acceptedInvitation.invitation?.status, "accepted", "Valid partner invitations must be accepted once.");
  assert.equal(acceptedInvitation.profile?.role, "partner", "Accepted invitation must create a partner profile.");
  const roleChanged = await api("PATCH", "/admin/partners", {
    action: "change_restaurant_role",
    restaurant_id: partner.profile.restaurant_id,
    email: validInvitationEmail,
    restaurant_role: "read_only",
    reason: "Security regression role change."
  }, adminAuditHeaders);
  assert.equal(roleChanged.restaurant_access?.role, "read_only", "Admin must be able to change a restaurant-level partner role.");
  const deactivatedAccess = await api("PATCH", "/admin/partners", {
    action: "deactivate_restaurant_access",
    restaurant_id: partner.profile.restaurant_id,
    email: validInvitationEmail,
    reason: "Security regression deactivation."
  }, adminAuditHeaders);
  assert.equal(deactivatedAccess.restaurant_access?.status, "disabled", "Admin must be able to deactivate restaurant access without deleting the user.");
  const reactivatedAccess = await api("PATCH", "/admin/partners", {
    action: "reactivate_restaurant_access",
    restaurant_id: partner.profile.restaurant_id,
    email: validInvitationEmail,
    reason: "Security regression reactivation."
  }, adminAuditHeaders);
  assert.equal(reactivatedAccess.restaurant_access?.status, "active", "Admin must be able to reactivate restaurant access.");
  const acceptedLogin = await loginAs(validInvitationEmail, acceptedPassword, "partner");
  const acceptedPartnerProfile = await api("GET", "/partner/profile", {}, acceptedLogin.headers);
  assert.equal(acceptedPartnerProfile.restaurant?.id, partner.profile.restaurant_id, "Accepted partner must receive the assigned restaurant access.");
  await expectStatus("POST", "/auth/partner-invitation", 410, {
    token: validInvitationToken,
    password: acceptedPassword,
    confirm_password: acceptedPassword
  }, {}, "Duplicate invitation acceptance must be rejected safely.");
  await expectStatus("PATCH", "/admin/partners", 409, { id: validInvitation.invitation.id, action: "revoke_invitation" }, adminAuditHeaders, "Accepted invitations must not be revocable as pending invitations.");

  const duplicateRestaurantPayload = {
    name: "Hudson Hearth",
    email: uniqueEmail("duplicate-check"),
    address: "101 Duplicate Test Avenue",
    phone: "+1 212 555 0101",
    website: "https://duplicate-check.example.test",
    cuisine_type: "Modern American",
    description: "Security duplicate detection test restaurant."
  };
  const duplicateWarning = await expectStatus("POST", "/admin/restaurants", 409, duplicateRestaurantPayload, adminAuditHeaders, "Possible duplicate restaurant creation must require admin override.");
  assert.equal(duplicateWarning.body?.code, "DUPLICATE_RESTAURANT_POSSIBLE", "Duplicate restaurant response must use the documented duplicate code.");
  assert.equal(duplicateWarning.body?.requires_override, true, "Duplicate restaurant response must require an explicit override.");
  assert.ok(duplicateWarning.body?.duplicates?.some((item) => item.matched_fields?.includes("name")), "Duplicate detection must report the matched normalized name.");
  await expectStatus("POST", "/admin/restaurants", 400, { ...duplicateRestaurantPayload, duplicate_override: true }, adminAuditHeaders, "Duplicate restaurant override must require a reason.");
  const overrideRestaurant = await api("POST", "/admin/restaurants", {
    ...duplicateRestaurantPayload,
    duplicate_override: true,
    duplicate_override_reason: "Controlled security regression test override."
  }, adminAuditHeaders);
  assert.equal(overrideRestaurant.restaurant?.name, duplicateRestaurantPayload.name, "Authorized duplicate override must still create the requested restaurant.");

  const onboardingRestaurant = await api("POST", "/admin/restaurants", {
    name: `RBAC Wizard Test ${Date.now()}`,
    email: uniqueEmail("rbac-wizard-restaurant"),
    address: "404 Wizard Regression Avenue",
    phone: "+1 212 555 0420",
    website: `https://rbac-wizard-${Date.now()}.example.test`,
    cuisine_type: "Regression",
    description: "Restaurant onboarding regression coverage.",
    status: "draft",
    partner_access_mode: "invite_new",
    partner_full_name: "Wizard Partner Invite",
    partner_email: uniqueEmail("rbac-wizard-partner"),
    restaurant_role: "manager"
  }, adminAuditHeaders);
  assert.equal(onboardingRestaurant.restaurant?.status, "pending", "Draft restaurants must be stored as non-public pending records.");
  assert.equal(onboardingRestaurant.restaurant?.onboarding_status, "draft", "New restaurant onboarding status must remain Draft until an admin activates it.");
  assert.equal(onboardingRestaurant.partner_access?.status, "invitation_created", "Restaurant onboarding Step 3 must create a secure partner invitation when requested.");
  assert.equal(onboardingRestaurant.partner_access?.invitation?.restaurant_role, "manager", "Restaurant onboarding partner invitation must preserve the restaurant-level role.");

  const partnerView = await api("POST", "/admin/impersonate-account", {
    target_role: "partner",
    target_user_id: partner.profile.id,
    reason: "Security regression test: partner view-as."
  }, adminAuditHeaders);
  assert.equal(partnerView.profile?.role, "partner", "Admin must be able to view BASIC partner accounts.");
  assert.equal(partnerView.profile?.impersonation?.mode, "read", "View-as mode must default to read-only.");
  assert.ok(partnerView.impersonation_session_id, "View-as sessions must have an auditable session id.");
  assert.ok((await api("GET", "/partner/profile", {}, authHeaders(partnerView.access_token))).restaurant, "Read-only partner view-as must permit partner read routes.");
  await expectStatus("PATCH", "/partner/profile", 403, { name: "Blocked Write" }, authHeaders(partnerView.access_token), "Read-only view-as tokens must block partner writes.");
  await expectStatus("POST", "/admin/impersonate-account", 400, {
    target_role: "partner",
    target_user_id: partner.profile.id,
    reason: "Security regression test: unconfirmed write-mode view-as.",
    write_mode: true
  }, adminAuditHeaders, "Write-mode view-as must require an explicit confirmation flag.");
  const writeModePartnerView = await api("POST", "/admin/impersonate-account", {
    target_role: "partner",
    target_user_id: partner.profile.id,
    reason: "Security regression test: confirmed write-mode view-as.",
    write_mode: true,
    write_mode_confirmed: true
  }, adminAuditHeaders);
  assert.equal(writeModePartnerView.profile?.impersonation?.mode, "write", "Confirmed write-mode view-as must explicitly mark the session as write mode.");

  const guestView = await api("POST", "/admin/impersonate-account", {
    target_role: "guest",
    target_user_id: guest.profile.id,
    reason: "Security regression test: guest view-as."
  }, adminAuditHeaders);
  assert.equal(guestView.profile?.role, "guest", "Admin must be able to view BASIC guest accounts.");
  assert.equal(guestView.profile?.impersonation?.mode, "read", "Guest view-as mode must default to read-only.");
  assert.ok((await api("GET", "/guest/account", {}, authHeaders(guestView.access_token))).profile, "Read-only guest view-as must permit guest read routes.");

  await expectStatus("POST", "/admin/impersonate-account", 403, {
    target_role: "super_admin",
    target_user_id: superAdmin.profile.id,
    reason: "Regular admin must not view superadmin."
  }, adminAuditHeaders, "Regular admins must not view as Super Admin accounts.");
  const adminStillRegular = await api("GET", "/admin/settings/platform-mode", {}, admin.headers);
  assert.equal(adminStillRegular.can_edit, false, "View-as mode must not alter the administrator's real stored role.");
  const adminView = await api("POST", "/admin/impersonate-account", {
    target_role: "admin",
    target_user_id: admin.profile.id,
    reason: "Super Admin regression test: admin view-as."
  }, superAdmin.headers);
  assert.equal(adminView.profile?.role, "admin", "Super Admin must be able to view admin accounts.");
  await api("POST", "/admin/impersonation/end", {
    impersonation_session_id: guestView.impersonation_session_id,
    target_user_id: guest.profile.id,
    target_role: "guest"
  }, adminAuditHeaders);

  const audit = await api("GET", "/admin/errors", {}, admin.headers);
  const auditRows = (audit.app_errors || []).filter((item) => item.area === "audit");
  const auditActions = auditRows.map((item) => item.details?.action);
  for (const action of [
    "partner_invitation_created",
    "partner_invitation_resent",
    "partner_invitation_revoked",
    "partner_invitation_accepted",
    "restaurant_duplicate_warning",
    "restaurant_created_duplicate_override",
    "restaurant_status_transition",
    "restaurant_capacity_configured",
    "restaurant_access_change_restaurant_role",
    "restaurant_access_deactivate_restaurant_access",
    "restaurant_access_reactivate_restaurant_access",
    "impersonation_started",
    "impersonation_start_denied",
    "impersonation_ended",
    "authorization_failed"
  ]) {
    assert.ok(auditActions.includes(action), `Audit log must include ${action}.`);
  }
  const duplicateOverrideAudit = auditRows.find((item) => item.details?.action === "restaurant_created_duplicate_override");
  assert.equal(duplicateOverrideAudit?.details?.actor_user_id, admin.profile.id, "Duplicate override audit must record the actor user ID.");
  assert.equal(duplicateOverrideAudit?.details?.actor_role, "admin", "Duplicate override audit must record the actor role.");
  assert.ok(duplicateOverrideAudit?.details?.entity_id, "Duplicate override audit must record the restaurant target ID.");
  assert.equal(duplicateOverrideAudit?.details?.success, true, "Duplicate override audit must record the result.");
  assert.equal(duplicateOverrideAudit?.details?.metadata?.override_reason, "Controlled security regression test override.", "Duplicate override audit must store the written reason.");
  assert.ok(duplicateOverrideAudit?.details?.request_id, "Duplicate override audit must include request metadata.");
  assert.ok(duplicateOverrideAudit?.details?.created_at || duplicateOverrideAudit?.created_at, "Duplicate override audit must include a timestamp.");

  const invitationAcceptedAudit = auditRows.find((item) => item.details?.action === "partner_invitation_accepted");
  assert.equal(invitationAcceptedAudit?.details?.target_role, "partner", "Invitation acceptance audit must record the target role.");
  assert.equal(invitationAcceptedAudit?.details?.restaurant_id, partner.profile.restaurant_id, "Invitation acceptance audit must record restaurant context.");
  const writeDeniedAudit = auditRows.find((item) => item.details?.action === "impersonation_start_denied" && item.details?.metadata?.denial_reason === "write_mode_confirmation_required");
  assert.ok(writeDeniedAudit, "Write-mode view-as confirmation denial must be audited.");
  const writeStartedAudit = auditRows.find((item) => item.details?.action === "impersonation_started" && item.details?.metadata?.write_mode === true);
  assert.ok(writeStartedAudit?.details?.impersonation_session_id, "Confirmed write-mode view-as audit must record the impersonation session.");
  const blockedWriteAudit = auditRows.find((item) => item.details?.action === "authorization_failed" && item.details?.metadata?.code === "IMPERSONATION_READ_ONLY");
  assert.ok(blockedWriteAudit, "Blocked read-only view-as writes must be audited.");
  const serializedAudit = JSON.stringify(auditRows);
  for (const secret of [firstInvitationToken, resentInvitationToken, validInvitationToken]) {
    assert.ok(!serializedAudit.includes(secret), "Audit logs must not contain raw invitation tokens.");
  }
  for (const forbidden of ["Accepted-Partner-Invite-1!", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"]) {
    assert.ok(!serializedAudit.includes(forbidden), `Audit logs must not contain sensitive value ${forbidden}.`);
  }
}

async function assertResolvedReservationsCannotReplay() {
  const lifecycleSource = await readFile(new URL("../scripts/check-reservation-lifecycle.js", import.meta.url), "utf8");
  for (const token of [
    "Repeated acceptance must be idempotent.",
    "Repeated acceptance must not trigger duplicate emails.",
    "Accepted reservations must not be declined later.",
    "Completed reservations must not be reopened as pending.",
    "Repeated guest cancellation must be blocked.",
    "Partner must not modify another restaurant's reservation.",
    "Super Admin cancellation must require explicit confirmation."
  ]) {
    assert.ok(lifecycleSource.includes(token), `Reservation lifecycle replay protection coverage is missing: ${token}`);
  }
}

async function assertRestaurantLevelRoleMutationGuards() {
  const appSource = await readFile(new URL("../src/app-core.js", import.meta.url), "utf8");
  for (const token of [
    "function requireRestaurantAccessRole(",
    'requireRestaurantAccessRole(restaurant, ["owner", "manager"]);',
    'requireRestaurantAccessRole(restaurant, ["owner", "manager", "marketing_staff"]);',
    'requireRestaurantAccessRole(restaurant, ["owner", "manager", "reservation_staff"]);',
    "INVITATION_INVALID_OR_EXPIRED",
    "new Date(invitation.expires_at) <= now",
    "DUPLICATE_RESTAURANT_POSSIBLE",
    "function createRestaurantOnboardingPartnerAccess(",
    "function effectivePartnerInvitationStatus(",
    "function partnerAdminListRows(",
    "partner_access_mode",
    "invitation_id",
    "IMPERSONATION_READ_ONLY",
    "authorization_failed"
  ]) {
    assert.ok(appSource.includes(token), `Restaurant-level mutation guard is missing: ${token}`);
  }
}

async function assertFrontendDirectRouteGuards() {
  const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  for (const token of [
    "function currentProtectedAreaRoute()",
    "function guardProtectedAreaRoute(",
    "function hasProtectedAreaAccess(",
    "function renderForbiddenRoute(",
    "function currentAiRoute()",
    "function aiRouteAccess(",
    "function renderUnavailableRoute(",
    "ai_route_unavailable_basic",
    'path.startsWith("/account/")',
    'path.startsWith("/partner/")',
    'path.startsWith("/admin/")',
    "data-restaurant-partner-mode",
    "partner_access_mode",
    "restaurant_partner_access_invite_new",
    '"/ai-concierge"',
    '"/partner/ai-demand"',
    '"/admin/ai-controls"'
  ]) {
    assert.ok(appSource.includes(token), `Frontend direct-route guard is missing ${token}.`);
  }
}

async function assertBasicModeHidesAiDirectRoutes() {
  const config = await api("GET", "/public/config");
  assert.equal(config.platform_mode, "basic", "BASIC security check expects platform mode to remain basic.");
  assert.equal(registryCanShow(config.feature_registry["ai.concierge"], {
    platformMode: config.platform_mode,
    aiDemoVisibility: true,
    audience: "guest"
  }), false, "BASIC mode must not expose guest AI Concierge even if demo visibility were enabled.");
  assert.equal(registryCanShow(config.feature_registry["ai.partnerDemand"], {
    platformMode: config.platform_mode,
    aiDemoVisibility: true,
    audience: "partner"
  }), false, "BASIC mode must not expose Partner AI Demand through direct route visibility.");
  assert.equal(registryCanShow(config.feature_registry["ai.adminAIControls"], {
    platformMode: config.platform_mode,
    aiDemoVisibility: true,
    audience: "admin"
  }), false, "BASIC mode must not expose Admin AI controls through direct route visibility.");
}

await assertPublicRoutesArePublic();
await assertProtectedApiBoundaries();
await assertResolvedReservationsCannotReplay();
await assertRestaurantLevelRoleMutationGuards();
await assertFrontendDirectRouteGuards();
await assertBasicModeHidesAiDirectRoutes();

console.log("BASIC security and role-boundary checks passed.");
