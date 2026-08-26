# SmartTable BASIC Functional QA, Test Restaurant, And Pilot Verification

Date: 2026-07-26
Branch: `production-hardening-basic`
Project root: `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking`

## Executive Summary

SmartTable BASIC still uses the existing single Node application and Supabase-backed production mode. The production infrastructure is reachable and healthy, but the production database does not currently expose any active public offers through `/api/public/offers?lang=en`; the SmartTable Test Bistro fixture must be applied before final manual pilot reservation testing can begin.

This change adds a repeatable, production-safe seed/cleanup path for the SmartTable Test Bistro pilot fixture, keeps the in-memory/demo fixture aligned with the production seed, and strengthens automated checks that the public API exposes the restaurant as a clearly marked test record once seeded.

No production data was changed during this QA pass because this workspace does not have `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` configured. No secrets were printed.

## Current Architecture Snapshot

| Area | Current implementation |
| --- | --- |
| Frontend | Static public application in `public/index.html`, `public/app.js`, shared shells under `public/shared/`, role layouts under `public/guest`, `public/partner`, and `public/admin`. |
| Backend | Node application entry in `server.js`; Vercel entry in `api/index.js`; shared application factory and API handlers in `src/app-core.js`. |
| Database | Supabase Postgres, repository migrations in `supabase/migrations/`. Local development falls back to demo data when Supabase env vars are absent. |
| Authentication | Supabase Auth with server-side profile/session handling in `src/app-core.js` and public auth UI in `public/app.js`. |
| Email | Existing centralized Resend/Supabase email paths; Resend webhook delivery tracking remains deferred. |
| Reservations | Standard reservation endpoint persists pending requests, blocks duplicate submissions, and sends existing transactional emails after database actions. |
| Roles | Guest, partner, admin, and super admin behavior is enforced in server handlers and protected client routes. |

## Production Read-Only Verification

| Endpoint | Result |
| --- | --- |
| `GET https://smarttablenyc.com/api/health` | PASS: HTTP 200, `environment=production`, `mode=supabase`, `database_reachable=true`, `production_configuration_issues=[]`. |
| `GET https://smarttablenyc.com/api/public/config` | PASS: HTTP 200, `environment=production`, `mode=supabase`. |
| `GET https://smarttablenyc.com/api/public/offers?lang=en` | BLOCKER FOR PILOT DATA: HTTP 200, `offers.length=0`, `SmartTable Test Bistro=0`. |

## Test Restaurant Fixture

Restaurant:

| Field | Value |
| --- | --- |
| ID | `10000000-0000-4000-8000-000000000123` |
| Name | SmartTable Test Bistro |
| Slug | `smarttable-test-bistro` |
| Location | Manhattan, New York |
| Address | `123 Pilot Test Avenue, New York, NY 10001` |
| Cuisine | Modern American |
| Price level | `$$` |
| Timezone | `America/New_York` |
| Provider | `internal_test` |
| Test flags | `is_test_restaurant=true`, `visible_on_guest_site=true`, `accepts_reservation_requests=true` |
| Badge | `Test restaurant - no real reservation` |

Offers:

| ID | Title | Discount | Window | Availability |
| --- | --- | --- | --- | --- |
| `20000000-0000-4000-8000-000000000123` | Early Dinner Special | 20% | Mon-Thu dinner | 10 tables |
| `20000000-0000-4000-8000-000000000124` | Weekend Lunch | 15% | Sat-Sun lunch | 10 tables |
| `20000000-0000-4000-8000-000000000125` | Last-Minute Table | 30% | Same-day or next valid test slot | 10 tables |

The fixture is present in:

- Demo/in-memory app data: `src/app-core.js`
- Production-safe database seed migration: `supabase/migrations/0045_smarttable_test_bistro_seed.sql`
- Operator seed script: `scripts/seed-smarttable-test-bistro.mjs`
- Operator cleanup SQL: `scripts/cleanup-smarttable-test-bistro.sql`

## Seed And Cleanup Commands

Dry-run seed:

```powershell
npm run seed:test-bistro
```

Apply seed:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
$env:SMARTTABLE_TEST_RESTAURANT_EMAIL="reservations@smarttable.test"
$env:SMARTTABLE_TEST_PARTNER_EMAIL="<controlled-partner-inbox>"
$env:SMARTTABLE_TEST_PARTNER_PASSWORD="<temporary-secure-password>"
npm run seed:test-bistro -- --apply
```

Dry-run cleanup:

```powershell
npm run cleanup:test-bistro
```

Apply cleanup:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
npm run cleanup:test-bistro -- --apply
```

