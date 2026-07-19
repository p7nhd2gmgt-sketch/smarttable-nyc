# SmartTable BASIC Final QA

Date of verification: 2026-07-19

## Environment Tested

| Item | Value |
| --- | --- |
| Project root | `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking` |
| Local URL | `http://localhost:4173` |
| Local mode | Demo mode, reported by `/api/health` |
| Platform scope | BASIC discounted restaurant reservation marketplace |
| Branch | `main` |
| Commit | `fd91adf91beb860017e8fff4c2360f66a2348be0` |
| Email provider | Resend, backend-only |
| Verified sender expected | `SmartTable <reservations@mail.smarttablenyc.com>` |
| Webhook delivery tracking | Deferred |

Secrets were not printed or stored in this report.

## Architecture Summary

SmartTable BASIC is a Node-backed web application with a shared frontend shell, shared API layer, common authentication/session handling, shared restaurant/offer/reservation data, localized UI strings, and role-aware guest, partner, admin, and Super Admin experiences. The application supports demo data locally when Supabase values are not configured. In production, Supabase-backed persistence and server-side Resend email delivery are expected.

The current BASIC release scope intentionally excludes AI Concierge, AI Demand Engine, AI scoring, AI route planning, AI calendar synchronization, Stripe monetization, POS integrations, and Resend webhook delivery activation.

## Commands Executed

| Command | Result |
| --- | --- |
| `npm.cmd run check:basic-ui-behavior` | PASS |
| `npm.cmd run check:basic-visual-readiness` | PASS |
| `npm.cmd run check:reservation-lifecycle` | PASS |
| `npm.cmd run check:email` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd test` | PASS |
| `Invoke-RestMethod -Uri http://localhost:4173/api/health` | PASS: `ok=true`, `mode=demo` |

## Browser Coverage

| Browser / engine | Status | Notes |
| --- | --- | --- |
| Microsoft Edge Chromium headless | PARTIAL PASS | Used for rendered route shell checks, responsive overflow metrics, and direct `/login` verification. |
| In-app browser | BLOCKED | Windows sandbox failed with `CreateProcessAsUserW failed: 5`. |
| Chrome desktop | NOT VERIFIED | Requires human/manual QA. |
| Firefox desktop | NOT VERIFIED | Requires human/manual QA. |
| Safari/WebKit | NOT VERIFIED | Requires human/manual QA on available hardware or WebKit-capable tooling. |
| Physical mobile browser | NOT VERIFIED | Requires human/manual QA. |

## Viewport Sizes Tested

Rendered Edge/CDP overflow checks were executed for:

- `320x800`
- `375x667`
- `390x844`
- `430x932`
- `768x1024`
- `1024x768`
- `1366x768`
- `1440x900`

Route-shell checks included `/`, `/restaurants`, `/signup`, `/login`, `/forgot-password`, `/account`, `/partner`, and `/admin` at representative phone, tablet, and desktop widths. Tested combinations returned no page-level horizontal overflow after the mobile-header fix.

## Guest Flows Tested

Automated/API/static checks verify:

- guest signup validation and consent requirements;
- guest login route rendering regression;
- duplicate email handling;
- guest account and preferences APIs;
- favorite creation and listing;
- reservation request creation;
- duplicate reservation prevention;
- pending reservation display;
- cancellation rules in lifecycle tests;
- BASIC mode hiding AI-only public sections.

Manual browser testing is still required for full human interaction through signup, login, booking modal, favorites, account tabs, and cancellation confirmation.

## Partner Flows Tested

Automated/API/static checks verify:

- partner login role;
- partner cannot access admin routes;
- partner profile loads;
- partner offer create/edit/deactivate;
- partner cannot access another restaurant through the checked API paths;
- incoming pending reservations are visible;
- pending to accepted and pending to rejected transitions;
- repeated accept/decline is idempotent;
- confirmation text and warning style are present in source;
- no AI-only partner demand controls appear publicly in BASIC mode.

Manual browser testing is still required for dashboard interaction, offer forms, status filters, and tablet/mobile operational use.

## Admin And Super Admin Flows Tested

Automated/API/static checks verify:

- guest and partner users cannot use admin APIs;
- regular admin can read ordinary admin resources;
- regular admin cannot edit Super Admin-only platform mode;
- Super Admin can read editable platform mode state;
- admin content, restaurant, offer, partner/user, and reservation endpoint access;
- email diagnostics are Super Admin-only.

Manual browser testing is still required for rendered admin tables, content editing, platform-mode controls, email diagnostics UI, destructive confirmations, and role management.

## Email Flows Tested

`npm.cmd run check:email` passed and covers:

- provider configuration checks;
- welcome/registration;
- email verification;
- forgot password;
- password changed;
- guest pending reservation;
- partner new reservation notice;
- accepted reservation guest email;
- declined reservation guest email;
- guest and partner cancellation emails;
- post-visit feedback eligibility and duplicate prevention;
- missing recipient and missing partner notification email handling;
- provider failure preserving valid reservation state;
- queue, idempotency, retry behavior, diagnostics masking, and localized templates.

Real inbox delivery was not re-tested in this pass. Webhook delivery status remains deferred, so provider acceptance must not be described as delivered.

## Localization Results

