# SmartTable Full System Audit

Audit date: 2026-07-21
Repository root: `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking`
Branch: `production-hardening-basic`
Commit inspected: `6a4cad3`
Remote: `http://github.com/p7nhd2gmgt-sketch/smarttable-nyc.git`

This audit is repository-based. It does not claim production database, Supabase Dashboard, Resend Dashboard, Gmail inbox, DNS, Cloudflare, Vercel runtime, or real browser/device verification unless explicitly stated. No secrets were recorded in this document.

## Magyar vezetői összefoglaló

Ez a dokumentum a SmartTable jelenlegi repository-szintű, teljes rendszerellenőrzése. A kód, a migrációk, a public/partner/admin felületek, az API, a Supabase/Resend integrációs pontok, a feature flag-ek, a mock/placeholder modulok, a SEO, az adatvédelem, a deployment hardening és a tesztek alapján készült. Külső dashboard-hozzáférést, valós production adatbázisállapotot, valós inbox-ellenőrzést és rendered browser/device QA-t csak ott tekint ellenőrzöttnek, ahol ezt kifejezetten jelzi.

Rövid végkövetkeztetés:

- **Elindítható-e most unrestricted public productionként?** Nem.
- **Belső, kontrollált QA/pilot előkészíthető-e?** Igen, de előbb a release-blocker PII endpointokat javítani kell.
- **Legnagyobb biztonsági kockázat:** auth nélküli vagy auth-opcionális vendégadat-lekérdezés booking reference/email/profile key alapján.
- **Legfontosabb működő részek:** build/lint/test, foglalási lifecycle, Supabase/Resend architektúra, BASIC feature gating, email queue/idempotency, guest account alapfolyamatok.
- **Legfontosabb hiányosságok:** valódi browser/device QA hiánya, production signup/Auth/email/account manuális verifikáció hiánya, CSP/body limit/pagination hardening, mock AI/integration/billing modulok.
- **Első javítási sorrend:** PII endpoint hardening, production Auth/email QA, Supabase RLS verifikáció, request body limit, minimális browser E2E/manual QA.

## A. Executive Summary

SmartTable is a single-repository BASIC marketplace application with a static browser SPA, Node/Vercel API handler, Supabase-backed production mode, demo-mode local fallback, Supabase Auth integration, Resend transactional email infrastructure, guest account flows, partner dashboard, admin/super-admin dashboard, feature flags, and reservation lifecycle logic.

Overall repository readiness estimate: **72%**.

Public production readiness estimate: **60%**, because several critical launch gates still require either safe code fixes or real external/manual verification.

Current production launch verdict: **not ready for unrestricted public launch**. The system may be suitable for controlled internal QA after documented P1 privacy/security issues are fixed and real browser/Supabase/Auth/email flows are manually verified.

Most important working areas:

- Production build and syntax checks pass.
- Static quality/lint checks pass.
- Full repository Node-based test suite passes.
- Supabase mode and production hardening checks exist.
- Guest signup/account/reservation lifecycle checks exist.
- Reservation validity and status-transition logic exists on the backend and in PostgreSQL functions.
- Resend email service, queue, logs, idempotency, templates, retry tests, and diagnostics are implemented at repository level.
- BASIC/AI feature visibility checks exist and pass.
- English, Spanish, and Hungarian locale files exist.
- Vercel deployment configuration, `.vercelignore`, `.gitignore`, health endpoint, robots, sitemap, canonical, and Open Graph basics exist.

Most important gaps:

- Two public/auth-optional endpoints can expose guest-related data by booking reference or email/profile key.
- Real rendered browser QA is not covered by the repository; Playwright/Cypress/Puppeteer are not configured.
- Public production signup, Supabase Auth confirmation, welcome email, login, onboarding, and account-page access remain manual/external verification items.
- Public and admin list endpoints need pagination and narrower field selection before large-scale use.
- CSP header and explicit request-body size limits are missing.
- AI, billing, loyalty, and reservation-platform integrations contain foundation/mock/placeholder areas and must remain hidden or clearly labeled in BASIC.
- Effective production RLS policy state must be verified in the Supabase project after migrations.

## B. System Map

### Applications

| Area | Files | Status |
|---|---|---|
| Public guest SPA | `public/index.html`, `public/app.js`, `public/styles.css`, `public/guest/*` | PARTIAL: working static/API checks; browser QA required |
| Partner dashboard | `public/app.js`, `public/partner/layout.js`, partner endpoints in `src/app-core.js` | PARTIAL: route and lifecycle checks pass; browser QA required |
| Admin / Super Admin | `public/app.js`, `public/admin/layout.js`, admin endpoints in `src/app-core.js` | PARTIAL: role checks pass; browser QA required |
| API layer | `server.js`, `api/index.js`, `src/app-core.js` | PARTIAL: functional; needs request-size limit and PII endpoint hardening |
| Shared frontend contracts | `public/shared-contracts.js`, `public/api-client.js`, `public/shared/layout-shells.js` | PASS |

