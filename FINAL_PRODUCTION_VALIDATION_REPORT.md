# SmartTable BASIC Final Production Validation Report

Date: 2026-07-21
Branch: production-hardening-basic
Commit inspected: 6a4cad3
Vercel Preview deployment: `dpl_CS71ojneZGcqYdxKTgbp66XB7Yu1`
Vercel Preview URL: https://smarttable-fta0bjr7u-budaistvan007-7327s-projects.vercel.app
Vercel target: Preview

## Executive Summary

Final local validation passed, and a Vercel Preview deployment was created successfully.

The release gate is still **FAIL** because the deployed Preview is protected by Vercel authentication/protection and returns Vercel's login shell for SmartTable routes and API endpoints. Because of that, real deployed validation of Supabase Auth, application security headers, cookies, `/api/health`, `/api/public/config`, signup, email verification, password reset, login, and session behavior could not be completed on the Preview URL.

Gmail inbox verification is also blocked in this Codex session because the Gmail connector returned `token_expired`.

No AI, billing, POS, Resy, OpenTable, SevenRooms, or UI redesign work was implemented.

## Commands Executed

| Command | Result |
|---|---|
| `npm.cmd run lint` | PASS |
| `npm.cmd run check` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd run check:email` | PASS |
| `npm.cmd test` | PASS |
| `npm.cmd run test:e2e` | PASS, 12 Playwright tests |
| `npx.cmd vercel --yes` | PASS, Preview deployed |
| `npx.cmd vercel inspect smarttable-fta0bjr7u-budaistvan007-7327s-projects.vercel.app` | PASS, deployment Ready |
| `npx.cmd vercel env ls` | PASS, env names listed without values |

## Vercel Preview Deployment

| Item | Result | Evidence |
|---|---:|---|
| Preview deployment created | PASS | Deployment `dpl_CS71ojneZGcqYdxKTgbp66XB7Yu1` is Ready |
| Target is Preview, not Production | PASS | `vercel inspect` reports `target preview` |
| Build completed on Vercel | PASS | Vercel build ran `npm run build` successfully |
| SmartTable homepage reachable on Preview | FAIL | Preview returned Vercel login shell, not SmartTable app HTML |
| `/api/health` reachable on Preview | FAIL | Returned HTML login shell instead of JSON health payload |
| `/api/public/config` reachable on Preview | FAIL | Returned HTML login shell instead of JSON config payload |
| Preview app/API validation possible | FAIL | Vercel deployment protection blocks unauthenticated validation |

## Deployed Header Validation

The Preview response was Vercel's protected login shell, so these results cannot be counted as SmartTable application-header validation.

| Header / Security Item | Result | Observed State |
|---|---:|---|
| HTTPS | PASS | Preview URL uses HTTPS |
| HSTS | BLOCKED | Present on Vercel shell, but app response not reachable |
| CSP | FAIL | Observed CSP is Vercel shell CSP, not SmartTable CSP |
| X-Frame-Options | BLOCKED | Present on Vercel shell, but app response not reachable |
| X-Content-Type-Options | BLOCKED | Present on Vercel shell, but app response not reachable |
| Referrer-Policy | FAIL | Vercel shell returned `origin-when-cross-origin`, not SmartTable policy |
| Permissions-Policy | FAIL | Vercel shell did not expose the SmartTable `Permissions-Policy` header |
| Cache headers | BLOCKED | Vercel shell returned cache headers; app/API cache headers not reachable |
| Secure cookies | BLOCKED | Only Vercel shell cookie observed |
| SameSite cookies | BLOCKED | Only Vercel shell cookie observed |
| HttpOnly cookies | BLOCKED | Only Vercel shell cookie observed; app does not issue cookies locally |

## Supabase Authentication Flow

| Item | Result | Notes |
|---|---:|---|
| Automated signup regression | PASS | `npm test` and `check:production-auth-flow` pass |
| Automated email-confirmation-required handling | PASS | Covered by `check:production-auth-flow` |
| Automated confirmed-login handling | PASS | Covered by `check:production-auth-flow` |
| Automated missing-profile recovery | PASS | Covered by `check:production-auth-flow` |
| Automated invalid-credential handling | PASS | Covered by `check:production-auth-flow` |
| Automated invalid/rate-limited signup handling | PASS | Covered by `check:production-auth-flow` |
| Real deployed signup | FAIL | Cannot test because Preview app/API are behind Vercel protection |
| Real email verification | FAIL | Cannot test because Preview app/API are behind Vercel protection and Gmail token is expired |
| Real login | FAIL | Cannot test because Preview app/API are behind Vercel protection |
| Real session persistence | FAIL | Cannot test because Preview app/API are behind Vercel protection |
| Real logout | FAIL | Cannot test because Preview app/API are behind Vercel protection |
| Real password reset | FAIL | Cannot test because Preview app/API are behind Vercel protection and Gmail token is expired |
| Invalid token handling on deployed app | FAIL | Cannot test because Preview app/API are behind Vercel protection |
| Expired session handling on deployed app | FAIL | Cannot test because Preview app/API are behind Vercel protection |

## Resend / SMTP Flow

| Item | Result | Notes |
|---|---:|---|
| Email service automated tests | PASS | `npm.cmd run check:email` passes |
| Registration/welcome template coverage | PASS | Covered by email tests |
| Reservation email templates | PASS | Covered by email tests |
| Password-reset template/link generation | PASS | Covered by automated tests |
| Resend provider mock acceptance | PASS | Covered by automated tests |
| Provider failure handling | PASS | Covered by automated tests |
| Duplicate email prevention | PASS | Covered by automated tests |
| Vercel env names for `RESEND_API_KEY` and `EMAIL_FROM` | PASS | `vercel env ls` shows encrypted variables for Preview/Production |
| Vercel env name for `EMAIL_REPLY_TO` | FAIL | `EMAIL_REPLY_TO` was not listed by `vercel env ls` |
| Real registration email through Preview | FAIL | Cannot trigger Preview signup because Preview is protected |
| Real Supabase confirmation email through Preview | FAIL | Cannot trigger Preview signup and Gmail connector token is expired |
| Real password reset email through Preview | FAIL | Cannot trigger Preview reset and Gmail connector token is expired |
| Resend confirmation/retry from real inbox | FAIL | Cannot verify without Preview access and inbox access |
| Email templates in real inbox | FAIL | Gmail connector returned `token_expired`; real rendering not verified |
| Production domain configuration in real email links | FAIL | Not verified from a real delivered message in this pass |

## Vercel Environment Variable Inventory

Only names and encrypted presence were inspected. No secret values were printed.

| Variable | Environments Listed | Result |
|---|---|---:|
| `EMAIL_FROM` | Development, Preview, Production | PASS |
| `RESEND_API_KEY` | Preview, Production | PASS |
| `PUBLIC_BASE_URL` | Development, Preview, Production | PASS |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview, Production | PASS |
| `SUPABASE_ANON_KEY` | Preview, Production | PASS |
| `SUPABASE_URL` | Preview, Production | PASS |
| `EMAIL_REPLY_TO` | Not listed | FAIL if required for production reply-to policy |
| `SMARTTABLE_ENV` | Not listed | REVIEW REQUIRED; app can infer Preview/Production from Vercel, but explicit mode is cleaner |

## Debug Logging and Production Warnings

| Item | Result | Notes |
|---|---:|---|
| `console.debug` usage | PASS | No production `console.debug` found |
| Local email-provider warning hidden from production | PASS | Warning is gated to non-production runtime |
| Structured server logs redact secret-like keys | PASS | `logSafeServerEvent` removes secret/token/password/key/authorization fields |
| Remaining expected test logs | PASS | Local tests intentionally log `EMAIL_PROVIDER_NOT_CONFIGURED` when no local Resend key is present |
| Deployed production warnings | FAIL | Cannot inspect SmartTable deployed runtime because Preview is protected |

## Playwright / Browser Validation

| Item | Result | Notes |
|---|---:|---|
| Local Chromium desktop E2E | PASS | 6 desktop tests passed |
| Local mobile Chromium E2E | PASS | 6 mobile tests passed |
| Deployed Preview browser validation | FAIL | Preview serves Vercel login shell |
| Real browser signup on Preview | FAIL | Blocked by Vercel protection |
| Real browser login on Preview | FAIL | Blocked by Vercel protection |

## Production Blockers

1. **P1: Vercel Preview protection blocks SmartTable app/API validation.**
   - Evidence: `/`, `/api/health`, and `/api/public/config` returned Vercel login shell HTML.
   - Impact: Cannot verify deployed auth, SMTP, headers, cookies, health, config, or UI on Preview.
   - Required action: Provide a Vercel deployment protection bypass secret/URL, disable protection for this Preview, or run validation on a public Preview alias.

2. **P1: Gmail inbox verification is unavailable in this Codex session.**
   - Evidence: Gmail connector returned `HTTP 401 token_expired`.
   - Impact: Cannot verify real confirmation, password reset, welcome, or resend confirmation email arrival/rendering.
   - Required action: Reconnect Gmail or provide another controlled inbox verification method.

3. **P2: `EMAIL_REPLY_TO` is not present in Vercel env inventory.**
   - Evidence: `npx vercel env ls` did not list `EMAIL_REPLY_TO`.
   - Impact: Reply-to behavior may fall back empty unless intentionally optional.
   - Required action: Add `EMAIL_REPLY_TO` if SmartTable requires a production reply-to address.

4. **P2: Explicit `SMARTTABLE_ENV` is not present in Vercel env inventory.**
   - Evidence: `npx vercel env ls` did not list `SMARTTABLE_ENV`.
   - Impact: The app can infer runtime from Vercel, but explicit mode validation is clearer.
   - Required action: Add `SMARTTABLE_ENV=production` for Production and an appropriate value for Preview if desired.

## Final PASS / FAIL Matrix

| Production Item | Result |
|---|---:|
| Local lint | PASS |
| Local syntax/type check | PASS |
| Local build | PASS |
| Local unit/regression tests | PASS |
| Local Playwright | PASS |
| Vercel Preview deployment | PASS |
| Preview SmartTable app reachable | FAIL |
| Preview SmartTable API reachable | FAIL |
| Deployed SmartTable security headers verified | FAIL |
| Deployed cookie policy verified | FAIL |
| Complete real Supabase signup flow | FAIL |
| Complete real Supabase email verification flow | FAIL |
| Complete real Supabase login/session/logout flow | FAIL |
| Complete real Supabase password reset flow | FAIL |
| Complete real Resend/Supabase SMTP inbox flow | FAIL |
| Production warnings removed | FAIL, deployed runtime cannot be inspected |
| Unnecessary debug logs removed | PASS for local/static checks |
| AI not implemented | PASS |
| Billing not implemented | PASS |
| Resy/OpenTable/SevenRooms not implemented | PASS |
| UI not redesigned | PASS |

## Required Next Steps

1. Provide a Vercel Preview protection bypass or disable Preview protection for the deployed URL.
2. Reconnect Gmail or provide a controlled inbox that Codex can inspect.
3. Add missing `EMAIL_REPLY_TO` in Vercel if it is required by SmartTable production policy.
4. Re-run Preview endpoint/header checks:
   - `/`
   - `/api/health`
   - `/api/public/config`
5. Run one controlled real signup through Preview.
6. Verify Supabase Auth user creation, SmartTable profile/onboarding rows, confirmation email, welcome email, login, session persistence, logout, password reset, invalid token, and expired session behavior.

## Final Verdict

FAIL

The local code is validation-clean and the Preview deployment succeeded, but the application is **not READY FOR PUBLIC MVP** because the required deployed Supabase Auth and SMTP flows could not be verified through the protected Vercel Preview and the connected Gmail inbox is unavailable.