Automated checks verify English, Spanish, and Hungarian keys for BASIC navigation, guest search, auth/account, reservation statuses, partner labels, admin labels, loading, empty, error, and route states. Hungarian and Spanish visual wrapping still require manual rendered-browser review.

## Accessibility Findings

Automated/static and Edge DOM probes found:

- skip link present;
- main region present;
- focus-visible styling present;
- no unlabeled visible controls in checked route shells;
- no nameless buttons in checked route shells;
- no checked `img` elements missing `alt`;
- modal keyboard handling and Escape handling present in source;
- warning/destructive button styles distinct.

Manual keyboard, screen reader, contrast, zoom, touch target, and native date/time control review remain required before full production sign-off.

## Security And Tenant-Isolation Findings

Automated checks passed for:

- protected guest, partner, admin, and Super Admin routes;
- guest cannot access partner/admin routes;
- partner cannot request another restaurant reservation list by `restaurant_id`;
- regular admin does not receive Super Admin platform-mode permission;
- BASIC mode hides AI-only routes/features through feature guards;
- reservation status transitions and repeated actions are controlled server-side in lifecycle checks.

This was not an invasive penetration test. Production Supabase RLS, secrets, CORS, and deployment environment configuration still require a production readiness review.

## Phase 12 Error And Empty-State Matrix

| Scenario | Verification Status | Notes |
| --- | --- | --- |
| No restaurants | PARTIAL STATIC | Empty-state components and copy exist; seeded demo data was not destructively cleared. |
| No active offers | PARTIAL STATIC | `offers_empty` UI state and inactive/expired/sold-out offer filters are checked. |
| Search has no result | PARTIAL STATIC | Search is client-side in the current app; no-result copy exists. Public API query does not currently filter by the same search field. |
| Partner has no reservations | PARTIAL STATIC | Empty/list states exist; no destructive data-clearing test was run. |
| Admin has no users to display | MANUAL REQUIRED | Admin empty table state needs manual verification with appropriate data setup. |
| Image fails | PARTIAL STATIC | Fallback image paths and alt strings are checked; actual broken-image rendering still needs manual browser QA. |
| API request fails | PARTIAL STATIC | Fatal app error and retry UI are present; full network-failure browser simulation not completed. |
| Database temporarily unavailable | MANUAL/STAGING REQUIRED | Local run is demo mode; production-like Supabase outage behavior requires staging test. |
| Email sending fails | PASS AUTOMATED | Email failure preserves reservation/account state and reports truthful delivery state. |
| Session expires | FIXED/PASS STATIC | `isGuestSession()` now requires a real session; session-expired guest fallback renders guest login. |
| Object deleted in another tab | PARTIAL AUTOMATED | Not-found/unavailable paths and status validation exist; manual multi-tab browser test still required. |
| Refresh during form submission | PARTIAL AUTOMATED | Duplicate submission/idempotency protection is tested; actual refresh UX still manual. |
| Reservation becomes unavailable before submit completes | PASS AUTOMATED | Server-side inactive/expired/sold-out/date/time/party-size validation is tested. |

## Defects Found

| Severity | Defect | Status |
| --- | --- | --- |
| P1 | Direct `/login` for a logged-out user could remain on the loading skeleton because missing session data was treated as a guest session and caused a route loop. | FIXED |
| P2 | Mobile header actions could clip or visually overflow on phone-width rendering. | FIXED |
| P3 | Public/demo header still exposes Partner and Super Admin entry buttons. | DOCUMENTED; existing product/demo behavior, not changed in this pass. |

## Defects Fixed

- `public/app.js`: `isGuestSession()` now requires an actual current session before returning true.
- `public/app.js`: direct guest `/login` and guest session-expired fallback now use `renderGuestLogin()`.
- `public/styles.css`: mobile header actions now use a contained two-column grid with wrapped labels and language controls participating in the same grid.
- `scripts/check-basic-ui-behavior.js`: added regression assertions for logged-out guest login route handling.
- `scripts/check-basic-visual-readiness.js`: added regression assertions for mobile header containment.

## Remaining Known Issues

| Severity | Issue | Release Impact |
| --- | --- | --- |
| P2 | Full interactive browser QA for authenticated guest/partner/admin/Super Admin workflows is still manual. | Does not block code release if operational team accepts documented manual QA follow-up. |
| P2 | Safari/WebKit, Firefox, and physical mobile browsers were not verified in this environment. | Requires manual cross-browser QA. |
| P2 | Database-unavailable behavior needs a staging outage/configuration test. | Requires staging/production-like environment. |
| P3 | Public header includes operational portal entry buttons in the local/demo shell. | Review before public marketing launch if those should be hidden. |

No unresolved P0 or P1 issue was identified.

## Screenshots

Headless Edge screenshots were generated during QA to inspect homepage and login rendering, then removed as temporary artifacts after results were documented. No screenshot files are retained in the repository from this pass.

## Release Recommendation

B. RELEASE READY WITH DOCUMENTED MINOR ISSUES

Rationale:

- No unresolved P0 defects.
- No unresolved P1 defects.
- Mandatory automated checks pass.
- Primary BASIC reservation and email workflows pass automated validation.
- Remaining gaps are documented P2/P3 manual verification items and browser/device coverage limits.

Next recommended step:

Begin SmartTable Enterprise Phase 3.1.1 - SaaS Platform Foundation & Monetization Architecture in a new branch and separate change set.