### Services and infrastructure

| Service | Implementation | Status |
|---|---|---|
| Node HTTP server | `server.js` | PASS for local/Vercel entry; missing CSP/body limit |
| Vercel serverless API | `api/index.js`, `vercel.json` | PARTIAL: production runtime must be verified externally |
| Supabase REST/RPC | `src/app-core.js`, `supabase/migrations/*` | PARTIAL: code and migrations exist; production project state manual verification required |
| Supabase Auth | `src/app-core.js` auth functions | PARTIAL: repository tests pass; real production signup/login must be verified |
| Resend email | `src/email-service.js`, email queue/log code in `src/app-core.js` | PASS at repository level; real provider/dashboard verification external |
| Push | `src/push-service.js` | NOT IMPLEMENTED / disabled provider |
| SMS | No real provider found | NOT IMPLEMENTED |
| Browser E2E | No Playwright/Cypress/Puppeteer config found | NOT IMPLEMENTED |

### Database

Supabase SQL migrations live under `supabase/migrations/`. The consolidated production auth SQL is documented separately under `docs/production/SMARTTABLE_AUTH_PRODUCTION_MIGRATION.sql`.

Core tables and views referenced by the application include:

- `profiles`
- `guests`
- `guest_profiles`
- `guest_consents`
- `privacy_requests`
- `restaurants`
- `offers`
- `reservations`
- `reservation_overview`
- `reservation_status_events`
- `restaurant_followers`
- `guest_notifications`
- `admin_notifications`
- `email_queue`
- `email_logs`
- `email_delivery_events`
- `feature_flags`
- `integration_connections`
- `marketing_campaigns`
- `billing_plans`
- `subscriptions`

### Main data flows

1. Guest signup:
   Browser `/signup` -> `POST /api/auth/signup-guest` -> Supabase Auth signUp -> SmartTable profile/guest/onboarding/consent records -> Resend welcome email queue/log.

2. Guest login:
   Browser `/login` -> `POST /api/auth/login` -> Supabase Auth password token -> SmartTable profile lookup/recovery -> browser session.

3. Reservation request:
   Browser booking form -> `POST /api/reservations` -> offer validity evaluation -> duplicate active reservation check -> `public.create_reservation` RPC -> reservation row -> guest/partner transactional emails.

4. Partner reservation management:
   Partner dashboard -> `PATCH /api/partner/reservations` -> server role authorization -> `public.update_reservation_status` RPC -> status event -> guest email.

5. Admin management:
   Admin dashboard -> protected admin endpoints -> service-role Supabase operations -> audit/admin notification records where implemented.

6. Email:
   Business action succeeds -> queue/log record -> centralized Resend service -> provider response -> log update. Webhook delivery tracking is intentionally deferred unless configured.

## C. Audit Scorecard

| Area | Status | Score | Critical Issues | Notes |
|---|---:|---:|---|---|
| Repository structure | PASS | 8/10 | None | Clear single app, but large SPA/core files |
| Build/typecheck | PASS | 9/10 | None | `npm run build` passes |
| Lint/static quality | PASS | 9/10 | None | `npm run lint` passes |
| Automated tests | PASS | 8/10 | Browser E2E missing | Node/static/in-memory suite passes |
| Guest signup/auth | PARTIAL | 7/10 | Real production QA required | Repository checks pass; production confirmation external |
| Guest account | PARTIAL | 7/10 | Browser QA required | Account routes and privacy tests exist |
| Reservation lifecycle | PASS | 8/10 | None found in automated tests | Server/RPC status policy exists |
| Partner dashboard | PARTIAL | 7/10 | Browser QA required | Authorization checks pass |
| Admin/Super Admin | PARTIAL | 7/10 | Browser QA required | Route/role checks pass |
| Tenant isolation | PARTIAL | 6/10 | PII lookup endpoints | Partner/admin checks pass; public lookup gaps |
| API security | PARTIAL | 6/10 | Auth-optional PII endpoints, no body limit | Safe 500s and secret stripping exist |
| Email | PARTIAL | 8/10 | Real provider delivery external | Queue/idempotency/templates implemented |
| Notifications | PARTIAL | 5/10 | Guest notification lookup risk | In-app exists; SMS/push absent |
| Webhooks | PARTIAL | 5/10 | Resend webhook deferred | Code/tests exist but not active production launch gate |
| AI features | PARTIAL | 4/10 | Mock/placeholder inventory | Must stay hidden in BASIC |
| Reservation integrations | NOT IMPLEMENTED | 3/10 | No live provider integration | Mock adapters only |
| Billing/subscription | NOT IMPLEMENTED | 3/10 | No Stripe billing flow | Foundation tables only |
| Marketing/loyalty | PARTIAL | 4/10 | Consent and campaign sending incomplete | Must not be marketed as live |
| Performance/scaling | PARTIAL | 6/10 | Pagination/field selection gaps | Good timeout/index foundations |
| SEO | PARTIAL | 7/10 | Restaurant schema incomplete | Base SEO and sitemap/robots exist |
| Accessibility | MANUAL VERIFICATION REQUIRED | 6/10 | Browser/screen-reader QA missing | Static checks pass |
| Responsive design | MANUAL VERIFICATION REQUIRED | 6/10 | Real viewport QA missing | Static checks pass |
| Deployment hardening | PARTIAL | 7/10 | CSP missing, external verification needed | Health/config checks exist |
| Compliance | PARTIAL | 5/10 | Legal review required | Consent structures exist |

