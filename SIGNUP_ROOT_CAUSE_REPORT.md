# SmartTable Signup Root Cause Report

Date: 2026-07-21
Environment tested: Production, `https://www.smarttablenyc.com`
Deployment verified after fix: `dpl_FwAv2kV48V5peH27wXgK6iTPLzCy`

## Executive Summary

The original production signup blocker was fixed.

Evidence from Vercel production logs before the fix:

- `POST /api/auth/signup-guest`
- Supabase Auth signup succeeded.
- `email_verification_required=true`
- SmartTable profile/onboarding persistence failed afterward.
- The browser saw: `Account setup could not be completed. Please try again or contact support.`

The minimal application fix was deployed. A follow-up production signup returned HTTP 201 and Vercel logs showed:

- `guest_signup_auth_success`
- `guest_signup_profile_creation_success`

The first remaining production blocker is now separate from account setup:

- SmartTable welcome email through Resend failed with `RESEND_400`
- Provider message: `API key is invalid`
- This is a Vercel Production `RESEND_API_KEY` configuration issue, not an application-code issue.

## Original Failing Requests

### 1. Signup request

Endpoint: `POST /api/auth/signup-guest`

Observed production result before fix:

- HTTP status returned to browser: `500`
- UI message: `Account setup could not be completed. Please try again or contact support.`
- Server event sequence:
  - `guest_signup_request_started`
  - `guest_signup_auth_success`
  - `guest_signup_profile_creation_failed`
- Logged upstream status: `400`
- Logged application code: `SIGNUP_PROFILE_CREATION_FAILED`
- Stack trace: not available in production logs. The application intentionally avoids logging raw upstream database details.

Root cause:

`guestConsentRows()` returned a bulk PostgREST insert array whose rows did not have the same object keys. The terms, privacy, and marketing consent rows each included different column sets. PostgREST rejects heterogeneous bulk insert payloads with HTTP 400. That caused signup to fail after the Auth user had been created and after required profile writes had started.

Failing component:

- Table/relation: `public.guest_consents`
- Error category: PostgREST bulk insert payload shape error
- Cause type: invalid payload shape

### 2. Signup analytics request

Endpoint: `POST /api/analytics/events`

Observed production result before fix:

- HTTP status: `400`
- Error code: `PGRST204`
- Stack trace: not available in production logs.

Root cause:

The production SQL defines `public.analytics_events` with a `metadata` column, while the application inserted `properties`, `entity_type`, and `entity_id`. PostgREST returned `PGRST204` because those inserted columns were not present in the deployed production table schema.

Failing component:

- Table/relation: `public.analytics_events`
- Error category: PostgREST schema cache / missing column
- Cause type: schema mismatch between application insert payload and production migration SQL

## Fix Applied

Modified `src/app-core.js`.

1. `guestConsentRows()` now returns terms, privacy, and marketing rows with one uniform column set. Non-applicable fields are explicitly set to `null`, preserving the existing consent semantics while making the bulk insert valid for PostgREST.

2. `analyticsEvent()` now writes whitelisted analytics properties into the existing production `metadata` column. The API response still exposes `event.properties` so existing frontend/test behavior remains compatible. A fallback remains for older schemas with `properties`.

Modified `scripts/check-production-auth-flow.js`.

1. Added regression coverage that signup consent bulk-insert rows have identical keys.

2. Added regression coverage that production analytics can write to a `metadata`-only schema and still return the existing `properties` response contract.

## Verification After Fix

### Production endpoints

- `GET /api/health`: HTTP 200
- `environment`: `production`
- `mode`: `supabase`
- `database_reachable`: `true`
- `production_configuration_issues`: `[]`
- No secret values exposed.

- `GET /api/public/config`: HTTP 200
- `environment`: `production`
- `mode`: `supabase`
- Public base URL is production, not localhost.
- No secret values exposed.

### Production signup retest

One controlled production signup was submitted after deployment.

Result:

- `POST /api/auth/signup-guest`: HTTP 201
- Supabase Auth user ID returned: yes
- `email_verification_required`: true
- Active session returned: no, expected because email confirmation is enabled
- Vercel logs show `guest_signup_profile_creation_success`: yes
- Login immediately after signup: HTTP 403 `EMAIL_NOT_CONFIRMED`, expected until the confirmation link is used

Database/profile inference:

Vercel logs show `guest_signup_profile_creation_success`, which occurs only after the required SmartTable profile, guest, guest profile, consent, and AI preference profile persistence steps complete.

Direct database inspection using the local `.env.local` Supabase credentials did not verify the production records, which indicates the local credentials may not match the active production Supabase project or may not have admin access. No secret values were printed.

### Production analytics retest

Endpoint: `POST /api/analytics/events`

Result after fix:

- HTTP 201
- Event returned: yes
- `properties` response contract preserved: yes

## Remaining Blockers

### P1: SmartTable welcome email fails through Resend

During the post-fix signup, the SmartTable registration/welcome email failed.

Observed application email delivery result:

- Provider: `resend`
- Error code: `RESEND_400`
- Error message: `API key is invalid`
- Accepted count: `0`
- Failed count: `1`

Vercel logs confirm:

- `guest_signup_welcome_email_result`
- `accepted_count=0`
- `failed_count=1`
- `error_code=RESEND_400`

Root cause:

The Vercel Production `RESEND_API_KEY` value is invalid, revoked, from the wrong Resend account, incorrectly copied, or otherwise not accepted by Resend's HTTP API.

Exact fix required:

Update Vercel Production `RESEND_API_KEY` to a current valid Resend API key for the SmartTable Resend account that owns the verified sender domain. Keep:

- `EMAIL_FROM=SmartTable <reservations@mail.smarttablenyc.com>`

After updating the variable, redeploy or redeploy the existing production build so the runtime receives the corrected secret.

### P1: Email confirmation link could not be verified in this Codex session

Supabase email confirmation is enabled, as shown by:

- signup response `email_verification_required=true`
- immediate login response `EMAIL_NOT_CONFIRMED`

The Gmail connector in this Codex session still returns HTTP 401 `token_expired`, so inbox arrival and confirmation-link click-through could not be verified here.

Exact manual verification required:

1. Confirm the Supabase confirmation email arrives in the controlled test inbox.
2. Open the confirmation link.
3. Confirm redirect returns to `https://smarttablenyc.com`.
4. Log in with the new account.
5. Verify `/account`, `/account/favorites`, `/account/reservations`, and `/account/notifications`.

## Automated Checks

Commands executed after the fix:

- `npm.cmd run check:production-auth-flow`: PASS
- `npm.cmd run check:signup`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd run check:email`: PASS
- `npm.cmd run check:reservation-lifecycle`: PASS
- `npm.cmd run check:production-hardening`: PASS
- `npm.cmd run check:basic-security-hardening`: PASS
- `npm.cmd test`: PASS

## Final Status

Original `SIGNUP_PROFILE_CREATION_FAILED` blocker: PASS, fixed and production-verified.

Account created: PASS by production signup response and Vercel auth-success log.

Profile created: PASS by Vercel `guest_signup_profile_creation_success` log.

Preferences saved: PASS by the same server-side success point.

Confirmation email sent: NOT VERIFIED in this session. Supabase confirmation is required, but Gmail access is expired.

Welcome email sent: FAIL. Resend HTTP API rejected the configured production API key.

Confirmation link works: NOT VERIFIED in this session. Requires inbox access.

Login works: BLOCKED until email confirmation. Immediate login correctly returns `EMAIL_NOT_CONFIRMED`.

Logout works: NOT TESTED because confirmed login was blocked by missing confirmation-link verification.
