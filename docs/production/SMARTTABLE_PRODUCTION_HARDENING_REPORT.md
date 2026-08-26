# SmartTable Production Hardening Report

## 1. Date

2026-07-19

## 2. Branch

`production-hardening-basic`

## 3. Commit Hash

Verification started from `b57d034101adb0b8230043e68448db290c5c8ec6`. The final release-candidate commit hash is recorded by Git after this report is committed.

## 4. Environment Reviewed

| Area | Result |
| --- | --- |
| Local repository | Reviewed in `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking`. |
| Runtime command | `npm.cmd run dev` / `node server.js`. |
| Local URL | `http://localhost:4173`. |
| Production host | Vercel deployment controlled by GitHub. |
| Mode | BASIC remains the default. |
| Deferred item | Resend webhook delivery tracking remains deferred. |

No DNS, Supabase key, Resend key, or Vercel environment value was changed during this phase.

## 5. Production Configuration Summary

Required production variables are centralized and validated by the application:

| Variable | Purpose | Required In Production |
| --- | --- | --- |
| `SMARTTABLE_ENV` | Explicit runtime environment. | Yes, use `production`. |
| `PUBLIC_BASE_URL` | Canonical application base URL and email link base. | Yes. |
| `SUPABASE_URL` | Supabase project URL. | Yes. |
| `SUPABASE_ANON_KEY` | Public Supabase anon key. | Yes. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key. | Yes. |
| `EMAIL_FROM` | Verified transactional sender. | Yes. |
| `RESEND_API_KEY` | Server-only Resend sending key. | Yes. |
| `EMAIL_REPLY_TO` | Reply-to address. | Optional. |
| `ADMIN_NOTIFICATION_EMAIL` | Internal admin notification recipient. | Optional. |
| `EMAIL_RECIPIENT_ALLOWLIST` | Non-production real-email allowlist. | Optional, recommended for preview/staging. |
| `SUPABASE_REQUEST_TIMEOUT_MS` | Upstream timeout override. | Optional. |
| `RESEND_WEBHOOK_SECRET` | Deferred webhook signing secret. | Optional for BASIC launch because webhook tracking is deferred. |

Production now fails safely instead of silently entering demo mode when mandatory configuration is missing.

## 6. Onboarding UI Defect And Resolution

Defect: the seven-step guest onboarding indicator used long labels in a narrow row, causing overlap and unreadable labels on laptop and mobile widths.

Resolution:

- stepper navigation now uses short labels: Account, Location, Food, Habits, Budget, Alerts, Review;
- full descriptive titles remain in the content header;
- the signup page uses a wider standalone guest shell;
- step items have equal sizing, consistent height, readable wrapping, and horizontal scrolling on narrow widths;
- current and completed steps remain visually distinct;
- regression checks assert the short labels, scroll behavior, `aria-current`, and viewport coverage.

## 7. Public Navigation Changes

The unauthenticated public header hides internal entry points by default:

- Super Admin is hidden from normal public navigation;
- Partner is hidden from normal public navigation;
- direct protected routes remain available to authorized users;
- route and API authorization are still enforced server-side.

The public navigation keeps consumer-facing paths such as Offers, Restaurants, Contact, Sign Up, and Log In.

## 8. Domain Readiness

`PUBLIC_BASE_URL` is the source of truth for account links, password reset links, reservation links, feedback links, email links, server-rendered canonical URLs, robots, and sitemap generation.

Hardening completed in this phase:

- `/api/public/config` now returns the safe configured `public_base_url`;
- client-side canonical and Open Graph URL updates read `state.config.public_base_url`;
- server-side SEO metadata already uses `PUBLIC_BASE_URL` or `PUBLIC_SITE_URL`;
- runtime code does not hardcode a Vercel deployment URL;
- production preflight rejects localhost and deprecated `smarttable.com` base URLs.

Current CORS/origin posture:

- SmartTable is served as a same-origin app by `server.js`;
- no broad custom CORS allowlist is configured in application code;
- future separate domains or subdomains must be added deliberately to Vercel and Supabase Auth redirect settings.

Future custom domain setup must document the selected production URL, update `PUBLIC_BASE_URL`, update Supabase Auth redirect allowlists, confirm canonical metadata, and leave DNS unchanged until explicitly approved.

Resend sender status:

- existing repository fallback uses `reservations@mail.smarttablenyc.com`;
- verify the exact sender domain in Resend before changing Vercel `EMAIL_FROM`.

## 9. Supabase Findings

Repository migrations are stored in `supabase/migrations/`. The production initialization guide is `docs/SUPABASE_PRODUCTION_INITIALIZATION.md`.

Findings:

- migrations are repository-backed and additive for the current BASIC scope;
- production must not use `supabase db reset`;
- production schema readiness still requires a Supabase dashboard or SQL verification of applied migrations;
- backup and RLS state cannot be fully proven from the repository alone.

## 10. RLS And Tenant-Isolation Findings

Automated checks cover API-level tenant isolation:

- guests can access only their own account and reservation resources;
- partners are scoped to their authorized restaurant;
- regular admins do not receive Super Admin platform-mode permission;
- partner cross-restaurant reservation changes are rejected;
- direct private AI routes are hidden in BASIC mode.

Production RLS must still be reviewed in Supabase using the SQL queries documented in `docs/SUPABASE_PRODUCTION_INITIALIZATION.md`.

## 11. Authentication Findings

The app keeps one shared auth/account system for guest, partner, admin, and Super Admin roles. The frontend detects expired sessions and returns guest users to the login screen with a localized session-expired message.

