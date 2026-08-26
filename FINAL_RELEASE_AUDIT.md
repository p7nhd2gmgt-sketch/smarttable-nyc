# Final Release Audit

Date: 2026-07-21

Auditor mode: independent senior security audit, read-only except for this report.

Production target audited:

- `https://www.smarttablenyc.com`
- `https://smarttablenyc.com`

Repository state observed:

- Branch: `production-hardening-basic`
- Local HEAD: `6a4cad3`
- Worktree: dirty before audit; no code, DNS, Vercel, Supabase, or Resend changes were made during this audit.

## DNS

| Item | Status | Evidence |
|---|---|---|
| SPF | PASS | Public DNS shows `send.mail.smarttablenyc.com TXT "v=spf1 include:amazonses.com ~all"` on Cloudflare and Google DNS. |
| DKIM | PASS | Public DNS shows `resend._domainkey.mail.smarttablenyc.com TXT` with a Resend DKIM public key on Cloudflare and Google DNS. |
| DMARC | PASS | Public DNS shows `_dmarc.smarttablenyc.com TXT "v=DMARC1; p=none; rua=mailto:postmaster@smarttablenyc.com; adkim=s; aspf=r"` on Cloudflare and Google DNS. |
| MX | PASS | Public DNS shows `send.mail.smarttablenyc.com MX 10 feedback-smtp.us-east-1.amazonses.com.` |
| Return-Path | PASS | Return-path DNS is present at `send.mail.smarttablenyc.com` with both SPF TXT and MX records. |
| Resend verified domain | NOT TESTABLE | Resend account dashboard/API state is not public and was not accessed. Public DNS contains the records normally required for Resend verification, but the provider-side verified state cannot be independently confirmed from public DNS alone. |
| EMAIL_FROM alignment | PASS | Production health reports no production configuration issues. Repository preflight expects `reservations@mail.smarttablenyc.com`, and live health is `ok=true`, `environment=production`, `mode=supabase`, `email_configured=true`. |

## Production

| Item | Status | Evidence |
|---|---|---|
| HTTPS | PASS | `https://www.smarttablenyc.com/` returned HTTP 200. |
| HTTP -> HTTPS redirect | PASS | `http://www.smarttablenyc.com/` returned 308 to `https://www.smarttablenyc.com/`; `http://smarttablenyc.com/` returned 308 to `https://smarttablenyc.com/`. |
| Content-Security-Policy | PASS | Live `/`, `/api/health`, and `/api/public/config` responses include a non-empty CSP. |
| Strict-Transport-Security | PASS | Live responses include `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`. |
| X-Frame-Options | PASS | Live responses include `X-Frame-Options: DENY`. |
| X-Content-Type-Options | PASS | Live responses include `X-Content-Type-Options: nosniff`. |
| Referrer-Policy | PASS | Live responses include `Referrer-Policy: strict-origin-when-cross-origin`. |
| Permissions-Policy | PASS | Live responses include `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`. |
| Secure Cookies | NOT TESTABLE | Anonymous production requests to `/`, `/api/health`, and `/api/public/config` set no cookies. Authenticated cookie attributes cannot be verified without a real authenticated session, which would require credentials or signup. |
| SameSite Cookies | NOT TESTABLE | No cookies were set on audited anonymous production responses. |
| HttpOnly Cookies | NOT TESTABLE | No cookies were set on audited anonymous production responses. |
| Cache-Control | PASS | Live `/`, `/api/health`, and `/api/public/config` responses include `Cache-Control: no-store`. |

## Application

| Item | Status | Evidence |
|---|---|---|
| `/` loads | PASS | `https://www.smarttablenyc.com/` returned HTTP 200 with SmartTable HTML. |
| `/api/health` | PASS | Returned HTTP 200 with `ok=true`, `status=ok`, `environment=production`, `mode=supabase`. |
| `/api/public/config` | PASS | Returned HTTP 200 with `environment=production`, `mode=supabase`, `public_base_url=https://smarttablenyc.com`. |
| Supabase connectivity | PASS | `/api/health` reports `database_reachable=true` and `supabase_configured=true`. |
| Authentication configuration | PASS | Protected guest, partner, and admin API routes return HTTP 401 without credentials. A single invalid login returned HTTP 401 with safe message `Invalid email or password.` |
| Email configuration | PASS | `/api/health` reports `email_configured=true` and no production configuration issues. `npm.cmd run check:email` passed against mocked provider paths. |
| Environment variables | PASS | `/api/health` and `/api/public/config` report `production_configuration_issues=[]`; no secret values were exposed in those responses. |
| Production mode | PASS | `/api/health` and `/api/public/config` both report `environment=production`, `runtime_mode=production`, `mode=supabase`. |