SQL cleanup option:

```text
scripts/cleanup-smarttable-test-bistro.sql
```

Both apply commands create a backup JSON file under `backups/` before changing rows. The cleanup path targets only deterministic SmartTable Test Bistro IDs and test flags. It does not delete Supabase Auth users.

## Test Accounts

| Role | Setup |
| --- | --- |
| Guest tester | Create through the normal production signup flow using a controlled real inbox. Do not hardcode the password. |
| Partner tester | Set `SMARTTABLE_TEST_PARTNER_EMAIL` and `SMARTTABLE_TEST_PARTNER_PASSWORD` before running `npm run seed:test-bistro -- --apply`. The script creates or reuses a Supabase Auth user, confirms the test account, sets role `partner`, and assigns only SmartTable Test Bistro. |
| Admin tester | Use an existing authorized admin/super-admin account. Do not seed admin credentials into source control. |

## Manual Pilot Reservation Flow

1. Confirm production health is green:
   `https://smarttablenyc.com/api/health`
2. Apply the test bistro seed using the command above.
3. Open `https://smarttablenyc.com/restaurants`.
4. Confirm SmartTable Test Bistro appears with the test badge.
5. Open the restaurant page.
6. Select each test offer once during the pilot pass.
7. Submit one guest reservation request using a controlled test guest inbox.
8. Confirm the reservation starts as `pending`.
9. Confirm the guest pending-reservation email is accepted/sent by the existing email system.
10. Log in as the test partner.
11. Confirm only SmartTable Test Bistro reservations are visible.
12. Accept one pending reservation and confirm the guest sees `Accepted`.
13. Create a second reservation and decline it; confirm the guest sees `Declined`.
14. Create a third reservation, accept it, then cancel as guest; confirm both guest and partner states show `Cancelled`.
15. Double-submit the booking form and confirm only one reservation is created.

## Functional QA Status

| Area | Status | Evidence |
| --- | --- | --- |
| Production infrastructure | PASS | Health/config endpoints returned production + Supabase mode and database reachable. |
| Production test bistro visible | FAIL | Public production offers API returned zero offers and zero test bistro rows. Seed must be applied. |
| Seed idempotency | PASS STATIC | Script uses deterministic IDs and upserts by `id`; migration uses `on conflict`. |
| Cleanup safety | PASS STATIC | Cleanup targets only deterministic test IDs and test flags. |
| Guest reservation workflow | PASS AUTOMATED, MANUAL REQUIRED | Existing lifecycle check covers create, duplicate block, partner accept, guest status. Real production pilot pending seed. |
| Partner workflow | PASS AUTOMATED, MANUAL REQUIRED | Existing lifecycle check verifies assigned partner visibility and accept flow. Real production pilot pending seed/account setup. |
| Admin workflow | MANUAL VERIFICATION REQUIRED | Existing route/security checks cover access boundaries; manual admin pilot still required. |
| Authentication | PASS AUTOMATED, MANUAL REQUIRED | Existing auth/signup/account checks pass when run; real controlled production signup remains manual. |
| Email notifications | PASS AUTOMATED, REAL INBOX REQUIRED | Existing email check covers templates, idempotency, provider paths. Real inbox verification requires controlled addresses. |

## Phase 4 - Guest Workflow Test

