# SmartTable BASIC Production Hardening Report

Date: 2026-07-19

Scope: SmartTable BASIC only. AI Concierge, AI Demand Engine, AI scoring, AI recommendations, route planning, calendar sync, Stripe, POS integrations, and Resend webhook expansion were not started.

## Environment

| Item | Result |
| --- | --- |
| Project root | `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking` |
| Branch | `main` |
| Latest commit before this pass | `b57d034101adb0b8230043e68448db290c5c8ec6` |
| Remote | `origin http://github.com/p7nhd2gmgt-sketch/smarttable-nyc.git` |
| Local URL checked | `http://localhost:4173` |
| Local health | `ok=true`, `status=ok`, `mode=demo`, `database_reachable=false`, `publicBaseUrl=https://smarttablenyc.com` when started with the intended non-secret `PUBLIC_BASE_URL` override |
| Vercel default host checked | `https://smarttable-nyc.vercel.app/api/health` |
| Vercel default host result | `200`, but `mode=demo` |
| Custom domain checked | `https://smarttablenyc.com/api/health` |
| Custom domain result | Cloudflare `522` |
| Webhook status | Deferred by product decision |

## Baseline Checks

These checks were run before new hardening edits in this pass:

| Command | Result |
| --- | --- |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run check:basic-ui` | PASS |
| `npm.cmd run check:basic-ui-behavior` | PASS |
| `npm.cmd run check:basic-visual-readiness` | PASS |
| `npm.cmd run check:reservation-lifecycle` | PASS |
| `npm.cmd run check:email` | PASS |
| `npm.cmd test` | PASS |

## Hardening Changes

### Environment And Mode Hardening

`src/app-core.js` now classifies runtime as `development`, `preview`, `staging`, or `production` using `SMARTTABLE_ENV`, `APP_ENV`, `VERCEL_ENV`, then `NODE_ENV`.

When the runtime is production, SmartTable no longer silently falls back to demo storage. If mandatory production configuration is missing, `/api/health` returns a safe `503` configuration status and all other API routes return:

```json
{
  "error": "Service temporarily unavailable.",
  "code": "PRODUCTION_CONFIGURATION_INCOMPLETE"
}
```

The safe health payload reports only non-secret status:

- runtime environment;
- data mode (`supabase`, `demo`, or `configuration_error`);
- BASIC default platform mode;
- whether `PUBLIC_BASE_URL` is configured;
- whether `PUBLIC_BASE_URL` uses localhost;
- whether Supabase and Resend are configured;
- webhook status (`deferred` unless explicitly configured).

The server now uses `PUBLIC_BASE_URL` for SEO/canonical generation before falling back to `PUBLIC_SITE_URL`, and production 500 errors no longer echo raw exception messages to public clients.

Phase 8 follow-up added a deeper `/api/health` payload:

- `status`;
- `runtime_mode`;
- `database_reachable`;
- safe `version`;
- safe `commit`.

Supabase requests now use a bounded timeout and return safe upstream error codes such as `UPSTREAM_TIMEOUT` or `UPSTREAM_UNAVAILABLE`. Production health also fails safely if `PUBLIC_BASE_URL` is configured to the deprecated `smarttable.com` domain.

### Email Hardening

All existing email flows still use the centralized Resend service and queue. The verified repository default sender remains:

```text
SmartTable <reservations@mail.smarttablenyc.com>
```

The current request mentioned:

```text
SmartTable <reservations@mail.smarttable-nyc.com>
```

That hyphenated sender was not present in the repository configuration and was not switched in code because changing it without Resend verification evidence could break the already working sender. If the Resend dashboard has moved to the hyphenated domain, update `EMAIL_FROM` in Vercel only after confirming the domain is verified.

Preview and development environments that have a real `RESEND_API_KEY` now require `EMAIL_RECIPIENT_ALLOWLIST`. Without an explicit allowlist, real non-production sends are blocked before contacting Resend. Production also blocks reserved `.example` TLD recipients before a provider request.

The email service now emits safe structured diagnostic logs with:

- event type;
- success/failure;
- provider;
- provider message ID when available;
- status;
- error code;
- timestamp.

It does not log API keys, webhook secrets, passwords, reset tokens, or full email bodies.

### Guest Onboarding Stepper

The guest signup stepper now uses short navigation labels on the step cards and keeps the full title in the content header. The step cards use equal-height responsive grid behavior and horizontal scrolling on compact screens, preventing title overlap at laptop, tablet, and mobile widths.

The active step uses `aria-current="step"`, a compact progress summary shows the current position, and the active step is scrolled into view after step changes so mobile users do not need precision scrolling.

Regression coverage in `scripts/check-basic-visual-readiness.js` includes the 320, 390, 768, 1024, and 1366 pixel width matrix and verifies the short-label translation keys, current-step semantics, equal sizing CSS, and mobile scroll behavior.

### Public Internal Entry Points

The public header no longer shows Admin or Partner entry buttons to unauthenticated visitors. The buttons remain in the DOM as hidden controls and become visible only for authenticated users with the matching role:

- Super Admin/Admin session: Super Admin shortcut can appear.
- Partner session: Partner shortcut can appear.
- Guest or anonymous visitor: internal shortcuts stay hidden.

The consumer navigation now exposes:

- Offers
- Restaurants
- Contact
- Sign Up
- Log In

The protected `/admin` and `/partner` routes and server-side authorization rules were not changed.

## Security And Secret Review

`src/env-loader.js` loads `.env` and `.env.local` before `server.js`, `api/index.js`, and the backend app core initialize. Existing host environment variables take precedence.

`.gitignore` covers:

- `.env`
- `.env.*`
- `.env.local`
- `.env.production`

Tracked-file scans found no live secrets. Matches were classified as:

- environment variable names;
- safe placeholders;
- test-only values in automated tests;
- normal words such as `preview` that matched a broad pattern;
- server-side `process.env` reads.

Public bundle/source checks found no references to:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`

