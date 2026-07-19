# SmartTable BASIC Final QA Report

Date: 2026-07-19

Final recommendation: **B. CONDITIONALLY READY**

SmartTable BASIC has passed the available automated, API, static, route-boundary, email, localization, architecture, and reservation-lifecycle checks. It should not yet be marked fully production-ready because rendered browser/device QA could not be completed in this environment.

## Executive Summary

SmartTable BASIC is currently code-check ready for manual launch QA:

- BASIC marketplace flows are covered by automated/static checks.
- Guest, partner, admin, and Super Admin route boundaries passed non-destructive authorization checks.
- Reservation lifecycle checks passed, including duplicate submission, ownership, partner authorization, accepted/declined/cancelled/completed transitions, and duplicate email protection.
- Email infrastructure checks passed; Resend sending remains configured from previous work.
- AI Concierge and unfinished AI functionality remain hidden in BASIC mode through the platform mode and feature registry.
- POS integration remains prohibited and was not added.
- Resend webhook delivery tracking remains intentionally **DEFERRED**.

The remaining launch gate is manual rendered-browser QA across the required browsers, devices, viewports, and assistive-technology checks.

## Date And Environment

| Field | Value |
| --- | --- |
| Date | 2026-07-19 |
| Project root | `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking` |
| Runtime | Node via npm scripts |
| Application URL checked | `http://localhost:4173` |
| Local health check | `GET /api/health` returned `ok: true` |
| App mode during health check | `demo` |
| Public base URL reported | `https://smarttable.com` |
| Platform scope | BASIC only |
| Webhook status | DEFERRED |
| AI Concierge | Not activated |
| POS integration | Prohibited; not added |

## Git Branch And Commit

| Field | Value |
| --- | --- |
| Branch | `main` |
| Commit | `fd91adf91beb860017e8fff4c2360f66a2348be0` |

Note: The working tree already contains many existing modified/untracked files from the broader SmartTable workstream. This report covers the files changed for the current QA/security/documentation pass.

## Application URL Used

- `http://localhost:4173`

The local API health endpoint responded successfully. Rendered page verification in a browser was not completed because browser automation is blocked in this environment.

## Automated Checks