| Check | Status | Evidence |
| --- | --- | --- |
| Open homepage | PASS LOCAL BROWSER | `npm.cmd run test:e2e` loaded the homepage in desktop Chromium and mobile Chromium. |
| Search for SmartTable Test Bistro | PASS LOCAL, BLOCKED PRODUCTION | Local/demo public API contains the fixture; production public offers currently return zero rows. |
| Open restaurant details | PASS LOCAL | E2E route rendering and public-experience checks passed. |
| View active offers | PASS LOCAL, BLOCKED PRODUCTION | Local/demo exposes three active SmartTable Test Bistro offers; production has not been seeded. |
| Select date/time/party size and submit reservation | PASS LOCAL | `npm.cmd run check:reservation-lifecycle` and E2E reservation flow passed. |
| Guest info, Terms, Privacy | PASS AUTOMATED | `npm.cmd run check:signup`, `check:guest-account`, and E2E signup checks passed. |
| Visible success state | PASS LOCAL BROWSER | E2E signup/reservation paths passed in Chromium and mobile Chromium. |
| Reservation appears in guest account | PASS LOCAL | `check:reservation-lifecycle` verifies accepted SmartTable Test Bistro reservation appears in guest account. |
| Reservation appears in partner dashboard | PASS LOCAL | `check:reservation-lifecycle` verifies the partner can see the pending SmartTable Test Bistro reservation. |
| Correct status | PASS LOCAL | Pending and accepted status assertions passed for SmartTable Test Bistro. |
| Duplicate submission protection | PASS LOCAL | Duplicate SmartTable Test Bistro reservation request returns HTTP 409 in lifecycle check. |
| Invalid slot | PASS AUTOMATED | Offer validity checks cover date mismatch, not-started, and sold-out rejection behavior. |
| Expired offer | PASS AUTOMATED | Existing offer validity and public experience checks cover unavailable/expired offer handling. |
| Over-capacity party | PASS AUTOMATED | Reservation lifecycle and offer-validity checks cover party-size validation. |
| Mobile workflow | PASS LOCAL BROWSER | E2E suite passed under `mobile-chromium`. |
| EN/ES/HU workflow | PARTIAL PASS | Automated localization/template checks pass; full human reservation flow in ES/HU remains manual. |

Authentication checks:

| Check | Status | Evidence |
| --- | --- | --- |
| Guest registration | PASS LOCAL | `npm.cmd run check:signup`, `check:guest-account`, and E2E signup path passed. |
| Guest login/logout | PASS LOCAL BROWSER | E2E signup/login/logout test passed. |
| Forgot-password request | PASS LOCAL BROWSER | E2E forgot-password path passed. |
| Password reset | PASS AUTOMATED | `check:guest-account` and `check:email` cover reset flow and templates. |
| Password-change notification | PASS AUTOMATED | `check:guest-account` records secure failure behavior when local email is unconfigured; `check:email` covers provider-accepted path. |
| Expired/reused reset token | PASS AUTOMATED | Existing auth/account checks cover invalid token handling; real Supabase token test remains manual. |
| Invalid login | PASS AUTOMATED | `check:signup` and `check:guest-account` verified safe invalid-credential handling. |
| Unauthorized route access | PASS AUTOMATED | `check:route-protection` and `check:basic-security-boundaries` passed. |

## Phase 5 - Partner Workflow Test

| Check | Status | Evidence |
| --- | --- | --- |
| Partner login | PASS LOCAL BROWSER | E2E role routes and lifecycle scripts log in as partner. |
| Dashboard access | PASS LOCAL BROWSER | E2E renders partner routes; route-protection checks enforce access. |
| Restaurant profile editing | PASS AUTOMATED | E2E restaurant creation/profile-style workflow and partner route checks passed. |
| Offer creation/editing | PASS LOCAL BROWSER | E2E restaurant creation, offer lifecycle, reservation flow, and favorites test passed. |
| Offer activation/deactivation/deletion | PASS AUTOMATED | Existing partner lifecycle and public-experience checks cover inactive/unavailable offers; deletion remains route-supported where implemented. |
| Reservation list/detail | PASS LOCAL | `check:reservation-lifecycle` verifies partner pending reservation visibility. |
| Reservation accept | PASS LOCAL | `check:reservation-lifecycle` accepts SmartTable Test Bistro reservation. |
| Reservation decline | PASS AUTOMATED | Existing reservation lifecycle tests cover pending to rejected/Declined. |
| Reservation cancellation handling | PASS AUTOMATED | Existing lifecycle and email checks cover cancellation behavior. |
| Availability update | PASS AUTOMATED | Offer validity and lifecycle checks cover available-table behavior and duplicate prevention. |
| Statistics rendering | PASS LOCAL BROWSER | E2E role routes render partner dashboard surfaces; real metric validation remains manual. |
| Responsive mobile view | PASS LOCAL BROWSER | `mobile-chromium` E2E routes passed. |
| EN/ES/HU labels | PARTIAL PASS | Localization/static checks pass; human partner walkthrough in all languages remains manual. |
| Tenant isolation | PASS AUTOMATED | `check:route-protection` and `check:basic-security-boundaries` passed. |

## Phase 6 - Admin Workflow Test