## D. Critical Issues

### ST-C-001 — Auth-optional public rewards context exposes guest PII

Severity: Critical / release-blocking
Affected file: `src/app-core.js`
Affected function: `publicRewardsContext()`
Affected endpoint: `GET /api/public/rewards/context?bookingId=...`

Problem:

The endpoint accepts a booking ID/reference and returns guest context, including `guestName` and `guestEmail`, without requiring an authenticated guest session.

Evidence:

- `publicRewardsContext()` starts at `src/app-core.js:11521`.
- It returns `guestName` and `guestEmail` at `src/app-core.js:11560` and `src/app-core.js:11561`.
- Dispatcher exposes it at `/public/rewards/context`.

Business impact:

Anyone with a reservation reference or guessable booking ID may retrieve guest identity information.

Security impact:

PII exposure and potential IDOR-style privacy violation.

Reproduction steps:

1. Obtain or guess a booking reference.
2. Request `GET /api/public/rewards/context?bookingId=<reference>`.
3. Observe returned guest context fields.

Recommended fix:

Require guest authentication and ownership for PII fields, or return only non-PII restaurant/visit metadata plus a signed, expiring, single-purpose feedback token. Do not expose guest email/name from this public endpoint.

### ST-C-002 — Guest notifications can be queried by email/profile key without authentication

Severity: Critical / release-blocking
Affected file: `src/app-core.js`
Affected function: `guestNotifications()`
Affected endpoint: `GET /api/guest/notifications`

Problem:

`guestNotifications()` attempts authentication but falls back to query parameters `guest_email`, `email`, or `profile_key` for GET requests.

Evidence:

- Auth is optionalized in `src/app-core.js:11570` to `src/app-core.js:11576`.
- Email/profile key fallback is built at `src/app-core.js:11578` and `src/app-core.js:11579`.
- Supabase query uses that filter at `src/app-core.js:11617`.

Business impact:

Notifications may reveal guest/reservation activity if email or profile key is known.

Security impact:

PII and activity leakage; insufficient tenant/user isolation.

Reproduction steps:

1. Request `GET /api/guest/notifications?guest_email=<known-email>` without a bearer token.
2. If rows exist, the endpoint may return private notifications.

Recommended fix:

Require authenticated guest session for all `/guest/notifications` reads and writes. If public notification previews are needed, use signed, scoped tokens that do not expose broad notification history.

## E. High Priority Issues

### ST-H-001 — Real browser/device QA is not automated and remains unverified

Severity: High
Affected files: `package.json`, `docs/BASIC-Final-QA-Report.md`, `docs/BASIC-UI-UX-Audit.md`

Problem:

The repository does not include Playwright, Cypress, Puppeteer, Selenium, or another full browser E2E runner. Existing checks are Node/static/API tests.

Business impact:

Layout, focus, modal, date/time picker, mobile keyboard, and authenticated dashboard defects can escape to production.

Security impact:

Direct browser route-protection behavior is not fully verified across real engines.

Reproduction steps:

1. Inspect `package.json`.
2. Observe no browser E2E script or dependency.
3. Review docs noting browser QA was blocked by local Windows browser launch limitations.

Recommended fix:

Add a minimal Playwright suite covering public homepage, signup, login, reservation creation, partner accept/decline, admin route protection, mobile viewport, and AI-hidden-in-BASIC assertions.

### ST-H-002 — Production signup/login/email/account flow requires external verification

Severity: High
Affected files: `docs/production/SMARTTABLE_AUTH_FINAL_PRODUCTION_QA.md`, `src/app-core.js`, Supabase Dashboard, Resend Dashboard

Problem:

Repository tests cover signup/auth behavior with mocked/in-memory/Supabase-stubbed flows, but real production Supabase Auth user creation, confirmation email, welcome email, onboarding, login, and account pages require live verification.

Business impact:

The first real guest may fail to create or access an account despite passing repository checks.

Security impact:

Cannot confirm production RLS, redirect allowlist, email confirmation behavior, or session behavior solely from source.

Reproduction steps:

1. Use a controlled real inbox.
2. Complete `/signup` on production.
3. Verify Supabase Auth user, SmartTable records, welcome email, login, onboarding, and account pages.

Recommended fix:

Complete a production QA run with controlled test identity and record results. Do not mark GO until verified.

### ST-H-003 — Public/admin/partner endpoints use broad `select=*` and limited pagination

Severity: High for scale readiness
Affected files: `src/app-core.js`

Problem:

Multiple endpoints use `select=*` and/or fixed small limits. The public offer endpoint loads all public available offers without server-side pagination:

- `GET /public/offers`: `src/app-core.js:8110`
- admin billing/invoices/events use `limit=100`
- admin diagnostics/errors use `limit=50`
- partner/import/integration views use `limit=50/100`
- guest reservations can query full guest history without cursor pagination

Business impact:

Large data sets may cause slow API responses, large client payloads, and dashboard performance degradation.

Security impact:

Broad selection increases accidental exposure risk if views/tables later gain sensitive columns.

Reproduction steps:

1. Populate thousands of offers/reservations/notifications.
2. Load public offers or admin dashboards.
3. Observe response size and client rendering cost.

Recommended fix:

Add cursor pagination, explicit field lists, server-side filtering, and response size tests before scaling beyond a small pilot.

### ST-H-004 — Request body size is not explicitly bounded

Severity: High
Affected files: `server.js`, `api/index.js`

Problem:

Both local server and Vercel API entry read all request chunks without an explicit maximum body size.

Evidence:

- `server.js:233` to `server.js:238`
- `api/index.js:16` to `api/index.js:22`

Business impact:

Large payloads can increase memory pressure and degrade availability.

Security impact:

Potential denial-of-service vector.

Recommended fix:

Add a conservative JSON body size limit and return `413 Payload Too Large` with safe error text.

## F. Medium and Low Priority Issues

### ST-M-001 — Content Security Policy is missing

Severity: Medium
Affected file: `server.js`

Problem:

Security headers include `x-content-type-options`, `x-frame-options`, `referrer-policy`, and `permissions-policy`, but no `Content-Security-Policy`.

Evidence:

- `server.js:30` to `server.js:35`

Recommended fix:

Add a CSP appropriate for the current inline JSON-LD, styles, images, Resend/Supabase/API origins, and future map provider constraints.

### ST-M-002 — Client-side token/session storage is used

Severity: Medium
Affected file: `public/app.js`

Problem:

Sessions are stored in `localStorage` or `sessionStorage` depending on Remember Me.

Evidence:

- `public/app.js:899` to `public/app.js:906`

Business impact:

Practical for SPA MVP, but less secure than HttpOnly secure cookies.

Security impact:

XSS would put bearer tokens at higher risk.

Recommended fix:

For a later hardening phase, move to server-managed HttpOnly Secure SameSite cookies or document the tradeoff and enforce strict CSP.

### ST-M-003 — Effective production RLS state must be verified in Supabase

Severity: Medium
Affected files: `supabase/migrations/*`, Supabase Dashboard

Problem:

Migrations contain RLS enablement and policies, but repository inspection cannot prove the production project has exactly those policies applied and active.

Recommended fix:

Run the documented production verification SQL against Supabase and save the result as deployment evidence.

### ST-M-004 — Restaurant-specific structured data is incomplete

Severity: Medium
Affected files: `public/index.html`, `server.js`, `public/app.js`

Problem:

Base JSON-LD exists, but public restaurant detail pages do not appear to emit dynamic `Restaurant` or `LocalBusiness` schema.org data per restaurant.

Recommended fix:

Add route-aware restaurant JSON-LD only for approved/public restaurants and non-private data.

### ST-M-005 — No GitHub Actions CI workflow found

Severity: Medium
Affected path: `.github/workflows`

Problem:

No repository-level GitHub Actions workflow was found.

Recommended fix:

Add CI for `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm audit`, and migration syntax validation.

### ST-L-001 — Some Hungarian AI strings remain mixed English/Hungarian

Severity: Low for BASIC, Medium if AI mode launches
Affected file: `public/locales/hu.json`

Problem:

Some AI-related Hungarian translation values contain mixed English wording. BASIC mode should hide these, but AI launch would require copy cleanup.

Recommended fix:

Complete AI-specific HU localization before AI_CONCIERGE public use.