The production public config probe on the Vercel default host did not expose those privileged names.

## Production Probe Findings

| Check | Result | Severity |
| --- | --- | --- |
| `https://smarttablenyc.com/api/health` | Cloudflare `522` | Blocker for public custom-domain testing |
| `https://www.smarttablenyc.com/api/health` | Cloudflare `522` | Blocker for public custom-domain testing |
| `https://smarttable-nyc.vercel.app/api/health` | `200`, but `mode=demo` | Blocker for production data readiness |
| `https://smarttable-nyc.vercel.app/api/public/config` | BASIC mode, AI demo off, no privileged key names exposed | Pass for public config safety |
| `https://smarttable-nyc.vercel.app/api/admin/email-diagnostics` | `401 Unauthorized` without auth | Pass for protected diagnostics |
| `https://smarttable-nyc.vercel.app/api/admin/reservations` | `401 Unauthorized` without auth | Pass for protected admin data |

The Vercel default host responding in demo mode means the checked deployment is not using Supabase-backed production persistence. This must be resolved before limited public testing with real users or restaurants.

Resend production sending was not re-tested during this pass because that would intentionally send mail. Existing local automated email checks still pass, and previous controlled provider-acceptance results remain preserved. Webhook delivery tracking remains deferred.

## Required Production Fixes Outside This Code Patch

