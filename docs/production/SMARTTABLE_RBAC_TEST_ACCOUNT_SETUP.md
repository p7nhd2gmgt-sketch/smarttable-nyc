# SmartTable RBAC Test Account Setup

This procedure prepares protected test accounts for validating the SmartTable BASIC RBAC and restaurant onboarding foundation. It does not use public demo credentials and must not place passwords in source control, frontend code, logs, screenshots, or documentation.

## Required Roles

| Role | Purpose | Required profile role |
| --- | --- | --- |
| Guest tester | Guest browsing, reservation, account, and cancellation checks | `guest` |
| Partner tester | Restaurant dashboard and assigned-restaurant checks | `partner` |
| Admin tester | BASIC platform management without Super Admin powers | `admin` |
| Super Admin tester | Platform-level management and sensitive controls | `super_admin` |

## Environment Variables

Set these values only in the protected local, staging, or production environment where the checks run. Leave them blank in `.env.example`.

```text
SMARTTABLE_TEST_GUEST_EMAIL
SMARTTABLE_TEST_GUEST_PASSWORD
SMARTTABLE_TEST_PARTNER_EMAIL
SMARTTABLE_TEST_PARTNER_PASSWORD
SMARTTABLE_TEST_ADMIN_EMAIL
SMARTTABLE_TEST_ADMIN_PASSWORD
SMARTTABLE_TEST_SUPERADMIN_EMAIL
SMARTTABLE_TEST_SUPERADMIN_PASSWORD
```

The password variables are for protected automated QA only. For shared staging and production-style validation, prefer Supabase invitation or password-reset links so each tester creates their own password.

## Supabase Auth Account Creation

1. Open the intended SmartTable Supabase project.
2. Go to `Authentication` > `Users`.
3. Create or invite one user for each role email.
4. Require the user to set a password through an invitation or password-reset flow.
5. Confirm each user has a verified email before running role-access checks.
6. Do not manually create or share temporary plaintext passwords.

## Profile Role Assignment

After the Auth users exist, verify or create their matching `public.profiles` records. Use the Supabase SQL Editor or the existing protected admin workflow. Replace the placeholder emails with the real test-account emails before running the SQL.

```sql
update public.profiles
set role = 'guest',
    is_test_data = true,
    status = 'active'
where lower(email) = lower('<guest-test-email>');

update public.profiles
set role = 'partner',
    is_test_data = true,
    status = 'active'
where lower(email) = lower('<partner-test-email>');

update public.profiles
set role = 'admin',
    is_test_data = true,
    status = 'active'
where lower(email) = lower('<admin-test-email>');

update public.profiles
set role = 'super_admin',
    is_test_data = true,
    status = 'active'
where lower(email) = lower('<superadmin-test-email>');
```

If a profile is missing, create it with the Auth user `id` from `auth.users`. Do not invent user IDs.

## Partner Restaurant Assignment

The partner tester must be assigned only to the intended test restaurant.

1. Confirm `SmartTable Test Bistro` exists and is marked as test data where the schema supports it.
2. Confirm the partner profile has `role = 'partner'`.
3. Create a `restaurant_users` assignment with one of these restaurant-level roles:
   - `owner`
   - `manager`
   - `reservation_staff`
   - `marketing_staff`
   - `read_only`
4. Use `status = 'active'` for the main partner tester.
5. Mark the assignment with `is_test_data = true` where the column exists.

Example template:

```sql
insert into public.restaurant_users (
  restaurant_id,
  user_id,
  email,
  role,
  status,
  is_test_data
)
select
  r.id,
  p.id,
  p.email,
  'owner',
  'active',
  true
from public.restaurants r
join public.profiles p on lower(p.email) = lower('<partner-test-email>')
where lower(r.name) = lower('SmartTable Test Bistro')
on conflict (restaurant_id, email)
do update set
  user_id = excluded.user_id,
  role = excluded.role,
  status = excluded.status,
  is_test_data = excluded.is_test_data;
```

If the active production schema does not have one of these columns, stop and update the assignment through the protected admin workflow instead of weakening RLS or creating ad hoc schema changes.

## Invitation Validation

Use the Admin or Super Admin restaurant onboarding flow to test partner invitations.

1. Create or open a Draft test restaurant.
2. Choose `Invite a new partner`.
3. Enter the partner email and role.
4. Send the invitation.
5. Verify the invitation status is `pending`.
6. Resend the invitation and verify the token rotates or a new safe attempt is recorded.
7. Revoke the invitation and verify the status becomes `revoked`.
8. Use a fresh invitation link to accept and verify the status becomes `accepted`.

Invitations must expire automatically according to the `expires_at` timestamp and must never email a temporary plaintext password.

## Role-Access QA Checklist

| Check | Expected result |
| --- | --- |
| Guest opens public pages | Allowed |
| Guest opens `/partner` | Denied |
| Guest opens `/admin` | Denied |
| Guest opens `/superadmin` | Denied |
| Partner opens assigned restaurant dashboard | Allowed |
| Partner requests another restaurant by ID | Denied |
| `read_only` partner writes profile, offers, or reservations | Denied |
| `reservation_staff` manages reservations | Allowed where assigned |
| `reservation_staff` performs owner-only or marketing action | Denied |
| `marketing_staff` performs owner-only action | Denied |
| Admin opens `/admin` | Allowed |
| Admin opens `/superadmin` | Denied |
| Admin promotes self or creates Super Admin | Denied |
| Admin creates Draft restaurant | Allowed |
| Admin activates restaurant | Allowed |
| Super Admin opens `/admin` and `/superadmin` | Allowed |
| View-as Guest or Partner starts | Allowed only with audit reason |
| View-as write mode without confirmation | Denied |
| View-as write mode with confirmation | Audited and allowed only for authorized admins |
| Duplicate restaurant detected | Warning returned |
| Duplicate override without reason | Denied |
| Duplicate override with reason | Allowed and audited |

## Verification Commands

Run these after account setup:

```text
npm run check:onboarding-migration
npm run check:basic-security-boundaries
npm run check:route-protection
npm test
npm run test:e2e
```

The checks must run with protected environment variables. Do not print the variable values in terminal output, CI logs, tickets, or screenshots.
