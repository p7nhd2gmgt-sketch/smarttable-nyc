# SmartTable Supabase Production Initialization

Date: 2026-07-19

Scope: SmartTable BASIC only. This process prepares the shared SmartTable database used by guest, partner, admin, and Super Admin surfaces. It does not add POS integrations, AI launch functionality, Stripe, or Resend webhook activation.

## Safety Rules

- Do not run `supabase db reset` against production.
- Do not delete existing production data.
- Do not paste service-role keys into browser code, public docs, screenshots, logs, or client-side configuration.
- Apply migrations first to a disposable empty Supabase project or staging project before applying them to production.
- Keep BASIC mode as the default platform mode.
- Keep Resend webhook delivery tracking deferred unless it is intentionally configured in a later post-launch task.

## Required Repository Migrations

The repository currently contains migrations `0001_initial_schema.sql` through `0041_reservation_lifecycle_policy.sql` in `supabase/migrations/`.

Core BASIC launch migrations include:

| Migration | Purpose |
| --- | --- |
| `0001_initial_schema.sql` | Profiles, restaurants, offers, reservations, base RLS policies. |
| `0004_saas_platform_content_partner.sql` | Partner/admin content, restaurant dashboard support. |
| `0007_restaurant_order_followers_maps.sql` | Restaurant ordering, followers, map fields. |
| `0008_reviews_notifications_newest.sql` | Reviews and admin notifications. |
| `0027_platform_mode_settings.sql` | Platform mode and app settings. |
| `0029_guest_signup_onboarding_consents.sql` | Guest signup and consent fields. |
| `0031_guest_account_auth_system.sql` | Guest account auth events and account support. |
| `0032_guest_reservation_cancellation.sql` | Guest reservation cancellation. |
| `0033_guest_privacy_security_controls.sql` | Privacy, consent, export, deletion controls. |
| `0035_timezone_aware_offer_validity.sql` | Timezone-aware offer validity fields. |
| `0036_email_service_templates.sql` | Email template foundation. |
| `0037_email_delivery_log_idempotency.sql` | Email delivery log and idempotency fields. |
| `0039_email_queue_retry.sql` | Persistent email queue and retry metadata. |
| `0040_basic_email_flow_content.sql` | BASIC transactional email content. |
| `0041_reservation_lifecycle_policy.sql` | Reservation lifecycle policy and status events. |

AI-related schema may exist for future gated features, but BASIC mode must keep unfinished AI surfaces hidden.

## Empty Production Project Initialization

Use this only for a new empty Supabase project.

```powershell
supabase login
supabase link --project-ref <production-project-ref>
supabase migration list --linked
supabase db push
```

Before running `supabase db push` against production, run the same command against a staging or disposable project and verify:

- all migrations apply cleanly;
- RLS policies are present;
- seed/demo rows do not create unwanted production customer data;
- default app settings keep `platform_mode` as `basic`;
- no POS-related schema or integration is introduced.

If the Supabase CLI is not available, apply each SQL migration from `supabase/migrations/` in filename order through the Supabase SQL editor or a controlled SQL deployment process.

## Migration Status Verification

Run this in the Supabase SQL editor after migrations:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Confirm the latest applied migration includes:

```text
0041_reservation_lifecycle_policy.sql
```

## RLS Verification

Run this in Supabase SQL editor:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Every public table that stores guest, partner, reservation, offer, email, notification, admin, integration, or privacy data should have `rowsecurity = true` unless it is intentionally public read-only content.

Then inspect policies:

```sql
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Minimum expected protections:

- guests can read and update only their own private profile and reservation data;
- partners can read/manage only authorized restaurant data;
- admins can manage admin-scoped content;
- Super Admin-only settings, including platform mode, require Super Admin authorization;
- email logs and email queue are service/admin scoped;
- service-role operations remain server-side.

## Server-Side Ownership Checks

SmartTable also enforces authorization in `src/app-core.js` before performing sensitive actions. Required checks include:

- `requireProfile` for protected routes;
- guest ownership checks for account, reservation, favorite, privacy, and notification endpoints;
- partner restaurant ownership checks for profile, offer, and reservation management;
- Super Admin checks for platform settings and email diagnostics;
- centralized reservation status transition checks.

Do not rely on RLS or hidden UI alone.

## Production Environment Preflight

Production runtime must be explicit:

```text
SMARTTABLE_ENV=production
PUBLIC_BASE_URL=https://smarttablenyc.com
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<server-side service role key>
EMAIL_FROM=SmartTable <reservations@mail.smarttablenyc.com>
RESEND_API_KEY=<server-side Resend key>
```

When `SMARTTABLE_ENV=production`, SmartTable now fails safely instead of falling back to demo storage if mandatory production configuration is missing. Verify:

```powershell
Invoke-RestMethod -Uri https://smarttablenyc.com/api/health
```

Expected production result after correct configuration:

```json
{
  "ok": true,
  "environment": "production",
  "mode": "supabase",
  "platform_mode_default": "basic",
  "public_base_url_uses_localhost": false,
  "supabase_configured": true,
  "email_configured": true,
  "webhook_status": "deferred"
}
```

If `/api/health` returns `503` with `PRODUCTION_CONFIGURATION_INCOMPLETE` on other API routes, fix Vercel/Supabase/Resend environment variables before public testing.

## Non-Production Email Safety

Preview and development deployments that configure `RESEND_API_KEY` must set:

```text
EMAIL_RECIPIENT_ALLOWLIST=tester@example.com,owner@example.com
```

Without an allowlist, non-production real email sends are blocked by the centralized email service. Production also blocks reserved `.example` TLD recipients before contacting Resend.

## Rollback

For application regressions, roll back the Vercel deployment first.

For database migration issues:

- do not run destructive rollback commands without a reviewed plan;
- keep a backup snapshot before applying migrations;
- prefer additive corrective migrations over editing existing migration history;
- preserve users, restaurants, offers, reservations, consents, notifications, and email logs.
