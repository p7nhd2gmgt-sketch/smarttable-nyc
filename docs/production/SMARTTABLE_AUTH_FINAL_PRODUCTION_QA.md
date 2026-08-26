# SmartTable Auth Final Production QA

Date: 2026-07-19

Branch: `production-hardening-basic`

Commit reviewed: `6a4cad3638b0ffbcd1bdc2c94c1348e52a2ed820`

Scope: SmartTable BASIC production authentication, guest registration, Supabase Auth integration, SmartTable onboarding records, email responsibility, login, account access, and production safety gates.

Do not use this report to enable AI Concierge, POS integrations, Stripe, or Resend webhook tracking. Resend webhook delivery tracking remains deferred.

## 1. Executive Summary

Release decision: **NO-GO — blocking issue remains**

The code-level production auth fix has been implemented, committed, pushed to GitHub, and covered by automated checks. However, final production verification has not completed.

Blocking findings:

- `https://smarttablenyc.com/api/health` returns `522`.
- `https://smarttablenyc.com/api/public/config` returns `522`.
- `https://smarttable-nyc.vercel.app/api/health` still reports `mode: "demo"`.
- `https://smarttable-nyc.vercel.app/api/public/config` still reports `mode: "demo"`.
- Supabase production migrations were not applied from this machine.
- The production deployment of commit `6a4cad3` was not verified.
- Real browser signup, confirmation email, welcome email, login, onboarding, and account-page access were not verified.

Because production is not confirmed to be running the Supabase-backed fixed build, the production auth flow cannot be marked verified.

## 2. Root Cause Recap

Confirmed production evidence showed:

- Supabase Authentication -> Users contained zero users after a guest completed registration.
- Login returned `Invalid email or password`.
- Vercel runtime showed expected logged-out `401` responses plus a noisy guest notifications state.
- No registration email arrived.
- Public production navigation still exposed internal/demo entry points.

Code investigation found that the intended registration endpoint is:

```text
POST /api/auth/signup-guest
```

Expected fixed flow:

```text
public/app.js submitSignupStep()
-> api("/auth/signup-guest")
-> api/index.js
-> src/app-core.js handleApiRequest()
-> signupGuest()
-> Supabase Auth POST /auth/v1/signup
-> public.profiles
-> public.guests
-> public.guest_profiles
-> public.guest_consents
-> public.ai_preference_profiles
-> SmartTable Resend welcome email
```

The live production checks still show the public deployment is not serving the fixed Supabase-backed build. That remains the primary release blocker.

## 3. Files Changed

Committed in `6a4cad3638b0ffbcd1bdc2c94c1348e52a2ed820`:

```text
docs/production/SMARTTABLE_AUTH_MIGRATION_EXECUTION_GUIDE.md
docs/production/SMARTTABLE_AUTH_PRODUCTION_MIGRATION.sql
docs/production/SMARTTABLE_AUTH_REGISTRATION_PRODUCTION_FIX.md
package-lock.json
package.json
public/app.js
public/index.html
public/locales/en.json
public/locales/es.json
public/locales/hu.json
public/styles.css
scripts/check-basic-security-hardening.js
scripts/check-basic-ui-readiness.js
scripts/check-basic-visual-readiness.js
scripts/check-guest-signup.js
scripts/check-production-auth-flow.js
scripts/check-production-hardening.js
src/app-core.js
```

This report file was added after that commit:

```text
docs/production/SMARTTABLE_AUTH_FINAL_PRODUCTION_QA.md
```

Local ignored files not committed:

```text
.env.local
.autosave.heartbeat
.autosave.pid
autosave.log
backups/latest.txt
```

## 4. Migrations Applied Or Still Requiring Manual Execution

Status: **manual action required**

Supabase CLI status:

```text
where.exe supabase -> not found
```

Migrations were not applied from this machine.

The safe production migration package is:

```text
docs/production/SMARTTABLE_AUTH_PRODUCTION_MIGRATION.sql
docs/production/SMARTTABLE_AUTH_MIGRATION_EXECUTION_GUIDE.md
```

Important safety note: do not blindly run the full repository migration chain against production yet. Historical migration `supabase/migrations/0028_remove_pos_integration_references.sql` contains destructive SQL relative to the current rollout safety rule and must be reviewed separately before full CLI migration push is used.

Required next action: apply the consolidated additive SQL manually in the intended production Supabase project, then run the verification queries in the execution guide.

## 5. Production Environment Audit

Production environment variables could not be read directly from Vercel from this environment.

Live endpoint observations:

```text
https://smarttablenyc.com/api/health -> 522
https://smarttablenyc.com/api/public/config -> 522
https://smarttable-nyc.vercel.app/api/health -> ok=true, mode=demo
https://smarttable-nyc.vercel.app/api/public/config -> mode=demo, platform_mode=basic
```

Required Vercel Production variables:

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

`RESEND_WEBHOOK_SECRET` remains deferred for BASIC launch.

## 6. Supabase Auth URL Settings

Required Supabase Dashboard path:

```text
Authentication -> URL Configuration
```

Required Site URL:

```text
https://smarttablenyc.com
```

Required Allowed Redirect URLs:

```text
https://smarttablenyc.com/**
https://www.smarttablenyc.com/**
```

Also include the active Vercel production URL only if it remains intentionally used by production email/auth redirects:

```text
https://smarttable-nyc.vercel.app/**
```

Status: **not verified in Supabase Dashboard from this environment**

## 7. Email-Confirmation Configuration

Supabase email confirmation setting: **UNKNOWN**

The application supports both configurations:

- Email confirmation enabled: signup returns `email_verification_required: true`, does not imply an active session, and tells the guest to check email before signing in.
- Email confirmation disabled: Supabase returns an immediate session, signup returns `email_verification_required: false`, and the guest can continue safely.

Status: **not verified against production Supabase**

## 8. Resend Verification Status

Expected production sender:

```text
SmartTable <reservations@mail.smarttablenyc.com>
```

Code responsibility split:

- Supabase Auth sends provider emails: signup confirmation, password reset, and magic-link emails if enabled.
- SmartTable Resend sends application emails: welcome/registration, reservation request, partner notification, accepted/declined/cancelled notifications, and post-visit feedback request.

Current production welcome email status: **not tested**

Reason: production is not confirmed to be running the fixed Supabase-backed build and the custom domain is returning `522`.

## 9. Automated Test Results

Latest relevant local checks run after the production auth fix:

```text
npm.cmd install -> PASS
npm.cmd run build -> PASS
npm.cmd run lint -> PASS
npm.cmd run check:email -> PASS
npm.cmd run check:reservation-lifecycle -> PASS
npm.cmd run check:production-auth-flow -> PASS
npm.cmd run check:production-hardening -> PASS
npm.cmd run check:signup -> PASS
npm.cmd run check:basic-security-hardening -> PASS
npm.cmd test -> PASS
```

Notes:

- Email tests intentionally include mocked provider failures such as `EMAIL_PROVIDER_NOT_CONFIGURED`, `RESEND_403`, and `RESEND_503`; those scenarios are expected test coverage and the commands exited successfully.
- Production hardening checks simulate missing/unreachable upstream services and verify safe failure behavior.

## 10. Deployment URL And Deployment Status

GitHub push status:

```text
origin/production-hardening-basic -> pushed at commit 6a4cad3
```

Vercel CLI status:

```text
where.exe vercel -> not found
```

Production deployment status: **not performed or verified from this machine**

Live URL status:

```text
https://smarttablenyc.com -> API health/config blocked by 522
https://smarttable-nyc.vercel.app -> reachable but still reports demo mode
```

Deployment identifier: **not available**

## 11. Real Browser QA Results

