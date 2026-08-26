# SmartTable Public MVP Release Checklist

Date: 2026-07-21
Branch inspected: `production-hardening-basic`
Local commit inspected: `6a4cad3`
Production deployment inspected: `dpl_3UzWvEJ1X7KG7XUXSQSGHs2mpJsD`
Production aliases inspected:

- `https://smarttablenyc.com`
- `https://www.smarttablenyc.com`
- `https://smarttable-nyc.vercel.app`

Preview deployment inspected: `dpl_CS71ojneZGcqYdxKTgbp66XB7Yu1`
Preview URL inspected: `https://smarttable-fta0bjr7u-budaistvan007-7327s-projects.vercel.app`

## Summary

The public Production deployment is reachable and reports:

- `environment = production`
- `mode = supabase`
- `database_reachable = true`
- `email_configured = true`
- `production_configuration_issues = []`

However, the protected Preview deployment cannot be externally validated because Vercel Preview Protection returns Vercel's login shell for `/`, `/api/health`, and `/api/public/config`.

The answer to the final release question is **NO**: if Preview Protection were disabled today, SmartTable would not be expected to pass every final production validation item yet. The strongest blockers are:

1. The active sender expected by the app is `noreply@smarttable.com`, but DNS-over-HTTPS found no SPF TXT, DMARC TXT, or Resend DKIM TXT records for `smarttable.com`.
2. The currently deployed Production response lacks the SmartTable `Content-Security-Policy` header.
3. The Preview release candidate could not be checked because Vercel Preview Protection intercepted all app/API routes.
4. Real Supabase Auth and inbox email flows still require live browser/inbox validation.

## Vercel Production Audit

| Item | PASS / FAIL | Evidence |
|---|---:|---|
| Production deployment exists | PASS | `vercel inspect smarttablenyc.com` fetched `dpl_3UzWvEJ1X7KG7XUXSQSGHs2mpJsD` |
| Production deployment status | PASS | Vercel reports `Ready` |
| Production target | PASS | Vercel reports `target production` |
| Production aliases | PASS | `smarttablenyc.com`, `www.smarttablenyc.com`, and Vercel aliases are attached |
| Production app reachable | PASS | `GET https://www.smarttablenyc.com/` returned HTTP 200 SmartTable HTML |
| Production API reachable | PASS | `/api/health` and `/api/public/config` returned HTTP 200 JSON |
| Preview deployment exists | PASS | `dpl_CS71ojneZGcqYdxKTgbp66XB7Yu1` is Ready |
| Preview external validation | FAIL | Preview returned Vercel login shell for `/`, `/api/health`, and `/api/public/config` |
| Current Production equals latest Preview candidate | FAIL | Production deployment is 2 days old; Preview deployed the current worktree separately |

## Why Preview Protection Blocks External Validation

Vercel Preview Protection places an authentication layer in front of Preview deployments. Unauthenticated requests do not reach the SmartTable serverless function or static shell. Instead, Vercel serves its own protected deployment login page.

Evidence from the Preview URL:

- `/` returned HTTP 200 `text/html` containing Vercel login shell markup.
- `/api/health` returned HTTP 200 `text/html`, not SmartTable JSON.
- `/api/public/config` returned HTTP 200 `text/html`, not SmartTable JSON.
- Response headers included Vercel login-shell indicators such as `x-matched-path: /login`, Vercel CSP, and a Vercel consent cookie.

Because the SmartTable app/API did not receive the requests, none of the following can be verified on Preview until protection is disabled or a bypass secret/URL is provided:

- SmartTable CSP
- SmartTable API cache headers
- SmartTable health/config JSON
- Supabase signup/login/session flows
- Password reset
- Email verification redirects
- SmartTable app cookies/session behavior
- Real browser auth and email-dependent flows

## Would Production Allow Complete Validation?

| Item | PASS / FAIL | Evidence |
|---|---:|---|
| Production is public, unlike Preview | PASS | `https://www.smarttablenyc.com/` returns SmartTable HTML |
| Production API health reachable | PASS | `/api/health` returns JSON with `ok=true` |
| Production public config reachable | PASS | `/api/public/config` returns JSON |
| Production could be used for live validation | PASS | The production aliases are not blocked by Vercel Preview Protection |
| Production validates the current Preview release candidate | FAIL | Production is an older deployment and does not include the Preview candidate's latest hardening changes |

Production can technically be used for live validation because it is reachable and not protected. It cannot validate the latest Preview release candidate unless that candidate is promoted to Production or Preview Protection is bypassed.

