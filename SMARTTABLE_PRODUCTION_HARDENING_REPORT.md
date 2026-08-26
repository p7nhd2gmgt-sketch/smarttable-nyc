# SmartTable Production Hardening Report

Date: 2026-07-21
Branch: production-hardening-basic
Base commit inspected: 6a4cad3
Repository: http://github.com/p7nhd2gmgt-sketch/smarttable-nyc.git

## Executive Summary

This pass implemented the requested critical security hardening for the current SmartTable BASIC codebase without adding AI, billing, POS, OpenTable, Resy, SevenRooms, or UI redesign work.

Code-level production readiness estimate: 88%.
Estimated public MVP launch readiness: 78%.

The application now has centralized strict security headers, Content Security Policy, request-size limits, unsafe-method CSRF Origin/Referer validation, mutation rate limiting, bearer token shape validation, safer production environment validation, and regression coverage for the new protections. Automated static, unit/regression, and Playwright checks pass locally.

The remaining gap is not a code failure found in this pass. Public MVP readiness still requires final production-environment verification with real Supabase Auth, custom SMTP, Resend, deployed headers, and a controlled browser signup/login/reservation smoke test.

## Modified Files

Files modified or created by the security-hardening work:

- `.env.example`
- `api/index.js`
- `package.json`
- `scripts/check-basic-security-hardening.js`
- `scripts/check-production-auth-flow.js`
- `server.js`
- `src/app-core.js`
- `src/security-headers.js`
- `vercel.json`
- `SMARTTABLE_PRODUCTION_HARDENING_REPORT.md`

Existing dirty or previously generated files were present in the worktree before this final hardening pass and were not intentionally reverted.

## Security Improvements

### Content Security Policy

- Added shared CSP in `src/security-headers.js`.
- Applied CSP through local/API responses and Vercel static headers.
- Policy blocks framing with `frame-ancestors 'none'`, blocks plugins with `object-src 'none'`, restricts base URI and form action to self, and restricts network connections to SmartTable, Supabase, Resend, Google Maps, and required asset origins.

Note: The current app still requires `'unsafe-inline'` for existing inline styles/scripts. Removing that is a future non-critical hardening task requiring template/script refactoring.

### Strict Headers

Added or centralized:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `X-Permitted-Cross-Domain-Policies: none`
- `X-XSS-Protection: 0`

### XSS Protection

- Preserved existing browser escaping checks for `escapeHtml()` and `escapeAttr()`.
- Verified no browser use of `dangerouslySetInnerHTML`.
- Added CSP and `nosniff` defense-in-depth.
- Existing public review/follow/reward responses were hardened in prior critical-blocker work and are now covered by security regression checks.

### CSRF Validation

- Added Origin/Referer validation for unsafe API methods.
- Production allowlist is based on configured public base URL and known SmartTable canonical hostnames, not arbitrary request Host headers.
- Webhook route remains exempt because provider webhooks do not reliably carry browser Origin/Referer headers.
- Added `CSRF_ORIGIN_FORBIDDEN` regression coverage.

### Rate Limiting

- Added centralized in-process mutation rate limiting.
- Separate configurable limits for general unsafe API calls and auth endpoints.
- Added `Retry-After` and `RATE_LIMITED` responses.
- Added regression coverage for configured rate limits.

Environment knobs:

- `API_RATE_LIMIT_WINDOW_MS`
- `API_MUTATION_RATE_LIMIT`
- `AUTH_MUTATION_RATE_LIMIT`

### Request Size Limits

- Added request body size enforcement in both `server.js` and Vercel `api/index.js`.
- Rejects oversized declared `Content-Length`, streamed bodies, and already-buffered string bodies.
- Returns safe `413 REQUEST_TOO_LARGE`.

Environment knob:

- `MAX_JSON_BODY_BYTES`

### Secure Cookies and Storage

- The current SmartTable SPA does not set application cookies in `server.js`, `api/index.js`, or `src/app-core.js`.
- Because no app cookies are issued, there were no cookie attributes to harden in this pass.
- Browser session persistence still uses the existing local/session storage model. This was not rewritten because that would be an authentication architecture change.
- Follow-up recommendation: move production Supabase sessions to server-set HttpOnly, Secure, SameSite cookies in a separate auth architecture task.

### Token Validation

- Added bearer token shape validation before using Authorization tokens.
- Accepted formats are Supabase-like JWTs, SmartTable demo tokens, and existing signed impersonation tokens.
- Regression fixtures were updated to use JWT-shaped test tokens.

### Environment Validation

- Production configuration still blocks unsafe production startup states.
- Added hardening env placeholders to `.env.example`.
- Verified public config and health checks do not expose service-role, Resend, webhook, token, or authorization secrets.
- Static sweep found no service-role or Resend secret references in `public/app.js`.