Real browser QA status: **not completed**

The in-app browser could not be launched from this environment:

```text
CreateProcessAsUserW failed: 5
```

Production browser tests not completed:

- New guest signup
- Supabase confirmation email click-through
- SmartTable Resend welcome email receipt
- Login after confirmation
- Onboarding completion
- `/account`
- `/account/reservations`
- `/account/favorites`
- `/account/notifications`
- Logout and unauthenticated access behavior
- Existing Auth user recovery
- Duplicate/invalid/expired-link cases

## 12. Database Record Verification

Production database record verification status: **not completed**

Required verification after migration and deployment:

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

Expected result: exactly one corresponding Auth user and one coherent set of SmartTable records for the controlled test account.

## 13. Security/RLS Verification

Code/static security checks: **PASS**

Production RLS verification: **not completed**

Verified locally/static:

- service-role key is not referenced by browser code;
- Resend API key is not referenced by browser code;
- production config refuses silent demo fallback when required configuration is missing;
- public config/health responses are designed not to expose secrets;
- production demo credentials are hidden by runtime checks;
- auth failures return safe categories;
- guest notification endpoint returns authenticated-state errors instead of noisy unauthenticated `400` when appropriate.

Still requiring live Supabase verification:

- RLS enabled on required public tables;
- anon users cannot read private account data;
- guests cannot read/modify other guests' rows;
- partners cannot access another restaurant's data;
- policies match the deployed production schema;
- service-role operations happen only server-side;
- logs do not contain passwords, tokens, API keys, or session values.

## 14. Remaining Manual Steps

1. Open Supabase Dashboard and select the intended SmartTable production project.
2. Apply `docs/production/SMARTTABLE_AUTH_PRODUCTION_MIGRATION.sql`.
3. Run the verification queries in `docs/production/SMARTTABLE_AUTH_MIGRATION_EXECUTION_GUIDE.md`.
4. Configure Supabase Auth URL settings:
   - `https://smarttablenyc.com`
   - `https://smarttablenyc.com/**`
   - `https://www.smarttablenyc.com/**`
   - active Vercel production URL only if still used
5. Confirm whether Supabase email confirmation is enabled.
6. Confirm Vercel Production environment variables.
7. Deploy commit `6a4cad3638b0ffbcd1bdc2c94c1348e52a2ed820` to production.
8. Fix the `smarttablenyc.com` `522` issue.
9. Confirm:
   - `/api/health` reports `environment: "production"` and `mode: "supabase"`;
   - `/api/public/config` does not report `mode: "demo"`.
10. Run real browser signup with a controlled inbox.
11. Verify Supabase Auth user creation.
12. Verify SmartTable profile, guest, preference, and consent records.
13. Verify Supabase confirmation email behavior according to configuration.
14. Verify SmartTable Resend welcome email arrival.
15. Verify login, onboarding/account redirect, account pages, logout, and unauthenticated `401` behavior.
16. Verify RLS/security boundaries in production with controlled accounts only.

## 15. Known Risks

- Production currently appears to be serving an old/demo build or an incorrectly configured build.
- Custom domain returns `522`, so users cannot reliably reach production.
- Production Supabase migrations may be missing because the project was newly created.
- Supabase email confirmation setting is unknown.
- Supabase Auth URL allowlist is not verified.
- Resend welcome email delivery for the current production signup flow is not verified.
- RLS policies are documented in the consolidated migration but not verified against the actual production database.
- Vercel production environment variables are not directly verified from this environment.
- Real browser QA is blocked locally by Windows browser launch permissions.

## 16. Final Release Decision

**NO-GO — blocking issue remains**

Reason: the fixed code is committed and pushed, and local automated checks pass, but production deployment, Supabase migration state, Supabase mode, real signup, Auth user creation, SmartTable record creation, confirmation behavior, email delivery, login, account pages, and live RLS/security behavior have not all been genuinely verified.
