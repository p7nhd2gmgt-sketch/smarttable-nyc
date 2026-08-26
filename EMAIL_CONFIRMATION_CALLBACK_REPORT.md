# SmartTable Email Confirmation Callback Report

Date: 2026-07-21

Environment: Production

Canonical domain: https://smarttablenyc.com

Deployment ID: `dpl_GLYFgeQkyoHRX1iR7hw8iUEWK8pC`

Deployment URL: https://smarttable-6cmif0pa8-budaistvan007-7327s-projects.vercel.app

## Executive Summary

The Supabase email-confirmation callback failure was caused by missing application handling for Supabase confirmation redirect parameters. Expired or invalid confirmation links were routed into the normal guest homepage flow, so the user saw the homepage instead of a clear confirmation failure state.

The fix adds a dedicated `/auth/callback` frontend route and `/api/auth/callback` backend endpoint. The callback now handles Supabase code exchange, token-hash/token verification, access-token hash callbacks, and error redirects such as `otp_expired`.

Real production signup confirmation with a fresh inbox was not completed in this session because Gmail connector access still returns `401 token_expired`.

## Root Cause

PASS

- Endpoint: `/auth/callback`
- HTTP status before fix: static app shell/homepage behavior, no callback handling
- Observed result: Supabase redirected with `error=access_denied&error_code=otp_expired&error_description=Email link is invalid or has expired`, but SmartTable did not render a confirmation failure page.
- Root cause: no dedicated callback route and no frontend handling for Supabase confirmation error parameters.

## Implementation

PASS

- Created dedicated frontend callback route recognition for `/auth/callback`.
- Added backend route `/api/auth/callback`.
- Updated Supabase signup and resend requests to include `redirect_to=https://smarttablenyc.com/auth/callback`.
- Supported callback formats:
  - `code` + `code_verifier` PKCE exchange through Supabase `/auth/v1/token?grant_type=pkce`
  - `token_hash` / `token` verification through Supabase `/auth/v1/verify`
  - `access_token` / `refresh_token` hash callback handling
  - Supabase error redirects such as `otp_expired`
- Added public neutral resend-confirmation endpoint `/api/auth/resend-verification`.
- Added EN/ES/HU callback messages.
- Added noindex/robots coverage for `/auth/callback`.

## Production Validation

| Step | Result | Endpoint | HTTP Status | Observed Result | Root Cause for Failure |
|---|---|---:|---:|---|---|
| Production deploy | PASS | Vercel Production | READY | Deployed `dpl_GLYFgeQkyoHRX1iR7hw8iUEWK8pC`; aliased to `https://smarttablenyc.com` | n/a |
| Health check | PASS | `GET /api/health` | 200 | `environment=production`, `mode=supabase`, `database_reachable=true`, `production_configuration_issues=[]` | n/a |
| Public config | PASS | `GET /api/public/config` | 200 | `environment=production`, `mode=supabase`, `public_base_url=https://smarttablenyc.com` | n/a |
| Expired-link page route | PASS | `GET /auth/callback?error=access_denied&error_code=otp_expired...` | 200 | Noindex app shell served for callback route | n/a |
| Expired-link rendered UI | PASS | `/auth/callback?...otp_expired...` | 200 | Browser rendered: `This confirmation link is invalid or has expired.` and `Send a new confirmation email` | n/a |
| Root error redirect fallback | PASS | `/?error=access_denied&error_code=otp_expired...` | 200 | Browser rendered the same expired-link message and resend action | n/a |
| Missing callback token | PASS | `POST /api/auth/callback` | 400 | Returned `AUTH_CALLBACK_MISSING_TOKEN` | n/a |
| Invalid token hash | PASS | `POST /api/auth/callback` | 400 | Returned `OTP_EXPIRED` and `This confirmation link is invalid or has expired.` | n/a |
| Recent Vercel callback logs | PASS | Vercel logs | n/a | Callback GET/POST requests logged as function invocations; no crash observed | n/a |
| New production signup with unused email | FAIL | `/signup` | NOT TESTED | Not run because inbox access is unavailable | Gmail connector token expired |
| Confirmation email received | FAIL | Supabase Auth email | NOT TESTED | Cannot inspect real inbox from this session | Gmail connector token expired |
| Newest confirmation link opened immediately | FAIL | Email confirmation link | NOT TESTED | Cannot retrieve real confirmation link from inbox | Gmail connector token expired |
| `email_confirmed_at` populated | FAIL | Supabase Auth user | NOT TESTED | Not verifiable without completing real confirmation link flow | Gmail connector token expired |
| Login after confirmation | FAIL | `/login` | NOT TESTED | Not verifiable without real confirmed user | Gmail connector token expired |
| Logout after login | FAIL | `/logout` / client session clear | NOT TESTED | Not verifiable without real confirmed login | Gmail connector token expired |

## Browser Findings

PASS

- Browser engine used: Playwright Chromium headless.
- Viewport used: `390x844`.
- Callback UI rendered in English when `localStorage.smarttable.lang=en`.
- Callback UI also rendered the localized Hungarian expired-link copy in the default browser context.

Non-blocking console/network finding:

- `https://static.cloudflareinsights.com/beacon.min.js/...` is blocked by the current CSP.
- Failure type: `csp`.
- This is unrelated to the Supabase auth callback flow and was not changed in this auth-only fix.

## Supabase Configuration Status

PARTIAL

- Site URL and redirect URLs were previously confirmed by the operator:
  - `https://smarttablenyc.com`
  - `https://smarttablenyc.com/**`
  - `https://www.smarttablenyc.com/**`
- The application now explicitly requests:
  - `https://smarttablenyc.com/auth/callback`

Manual verification still required in Supabase Dashboard:

- Email confirmation setting.
- OTP/link expiration setting.
- Confirmation email template uses either Supabase `ConfirmationURL` or a token-hash link compatible with `/auth/callback`.
- Custom SMTP remains enabled and healthy.

## Tests Executed

PASS

- `npm.cmd run build`
- `npm.cmd run lint`
- `npm.cmd run check:email`
- `npm.cmd run check:signup`
- `npm.cmd run check:production-auth-flow`
- `npm.cmd run check:basic-security-hardening`
- `npm.cmd run check:basic-ui`
- `npm.cmd run check:basic-ui-behavior`
- `npm.cmd run check:production-hardening`
- `npm.cmd run check:reservation-lifecycle`
- `npm.cmd test`

## Files Changed

- `src/app-core.js`
- `public/app.js`
- `public/locales/en.json`
- `public/locales/es.json`
- `public/locales/hu.json`
- `server.js`
- `public/robots.txt`
- `scripts/check-basic-security-hardening.js`
- `scripts/check-basic-ui-readiness.js`
- `scripts/check-guest-signup.js`
- `scripts/check-production-auth-flow.js`
- `EMAIL_CONFIRMATION_CALLBACK_REPORT.md`

## Remaining Manual Validation

MANUAL VERIFICATION REQUIRED

1. Reconnect Gmail or provide an accessible controlled real inbox.
2. Register a completely new production guest email address.
3. Confirm exactly one Supabase confirmation email arrives.
4. Open the newest confirmation link immediately.
5. Verify the callback displays confirmation success.
6. Verify `email_confirmed_at` is populated in Supabase Auth.
7. Verify login succeeds.
8. Verify session creation and logout.
9. Reopen an old/used link and verify the expired-link page with resend option.

## Final Status

CONDITIONAL PASS

The SmartTable application callback defect is fixed and deployed. The real inbox-based confirmation loop remains blocked by expired Gmail connector authentication in this Codex session.