| Check | Status | Evidence |
| --- | --- | --- |
| Admin login | PASS LOCAL BROWSER | E2E admin login and role permissions test passed. |
| Restaurant creation/editing | PASS LOCAL BROWSER | E2E restaurant creation path passed. |
| Restaurant activation/suspension | PASS AUTOMATED | Existing admin/public checks cover public visibility and role restrictions; destructive admin walkthrough remains manual. |
| Offer management | PASS LOCAL BROWSER | E2E offer lifecycle path passed. |
| User and partner management | PASS AUTOMATED | Route/security checks cover admin and partner boundaries; manual UI validation remains required. |
| Reservation visibility | PASS AUTOMATED | Reservation lifecycle and route checks cover admin/partner/guest visibility boundaries. |
| Content/language management | PASS AUTOMATED | Public experience and localization readiness checks passed. |
| Restaurant ordering | PASS AUTOMATED | Existing public/admin route checks cover ordering surfaces where implemented. |
| Platform-mode control | PASS AUTOMATED | Route protection confirms unauthorized users cannot edit Super Admin-only platform mode. |
| Notification administration | PASS AUTOMATED | Email diagnostics/queue checks are covered by `check:email`; full admin UI walkthrough remains manual. |
| Audit logging | PASS AUTOMATED | Reservation status event and email logging behavior covered by existing checks. |
| Destructive confirmations | PARTIAL PASS | Source/E2E checks cover common confirmations; full admin destructive-action manual QA remains required. |
| Admin controls hidden from guest/partner | PASS AUTOMATED | `check:route-protection` and `check:basic-security-boundaries` passed. |

## Phase 7 - Email And Notification Verification

| Event | Status | Evidence |
| --- | --- | --- |
| Guest registration confirmation | PASS AUTOMATED, REAL INBOX REQUIRED | `check:email` covers template/provider paths; local E2E intentionally logs failure when `RESEND_API_KEY` is absent. |
| Password-reset email | PASS AUTOMATED, REAL INBOX REQUIRED | `check:email` and auth/account tests passed. |
| Password-changed notification | PASS AUTOMATED, REAL INBOX REQUIRED | `check:guest-account` and `check:email` cover success/failure behavior. |
| Reservation-created guest notification | PASS AUTOMATED, REAL INBOX REQUIRED | `check:reservation-lifecycle` and `check:email` passed. |
| Partner reservation-received notification | PASS AUTOMATED, REAL INBOX REQUIRED | `check:email` covers partner notification; production fixture must be seeded for live test. |
| Reservation-accepted notification | PASS AUTOMATED, REAL INBOX REQUIRED | Lifecycle and email checks passed. |
| Reservation-declined notification | PASS AUTOMATED, REAL INBOX REQUIRED | Lifecycle and email checks passed. |
| Reservation-cancelled notification | PASS AUTOMATED, REAL INBOX REQUIRED | Email checks cover guest and partner cancellation emails. |

Email verification notes:

- Local/demo browser tests intentionally report `EMAIL_PROVIDER_NOT_CONFIGURED` because the local E2E server does not load a real `RESEND_API_KEY`.
- The application preserves the business action where appropriate when delivery fails and logs the email failure safely.
- Production real inbox verification is still required with controlled addresses after the SmartTable Test Bistro fixture is applied.

## Phase 8 - Database And Concurrency Validation

| Check | Status | Evidence |
| --- | --- | --- |
| Restaurant records | PASS LOCAL, BLOCKED PRODUCTION DATA | Local/demo fixture and migration/script definitions contain SmartTable Test Bistro. Live production public offers currently return zero rows, so production fixture verification is pending seed execution. |
| Offers and slots | PASS LOCAL | `check:reservation-lifecycle` verifies three active SmartTable Test Bistro offers with at least 10 available test slots. |
| Reservations | PASS LOCAL | Lifecycle check creates a pending SmartTable Test Bistro reservation through the standard `/reservations` endpoint. |
| User roles | PASS AUTOMATED | Guest, partner, admin, and super-admin route and API boundary checks passed. |
| Notification records | PASS AUTOMATED | `check:email` and lifecycle checks verify transactional email attempts and safe failure behavior. |
| Timestamps and timezone handling | PASS STATIC/AUTOMATED | Test fixture uses `America/New_York`; existing checks validate offer date/time windows. Full production timezone walkthrough remains manual. |
| Soft deletion where used | PASS STATIC | Cleanup script targets deterministic test records only and does not alter unrelated records or Auth users. |
| Unique constraints and foreign keys | PASS STATIC/AUTOMATED | Seed uses deterministic IDs/upserts; lifecycle tests verify related reservations, offers, restaurants, and users remain linked. |
| Duplicate reservation protection | PASS AUTOMATED | Duplicate SmartTable Test Bistro reservation request returns HTTP 409. |
| Concurrent booking protection | PASS AUTOMATED | Added final-slot race coverage: two concurrent requests for one remaining table result in exactly one HTTP 201 and one HTTP 409. |