## Auth Flow

| Item | Status | Evidence / Reason |
|---|---|---|
| Signup | NOT TESTABLE | A real signup would create a Supabase Auth user and SmartTable rows, violating the instruction not to modify Supabase. |
| Email verification | NOT TESTABLE | Requires a new or existing verification email/link and provider/account state changes. |
| Login | NOT TESTABLE | Valid login requires known production credentials or newly created test credentials. Only invalid-login behavior was safely tested. |
| Logout | NOT TESTABLE | Requires a valid authenticated session. |
| Session persistence | NOT TESTABLE | Requires a valid authenticated session and browser/session state. |
| Password reset | NOT TESTABLE | Would trigger email/provider state and potentially mutate auth recovery state. |
| Invalid token handling | PASS | `GET /api/guest/account` with `Authorization: Bearer definitely-invalid-token` returned HTTP 401 with safe `Authentication required.` response. |

## Security

| Item | Status | Evidence |
|---|---|---|
| Rate limiting | PASS | `npm.cmd run check:basic-security-hardening` and `npm.cmd run check:production-hardening` passed. Static code evidence includes centralized `mutationRateLimit`. Live destructive/repeated rate-limit probing was not performed. |
| CSRF protection | PASS | `npm.cmd run check:basic-security-hardening` passed. Static code evidence includes `csrfOriginError` and `CSRF_ORIGIN_FORBIDDEN` handling for unsafe methods. |
| Bearer token validation | PASS | Invalid bearer token on a protected live endpoint returned HTTP 401. Static code evidence includes token shape extraction/validation before protected access. |
| Request size limits | PASS | Static code evidence in `server.js` and `api/index.js` enforces JSON body byte limits and returns 413 for oversized payloads. |
| Production headers | PASS | Live production responses include CSP, HSTS, XFO, XCTO, Referrer-Policy, Permissions-Policy, and no-store cache headers. |
| Production logging disabled | PASS | No debug output or stack traces were returned to public requests. Server-side safe structured logging exists; this audit did not access production log streams. |
| Secrets not exposed | PASS | `/api/health`, `/api/public/config`, and live `/app.js` did not expose `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, or service-role markers. The broad `sk_` scan matched non-secret `risk_` strings only. |
| Environment separation | PASS | Live health/config report production runtime and Supabase mode, not demo mode. Static checks for production hardening passed. |

## Commands and Checks Executed

| Check | Result |
|---|---|
| Public DNS via Cloudflare DNS-over-HTTPS | PASS for SPF, DKIM, DMARC, return-path MX. |
| Public DNS via Google DNS-over-HTTPS | PASS for DKIM, DMARC, return-path SPF. |
| Live HTTPS header checks | PASS for required headers. |
| HTTP redirect checks | PASS, 308 to HTTPS. |
| Live protected unauthenticated route checks | PASS, returned 401. |
| Live invalid login check | PASS, returned safe 401. |
| Live invalid bearer token check | PASS, returned safe 401. |
| Live browser bundle secret-marker scan | PASS, no actual secret markers found. |
| `npm.cmd run check:basic-security-hardening` | PASS |
| `npm.cmd run check:production-hardening` | PASS |
| `npm.cmd run check:email` | PASS |

## Final Questions

### 1. Is SmartTable technically ready for a Public MVP?

NO

### 2. If NO, list every remaining blocker.

1. Auth flow is not independently verified end-to-end under the read-only constraints: signup, email verification, valid login, logout, session persistence, and password reset are all `NOT TESTABLE` without creating/modifying Supabase Auth and Resend state or using known production test credentials.
2. Resend verified-domain dashboard status is `NOT TESTABLE` from public evidence alone. Public DNS is correctly present, but provider-side verified state must be confirmed in the Resend account.
3. Authenticated cookie attributes are `NOT TESTABLE` because anonymous production responses set no cookies and no authenticated session was available.

### 3. Estimate the production readiness as a percentage.

88%

Rationale: DNS, live production headers, public app availability, Supabase connectivity, production mode, protected-route rejection, invalid-token handling, and static security checks passed. The remaining uncertainty is concentrated in critical authenticated user journeys and private provider/account state.

### 4. Would you personally approve this release for public users?

NO

Reason: I would not approve public release without one successful controlled production signup -> verification -> login -> session -> password-reset cycle and a Resend dashboard verification check, even though the public infrastructure and security headers now pass.