1. Point `smarttablenyc.com` and `www.smarttablenyc.com` to the active Vercel deployment so `/api/health` returns `200`.
2. Set `SMARTTABLE_ENV=production` in the Vercel production environment.
3. Confirm the Vercel production environment has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` configured for the deployed project and environment.
4. Confirm `PUBLIC_BASE_URL` is set to the intended public guest URL and is not localhost.
5. Confirm `EMAIL_FROM` remains `SmartTable <reservations@mail.smarttablenyc.com>`.
6. Confirm `RESEND_API_KEY` is set only in the Vercel server environment.
7. Configure `EMAIL_RECIPIENT_ALLOWLIST` for preview/development environments that use a real Resend key.
8. Keep `RESEND_WEBHOOK_SECRET` deferred unless webhook delivery tracking is intentionally launched later.
9. Re-run `/api/health` and verify `environment=production`, `mode=supabase`, and `public_base_url_uses_localhost=false` before public testing.

## Supabase Production Initialization

Created `docs/SUPABASE_PRODUCTION_INITIALIZATION.md` with:

- migration inventory through `0041_reservation_lifecycle_policy.sql`;
- safe empty-project initialization steps;
- migration status SQL;
- RLS verification SQL;
- server-side ownership check summary;
- production health expectations;
- non-production email allowlist behavior;
- rollback guidance.

## Rollback Notes

If this hardening patch causes a UI regression:

1. Revert the changes to `public/index.html`, `public/app.js`, `public/styles.css`, `public/locales/en.json`, `public/locales/es.json`, `public/locales/hu.json`, and `scripts/check-basic-visual-readiness.js`.
2. Re-run `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd test`.
3. Redeploy the previous known-good commit.

No database schema, migrations, email provider behavior, reservation status logic, auth logic, or production data were changed by this pass.

## Phase 8-11 Follow-Up Verification

Additional hardening completed on 2026-07-19:

- Added `scripts/check-basic-security-hardening.js` and wired it into `npm test`.
- Verified public config and health responses do not expose service-role, Resend, webhook, password, or auth token values.
- Added a production preflight check for the deprecated `smarttable.com` public base URL.
- Updated public canonical, Open Graph, sitemap, robots, manifest, and favicon assets to use `smarttablenyc.com`/SmartTable branding.
- Added private-route noindex coverage for verification, auth, account, partner, admin, and AI preview routes.
- Fixed the signup/onboarding page so it no longer renders inside the narrow homepage hero column.
- Verified the signup stepper uses readable short labels and a scrollable compact layout on mobile/tablet.

### Browser Verification Actually Completed

| Engine | Status | Scope |
| --- | --- | --- |
| In-app browser | BLOCKED | Windows permission failure: `CreateProcessAsUserW failed: 5`. |
| Microsoft Edge Chromium headless | PARTIAL PASS | Public/auth route rendering, responsive overflow metrics, hidden internal nav controls, signup stepper measurements, and screenshots. |
| Chrome desktop | NOT VERIFIED | No Chrome binary found in this environment. |
| Firefox | NOT VERIFIED | No Firefox binary found in this environment. |
| Safari/WebKit | NOT VERIFIED | Not available in this Windows environment. |

Measured routes in headless Edge: `/`, `/restaurants`, `/offers`, `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/account`, `/partner`, `/admin`.

Measured widths: `320`, `375`, `390`, `430`, `768`, `1024`, `1366`, and `1440` pixels where applicable. The second route pass covered `/offers`, `/account`, `/reset-password`, `/partner`, and `/admin` at `390`, `1024`, and `1440`.

Screenshots created:

- `docs/qa/screenshots/home-desktop-1440x900.png`
- `docs/qa/screenshots/signup-desktop-1366x768.png`
- `docs/qa/screenshots/signup-mobile-390x844.png`

### Follow-Up Check Results

| Command | Result |
| --- | --- |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run check:production-hardening` | PASS |
| `npm.cmd run check:basic-security-hardening` | PASS |
| `npm.cmd run check:email` | PASS |
| `npm.cmd test` | PASS |

Notes:

- Mocked negative-path tests emit sanitized structured logs for expected `401`, `403`, `409`, `429`, email-provider, and Supabase-unreachable scenarios.
- Resend webhook delivery tracking remains intentionally deferred.
- No POS integration was added or referenced.

## Public Readiness Recommendation

Current recommendation: NOT READY FOR PUBLIC TESTING.

Reason: local code and automated checks are green, but the public custom domain returns Cloudflare `522`, and the reachable Vercel default host reports demo mode instead of Supabase mode.

After the Vercel/domain/Supabase environment findings are fixed and verified, the recommendation can move back to limited manual QA and controlled public testing.