Reviewed protections:

- no service-role key reference in the browser bundle;
- protected routes use role checks;
- expired guest sessions do not continue rendering protected account content;
- public errors avoid stack traces in production.

## 12. Email Findings

The centralized Resend email service remains in place. The repository fallback sender is:

```text
SmartTable <reservations@mail.smarttablenyc.com>
```

The latest task text also referenced:

```text
SmartTable <reservations@mail.smarttable-nyc.com>
```

That hyphenated sender was not switched in code because the already verified Resend sender in the repository is the non-hyphenated `mail.smarttablenyc.com` address. Before production launch, confirm the exact verified sender in the Resend dashboard and ensure Vercel `EMAIL_FROM` matches it.

Email hardening status:

- all BASIC transactional flows use the centralized service and queue;
- duplicate transactional sends are protected by idempotency;
- email links are generated from `PUBLIC_BASE_URL`;
- production blocks reserved `.example` recipients before contacting Resend;
- preview/staging can restrict real sends with `EMAIL_RECIPIENT_ALLOWLIST`;
- Resend webhook delivery tracking is deferred and not required for BASIC launch.

## 13. Security Findings

Implemented or verified:

- production preflight rejects missing mandatory config;
- production preflight rejects localhost `PUBLIC_BASE_URL`;
- production preflight rejects deprecated `smarttable.com` public base;
- `/api/health` returns safe status only;
- Supabase upstream timeouts return safe error codes;
- public config does not expose privileged key names;
- browser bundle does not reference `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, or `RESEND_WEBHOOK_SECRET`;
- public private-route SEO noindex rules include account, partner, admin, auth, and AI routes.

No POS integration was added. SmartTable remains limited to SmartTable data and future reservation-platform integrations.

## 14. Browser And Viewport Coverage

Actually completed:

- Microsoft Edge headless verification via local browser automation;
- public/auth route viewport measurements at 320, 390, 768, 1024, and 1440 px;
- signup stepper viewport checks at 320, 375, 390, 430, 768, 1024, 1366, and 1440 px;
- no page-level horizontal overflow was detected in the automated Edge pass.

Not completed:

- in-app browser verification, blocked by Windows `CreateProcessAsUserW failed: 5`;
- physical iPhone/Safari testing;
- real Chrome, Firefox, and WebKit manual passes.

## 15. Environment-Variable Validation

Automated production hardening checks cover:

- missing mandatory production variables fail safely;
- production does not silently enter demo mode;
- localhost base URL is rejected in production;
- deprecated public base domain is rejected in production;
- configured production health succeeds with mocked Supabase reachability;
- Supabase outage returns degraded health without exposing credentials;
- preview email allowlist blocks unapproved real recipients;
- production `.example` recipients are blocked before provider calls.

## 16. Health-Check Result

The safe health endpoint is:

```text
/api/health
```

It may report:

- application status;
- runtime environment;
- storage mode;
- database reachability;
- email configured yes/no;
- version or commit when safely available;
- webhook status as `deferred`.

It must not expose secret values, database credentials, API keys, or raw stack traces.

## 17. Backup And Recovery Status

Backup and recovery documentation was added at:

```text
docs/production/SMARTTABLE_BACKUP_AND_RECOVERY.md
```

Status:

- Supabase automated backup capability is not verifiable from the repository;
- manual export and restore procedures are documented;
- Vercel rollback procedure is documented;
- Supabase and Resend key rotation procedures are documented;
- service-role key exposure response is documented.

## 18. Remaining Known Issues

| Severity | Issue | Status |
| --- | --- | --- |
| P2 | Production Supabase migrations/RLS need dashboard verification. | Manual verification required. |
| P2 | Production custom-domain health could not be fully verified from source. | Manual DNS/Vercel verification required. |
| P2 | Sender-domain wording differs between task text and repository fallback. | Confirm exact verified Resend sender in dashboard before launch. |
| P3 | In-app browser visual QA is blocked by Windows permission error. | Use Edge/Chrome manual QA or browser automation on another machine. |
| P3 | Resend delivery webhooks are deferred. | Post-launch enhancement, not a BASIC blocker. |

No unresolved P0 or P1 defect is recorded in the repository-level hardening checks.

## 19. Deployment Instructions

1. Confirm this branch passes all mandatory checks.
2. Review the diff for secrets before merging.
3. Merge to the intended release branch only after approval.
4. Confirm Vercel has required production variables.
5. Deploy from GitHub through Vercel.
6. Call `/api/health`.
7. Verify the public homepage, signup, login, restaurant list, reservation request, partner dashboard, admin protection, and email diagnostics.
8. Keep BASIC mode active.
9. Keep AI features hidden in BASIC.
10. Do not configure the Resend webhook during BASIC launch.

## 20. Rollback Instructions

Application rollback:

1. Open Vercel Deployments.
2. Promote the previous known-good deployment.
3. Confirm `/api/health`.
4. Recheck guest reservation, partner reservation management, admin access protection, and email sending.

Database rollback:

1. Do not run destructive SQL.
2. Restore into staging first.
3. Prefer corrective forward migrations.
4. Preserve users, restaurants, offers, reservations, consents, notifications, and email logs.

## 21. Final Recommendation

Recommendation: CONDITIONALLY READY for limited public testing after production Supabase migrations/RLS, custom domain health, and exact Resend sender are manually verified in the provider dashboards.

Code and automated-check readiness are strong. Manual production-readiness still depends on dashboard checks that cannot be proven from the repository alone.