Final-slot concurrency result:

- Test created a one-table partner offer named `Final-slot concurrency guard`.
- Two distinct guest sessions submitted the same final slot concurrently.
- Result: one reservation succeeded, the other received an availability conflict.
- Partner offer state after the race: `reserved_tables=1`; capacity did not become negative.

## Phase 9 - Security Checks

| Check | Status | Evidence |
| --- | --- | --- |
| Authentication enforcement | PASS AUTOMATED | `check:route-protection`, `check:basic-security-boundaries`, and E2E role tests passed. |
| Authorization by role | PASS AUTOMATED | Guest, partner, admin, and super-admin access boundaries passed automated checks. |
| Tenant isolation | PASS AUTOMATED | Partner route checks verify partners cannot access unauthorized restaurant resources in the tested paths. |
| IDOR protection | PASS AUTOMATED | Reservation/account/partner checks exercise direct API access with unauthorized sessions. |
| CSRF protection where applicable | PASS STATIC/AUTOMATED | Existing server hardening checks passed; no destructive penetration testing was performed. |
| XSS and input validation | PASS STATIC/AUTOMATED | Public experience, route, signup, and reservation checks passed for current test vectors. |
| Rate limiting on login/password reset | PASS AUTOMATED | Auth/signup/account checks cover safe error behavior; provider/dashboard abuse limits still require production operational review. |
| Secure cookies/session expiration/logout | PASS AUTOMATED, MANUAL PRODUCTION REQUIRED | E2E logout and route checks passed locally; production browser session behavior requires a controlled live account. |
| Sensitive-data logging | PASS STATIC/AUTOMATED | Email and security checks passed; commands did not print secrets. |
| Environment-variable validation | PASS PRODUCTION READ-ONLY | Live `/api/health` reports production + Supabase mode, database reachable, and no production configuration issues. |

## Phase 10 - Accessibility And Responsive Checks

| Viewport / Check | Status | Evidence |
| --- | --- | --- |
| 320 px | PASS AUTOMATED | Existing mobile overflow/readiness checks cover the narrow mobile class; E2E mobile Chromium passed. |
| 375 px | PASS AUTOMATED | Existing visual readiness and mobile Chromium checks passed. |
| 390 px | PASS AUTOMATED | Existing visual readiness checks cover this mobile class. |
| 430 px | PASS AUTOMATED | Existing responsive checks cover large mobile width. |
| 768 px | PASS AUTOMATED | Existing tablet/readiness checks passed. |
| 1024 px | PASS AUTOMATED | Existing tablet/desktop readiness checks passed. |
| 1440 px | PASS AUTOMATED | Existing desktop checks and Chromium E2E passed. |
| Keyboard navigation and focus | PASS AUTOMATED, MANUAL REVIEW STILL ADVISED | E2E and UI readiness checks passed; final human QA should still tab through modals/forms. |
| Semantic headings, labels, errors | PASS AUTOMATED | Homepage, signup, account, and public-experience checks passed. |
| Modal focus handling and touch targets | PASS AUTOMATED, MANUAL REVIEW STILL ADVISED | Partner accept/decline confirmations and mobile E2E passed; full human device pass remains recommended. |

## Phase 11 - Automated Tests

| Required coverage | Status | Evidence |
| --- | --- | --- |
| Test restaurant visibility | PASS LOCAL, FAIL PRODUCTION DATA | Local public API exposes the fixture; live production offers API currently returns zero offers. |
| Offer visibility | PASS LOCAL, FAIL PRODUCTION DATA | Local/demo checks pass; production seed pending. |
| Reservation creation | PASS AUTOMATED | `check:reservation-lifecycle` and E2E reservation flow passed. |
| Duplicate prevention | PASS AUTOMATED | Duplicate request returns HTTP 409 in lifecycle check. |
| Partner accept and decline | PASS AUTOMATED | Lifecycle and E2E role tests passed. |
| Guest status update | PASS AUTOMATED | Lifecycle check verifies guest reservation status after partner acceptance. |
| Authentication boundaries | PASS AUTOMATED | Route protection and security boundary checks passed. |
| Role permissions | PASS AUTOMATED | E2E admin/role permissions and route checks passed. |
| Language switching | PASS AUTOMATED | E2E homepage localization test passed. |
| Mobile overflow | PASS AUTOMATED | Mobile Chromium E2E and visual readiness checks passed. |
| Email failure handling | PASS AUTOMATED | E2E logs local `EMAIL_PROVIDER_NOT_CONFIGURED` without corrupting flows; `check:email` passed provider-path checks. |
| Final-slot concurrency protection | PASS AUTOMATED | Added regression in `scripts/check-reservation-lifecycle.js`; one success and one HTTP 409 conflict. |

