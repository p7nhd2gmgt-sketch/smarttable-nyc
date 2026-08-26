# SmartTable Release Blockers Report

Date: 2026-07-21

Scope: public-release blocker verification only. No application functionality, UI, AI, billing, reservation logic, DNS, Vercel settings, or environment variables were changed.

## Executive Summary

SmartTable production is reachable and both `/api/health` and `/api/public/config` report production + Supabase mode with the database reachable. The remaining public-release blockers are:

1. `Content-Security-Policy` is missing from live production responses.
2. The transactional email sender domain is not aligned with the DNS records visible for Resend authentication.
3. DMARC is missing for the sender domains inspected.
4. Preview protection continues to block external preview validation, but this is a validation/infrastructure issue rather than a production runtime defect.

Current conclusion: NOT READY FOR PUBLIC RELEASE until the production deployment serves CSP and the active sender domain is verified/aligned in DNS and Resend.

## Evidence Collected

### Repository and Deployment

| Item | Result |
|---|---|
| Branch | `production-hardening-basic` |
| Local HEAD | `6a4cad3` |
| Remote | `http://github.com/p7nhd2gmgt-sketch/smarttable-nyc.git` |
| Production deployment inspected | `dpl_3UzWvEJ1X7KG7XUXSQSGHs2mpJsD` |
| Production URL | `https://smarttable-igrt1ehpf-budaistvan007-7327s-projects.vercel.app` |
| Production aliases | `https://smarttablenyc.com`, `https://www.smarttablenyc.com`, `https://smarttable-nyc.vercel.app` |
| Deployment status | Ready |
| Deployment age | Created 2026-07-19 17:41:45 EDT |

### Production Health

| Endpoint | HTTP | Environment | Mode | Database | Notes |
|---|---:|---|---|---|---|
| `https://www.smarttablenyc.com/api/health` | 200 | production | supabase | reachable | No production configuration issues reported. |
| `https://www.smarttablenyc.com/api/public/config` | 200 | production | supabase | n/a | Public base URL is production and not localhost. |

No secret values were exposed by either response during this check.

## Security Header Verification

Live production response headers were checked for:

- `/`
- `/api/health`
- `/api/public/config`

| Header | `/` | `/api/health` | `/api/public/config` | Status |
|---|---|---|---|---|
| `Content-Security-Policy` | Missing | Missing | Missing | FAIL |
| `Strict-Transport-Security` | `max-age=63072000` | `max-age=63072000` | `max-age=63072000` | PASS |
| `X-Frame-Options` | `DENY` | `DENY` | `DENY` | PASS |
| `X-Content-Type-Options` | `nosniff` | `nosniff` | `nosniff` | PASS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `strict-origin-when-cross-origin` | `strict-origin-when-cross-origin` | PASS |
| `Permissions-Policy` | `camera=(), microphone=(), payment=()` | `camera=(), microphone=(), payment=()` | `camera=(), microphone=(), payment=()` | PASS |

### CSP Investigation

| Layer | Finding |
|---|---|
| `vercel.json` | The current working tree includes a `Content-Security-Policy` header under `headers` for `/(.*)`. |
| Middleware | No middleware file was found in the active repository. Header delivery is currently handled by Vercel headers plus server/API response helpers. |
| Server headers | `server.js` imports `strictSecurityHeaders` from `src/security-headers.js` and applies those headers to local/server responses. |
| API headers | `api/index.js` imports `strictSecurityHeaders` and applies those headers to API responses. |
| Shared header module | `src/security-headers.js` defines `CONTENT_SECURITY_POLICY` and `strictSecurityHeaders`. |
| Production response | Live production responses do not include `Content-Security-Policy`. |

### CSP Root Cause

The repository working tree contains CSP configuration, but the live production deployment inspected is an older ready deployment from 2026-07-19 and is not serving the current CSP header configuration. This is a deployment/release promotion blocker, not a missing local code definition.

### CSP Required Fix

Deploy a production build that includes the current security header configuration from:

- `vercel.json`
- `src/security-headers.js`
- `server.js`
- `api/index.js`

After deployment, verify `Content-Security-Policy` is present on:

- `https://www.smarttablenyc.com/`
- `https://www.smarttablenyc.com/api/health`
- `https://www.smarttablenyc.com/api/public/config`

Classification:

- Type: deployment/configuration
- Developer action required: yes, deploy or promote a build containing the CSP configuration
- Account configuration required: no, unless Vercel project-level behavior overrides repository headers
- Production code change required: not if the current working tree changes are the intended release candidate

## Email Infrastructure Verification

Official Resend documentation states that domains are verified through DNS records in the Resend dashboard. DNS evidence was checked without using or exposing account credentials.

### Application Sender Configuration Evidence

The current repository expects the production transactional sender to be:

`SmartTable <noreply@smarttable.com>`

Evidence:

- `.env.example` contains `EMAIL_FROM=SmartTable <noreply@smarttable.com>`.
- `src/app-core.js` sets `EXPECTED_TRANSACTIONAL_SENDER_EMAIL = "noreply@smarttable.com"`.
- Production health reports no `EMAIL_FROM` configuration issue, so the deployed environment is compatible with the current deployed sender expectation.

### DNS Results

| Record | Result | Status |
|---|---|---|
| `TXT smarttable.com` | DNS query did not return an SPF TXT record. | FAIL |
| `TXT _dmarc.smarttable.com` | DNS query did not return a DMARC TXT record. | FAIL |
| `TXT resend._domainkey.smarttable.com` | DNS query did not return a Resend DKIM record. | FAIL |
| `TXT smarttablenyc.com` | Google site verification only; no SPF record visible. | PARTIAL/FAIL |
| `TXT _dmarc.smarttablenyc.com` | NXDOMAIN / no DMARC record. | FAIL |
| `TXT resend._domainkey.smarttablenyc.com` | NXDOMAIN / no Resend DKIM record. | FAIL |
| `TXT mail.smarttablenyc.com` | No SPF TXT record visible at this host. | FAIL |
| `TXT _dmarc.mail.smarttablenyc.com` | NXDOMAIN / no DMARC record. | FAIL |
| `TXT resend._domainkey.mail.smarttablenyc.com` | Resend DKIM public key exists. | PASS |
| `TXT send.mail.smarttablenyc.com` | `v=spf1 include:amazonses.com ~all` exists. | PASS |
| `MX send.mail.smarttablenyc.com` | `feedback-smtp.us-east-1.amazonses.com` exists. | PASS |

### Email Root Cause

The application is configured to require/use `noreply@smarttable.com`, but the visible Resend DNS evidence is for `mail.smarttablenyc.com` / `send.mail.smarttablenyc.com`. The current active sender domain (`smarttable.com`) does not show the SPF, DKIM, or DMARC records required to confidently treat it as production-ready for authenticated sending.

### Email Required Fix

Choose one canonical production sender and align all four places:

1. Resend verified domain
2. DNS records
3. Vercel `EMAIL_FROM`
4. SmartTable expected sender/preflight code and documentation

Safe options:

#### Option A: Keep `SmartTable <noreply@smarttable.com>`

Required account/DNS actions:

- Verify `smarttable.com` in Resend.
- Add the Resend DKIM record for `smarttable.com`.
- Add the Resend SPF/return-path records required by the Resend dashboard.
- Add a DMARC record at `_dmarc.smarttable.com`.
- Confirm the Resend dashboard marks the domain as verified.

Required developer action:

- None if `EMAIL_FROM` remains `SmartTable <noreply@smarttable.com>`.
- Re-run production health and email diagnostics after DNS propagation.

#### Option B: Use the visible Resend-authenticated subdomain

Required account/DNS actions:

- Confirm in the Resend dashboard that `mail.smarttablenyc.com` is the verified sending domain.
- Add a DMARC record for the relevant organizational/sender domain.
- Confirm whether the final sender should be `noreply@mail.smarttablenyc.com` or another mailbox at that verified domain.