## Environment Variables

Only names and encrypted presence were inspected. No secret values were printed.

`npx vercel env ls` reported:

| Variable | Environments | PASS / FAIL | Notes |
|---|---|---:|---|
| `EMAIL_FROM` | Development, Preview, Production | PASS | Production health has no `EMAIL_FROM` configuration issue |
| `RESEND_API_KEY` | Preview, Production | PASS | Production health reports `email_configured=true` |
| `PUBLIC_BASE_URL` | Development, Preview, Production | PASS | Production health reports configured and not localhost |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview, Production | PASS | Production health reports Supabase configured |
| `SUPABASE_ANON_KEY` | Preview, Production | PASS | Production health reports Supabase configured |
| `SUPABASE_URL` | Preview, Production | PASS | Production health reports Supabase configured |
| `EMAIL_REPLY_TO` | Not listed | FAIL | Optional in current app, but not present for explicit production reply-to policy |
| `SMARTTABLE_ENV` | Not listed | FAIL | App can infer production from Vercel, but explicit production mode is preferable |

Production `/api/health` returned `production_configuration_issues = []`, so the currently deployed code considers required production variables complete.

## Supabase Production Configuration

| Item | PASS / FAIL | Evidence |
|---|---:|---|
| Supabase env variables present in Vercel | PASS | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are encrypted in Preview/Production |
| Supabase configured at runtime | PASS | `/api/health` reports `supabase_configured=true` |
| Database reachable | PASS | `/api/health` reports `database_reachable=true` |
| Runtime mode | PASS | `/api/health` and `/api/public/config` report `mode=supabase` |
| Production environment | PASS | `/api/health` and `/api/public/config` report `environment=production` |
| Supabase Auth URL/redirect dashboard settings verified now | FAIL | Cannot verify dashboard-only Site URL/Redirect URLs from Vercel/code alone in this task |
| Real Supabase signup/login/password reset flow verified now | FAIL | Not run in this infrastructure-only task |

## Resend / SMTP Production Configuration

| Item | PASS / FAIL | Evidence |
|---|---:|---|
| Resend API key present in Vercel | PASS | `RESEND_API_KEY` encrypted for Preview/Production |
| Email configured at runtime | PASS | `/api/health` reports `email_configured=true` |
| Production config accepts `EMAIL_FROM` | PASS | `/api/health` reports `production_configuration_issues=[]` |
| Current app expected sender | PASS | Code expects `SmartTable <noreply@smarttable.com>` |
| Real registration email verified now | FAIL | Not run in this infrastructure-only task |
| Real confirmation email verified now | FAIL | Not run; Supabase Auth SMTP dashboard/inbox needed |
| Real password reset email verified now | FAIL | Not run; Supabase Auth SMTP dashboard/inbox needed |
| Resend webhook delivery tracking | FAIL | Deferred by product decision |

## DNS Requirements

DNS TXT records were checked with DNS-over-HTTPS. Local `nslookup` timed out, so DoH was used for a clean public lookup.

### Active Sender Domain From Code: `smarttable.com`

The current app expects:

`EMAIL_FROM=SmartTable <noreply@smarttable.com>`

| DNS Record | PASS / FAIL | Result |
|---|---:|---|
| SPF TXT for `smarttable.com` | FAIL | No TXT answers returned |
| DMARC TXT for `_dmarc.smarttable.com` | FAIL | No TXT answers returned |
| Resend DKIM TXT for `resend._domainkey.smarttable.com` | FAIL | No TXT answers returned |

This means `noreply@smarttable.com` is not DNS-ready for authenticated production email based on the public TXT checks performed here.

### SmartTable NYC Domain Family

| DNS Record | PASS / FAIL | Result |
|---|---:|---|
| TXT for `smarttablenyc.com` | FAIL | Only Google site verification TXT found; no SPF found |
| DMARC TXT for `_dmarc.smarttablenyc.com` | FAIL | NXDOMAIN |
| Resend DKIM TXT for `resend._domainkey.smarttablenyc.com` | FAIL | NXDOMAIN |
| TXT for `mail.smarttablenyc.com` | FAIL | No TXT answers returned |
| DMARC TXT for `_dmarc.mail.smarttablenyc.com` | FAIL | NXDOMAIN |
| Resend DKIM TXT for `resend._domainkey.mail.smarttablenyc.com` | PASS | DKIM public key TXT exists |

`mail.smarttablenyc.com` has a Resend DKIM key, but the current app's production sender expectation is `noreply@smarttable.com`. These must be aligned before public MVP email validation can pass.

