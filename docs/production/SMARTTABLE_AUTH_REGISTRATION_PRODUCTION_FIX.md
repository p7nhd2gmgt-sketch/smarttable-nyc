# SmartTable Production Auth Registration Fix

Date: 2026-07-19

Scope: SmartTable BASIC production registration and login only. Do not use this procedure to enable AI Concierge, POS integrations, Stripe, or Resend webhook delivery tracking.

## Exact Signup Endpoint

The guest signup flow uses this browser-to-server path:

```text
public/app.js submitSignupStep()
-> api("/auth/signup-guest")
-> POST /api/auth/signup-guest
-> api/index.js handler()
-> src/app-core.js handleApiRequest()
-> signupGuest()
-> Supabase Auth POST /auth/v1/signup
-> public.profiles, public.guests, public.guest_profiles, public.guest_consents, public.ai_preference_profiles
-> SmartTable Resend welcome email
```

Important behavior:

- The browser never receives the Supabase service-role key.
- Supabase Auth signup uses the anon key.
- Profile/onboarding persistence uses server-side service-role requests after Auth user creation succeeds.
- SmartTable welcome email is sent through Resend only after required account/profile/preference/consent records are saved.
- Supabase Auth remains responsible for confirmation signup email and password reset email when those provider flows are enabled.
- If Supabase Auth login succeeds but required SmartTable guest setup is missing, `/api/auth/login` returns `409 ACCOUNT_SETUP_INCOMPLETE` with a valid session and `/signup` redirect so the guest can finish onboarding instead of seeing a generic invalid-password failure.

Expected unauthenticated API behavior:

- `/api/auth/login` returns `401` only for invalid credentials or rate-limited login attempts.
- `/api/guest/account`, `/api/guest/reservations`, and `/api/guest/favorites` return `401` before login.
- `/api/guest/notifications` also returns `401 AUTHENTICATION_REQUIRED` before login when no explicit guest email or profile key query is supplied. It should not return a noisy `400` solely because the user is logged out.

## Production Evidence To Check

If a guest completed the signup UI but Supabase Authentication -> Users still shows zero users, the deployed app is not successfully calling Supabase Auth signup.

Check the live API:

```powershell
Invoke-RestMethod -Uri https://smarttable-nyc.vercel.app/api/health
Invoke-RestMethod -Uri https://smarttable-nyc.vercel.app/api/public/config
```

The production-ready result must show:

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

If it reports `mode: "demo"` or does not include these production fields, Vercel is serving an old build or the wrong branch. Do not continue public testing until the fixed branch is deployed.

## Required Environment Variables

Set these in Vercel Production. Do not commit values to Git.

```text
SMARTTABLE_ENV=production
PUBLIC_BASE_URL=https://smarttablenyc.com
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
RESEND_API_KEY=<resend key>
EMAIL_FROM=SmartTable <reservations@mail.smarttablenyc.com>
EMAIL_REPLY_TO=<support or monitored reply address>
```

`VERCEL_ENV=production` is also treated as production by the application and must not fall back to demo mode.

## Required Supabase Migrations

The repository migration sequence is:

```text
0001_initial_schema.sql
0002_seed_demo_availability.sql
0003_saas_enum_values.sql
0004_saas_platform_content_partner.sql
0005_billing_storage_email_templates.sql
0006_super_admin_socials_offer_management.sql
0007_restaurant_order_followers_maps.sql
0008_reviews_notifications_newest.sql
0009_ai_platform_foundation.sql
0010_restaurant_intelligence_expansion.sql
0011_partner_dashboard_demand_design.sql
0012_advisor_profile_public_concierge.sql
0013_ai_score_revenue_marketplace_insights.sql
0014_benchmark_consumer_planner_expansion.sql
0015_photo_rewards_recognition_loyalty_privacy.sql
0016_partner_ai_revenue_operating_system.sql
0017_partner_portfolio_ops_marketing_ai.sql
0018_partner_ai_competitor_menu_reputation.sql
0019_post_visit_photo_rewards.sql
0020_partner_post_visit_feedback.sql
0021_partner_ai_operating_system.sql
0022_partner_dashboard_simplification.sql
0023_real_ai_operating_system_foundation.sql
0024_integration_hub_billing_monitoring.sql
0025_ai_truth_status_updates.sql
0026_hungarian_i18n.sql
0027_platform_mode_settings.sql
0028_remove_pos_integration_references.sql
0029_guest_signup_onboarding_consents.sql
0030_guest_signup_profile_preference_fields.sql
0031_guest_account_auth_system.sql
0032_guest_reservation_cancellation.sql
0033_guest_privacy_security_controls.sql
0034_scale_readiness_feature_flags_booking.sql
0035_timezone_aware_offer_validity.sql
0036_email_service_templates.sql
0037_email_delivery_log_idempotency.sql
0038_post_visit_email_templates_and_webhooks.sql
0039_email_queue_retry.sql
0040_basic_email_flow_content.sql
0041_reservation_lifecycle_policy.sql
```