## G. Mock and Placeholder Inventory

| Item | File | Type | Current safety status |
|---|---|---|---|
| Partner AI mock analytics/data | `public/partner-ai-mock-data.js` | MOCK | Must remain hidden/gated in BASIC |
| AI Concierge routes and UI | `public/app.js` | PARTIAL / demo-gated | Feature registry and BASIC checks exist |
| AI preference/recommendation API | `src/app-core.js` | PARTIAL | Uses profile keys and deterministic/DB-backed records; not a full AI model integration |
| AI route planner | `public/app.js`, `src/app-core.js` | PLACEHOLDER/PARTIAL | Must not appear as working in BASIC |
| Reservation provider adapters | `src/reservation-providers.js` | MOCK/REQUIRES_INTEGRATION | Resy/OpenTable/SevenRooms/Tock/Google Reserve are not live |
| Integration Hub | `src/app-core.js`, `supabase/migrations/0024_*` | FOUNDATION | Provider API access/OAuth not connected |
| Billing/subscription | `supabase/migrations/0024_*`, `src/app-core.js` | FOUNDATION | No live Stripe billing flow |
| Push notifications | `src/push-service.js` | DISABLED | Provider interface only |
| SMS notifications | N/A | NOT IMPLEMENTED | No provider found |
| Marketing campaigns | `marketing_campaigns`, `public/app.js`, `src/app-core.js` | PARTIAL/AI demo | Consent structures exist; live campaign sending not proven |
| Loyalty/photo rewards | `public/app.js`, `src/app-core.js` | PARTIAL | Must not claim legal/reward completeness without business approval |
| Resend webhook delivery tracking | `src/app-core.js`, tests | DEFERRED | Preserve but do not require for BASIC launch |
| Demo/local data mode | `src/app-core.js`, `data/` | DEMO | Production hardening should prevent silent production demo mode |

## H. Environment Variable Inventory

No values are included.

| Variable | Required | Service | Client/Server | Present in `.env.example` | Security risk |
|---|---:|---|---|---:|---|
| `SMARTTABLE_ENV` | Production recommended | Runtime mode | Server | Yes | Low |
| `APP_ENV` | Optional legacy | Runtime mode | Server | No | Low |
| `VERCEL_ENV` | Vercel-provided | Runtime mode | Server | No | Low |
| `NODE_ENV` | Runtime standard | Runtime mode | Server | No | Low |
| `PORT` | Local optional | Local server | Server | No | Low |
| `PUBLIC_BASE_URL` | Required production | Links/SEO/email | Server + safe public config | Yes | Medium if wrong |
| `PUBLIC_SITE_URL` | Optional legacy | Links/SEO | Server | No | Medium if wrong |
| `SUPABASE_URL` | Required production | Supabase | Server | Yes | Low if URL only |
| `SUPABASE_ANON_KEY` | Required production | Supabase anon/API | Server | Yes | Medium; public-like but protect from misuse |
| `SUPABASE_SERVICE_ROLE_KEY` | Required production | Supabase admin operations | Server only | Yes | Critical secret |
| `SUPABASE_REQUEST_TIMEOUT_MS` | Optional | Supabase timeout | Server | No | Low |
| `SUPABASE_STORAGE_BUCKET` | Optional | Supabase Storage | Server | Yes | Low |
| `EMAIL_FROM` | Required for live email | Resend | Server | Yes | Low, must be verified sender |
| `EMAIL_REPLY_TO` | Optional | Resend | Server | Yes | Low |
| `RESEND_API_KEY` | Required for live email | Resend | Server only | Yes | Critical secret |
| `RESEND_WEBHOOK_SECRET` | Deferred optional | Resend webhook | Server only | Yes | Critical secret |
| `EMAIL_RECIPIENT_ALLOWLIST` | Recommended non-production | Email safety | Server | Yes | Medium if absent in staging |
| `EMAIL_ALLOWED_RECIPIENTS` | Optional alias | Email safety | Server | No | Medium if absent in staging |
| `EMAIL_TEMPLATE_VERSION` | Optional | Email templates | Server | Yes | Low |
| `EMAIL_RETRY_LIMIT` | Optional | Email retry | Server | Yes | Low |
| `EMAIL_QUEUE_MAX_ATTEMPTS` | Optional | Email retry | Server | Yes | Low |
| `EMAIL_WEBHOOK_TOLERANCE_SECONDS` | Optional | Email webhook | Server | Yes | Low |
| `ADMIN_NOTIFICATION_EMAIL` | Optional | Admin alerts | Server | No | Low/PII depending recipient |
| `GOOGLE_MAPS_API_KEY` | Optional | Maps | Server/safe public config if enabled | No | Medium |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional alias | Maps | Public-compatible | No | Medium |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional alias | Maps | Public-compatible | Yes | Medium |
| `OPENAI_API_KEY` | Future optional | AI | Server only | Yes | Critical secret |
| `STRIPE_WEBHOOK_SECRET` | Future optional | Billing | Server only | Yes | Critical secret |
| `IMPERSONATION_SECRET` | Optional | Admin support | Server only | No | Critical secret |
| `TERMS_VERSION` | Optional | Legal consent | Server | No | Low |
| `PRIVACY_POLICY_VERSION` | Optional | Legal consent | Server | No | Low |
| `SMARTTABLE_VERSION` | Optional | Health/version | Server | No | Low |
| `GIT_COMMIT_SHA` | Optional | Health/version | Server | No | Low |
| `VERCEL_GIT_COMMIT_SHA` | Vercel-provided | Health/version | Server | No | Low |
| `PUSH_PROVIDER` | Optional | Push | Server | No | Medium |
| `PUSH_API_KEY` | Optional | Push | Server only | No | Critical secret |
| `VAPID_PRIVATE_KEY` | Optional | Push | Server only | No | Critical secret |