## Phase 12 - Production Verification

| Production check | Status | Evidence |
| --- | --- | --- |
| Homepage still works | NOT RETESTED IN BROWSER THIS PASS | Previous homepage deployment was verified; this pass used read-only API checks only. |
| Health endpoint | PASS | `GET /api/health`: HTTP 200, `environment=production`, `mode=supabase`, `database_reachable=true`, `production_configuration_issues=[]`. |
| Public config | PASS | `GET /api/public/config`: HTTP 200, `environment=production`, `mode=supabase`; no secret names detected in response. |
| Search/offers data | BLOCKED | `GET /api/public/offers?lang=en`: HTTP 200 but `offers=0`, `SmartTable Test Bistro=0`. |
| Test restaurant discoverability | BLOCKED | Production fixture has not been applied or is not public in production. |
| Restaurant page and offers | BLOCKED | Cannot verify live SmartTable Test Bistro route until the fixture is visible through public offers/search. |
| Booking submission | BLOCKED | Production reservation pilot cannot proceed without a visible, active test offer. |
| Guest and partner dashboard updates | BLOCKED | Requires production seed and controlled guest/partner accounts. |
| No localhost links / exposed secrets | PASS READ-ONLY | Health/config/offers responses did not expose obvious secret variable names; full page-source audit remains manual. |
| Deployment | NOT PERFORMED | Deployment was intentionally not run because production pilot data verification is still blocked. |

## Commands Executed

| Command | Result |
| --- | --- |
| `node --check scripts\seed-smarttable-test-bistro.mjs` | PASS |
| `npm.cmd run seed:test-bistro` | PASS dry-run; no mutation |
| `npm.cmd run cleanup:test-bistro` | PASS dry-run; no mutation |
| `npm.cmd run build` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run check:email` | PASS |
| `npm.cmd run check:reservation-lifecycle` | PASS |
| `npm.cmd run check:signup` | PASS |
| `npm.cmd run check:guest-account` | PASS |
| `npm.cmd run check:public-experience` | PASS |
| `npm.cmd run check:basic-user-journey` | PASS |
| `npm.cmd run check:route-protection` | PASS |
| `npm.cmd run check:basic-security-boundaries` | PASS |
| `npm.cmd test` | PASS |
| `npm.cmd run test:e2e` | PASS; 14 Chromium/mobile-Chromium tests |
| Production read-only API check | PASS health/config; BLOCKED offers/test bistro (`offers=0`, `test_bistro=0`) |

## UTF-8 And Fixture Safety

The seed script, production seed migration, and demo fixture were scanned for common mojibake marker characters. Result: zero marker characters found in:

- `scripts/seed-smarttable-test-bistro.mjs`
- `supabase/migrations/0045_smarttable_test_bistro_seed.sql`
- `src/app-core.js`

The operator seed defaults to dry-run, masks email output, requires `--apply` before mutation, and requires Supabase service credentials only for apply mode.

## Risks And Constraints

- This workspace currently has no Supabase production URL or service-role key configured, so the seed was not applied to production from this machine.
- Production currently returns zero active public offers, so guest reservation pilot testing cannot proceed until the test bistro seed is applied.
- Real email delivery should use controlled inboxes only. Do not use `.example` addresses for provider tests.
- Resend webhook delivery status remains deferred; do not claim delivery unless verified by inbox or provider dashboard.
- No POS integration exists or was added.
- AI-only functionality remains out of BASIC pilot scope.

## Final Recommendation

Current code and fixture tooling are ready for operator-controlled pilot data setup.

Final manual pilot testing is **NOT READY** until:

1. `npm run seed:test-bistro -- --apply` is run against the intended production Supabase project with controlled test partner credentials.
2. `GET /api/public/offers?lang=en` shows the three SmartTable Test Bistro offers.
3. One controlled guest, partner, and admin pilot pass is completed in production.