## Production Header Checklist

Observed from `https://www.smarttablenyc.com/`, `/api/health`, and `/api/public/config`.

| Item | PASS / FAIL | Evidence |
|---|---:|---|
| HTTPS | PASS | Production URL uses HTTPS |
| HSTS | PASS | `Strict-Transport-Security: max-age=63072000` |
| X-Frame-Options | PASS | `DENY` |
| X-Content-Type-Options | PASS | `nosniff` |
| Referrer-Policy | PASS | `strict-origin-when-cross-origin` |
| Permissions-Policy | PASS | `camera=(), microphone=(), payment=()` |
| Cache headers | PASS | `cache-control: no-store` observed on app/API |
| CSP | FAIL | `Content-Security-Policy` header was absent on current Production |
| Secure cookies | PASS | No SmartTable `Set-Cookie` observed; no insecure app cookie exposed |
| SameSite cookies | PASS | No SmartTable `Set-Cookie` observed; no non-SameSite app cookie exposed |
| HttpOnly cookies | FAIL | The current SPA auth model does not issue HttpOnly auth cookies; session storage remains client-side |

## Required PASS / FAIL Checklist

| Area | PASS / FAIL | Reason |
|---|---:|---|
| Vercel | FAIL | Production is Ready/public, but Preview Protection blocks release-candidate validation |
| Supabase | PASS | Production health reports Supabase configured and database reachable |
| SMTP | FAIL | Runtime email is configured, but sender-domain DNS alignment fails for `smarttable.com` |
| Authentication | FAIL | Automated checks pass, but real production signup/verification/login/reset was not run in this task |
| Email verification | FAIL | Not verified end-to-end; DNS for active sender domain is not ready |
| Password reset | FAIL | Not verified end-to-end; DNS for active sender domain is not ready |
| Security headers | FAIL | CSP missing from current Production response |
| CSP | FAIL | No `Content-Security-Policy` header observed on current Production |
| Cookies | FAIL | No insecure app cookies observed, but HttpOnly auth cookies are not implemented |
| HTTPS | PASS | Production HTTPS works |
| Environment variables | PASS | Required runtime env names present and health reports no configuration issues |
| Deployment configuration | FAIL | Preview validation blocked; Production is older than the latest Preview candidate |

## Technical Evidence

- `vercel inspect smarttablenyc.com`:
  - target: `production`
  - status: `Ready`
  - aliases include `smarttablenyc.com` and `www.smarttablenyc.com`
- `GET https://www.smarttablenyc.com/api/health`:
  - HTTP 200
  - `environment=production`
  - `mode=supabase`
  - `database_reachable=true`
  - `email_configured=true`
  - `production_configuration_issues=[]`
- `GET https://www.smarttablenyc.com/api/public/config`:
  - HTTP 200
  - `environment=production`
  - `mode=supabase`
  - `public_base_url=https://smarttablenyc.com`
  - `platform_mode=basic`
- Production headers:
  - HSTS present
  - X-Frame-Options present
  - X-Content-Type-Options present
  - Referrer-Policy present
  - Permissions-Policy present
  - CSP absent
- Preview endpoint checks:
  - `/`, `/api/health`, `/api/public/config` returned Vercel login shell HTML
  - Vercel login-shell response had `x-matched-path: /login`
- DNS-over-HTTPS:
  - `smarttable.com` TXT: no SPF TXT returned
  - `_dmarc.smarttable.com`: no DMARC TXT returned
  - `resend._domainkey.smarttable.com`: no DKIM TXT returned
  - `resend._domainkey.mail.smarttablenyc.com`: DKIM TXT exists

## Final Answer

If Preview Protection were disabled today, SmartTable would **not** be expected to pass final production validation yet.

Reasons:

1. The currently active/expected sender is `noreply@smarttable.com`, but public DNS checks found no SPF, DMARC, or Resend DKIM TXT records for `smarttable.com`.
2. The current Production deployment is public and healthy but lacks the `Content-Security-Policy` header.
3. The latest Preview release candidate could not be validated because Vercel Preview Protection intercepted app/API requests.
4. Real Supabase Auth signup, email verification, password reset, session persistence, and inbox delivery were not verified in this task.

The closest technical expectation is: disabling Preview Protection would likely allow the latest Preview app/API to be tested, and the local automated validation suggests the code path is strong, but final public MVP validation would still fail on email-domain DNS alignment and unverified real auth/email flows until those are corrected and retested.