Required developer action:

- Update the SmartTable expected sender/preflight code, `.env.example`, docs, tests, and Vercel `EMAIL_FROM` to the exact verified sender.
- Redeploy after the sender expectation is aligned.

## Blocker Matrix

### REL-BLOCKER-001: Missing Content-Security-Policy in Production

- Severity: P1 release blocker
- Root cause: Live production deployment does not include/serve the current CSP header configuration.
- Required fix: Deploy or promote a production build containing the current `vercel.json` and `src/security-headers.js` header setup.
- Type: deployment/configuration
- Developer action required: yes
- Account configuration required: no, unless Vercel project settings override repository headers
- Status: OPEN

### REL-BLOCKER-002: Transactional Sender Domain Not DNS-Verified for Active Sender

- Severity: P1 release blocker
- Root cause: Application expects `noreply@smarttable.com`, but DNS checks did not find SPF, DKIM, or DMARC records for `smarttable.com`. Visible Resend records are instead under `mail.smarttablenyc.com` and `send.mail.smarttablenyc.com`.
- Required fix: Align Resend verified domain, DNS, `EMAIL_FROM`, code preflight, and documentation to one canonical sender.
- Type: DNS/account configuration, possibly code/env if changing sender
- Developer action required: yes if sender changes from `noreply@smarttable.com`
- Account configuration required: yes
- Status: OPEN

### REL-BLOCKER-003: DMARC Missing

- Severity: P1/P2 release blocker depending on launch policy
- Root cause: No DMARC TXT record was visible for `_dmarc.smarttable.com`, `_dmarc.smarttablenyc.com`, or `_dmarc.mail.smarttablenyc.com`.
- Required fix: Add a DMARC TXT record for the active sender domain/organizational domain. Start with a monitoring policy if appropriate, then tighten after delivery is observed.
- Type: DNS/account configuration
- Developer action required: no
- Account configuration required: yes
- Status: OPEN

### REL-BLOCKER-004: Preview Protection Blocks External Preview Validation

- Severity: P2 validation blocker
- Root cause: Vercel Preview Protection serves the Vercel authentication page for preview URLs, so external/browser validation cannot reach SmartTable Preview routes without a bypass.
- Required fix: Disable preview protection for the validation window or provide a Vercel protection bypass token/link to the QA tester.
- Type: infrastructure/account configuration
- Developer action required: no, unless QA automation must be updated to use a bypass token
- Account configuration required: yes
- Status: OPEN for preview validation only; production is reachable.

## Commands Executed

Read-only commands:

- `git status --short`
- `git branch --show-current`
- `git rev-parse --short HEAD`
- `git remote -v`
- `Get-Content -Raw vercel.json`
- `Get-Content -Raw src/security-headers.js`
- `rg -n "Content-Security-Policy|strictSecurityHeaders|securityHeaders|X-Frame-Options|Permissions-Policy|Referrer-Policy|Strict-Transport-Security" vercel.json server.js api src public`
- `rg --files -g "*middleware*"`
- `npx.cmd vercel inspect smarttablenyc.com`
- `Invoke-WebRequest` against production `/`, `/api/health`, `/api/public/config`
- Cloudflare DNS-over-HTTPS TXT/MX checks for SmartTable sender domains

No deployment was performed.

No DNS, Vercel, environment-variable, or application behavior changes were made.

## Final Recommendation

Do not proceed to public release until:

1. Production serves a non-empty `Content-Security-Policy` header on public and API responses.
2. The production sender domain is verified and aligned across Resend, DNS, Vercel `EMAIL_FROM`, and SmartTable sender preflight checks.
3. DMARC exists for the active sender domain.

After those changes, rerun:

- production response header checks
- `/api/health`
- `/api/public/config`
- `npm run check:email`
- one controlled real email send through the production sender

References:

- Resend domain verification documentation: https://resend.com/docs/dashboard/domains/introduction