### Debug Logging

- Local server provider-missing console message is now restricted to non-production runtime.
- Structured server logs continue to remove fields matching secret, token, password, key, or authorization.
- Existing local test logs report expected missing provider states without exposing secrets.

## Fixed Issues

### P1: Missing centralized security headers

Impact: Browser responses lacked a consistent security baseline.

Fix:

- Added `src/security-headers.js`.
- Wired it into `server.js`, `api/index.js`, and `src/app-core.js`.
- Added Vercel-level headers in `vercel.json`.

### P1: Unsafe API mutations had no Origin/Referer CSRF gate

Impact: Browser-originated cross-site POST/PATCH/DELETE requests could reach API routes.

Fix:

- Added `csrfOriginError()`.
- Production origin allowlist now derives from `PUBLIC_BASE_URL` and SmartTable canonical hosts.

### P1: No explicit request-size limit in API body parsing

Impact: Oversized payloads could consume memory or pass into route handlers.

Fix:

- Added `MAX_JSON_BODY_BYTES` enforcement in local and Vercel handlers.
- Added safe 413 responses.

### P1: No centralized mutation rate limiting

Impact: Auth and mutation endpoints were easier to abuse.

Fix:

- Added in-process mutation buckets with separate auth/general limits.
- Added `Retry-After` response.

### P2: Test token fixture bypassed new token validation expectations

Impact: Production auth-flow regression test failed after token-shape validation.

Fix:

- Updated the recovery-flow fixture to use a JWT-shaped access token.

## Remaining Blockers

No unresolved P0 or P1 code blockers were found by the local automated validation suite.

Remaining launch blockers are operational/manual:

- Production custom SMTP must be verified with a real signup confirmation and password reset.
- Production Supabase Auth, RLS, and profile/onboarding writes must be verified against the deployed project.
- Production HTTP response headers must be checked after deployment.
- Browser QA against the deployed public domain must be completed with a controlled real guest/partner/admin test path.

## Remaining Non-Blocking Issues

- CSP still includes `'unsafe-inline'` because existing public HTML/CSS/script rendering relies on inline behavior.
- Session tokens are still stored by the SPA in local/session storage according to existing remember-me behavior.
- Local test mode logs expected `EMAIL_PROVIDER_NOT_CONFIGURED` events when Resend credentials are intentionally absent.
- Resend webhook delivery tracking remains deferred and was not expanded.

## Production Environment Variables

Required production variables remain:

- `SMARTTABLE_ENV=production`
- `PUBLIC_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `RESEND_API_KEY`

New optional hardening variables:

- `MAX_JSON_BODY_BYTES`
- `API_RATE_LIMIT_WINDOW_MS`
- `API_MUTATION_RATE_LIMIT`
- `AUTH_MUTATION_RATE_LIMIT`

No real secret values were written to source control.

## Validation Results

| Command | Result |
|---|---|
| `npm.cmd install` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run check` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd test` | PASS |
| `npm.cmd run test:e2e` | PASS, 12 Playwright tests |
| `npm.cmd run check:platform-mode` | PASS |
| `npm.cmd run check:basic-security-hardening` | PASS |
| `npm.cmd run check:production-hardening` | PASS |
| Static secret sweep with `rg` | PASS for browser bundle; only expected server-side references/placeholders found |

Playwright coverage:

- Chromium desktop
- Mobile Chromium emulation
- Public pages
- Signup/login/logout/forgot password
- Restaurant creation and offer lifecycle
- Reservation flow
- Favorites
- Admin login and role permissions
- Guest/partner/admin/super-admin route rendering
- Mobile overflow check

## Repository Audit Result

There is no standalone audit script in `package.json`. Repository-level audit coverage is split across static quality, architecture, route map, route protection, production hardening, production auth flow, BASIC security boundaries, BASIC security hardening, email checks, UI readiness, visual readiness, and Playwright E2E checks. These relevant checks were executed successfully.

## Launch Readiness

Production readiness: 88%

Estimated launch readiness: 78%

Reasoning:

- Code-level security gates now pass.
- Core auth/reservation/email/UI regression suites pass locally.
- Browser automation passes locally.
- Production runtime verification still needs to be repeated after deployment with real Supabase Auth, SMTP, Resend, RLS, and deployed response headers.

## Final Conclusion

NOT READY FOR PUBLIC MVP

Detailed reasons:

- The codebase is materially hardened and automated validation passes.
- Public MVP cannot be declared ready until real production signup, email confirmation/password reset, login, account access, and deployed header checks pass against the live Supabase/Vercel/SMTP configuration.
- The remaining blockers are operational verification gates, not newly discovered local code failures.