| Command | Result |
| --- | --- |
| `npm.cmd run check:basic-ui` | PASS |
| `npm.cmd run check:basic-ui-behavior` | PASS |
| `npm.cmd run check:public-experience` | PASS |
| `npm.cmd run check:guest-design-system` | PASS |
| `npm.cmd run check:route-protection` | PASS |
| `npm.cmd run check:routes` | PASS |
| `npm.cmd run check:architecture` | PASS |
| `npm.cmd run check:email` | PASS |
| `npm.cmd run check:basic-visual-readiness` | PASS |
| `npm.cmd run check:basic-security-boundaries` | PASS |
| `npm.cmd run check:platform-mode` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd test` | PASS |

Additional runner discovery:

- No Playwright, Cypress, Puppeteer, axe, or pa11y npm runner is configured.
- `npm.cmd test` now includes `check:basic-visual-readiness` and `check:basic-security-boundaries`.

## Manual Journeys Tested

Rendered manual journeys were **not completed** in this environment.

Reason:

- Browser automation/attachment is unavailable here due the local Windows browser launch limitation previously observed as `CreateProcessAsUserW failed: 5`.

Manual journeys still required:

- New guest on mobile.
- Returning guest on desktop.
- Partner on tablet.
- Partner on mobile during service.
- Super Admin on desktop.
- English, Spanish, and Hungarian rendered flows.
- Slow network behavior.
- Invalid data behavior.
- Session expiration behavior.
- Permission-denied behavior.

These are listed step by step in `docs/BASIC-Launch-Manual-QA-Checklist.md`.

## Browser Matrix

| Browser target | Result | Notes |
| --- | --- | --- |
| Chrome | NOT VERIFIED | No successful browser session in this environment. |
| Microsoft Edge | NOT VERIFIED | No successful browser session in this environment. |
| Safari / WebKit | NOT VERIFIED | No project WebKit runner is configured. |
| iOS Safari | NOT VERIFIED | Requires real device or remote/manual simulator QA. |
| Android Chrome | NOT VERIFIED | Requires real device or manual mobile browser QA. |

## Device And Viewport Matrix

Static responsive readiness checks represent these viewports, but rendered visual QA is still required.

| Viewport | Static readiness | Rendered browser result |
| --- | --- | --- |
| `1440 x 900` | PASS | NOT VERIFIED |
| `1366 x 768` | PASS | NOT VERIFIED |
| `1280 x 720` | PASS | NOT VERIFIED |
| `1024 x 768` | PASS | NOT VERIFIED |
| `820 x 1180` | PASS | NOT VERIFIED |
| `768 x 1024` | PASS | NOT VERIFIED |
| `430 x 932` | PASS | NOT VERIFIED |
| `390 x 844` | PASS | NOT VERIFIED |
| `375 x 667` | PASS | NOT VERIFIED |
| `360 x 800` | PASS | NOT VERIFIED |

## Role Matrix

| Role | Boundary result | Evidence |
| --- | --- | --- |
| Public / unauthenticated | PASS | Public endpoints accessible; protected guest/partner/admin APIs return unauthorized. |
| Guest | PASS | Guest account data accessible only to guest role; partner/admin APIs blocked. |
| Partner | PASS | Partner profile/reservations scoped to assigned restaurant; admin routes blocked. |
| Admin | PASS | Admin data available; Super Admin platform-mode mutation blocked. |
| Super Admin | PASS | Editable platform-mode settings available. |

## Localization Matrix

| Language | Static/API result | Rendered visual result |
| --- | --- | --- |
| English | PASS | NOT VERIFIED |
| Spanish | PASS | NOT VERIFIED |
| Hungarian | PASS | NOT VERIFIED |

Localization changes completed in this QA pass:

- Guest search labels were added to EN/ES/HU locales.
- Super Admin sidebar/header labels were added to EN/ES/HU locales.
- Super Admin sidebar/header rendering now uses translation keys.

## Accessibility Results

Static accessibility readiness result: PASS.

Verified by static checks:

- skip link and main landmark;
- focus-visible CSS;
- modal role and `aria-modal`;
- Escape and Tab modal key handling;
- focus restoration hook;
- labeled generated form controls;
- loading and alert state hooks;
- reduced-motion CSS;
- warning/destructive action styling;
- language switch `aria-pressed` behavior.

Still manual:

- real keyboard traversal;
- screen reader announcements;
- color contrast measurement;
- 200% zoom;
- real touch target verification;
- native date/time picker behavior.

## Security Boundary Results

New check added:

- `npm.cmd run check:basic-security-boundaries`

Result: PASS.

Reviewed and verified:

- public routes are public;
- guest routes require guest authentication where appropriate;
- partner routes require partner authorization;
- admin routes require admin authorization;
- Super Admin edit actions require Super Admin authorization;
- hidden UI is not the only authorization mechanism;
- partner accounts cannot manage another restaurant's resources;
- resolved reservation replay/invalid transitions are covered by lifecycle checks;
- BASIC mode hides unfinished AI functionality through direct route/feature visibility checks.

Limitations:

- No invasive penetration testing was performed.
- Production Supabase RLS/security policy review still requires production-environment access and deployment-specific configuration review.

## Defects Fixed

| Defect | Fix |
| --- | --- |
| Guest hero search panel relied on fallback text for several visible labels. | Added EN/ES/HU locale keys for guest search title, placeholder, filter defaults, and buttons. |
| Super Admin sidebar/header included fixed English labels. | Added EN/ES/HU admin nav/header keys and updated rendering to use `t(...)`. |
| Phase 21 security boundaries were only indirectly covered by multiple checks. | Added a dedicated non-destructive `check:basic-security-boundaries` script and included it in `npm test`. |
| Manual QA checklist left Pass/Fail fields blank. | Marked all still-manual rows as `MANUAL VERIFICATION REQUIRED`. |

## Known Limitations

- Browser visual QA is not completed.
- Cross-browser QA is not completed.
- Real mobile QA is not completed.
- Manual accessibility QA is not completed.
- Resend webhook delivery tracking is deferred by product decision.
- AI Concierge remains out of BASIC launch scope.
- Reservation-platform integrations such as Resy, OpenTable, or SevenRooms are future work and were not implemented in this QA pass.
- POS integrations remain prohibited.

## Phase 24 Human QA Handoff

The human browser-testing handoff has been added to `docs/BASIC-Launch-Manual-QA-Checklist.md`.

It includes:

- exact local startup command;
- exact local URL;
- demo/test account credentials currently documented for QA;
- guest, partner, admin, and Super Admin test sequences;
- English, Spanish, and Hungarian localization checks;
- desktop, tablet, and mobile viewport checks;
- failure-recording instructions;
- required screenshots;
- BASIC completion criteria;
- a result table for Chrome desktop, Edge desktop, and mobile.

Current status: **MANUAL VERIFICATION REQUIRED**.

Browser-control attempt on July 19, 2026: **BLOCKED** by the local Windows launch restriction `CreateProcessAsUserW failed: 5`. No real browser, Safari/WebKit, or mobile-device visual QA is marked as passed from this environment.

## Release Gate Inspection: July 19, 2026

Scope: SmartTable BASIC only. No AI Concierge, AI Demand Engine, POS integration, Stripe, webhook expansion, or reservation-platform integration work was started.

Repository and environment:

- Project root: `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking`
- Git branch: `main`
- Git commit at inspection: `fd91adf91beb860017e8fff4c2360f66a2348be0`
- Frontend: static HTML/CSS/JavaScript served from `public/`
- Backend: Node.js HTTP server in `server.js` with API routing through `src/app-core.js`
- Database/auth target: Supabase PostgreSQL/Auth in production; local demo mode when Supabase keys are empty
- Email provider: Resend through backend-only `src/email-service.js`
- Local command: `npm run dev`
- Local URL: `http://localhost:4173`