## I. Test Results

Commands executed during this audit:

| Command | Result | Notes |
|---|---|---|
| `npm.cmd run build` | PASS | Syntax/type-style check via `npm run check` |
| `npm.cmd run lint` | PASS | `scripts/check-static-quality.js` |
| `npm.cmd test` | PASS | Full repository Node/static/API test suite |
| `npm.cmd audit --omit=dev --audit-level=moderate` | PASS | 0 vulnerabilities |

Test coverage status:

| Test area | Status | Notes |
|---|---|---|
| Build | PASS | `npm run build` |
| Lint | PASS | Static quality checks |
| Typecheck | PASS | Implemented as JS syntax checks via `npm run check` |
| Unit/integration | PASS | Custom Node scripts |
| Reservation lifecycle | PASS | `check:reservation-lifecycle` included in `npm test` |
| Email service | PASS | Mock/provider tests included; real delivery external |
| Route protection | PASS | Static/API checks |
| Production hardening | PASS | Static/in-memory checks |
| Browser E2E | NOT IMPLEMENTED | No Playwright/Cypress/Puppeteer runner |
| Manual browser QA | MANUAL VERIFICATION REQUIRED | Required before public signoff |
| Real production Supabase/Auth/email | MANUAL VERIFICATION REQUIRED | Dashboard and real inbox required |

During tests, expected development-mode email logs appeared with `EMAIL_PROVIDER_NOT_CONFIGURED`. That is acceptable for local/demo tests and is not proof of live delivery.

## J. Security Findings

### Authentication

Status: PARTIAL

Working:

- Supabase Auth signup/login paths exist.
- Safe login error mapping exists.
- Email confirmation state is handled in UI and server tests.
- Password reset and password change flows exist.
- Account deletion requires password/confirmation phrase in tests.

Risks:

- Real production Supabase Auth behavior must be verified manually.
- Client-side bearer-token storage remains a hardening concern.
- Supabase signup rate limits and SMTP configuration are external dashboard dependencies.

### Authorization

Status: PARTIAL

Working:

- Partner/admin/super-admin route protection tests pass.
- Server-side partner restaurant authorization exists via `getPartnerRestaurant()`.
- Reservation status changes are enforced by backend and PostgreSQL function.

Risks:

- Auth-optional public reward and notification endpoints need hardening.
- Effective production RLS policies must be verified directly in Supabase.

### Tenant isolation

Status: PARTIAL

Working:

- Partner cannot modify another restaurant in automated tests.
- Guest ownership checks exist for account/reservation routes.

Risks:

- Email/profile-key lookup patterns can bypass intended guest isolation.
- Service-role backend reads must keep explicit ownership filters.

### API security

Status: PARTIAL

Working:

- Production 500s are generic.
- Safe server logging strips key/token/password-like metadata keys.
- Supabase fetch timeout exists.
- Offer validity and reservation status errors have explicit codes.

Risks:

- No explicit JSON request body size limit.
- CSP missing.
- Some APIs return broad `select=*` payloads.
- Some AI/profile-key endpoints should be reviewed before AI launch.

### Secret management

Status: PASS/PARTIAL

Working:

- Static checks assert frontend does not reference `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, or `RESEND_WEBHOOK_SECRET`.
- `.gitignore` and `.vercelignore` exclude `.env*` except `.env.example`.

Risks:

- `.env.local` exists locally and must never be committed.
- Documentation/screenshots must avoid exposing provider dashboards or environment values.

### Webhook security

Status: PARTIAL / DEFERRED

Working:

- Resend webhook code/tests exist at repository level.
- `RESEND_WEBHOOK_SECRET` placeholder exists.

Risks:

- Webhook delivery tracking is deferred and should not be claimed as delivered until configured and verified.

### AI security

Status: PARTIAL

Working:

- BASIC UI checks gate AI visibility.
- Feature registry/platform mode exist.

Risks:

- AI route/API surface exists in code and must remain inaccessible/hidden in BASIC.
- Prompt-injection, cost control, tenant context isolation, and real model security are not production-proven.

## K. Integration Status

| Integration | Status | Real/Mock | Missing Configuration | Next Step |
|---|---|---|---|---|
| Supabase Postgres | PARTIAL | Real when env configured | Production migration/RLS verification | Run production verification SQL |
| Supabase Auth | PARTIAL | Real when env configured | Dashboard confirmation/SMTP/rate limit settings | Complete real signup/login QA |
| Resend API email | PARTIAL/PASS | Real when key/sender configured | Real dashboard delivery proof external | Verify live signup/reservation emails |
| Resend webhook | DEFERRED | Real code exists but inactive | `RESEND_WEBHOOK_SECRET`, webhook config | Post-launch enhancement |
| Vercel | PARTIAL | Real deployment target | Production deployment evidence external | Verify health/config on live domain |
| Cloudflare/DNS | MANUAL VERIFICATION REQUIRED | External | Dashboard/DNS status | Verify live domain and HTTPS |
| Google Maps | OPTIONAL | Public key optional | `GOOGLE_MAPS_API_KEY` / aliases | Enable only if needed |
| Resy | NOT IMPLEMENTED | Mock adapter | Provider API/OAuth/partnership | Future reservation integration |
| OpenTable | NOT IMPLEMENTED | Mock adapter | Provider API/OAuth/partnership | Future reservation integration |
| SevenRooms | NOT IMPLEMENTED | Mock adapter | Provider API/OAuth/partnership | Future reservation integration |
| Tock / Google Reserve | NOT IMPLEMENTED | Mock adapter | Provider API/OAuth/partnership | Future reservation integration |
| POS systems | PROHIBITED | None should be added | N/A | Keep prohibited |
| Push | NOT IMPLEMENTED | Disabled interface | Provider, VAPID/API keys, consent | Future only |
| SMS | NOT IMPLEMENTED | None found | Provider, consent, compliance | Future only |
| Stripe/Billing | NOT IMPLEMENTED | Foundation tables only | Stripe keys/webhooks/products | Future monetization phase |
| OpenAI/AI | PARTIAL | Mostly demo/foundation | `OPENAI_API_KEY`, model strategy, safety controls | Future AI phase only |

## L. Production Blockers

These must be resolved before unrestricted public launch:

1. **ST-C-001**: Public rewards context exposes guest PII by booking reference.
2. **ST-C-002**: Guest notifications can be queried by email/profile key without authentication.
3. **ST-H-002**: Real production signup/Auth/email/login/account flow is not fully verified from this repository audit.
4. **ST-H-001**: Manual rendered browser/device QA remains required.
5. **Production RLS verification**: Supabase project must be checked after migrations with verification SQL.

Recommended but not necessarily launch-blocking for a controlled pilot:

- Add request body size limits.
- Add CSP.
- Add cursor pagination for large lists.
- Add browser E2E test runner.

## M. Recommended Execution Order

### Phase 0 — Critical production blockers

1. Remove or authenticate PII from `/api/public/rewards/context`.
2. Require authenticated guest ownership for `/api/guest/notifications`.
3. Add regression tests for both PII/IDOR fixes.
4. Run full `npm test`.
5. Verify live `/api/health` and `/api/public/config`.

### Phase 1 — Authentication and e-mail

1. Complete one real production signup with controlled inbox.
2. Verify Supabase Auth user creation.
3. Verify SmartTable profile, guest profile, onboarding/preferences, consent records.
4. Verify confirmation email behavior according to Supabase setting.
5. Verify Resend welcome email.
6. Verify login/session/account routes.

### Phase 2 — Tenant isolation and security

1. Run Supabase RLS verification SQL.
2. Test guest cannot read another guest records.
3. Test partner cannot read/modify another restaurant.
4. Add request body size limit.
5. Add CSP.
6. Review AI/profile-key endpoints before AI launch.

### Phase 3 — Core restaurant workflows

1. Browser-test partner offer creation/edit/deactivate.
2. Browser-test reservation request -> accept -> decline -> cancel.
3. Verify partner email diagnostics and missing restaurant email state.
4. Verify admin restaurant approval/suspension.

### Phase 4 — Guest platform

1. Browser-test signup/onboarding EN/ES/HU.
2. Browser-test search/filter/detail/reservation.
3. Browser-test account/favorites/notifications/privacy.
4. Verify no BASIC AI/POS UI appears.

### Phase 5 — Reservation integrations

1. Keep POS prohibited.
2. Choose one reservation platform candidate.
3. Design provider credential storage.
4. Implement one provider adapter with real API sandbox.
5. Add sync conflict/idempotency tests.

### Phase 6 — AI and automation

1. Do not launch until BASIC is stable.
2. Replace mock AI data with real model/provider or keep hidden.
3. Add prompt-injection, tenant-isolation, timeout, cost, and logging controls.
4. Complete EN/ES/HU AI translations.

### Phase 7 — Billing and monetization

1. Design Stripe architecture in a separate branch.
2. Implement plan entitlements and webhooks.
3. Avoid storing card data.
4. Add billing portal and failure-state tests.

### Phase 8 — Performance and UX

1. Add cursor pagination and explicit field selection.
2. Add browser E2E suite.
3. Add lighthouse/manual performance checks.
4. Modularize `public/app.js` only after stable tests.

### Phase 9 — Final production QA

1. Run all automated checks.
2. Run browser matrix: Chrome/Edge/Firefox/WebKit where available.
3. Run mobile viewport/device QA.
4. Run controlled real guest/partner/admin journey.
5. Record evidence and final GO/NO-GO.

## N. Final Verdict

### Elindítható-e most productionben?

**Nem unrestricted public productionként.** Controlled internal QA/pilot előkészíthető, de a két PII endpointot és a real production signup/browser/RLS verifikációt előbb kezelni kell.

### Mi működik teljesen?

- Repository build/syntax checks.
- Static quality/lint checks.
- Node-based automated reservation lifecycle checks.
- Offer validity tests.
- BASIC route/feature visibility checks.
- Email infrastructure tests with mocked provider behavior.
- `.gitignore`/`.vercelignore` secret/runtime artifact exclusion.
- Health/public config safety checks at code level.

### Mi működik részlegesen?

- Supabase Auth signup/login: code and tests exist, real production needs verification.
- Guest account and privacy flows: code/tests exist, browser/device QA required.
- Partner/admin dashboards: route/API checks exist, browser/manual workflows required.
- Email: infrastructure complete, real delivery/provider dashboard proof external.
- Notifications: in-app structure exists, auth model needs hardening.
- SEO: base metadata exists, restaurant-specific schema incomplete.
- Compliance: consent structures exist, legal review required.

### Mi nem működik?

- Full browser E2E automation is not implemented.
- Real reservation-platform integrations are not implemented.
- SMS is not implemented.
- Push is not active.
- Live billing/subscriptions are not implemented.
- POS integration is not implemented and must remain prohibited.

### Mi csak mock?

- Partner AI mock analytics.
- Reservation provider adapters.
- Some AI recommendations/route/planner/demo flows.
- Billing/subscription foundation without live payment provider.
- Local demo mode data.

### Mi a legnagyobb biztonsági kockázat?

The largest current security/privacy risk is **PII leakage through auth-optional guest endpoints**, especially `/api/public/rewards/context` and `/api/guest/notifications` email/profile-key lookup behavior.

### Az öt legsürgősebb javítás

1. Require authenticated ownership or signed scoped token for `/api/public/rewards/context`.
2. Require authenticated guest ownership for all `/api/guest/notifications` reads.
3. Complete production Supabase/Auth/signup/email/login/account QA with a controlled inbox.
4. Add explicit request body size limits and regression tests.
5. Add minimal browser E2E coverage or complete documented manual browser/device QA.

### Mi szükséges a nyilvános induláshoz?

- Fix ST-C-001 and ST-C-002.
- Verify Supabase migrations/RLS in production.
- Verify real signup, confirmation/welcome email, login, onboarding, and account pages.
- Complete manual browser/device QA.
- Confirm no BASIC AI/POS public exposure.
- Confirm production health/config responses and Resend sender.
- Complete legal review of Terms, Privacy, consent, deletion/export, marketing email posture.

### Mi szükséges az első valódi étterem csatlakoztatásához?

- Verified production partner account.
- Verified restaurant profile creation/edit.
- Verified offer creation/edit/deactivate.
- Verified partner notification email.
- Verified partner cannot access other restaurants.
- Clear operational policy for reservation acceptance/decline/cancellation.
- Manual browser QA on tablet/mobile during service.

### Mi szükséges az első valódi vendég használatához?

- Verified production guest signup and Supabase Auth creation.
- Verified email confirmation behavior.
- Verified SmartTable guest/profile/onboarding/consent records.
- Verified login/session/account pages.
- Fixed public PII lookup endpoints.
- Verified booking request and pending/accepted/declined/cancelled status display.
- Verified transactional emails use production URLs and correct sender.