For guest registration specifically, these objects must exist:

- `auth.users`
- `public.profiles`
- `public.guests`
- `public.guest_profiles`
- `public.guest_consents`
- `public.ai_preference_profiles`
- `public.guest_auth_events`
- `public.email_logs`
- `public.email_queue`
- trigger `public.handle_new_user()` on `auth.users`
- RLS enabled on profile, guest, guest profile, consent, reservation, notification, and email tables

## Safe Migration Procedure

Preferred CLI path:

```powershell
supabase login
supabase link --project-ref <production-project-ref>
supabase migration list --linked
supabase db push
supabase migration list --linked
```

Safety rules:

- Do not run `supabase db reset` against production.
- Do not delete or truncate tables.
- Apply to a staging or disposable project first when possible.
- If production already has partial tables, use `supabase db push`; the repository migrations are written as additive/idempotent where practical.
- If a migration fails, stop and inspect the exact failure. Do not skip migrations.

Current rollout note: the Supabase CLI was not available on the local machine during the final deployment review, and the historical migration `supabase/migrations/0028_remove_pos_integration_references.sql` contains data and column removal. Do not blindly run the full migration chain against an existing production database until that migration is reviewed against the actual production data state.

For the current BASIC auth rollout, use the additive manual migration and guide instead:

```text
docs/production/SMARTTABLE_AUTH_PRODUCTION_MIGRATION.sql
docs/production/SMARTTABLE_AUTH_MIGRATION_EXECUTION_GUIDE.md
```

## Verification SQL

After migration, run:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Latest expected repository migration:

```text
0041_reservation_lifecycle_policy.sql
```

Check required tables:

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
    'guest_auth_events',
    'guest_notifications',
    'restaurant_followers',
    'email_logs',
    'email_queue',
    'app_settings'
  )
order by table_name;
```

Check the Auth profile trigger:

```sql
select tgname
from pg_trigger
where tgname = 'on_auth_user_created';
```

Check RLS:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Check policies:

```sql
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Supabase Auth Redirect Settings

In Supabase Dashboard -> Authentication -> URL Configuration:

- Site URL: `https://smarttablenyc.com`
- Redirect URLs:
  - `https://smarttablenyc.com/**`
  - `https://www.smarttablenyc.com/**`
  - the active Vercel production URL only while that URL is still intentionally used
  - preview URLs only when explicitly intended

Do not disable email confirmation automatically. The application supports both Supabase Auth configurations:

- Email confirmation enabled: signup succeeds only after Supabase Auth creates the user and SmartTable persists the required guest records; the response includes `email_verification_required: true`, no active session is promised, and the UI tells the guest to check email before signing in.
- Email confirmation disabled: Supabase returns an immediate session; the response includes `email_verification_required: false`, the browser can store the guest session, and the user may continue directly into onboarding/account flows.

## Email Responsibility

SmartTable intentionally separates account-provider email from application email:

- Supabase Auth sends secure provider emails: signup confirmation, password reset, and any magic-link style email if later enabled.
- SmartTable Resend sends application transactional emails: guest welcome/registration confirmation, reservation request, partner notification, accepted/declined/cancelled reservation notices, and post-visit feedback request.

The Resend welcome email must be attempted only after Supabase Auth user creation and required SmartTable profile/onboarding persistence succeed. A Resend failure must be shown truthfully but must not delete the successfully created Auth user.

## Post-Deployment Test Procedure

1. Deploy the branch containing the auth fix.
2. Open `/api/health` and confirm `environment: "production"` and `mode: "supabase"`.
3. Open `/api/public/config` and confirm it does not report `mode: "demo"`.
4. Create a guest account with a controlled real inbox.
5. Confirm a new row appears in Supabase Authentication -> Users.
6. Confirm related rows exist:

```sql
select id, email, role from public.profiles where lower(email) = lower('<guest-email>');
select id, user_id, email, status from public.guests where lower(email) = lower('<guest-email>');
select id, guest_id from public.guest_profiles where guest_id in (
  select id from public.guests where lower(email) = lower('<guest-email>')
);
```

7. If email confirmation is enabled, click the Supabase confirmation email link.
8. Log in with the confirmed guest account.
9. Verify `/account`, `/account/reservations`, `/account/favorites`, and `/account/notifications` load without 401/400 for the signed-in guest.
10. Verify the SmartTable welcome email is logged/accepted by Resend if Resend is configured.

Do not manually create the test Auth user. The test must prove the application signup path creates the Auth user.