Local environment status, without exposing values:

| Variable | Defined | Non-empty |
| --- | --- | --- |
| `PORT` | yes | yes |
| `PUBLIC_BASE_URL` | yes | yes |
| `SUPABASE_URL` | yes | no |
| `SUPABASE_ANON_KEY` | yes | no |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | no |
| `EMAIL_FROM` | yes | yes |
| `EMAIL_REPLY_TO` | yes | yes |
| `RESEND_API_KEY` | yes | yes |
| `RESEND_WEBHOOK_SECRET` | yes | no |

Local startup/API smoke checks:

| Check | Result |
| --- | --- |
| `GET /api/health` | PASS: returned `ok: true`, `mode: demo` |
| `GET /` | PASS: returned HTTP 200 |
| `GET /app.js?v=guest-account-1` | PASS: returned HTTP 200 |
| `GET /styles.css?v=guest-account-1` | PASS: returned HTTP 200 |
| `GET /locales/hu.json` | PASS: returned localized content |
| `GET /api/public/content?lang=hu` | PASS: returned content payload |
| `GET /api/public/offers?lang=en` | PASS: returned public offer data |

Automated release gates executed:

| Command | Result |
| --- | --- |
| `npm.cmd ls --depth=0` | PASS: no package dependencies are installed/required |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd run check:platform-mode` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd test` | PASS |

Browser verification:

- In-app browser connection attempt: BLOCKED by `CreateProcessAsUserW failed: 5`.
- Chrome desktop: NOT VERIFIED.
- Edge desktop: NOT VERIFIED.
- Safari/WebKit: NOT VERIFIED.
- Mobile browser/device: NOT VERIFIED.
- No manual browser journey is marked as passed.

Release-gate conclusion: automated and HTTP smoke checks are green, but production release still requires the human browser/device QA checklist before BASIC can be declared production-ready.

## Phase 4-5 Guest and Partner QA Attempt: July 19, 2026

Requested scope:

- Phase 4: complete guest experience manual QA from a clean browser session.
- Phase 5: complete restaurant partner experience manual QA.

Browser execution status:

- In-app browser launch: **BLOCKED** by `CreateProcessAsUserW failed: 5`.
- Clean browser session: **NOT VERIFIED**.
- Visual guest journey: **NOT VERIFIED**.
- Visual partner journey: **NOT VERIFIED**.
- No click-through browser flow is marked PASS.

Non-browser checks completed during this phase:

| Area | Check | Result |
| --- | --- | --- |
| Local server | `GET /api/health` | PASS |
| Public landing page | `GET /` | PASS |
| Restaurant discovery data | `GET /api/public/offers?lang=en` | PASS |
| Guest public experience | `npm.cmd run check:public-experience` | PASS |
| Guest registration | `npm.cmd run check:signup` | PASS |
| Guest account | `npm.cmd run check:guest-account` | PASS |
| Reservation lifecycle | `npm.cmd run check:reservation-lifecycle` | PASS |
| BASIC UI behavior | `npm.cmd run check:basic-ui-behavior` | PASS |
| Route protection | `npm.cmd run check:route-protection` | PASS |

Guest flow status:

- Public data/API availability: **PASS**.
- Signup/account/reservation lifecycle static and automated checks: **PASS**.
- Browser validation of navigation, modals, form interaction, duplicate-click behavior, visual status labels, favorites, and ratings: **MANUAL VERIFICATION REQUIRED**.

Partner flow status:

- Partner authorization and reservation lifecycle automated checks: **PASS**.
- Browser validation of partner login, profile edit UI, offer forms, reservation action buttons, refresh persistence, and dashboard statistics: **MANUAL VERIFICATION REQUIRED**.

No product defect was confirmed from the executable checks. No application code was changed for this phase.

## Phase 6-7 Admin, Super Admin, and Email QA Attempt: July 19, 2026

Requested scope:

- Phase 6: admin and Super Admin role security, restaurant/offer/user/content/platform management checks.
- Phase 7: implemented email-triggering workflow inspection.

Browser execution status:

- In-app browser launch: **BLOCKED** by `CreateProcessAsUserW failed: 5`.
- Microsoft Edge Chromium headless/CDP: **PARTIALLY VERIFIED** for public/auth/protected route shells and responsive overflow metrics.
- Admin UI browser flow: **NOT VERIFIED**.
- Super Admin UI browser flow: **NOT VERIFIED**.
- Email diagnostics UI browser flow: **NOT VERIFIED**.
- No authenticated admin/super-admin browser workflow is marked PASS.

Phase 8-11 browser and responsive verification:

| Area | Result |
| --- | --- |
| Homepage Edge overflow matrix | PASS at `320x800`, `375x667`, `390x844`, `430x932`, `768x1024`, `1024x768`, `1366x768`, `1440x900` |
| Public/auth/protected route shell overflow | PASS at `320x800`, `390x844`, `768x1024`, `1366x768` for `/`, `/restaurants`, `/signup`, `/login`, `/forgot-password`, `/account`, `/partner`, `/admin` |
| 320px homepage screenshot | PASS after fix: header and hero fit, no page-level horizontal overflow |
| 390px guest login screenshot | PASS after fix: dedicated guest login card renders, no page-level horizontal overflow |
| Accessibility DOM probe | PASS for no unlabeled basic controls, nameless buttons, or missing image `alt` attributes on checked route shells |
| Chrome desktop | NOT VERIFIED |
| Firefox desktop | NOT VERIFIED |
| Safari/WebKit | NOT VERIFIED |
| Physical mobile browser | NOT VERIFIED |

Phase 8-11 defects fixed:

| Defect | Root Cause | Fix |
| --- | --- | --- |
| Mobile header actions could be clipped in a rendered phone-width capture. | The phone/tablet header still allowed a three-column action layout and nested language switcher behavior that could exceed the available visual width. | `public/styles.css` now uses a contained two-column mobile action grid below `760px`, wraps long button labels, and makes language controls participate in the same grid. |
| Direct `/login` for logged-out users could remain on the loading skeleton through a navigation loop. | `isGuestSession()` treated a missing session as a guest because `normalizeRole(undefined)` defaults to `guest`; direct guest login route also called the generic dashboard login renderer. | `public/app.js` now requires an actual session for `isGuestSession()` and routes direct guest login/session-expired guest fallback to `renderGuestLogin()`. |

Live API role/security smoke checks:

| Check | Result |
| --- | --- |
| Guest role login returns `guest` role | PASS |
| Partner role login returns `partner` role | PASS |
| Regular admin login returns `admin` role | PASS |
| Super Admin login returns `super_admin` role | PASS |
| Guest cannot PATCH platform mode | PASS: `403` |
| Partner cannot PATCH platform mode | PASS: `403` |
| Regular admin cannot PATCH platform mode | PASS: `403` |
| Regular admin can read platform mode and `can_edit=false` | PASS |
| Super Admin can read platform mode and `can_edit=true` | PASS |

Admin endpoint smoke results:

| Endpoint | Regular Admin | Super Admin |
| --- | --- | --- |
| `/api/admin/stats` | `200` | `200` |
| `/api/admin/restaurants` | `200` | `200` |
| `/api/admin/offers` | `200` | `200` |
| `/api/admin/reservations` | `200` | `200` |
| `/api/admin/partners` | `200` | `200` |
| `/api/admin/content` | `200` | `200` |
| `/api/admin/notifications` | `200` | `200` |
| `/api/admin/settings/platform-mode` | `200`, read-only | `200`, editable |
| `/api/admin/email-diagnostics` | `403` | `200` |
| `/api/admin/email-queue` | `403` | `200` |

Current live admin data observed:

| Data area | Count |
| --- | ---: |
| Restaurants | 2 |
| Offers | 2 |
| Reservations | 3 |
| Partners | 1 |
| Content records | 784 |
| Admin notifications | 0 |
| Email diagnostic logs | 1 |

Automated checks executed for Phase 6:

| Check | Result |
| --- | --- |
| `npm.cmd run check:route-protection` | PASS |
| `npm.cmd run check:basic-security-boundaries` | PASS |
| `npm.cmd run check:platform-mode` | PASS |
| `npm.cmd run check:basic-ui` | PASS |
| `npm.cmd run check:routes` | PASS |

Email workflow verification:

| Area | Status |
| --- | --- |
| Provider | PASS: Resend |
| Verified sender | PASS: `SmartTable <reservations@mail.smarttablenyc.com>` in code/config checks |
| Real send capability | PASS from diagnostics: `can_send_real_email=true` |
| Registration/welcome templates | PASS via `check:email` |
| Email verification template/trigger | PASS via `check:email` |
| Password reset/password changed template/trigger | PASS via `check:email` |
| Guest reservation request email | PASS via `check:email` |
| Partner reservation request email | PASS via `check:email` |
| Reservation accepted email | PASS via `check:email` |
| Reservation declined email | PASS via `check:email` |
| Reservation cancellation guest/partner emails | PASS via `check:email` |
| Post-visit feedback email eligibility/idempotency | PASS via `check:email` |
| Duplicate email prevention/idempotency | PASS via `check:email` |
| Missing partner recipient failure logging | PASS via `check:email` |
| Provider failure preserves reservation state | PASS via `check:email` |
| Diagnostics masking / no body leakage | PASS via `check:email` |
| Webhook implementation | DEFERRED; not expanded or configured in this phase |

Phase 7 command executed:

| Check | Result |
| --- | --- |
| `npm.cmd run check:email` | PASS |

Manual/browser-only items still requiring a human:

- Admin restaurant create/edit/disable/reorder visual flow.
- Admin offer inspect/disable visual flow.
- Admin user search/list and role display visual flow.
- Content editor save behavior in EN/ES/HU from the rendered UI.
- Super Admin platform mode controls from the rendered UI.
- Email diagnostics page filtering and retry controls from the rendered UI.
- Confirmation-dialog wording and destructive-action UX in real browsers.

No product defect was confirmed from executable checks. No application code was changed for this phase, and no webhook, POS, AI, or Stripe work was started.

## Blockers

No automated-code blocker was found.

Production launch still requires:

- completion of manual rendered-browser QA;
- at least one desktop browser pass;
- at least one mobile-width browser pass;
- at least one real mobile browser/device pass;
- manual accessibility spot check;
- production environment configuration review.

## Final Recommendation

**B. CONDITIONALLY READY**

SmartTable BASIC is ready to enter final manual QA. The code and automated validation gates pass, and no current automated blocker was found. It should not be labeled **READY FOR PRODUCTION** until the manual browser/device checklist is completed with real screenshots/results and any visual or accessibility defects found there are fixed.
