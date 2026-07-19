# SmartTable Auth Production Migration Execution Guide

Date: 2026-07-19

Scope: SmartTable BASIC production authentication, guest signup, onboarding, account access, reservation lifecycle, and transactional email support.

Do not use this guide to enable AI Concierge, POS integrations, Stripe, or Resend webhook delivery tracking.

## Current Local Tooling Finding

The local machine does not have the Supabase CLI installed:

```text
where.exe supabase -> not found
```

Because the CLI is unavailable, migrations were not applied from this environment. The safe fallback is to use the Supabase SQL Editor with the consolidated additive SQL file:

```text
docs/production/SMARTTABLE_AUTH_PRODUCTION_MIGRATION.sql
```

## Critical Migration Safety Finding

Do not blindly run the full repository migration chain against an existing production database yet.

The historical repository migration below contains deletes and column/table removals:

```text
supabase/migrations/0028_remove_pos_integration_references.sql
```

This does not mean the migration is wrong for its original purpose, but it is destructive relative to the current rollout rule. It must be reviewed separately before any full `supabase db push` is used on production.

The consolidated SQL file in this guide is intentionally additive:

- no `DELETE`
- no `TRUNCATE`
- no `DROP TABLE`
- no `DROP COLUMN`
- no production reset
- no demo restaurants or users
- no POS integration

## Before Running SQL

1. Open the Supabase Dashboard.
2. Select the SmartTable production project.
3. Confirm the project URL or reference matches the values configured in Vercel Production:

```text
SUPABASE_URL=https://<production-project-ref>.supabase.co
```

4. Confirm you are not inside a staging, preview, or unrelated Supabase project.
5. Confirm you have a current Supabase backup or project-level recovery option available.
6. Do not run `supabase db reset`.
7. Do not manually create the guest test user. The retest must prove the app creates the Auth user.

## SQL Editor Procedure

1. In Supabase Dashboard, open:

```text
SQL Editor -> New query
```

2. Open this repository file locally:

```text
docs/production/SMARTTABLE_AUTH_PRODUCTION_MIGRATION.sql
```

3. Copy the full SQL content.
4. Paste it into the Supabase SQL Editor.
5. Read the first comment block again and confirm it is the auth/BASIC consolidated migration.
6. Click `Run`.

## Stop Conditions

Stop immediately if Supabase reports any error involving:

- table ownership or missing `auth.users`
- permission denied
- enum value cannot be used
- view replacement failure
- policy creation failure
- function compilation failure
- any statement trying to delete, truncate, drop a table, or drop a column

Do not continue with production signup tests until the error is reviewed and fixed.

## Expected Successful Output

Supabase SQL Editor usually reports a successful command sequence rather than a single row result. A successful run should show no red error panel and no failed statement.

It is normal for idempotent statements to report:

- object already exists
- relation already exists
- index already exists

as notices rather than errors.

## Verification Queries

Run these queries after the SQL succeeds.

### Required tables

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'restaurants',
    'offers',
    'reservations',
    'guests',
    'guest_profiles',
    'guest_consents',
    'ai_preference_profiles',
    'guest_notifications',
    'restaurant_followers',
    'restaurant_reviews',
    'guest_feedback',
    'email_events',
    'email_logs',
    'email_queue',
    'app_settings',
    'site_content',
    'reservation_status_events'
  )
order by table_name;
```

Expected: every listed table that appears in the `in (...)` list should be returned.

### Auth profile trigger

```sql
select tgname
from pg_trigger
where tgname = 'on_auth_user_created';
```

Expected:

```text
on_auth_user_created
```

### RLS status

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'restaurants',
    'offers',
    'reservations',
    'guests',
    'guest_profiles',
    'guest_consents',
    'guest_notifications',
    'restaurant_followers',
    'email_logs',
    'email_queue',
    'app_settings',
    'site_content',
    'reservation_status_events'
  )
order by tablename;
```

Expected: `rowsecurity = true` for the protected application tables.

### Key policies

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'restaurants',
    'offers',
    'reservations',
    'guests',
    'guest_profiles',
    'guest_consents',
    'guest_notifications',
    'email_logs',
    'email_queue',
    'app_settings'
  )
order by tablename, policyname;
```

Expected: policies exist for self/admin guest data, restaurant ownership, email diagnostics, app settings, and public content read access.

### Platform mode

```sql
select key, value
from public.app_settings
where key = 'platform';
```

Expected:

```json
{
  "platform_mode": "basic",
  "ai_demo_visibility": false
}
```

### Public offer view

```sql
select *
from public.public_available_offers
limit 1;
```

Expected: query succeeds. It may return zero rows if no approved restaurant with an active future offer exists.

## Vercel Production Variables To Confirm

Confirm in Vercel Project Settings -> Environment Variables -> Production.

Do not paste values into chat or documentation.

Required:

```text
SMARTTABLE_ENV=production
PUBLIC_BASE_URL=https://smarttablenyc.com
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
EMAIL_FROM=SmartTable <reservations@mail.smarttablenyc.com>
EMAIL_REPLY_TO
```

Optional:

```text
SUPABASE_STORAGE_BUCKET
EMAIL_RECIPIENT_ALLOWLIST
EMAIL_QUEUE_MAX_ATTEMPTS
EMAIL_TEMPLATE_VERSION
TERMS_VERSION
PRIVACY_POLICY_VERSION
RESEND_WEBHOOK_SECRET
```

`RESEND_WEBHOOK_SECRET` remains deferred for BASIC launch unless webhook delivery tracking is explicitly scheduled later.

## Supabase Auth URL Configuration

Open:

```text
Supabase Dashboard -> Authentication -> URL Configuration
```

Set:

```text
Site URL: https://smarttablenyc.com
```

Add redirect URLs:

```text
https://smarttablenyc.com/**
https://www.smarttablenyc.com/**
https://smarttable-nyc.vercel.app/**
```

Add the active Vercel production deployment URL only if it is still intentionally public and not behind Vercel authentication. If production traffic is served only from `smarttablenyc.com` and `www.smarttablenyc.com`, remove obsolete Vercel deployment URLs from the allowlist after verifying no email links or OAuth redirects depend on them.

Do not disable email confirmation from this rollout step. Record the existing Supabase setting and test the matching application behavior:

- Email confirmation enabled: `/api/auth/signup-guest` returns `email_verification_required: true`, no active guest session is implied, the user sees the localized check-email state, the Supabase confirmation link redirects back to SmartTable, and the confirmed guest can sign in.
- Email confirmation disabled: Supabase returns an immediate session, `/api/auth/signup-guest` returns `email_verification_required: false`, the browser stores the returned guest session, and the guest can continue to `/account` without waiting for confirmation.

## Deployment Order

1. Apply the SQL above to the intended production Supabase project.
2. Verify the SQL with the queries in this document.
3. Configure/confirm Vercel Production environment variables.
4. Deploy the branch containing the auth fix.
5. Open:

```text
https://smarttablenyc.com/api/health
https://smarttablenyc.com/api/public/config
```

Expected current fixed build:

```json
{
  "environment": "production",
  "mode": "supabase",
  "supabase_configured": true,
  "database_reachable": true,
  "email_configured": true,
  "webhook_status": "deferred"
}
```

If `/api/public/config` reports `mode: "demo"`, stop. The fixed branch or production variables are not active.

## Production Retest Procedure

Use a controlled real inbox that you own.

1. Open the production site.
2. Create a new guest account from the public signup flow.
3. Confirm Supabase Dashboard -> Authentication -> Users now contains the new user.
4. Confirm SmartTable records:

```sql
select id, email, role
from public.profiles
where lower(email) = lower('<guest-email>');

select id, user_id, email, status
from public.guests
where lower(email) = lower('<guest-email>');

select id, guest_id, profile_key
from public.guest_profiles
where guest_id in (
  select id
  from public.guests
  where lower(email) = lower('<guest-email>')
);

select consent_type, status, terms_accepted, privacy_accepted, marketing_consent
from public.guest_consents
where lower(guest_email) = lower('<guest-email>')
order by created_at desc;
```

5. If Supabase email confirmation is enabled, open the Supabase confirmation email and complete verification.
6. Confirm the SmartTable welcome email is accepted by Resend or logged in `public.email_logs`.
7. Log in as the new guest.
8. Open:

```text
/account
/account/reservations
/account/favorites
/account/notifications
```

9. Confirm the pages load for the signed-in guest and do not return `401` or noisy `400`.

## If Signup Still Shows Success But No Auth User Appears

Stop testing and inspect the deployed `/api/health` and `/api/public/config` responses.

Most likely causes:

1. The fixed branch is not deployed.
2. Vercel Production variables are missing or attached only to Preview.
3. `SUPABASE_URL` points to the wrong Supabase project.
4. `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is missing/invalid.
5. The custom domain points to a different deployment or is failing at DNS/proxy level.

Do not manually create a production user as a workaround.
