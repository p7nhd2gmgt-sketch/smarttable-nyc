# SmartTable BASIC UI / UX / Responsive Audit

Date: 2026-07-19

Scope: BASIC reservation marketplace only. AI Concierge, AI demand prediction, calendar/route planning, POS integrations, and Resend webhook delivery tracking remain out of scope.

## Phase 1: Page, Route, Modal, and State Inventory

### Public / Guest

| Area | Current route or state | Status | Notes |
| --- | --- | --- | --- |
| Homepage | `/` | Working | BASIC hero, search, restaurant cards, newest restaurants, public sections. |
| Restaurant listing | `/restaurants` | Working | Scrolls to the restaurant listing section. |
| Restaurant detail | `/restaurants/:slug` plus modal state | Working | Opens restaurant detail modal from route slug or card click. |
| Offer detail | Offer card inside restaurant card/detail modal | Working as modal/card state | No standalone `/offers/:id` route exists today. |
| Offers/search results | `/offers` | Working | Scrolls to active offer/search area. |
| Filter interface | Homepage/list controls | Working | Date, time, party size, cuisine, neighborhood, discount, availability and sorting controls. |
| Guest sign-up | `/signup` and `#guest-signup` | Working | Dedicated multi-step page. |
| Guest login | `/login` and `#guest-login` | Working | Dedicated login state. |
| Email verification | `/verify-email` and `#verify-email` | Working | Uses auth verification endpoint and resend action. |
| Forgot password | `/forgot-password` and `#forgot-password` | Working | Neutral reset request flow. |
| Reset password | `/reset-password` and `#reset-password` | Working | Token-based reset state. |
| Guest account | `/account` | Working/protected | Requires guest session. |
| Guest profile | `/account/profile` | Working/protected | Profile editing state. |
| Guest preferences | `/account/preferences` | Working/protected | Required preference editing state. |
| Guest reservations | `/account/reservations` | Working/protected | Guest sees only own reservations. |
| Reservation detail | Reservation history card | Working as card state | No standalone reservation detail route exists today. |
| Booking form | Reservation modal | Working | Uses existing reservation request API. |
| Booking success | Confirmation modal/state | Working | Clearly describes pending restaurant confirmation. |
| Booking failure | Form error/toast | Working | Reservation API returns translated failure codes where available. |
| Cancellation confirmation | Browser confirmation plus status update | Working | Guest cancellation is server-authorized and idempotent. |
| Favorites | `/account/favorites` | Working/protected | Add/remove/follow notification state. |
| Notification preferences | `/account/notifications` and preferences state | Working/protected | Email channel active; push/SMS shown only as unavailable where not implemented. |
| Terms | `/terms` | Working | Public CMS-backed info page. |
| Privacy | `/privacy` | Working | Public CMS-backed info page. |
| Contact / support | `/contact`, `/help` | Working | Public CMS-backed info pages. |
| 404 | unknown public route | Working | User-facing not-found route. |
| Generic error state | Toast/session-expired/auth fallback | Partial | There is no standalone generic error page; route/auth errors are handled with UI states. |

### Partner

| Area | Current route or state | Status | Notes |
| --- | --- | --- | --- |
| Partner login | `/partner` when unauthenticated | Working | Protected-route guard shows partner login. |
| Partner dashboard | `/partner` | Working/protected | BASIC overview, offers, reservations, guests, reviews, settings. |
| Restaurant profile | `/partner/profile`, `#partner-profile` | Working/protected | Profile edit form in settings section. |
| Restaurant editing | Partner profile form | Working/protected | Partner can update own restaurant only. |
| Offer list | `/partner/offers`, `#partner-current-offers` | Working/protected | Current offers table. |
| Offer creation | `/partner/offers`, `#partner-deals` | Working/protected | Create discounted table offers. |
| Offer editing | Current offers table | Working/protected | Inline editing. |
| Reservation list | `/partner/reservations`, `#partner-reservations` | Working/protected | Filterable by status/date/search. |
| Reservation detail | Partner PATCH/detail action | Working/protected | Details are fetched through partner-owned reservation access. |
| Accept confirmation | Status-aware action button | Working/protected | Pending -> accepted only. |
| Decline confirmation | Status-aware action button | Working/protected | Pending -> rejected internally, displayed as declined. |
| Cancellation confirmation | Confirmation prompt plus server policy | Working/protected | Cancellation requires explicit confirmation. |
| Partner settings | `/partner/settings`, `#partner-settings` | Working/protected | Restaurant profile/settings section. |
| Empty states | Offers, reservations, feedback | Working | Empty-state components are present. |
| Permission denied | Protected route guard/API authorization | Working | Guests and other partners are blocked. |

### Admin / Super Admin

| Area | Current route or state | Status | Notes |
| --- | --- | --- | --- |
| Admin login | `/admin` when unauthenticated | Working | Protected-route guard shows admin login. |
| Dashboard | `/admin` | Working/protected | Super Admin operations overview. |
| Restaurant management | `/admin/restaurants`, `#admin-restaurants` | Working/protected | Create/edit/approve/order restaurants. |
| Restaurant detail/edit | Restaurant table inline controls | Working/protected | Managed in restaurant table/form. |
| Offer management | `/admin/offers`, `#admin-offers` | Working/protected | Inline offer controls. |
| Reservation management | `/admin/reservations`, `#admin-reservations` | Working/protected | Search/filter/detail/cancel with confirmation. |
| User/partner management | `/admin/users`, `#admin-partners` | Working/protected | Partner account creation and assignment. |
| Language/content management | `/admin/content`, `#admin-content` | Working/protected | CMS card list and edit modal. |
| Notification management | `/admin/notifications`, `#admin-notifications` | Working/protected | Admin notification list and mark-read actions. |
| Email diagnostics | `/admin/email-diagnostics` API and admin queue diagnostics | Working/protected | Existing diagnostics are server-side and Super/Admin protected. |
| Platform-mode controls | `/admin/platform-settings`, `#admin-platform-settings` | Working/protected | BASIC/AI mode control; BASIC scope verified. |
| System settings | Platform settings panel | Working/protected | Includes mode/demo/public badge settings. |
| Audit/history views | Audit log API and lifecycle migration | Partial | Reservation timestamp/actor fields exist; full visual event timeline is not a dedicated BASIC page. |
| Error/empty states | Tables, notifications, diagnostics | Working | Empty states and protected-route error states exist. |

## Phase 2: Responsive Matrix

Required widths:

| Width | Coverage status |
| --- | --- |
| 320 px | Static CSS readiness verified |
| 360 px | Covered by <=430 px rules |
| 375 px | Covered by <=430 px rules |
| 390 px | Covered by <=430 px rules |
| 430 px | Explicit CSS breakpoint verified |
| 768 px | Covered by <=760/<=860 tablet-adjacent rules and route/design checks |
| 1024 px | Covered by <=1050 dashboard/hero stacking rules |
| 1280 px | Covered by desktop dashboard/hero shell rules |
| 1440 px | Explicit hero max-width verified |

Automated checks verify:

- no accidental global horizontal overflow primitives;
- hero/search grid uses `minmax(0, ...)`, max-width containment, and tablet stacking;
- inputs/selects/textareas use full-width form controls;
- modal containers use `100dvh` limits;
- restaurant modal body scrolls internally;
- body scroll lock exists while modals are open;
- account/favorite/reservation cards stack on mobile;
- dashboard tables use internal horizontal scrolling where necessary;
- partner dashboard uses wide shell/table wrappers;
- loading, empty, error, success, toast, and protected-route states are present;
- keyboard modal behavior includes Escape and Tab handling.

Live browser viewport testing note:

The in-app browser connector failed during this audit with a local Windows permission error while attaching to the browser runtime. Because of that, the routes were not honestly marked as visually tested in a live browser at every viewport. The current automated coverage is static and API-backed, not a substitute for a manual browser QA pass.

## Phase 3: Public Guest Experience Audit

| Journey area | Status | Findings and action |
| --- | --- | --- |
| Homepage | Working | BASIC marketplace value proposition, primary search action, restaurant cards, and pending-request language are present. AI Concierge sections remain hidden in BASIC mode through platform/feature visibility checks. |
| Browse/search | Working | Restaurant cards use stable image areas, visible cuisine/location/discount/availability data, active filters, clear buttons, and empty states. Public offer queries are served by shared backend endpoints. |
| Restaurant detail | Working | Detail modal separates restaurant information from offers, supports internal scrolling, keeps the close control accessible, and handles missing optional fields without blank critical sections. |
| Offer selection | Working | Active offers are shown under their restaurant, inactive/expired/unavailable offers are not presented as bookable by the public offer API and reservation validation. |
| Booking form | Working | Required fields, selected restaurant/offer context, pending-confirmation language, Terms/Privacy consent, disabled submitting state, and backend validation are present. |
| Booking success | Working | Success state says the request was submitted/saved and does not claim automatic confirmation. It shows reservation details and next-step actions. |
| Guest reservations | Working after fix | Guest account reservations now use localized user-facing status labels, so the internal `rejected` status displays as Declined/Rechazada/Elutasítva. |

Phase 3 correction made:

- Centralized reservation status display with `reservationStatusLabel()`.
- Updated guest and partner/admin reservation tables to render a user-facing status label instead of raw internal values.
- Added English, Spanish, and Hungarian labels for edge statuses: expired, no-show, and waiting for partner confirmation.

## Phase 4: Authentication and Account UX Audit

| Area | Status | Findings |
| --- | --- | --- |
| Guest sign-up | Working | Dedicated `/signup` flow, grouped required fields, password strength, show/hide password, no skip bypass, separate Terms and Privacy consent, duplicate-email handling, and localized validation are present. |
| Guest login | Working | Dedicated `/login` flow with email/password validation, show/hide password, neutral invalid-login message, guest-only role check, forgot-password link, and correct guest redirect behavior. |
| Partner login | Working after fix | Partner route guard displays partner login, demo credentials are prefilled only in demo mode, password visibility toggle is present, forgot-password link is visible, and non-partner roles are rejected before a browser session is saved. |
| Admin login | Working after fix | Admin route guard displays admin login, demo credentials are prefilled only in demo mode, password visibility toggle is present, forgot-password link is visible, and only admin/super-admin roles can enter admin routes. |
| Email verification | Working | `/verify-email` route and resend action exist; verification delivery depends on the configured email/auth provider. |
| Forgot/reset password | Working | `/forgot-password` and `/reset-password` routes exist with neutral request messaging, token handling, password strength, and localized success/error states. |
| Logout/session handling | Working | Logout clears private state; expired sessions show a localized message and protected routes use authorization guards. |
| Unauthorized/forbidden states | Working | Protected guest, partner, admin, and super-admin areas use route guards and forbidden states instead of only hiding menu items. |

Phase 4 risks to keep watching:

- Some partner/admin labels remain older inline dashboard copy; this audit focused on BASIC guest-facing and auth UX rather than a full admin localization pass.
- Live visual QA at all requested viewport widths is still pending because browser automation was unavailable in this environment.

Phase 4 corrections made:

- Partner/admin login no longer pre-fills demo credentials unless the backend reports demo mode.
- Partner/admin login now validates the expected role before saving the returned session locally.
- Partner/admin login now includes password show/hide and forgot-password access.
- Successful partner/admin login now redirects to `/partner` or `/admin` by default instead of relying on the root route.

## Phase 5: Partner Dashboard UX Audit

| Area | Status | Findings and action |
| --- | --- | --- |
| Partner dashboard | Working | BASIC mode uses the simplified owner dashboard with Today, Offers, Reservations, Guests, Reviews, and Settings. Super Admin controls are not included unless a secured impersonation session exists, in which case only the return-to-admin control is shown. |
| Pending reservation visibility | Working | Pending counts and the reservation list are loaded from the shared partner reservation endpoint; pending rows remain actionable and resolved rows no longer show accept/decline controls. |
| Reservation management | Working after fix | Status filters, date/search filters, guest contact fields, reference, date/time, party size, notes, and actions are visible. Action buttons now disable and show loading while the backend request is in flight. |
| Offer management | Working after fix | Offer create/edit forms use required HTML controls plus backend validation. Save/delete buttons now show loading state; deleting an offer requires explicit confirmation. Offer statuses display localized labels instead of raw `sold_out`-style values. |
| Restaurant profile | Working after fix | Required fields are visible, profile save now has loading/duplicate-submit protection, image URL/upload controls remain available, and partner profile writes are server-authorized for the partner's own restaurant. |
| Mobile/tablet use | Static coverage | Responsive table wrappers and full-width partner shell are present. Live viewport QA could not be completed because the browser connector failed locally. |

Phase 5 corrections made:

- Added loading/disabled state to partner reservation actions, note saves, profile saves, offer creation, offer saves, and offer deletion.
- Added delete confirmation for offers.
- Localized partner/admin reservation and offer table headers, offer status labels, action labels, note placeholders, and compact guest count text.
- Ensured visible reservation badges use localized labels while keeping raw status values for CSS classes and backend state.

## Phase 6: Admin and Super Admin UX Audit

| Area | Status | Findings and action |
| --- | --- | --- |
| Roles and permissions | Working | Super Admin-only platform mode writes and partner impersonation are enforced by the backend and covered by route-protection checks. Regular admins can view mode state but cannot change it. |
| Dangerous actions | Working after fix | Header mode switching already required confirmation; full Platform Mode form now also asks for confirmation when the selected mode changes. Restaurant suspension and offer deletion now require confirmation. |
| Search and filters | Working | Reservation filters support status, date, and search. Content editor has search and modal editing. Current static checks do not measure large-dataset performance. |
| Tables on smaller screens | Static coverage | Admin and partner tables use table wrappers; live viewport QA remains pending due browser connector failure. |
| Platform mode visibility | Working | Admin header and platform settings panels show current mode. BASIC mode keeps incomplete AI features hidden from public and partner daily views. |
| Impersonation | Working/secured | “View as partner” appears only for Super Admin and calls the secured backend impersonation endpoint; no regular-admin impersonation control is shown. |
| Content and language management | Working/partial | Public Content Editor uses searchable cards and modal editing. EN/ES/HU keys have fallbacks; this pass added more BASIC partner/admin table labels. A full translation completeness sweep remains a separate broader task. |

Phase 6 corrections made:

- Added confirmation to platform-mode form saves when the mode actually changes.
- Added confirmation to restaurant suspension and offer deletion.
- Added loading/disabled state to admin restaurant save/status changes and admin offer save/delete actions.
- Added localized labels for the BASIC operational strings touched by this audit.

## Phase 7: Design-System Consistency

| Component family | Status | Notes |
| --- | --- | --- |
| Typography and headings | Working/static audit | Public, account, partner, and admin screens use the shared SaaS typography and compact section-heading patterns. No large redesign was introduced. |
| Cards, borders, shadows, radius | Working/static audit | Existing shared card and panel styles use soft shadows, 8px to 16px radii depending on surface, and consistent borders. |
| Buttons | Improved | Primary, secondary, destructive, disabled, and loading button meanings are clearer. Destructive actions now use a distinct danger outline/color, and disabled buttons are visibly disabled rather than only faded. |
| Form controls | Working/static audit | Inputs, selects, textareas, upload controls, and responsive form grids use full-width constraints and preserve current validation behavior. |
| Badges and reservation statuses | Working | Reservation status display is centralized: pending -> Pending, accepted -> Accepted, rejected -> Declined, cancelled -> Cancelled, completed -> Completed. |
| Tables | Working/static audit | Admin and partner tables use wrappers and wide dashboard shells; desktop compression fixes from earlier phases remain in place. |
| Modals and drawers | Working/static audit | Restaurant and reservation modals have fixed close controls, internal scroll behavior, focus trapping, and Escape handling. |
| Empty, loading, toast states | Improved | Loading skeletons now announce busy state, and fatal app loading errors render a user-facing retry state instead of a raw technical message. |

Phase 7 corrections made:

- Added shared skip-to-content shell support.
- Strengthened disabled and destructive button styling.
- Added lazy/async image attributes and descriptive alt text for guest-submitted photo thumbnails.
- Added EN/ES/HU labels for new shell/error/photo accessibility text.

## Phase 8: Accessibility Audit

| Area | Status | Notes |
| --- | --- | --- |
| Landmarks | Improved | The application root is a focusable `<main>` landmark. |
| Skip link | Added | Keyboard users can jump directly to the main application content. The label is localized in English, Spanish, and Hungarian. |
| Focus visibility | Working | Global `:focus-visible` styling is present for links, buttons, form controls, and focusable containers. |
| Modal keyboard behavior | Working/static audit | Guest modals support Escape close, focus movement into the dialog, Tab focus containment, and return focus to the opener when closed. |
| Button names | Working/static audit | Icon-only close buttons use accessible labels. New photo thumbnails use meaningful alt text. |
| Motion sensitivity | Added | `prefers-reduced-motion: reduce` disables long animations/transitions and avoids forced smooth scrolling. |
| Color and status communication | Improved | Destructive buttons now have non-color border treatment as well as color. Status labels still include visible text, not color alone. |
| Touch targets | Working/static audit | Mobile rules keep top nav, form buttons, signup chips, and action rows at usable target sizes. |

Remaining accessibility QA:

- A manual screen-reader pass is still required for VoiceOver/NVDA because this environment could not attach the in-app browser.
- Contrast was reviewed statically against the existing palette, but a dedicated automated contrast scanner was not available in this run.

## Phase 9: Loading, Empty, Error, and Offline-like States

| State type | Status | Notes |
| --- | --- | --- |
| Initial loading | Working | Skeleton loading state exists and now exposes `aria-busy`. |
| Empty results | Working | Restaurant, offer, reservation, favorite, feedback, and admin list empty states are present. |
| Filtered empty results | Working/static audit | Public offer/list filters use clearable controls and empty recovery text. |
| Permission denied | Working | Protected guest, partner, admin, and Super Admin areas render guarded denied/unavailable states. |
| Not found | Working | Unknown routes and missing restaurant slugs render user-facing not-found states. |
| Validation failure | Working | Signup, login, reservation, offer, profile, and account forms surface field or toast errors without bypassing backend validation. |
| Network/server failure | Improved | A fatal boot failure now shows a generic localized retry state instead of rendering `error.message` directly. |
| Retry | Added | The fatal app error state includes a safe Retry action. |
| Success | Working | Reservation, account, profile, content, and partner/admin actions show success toasts only after server responses. |

Phase 9 correction made:

- Replaced raw boot error output with `renderFatalAppError()` and localized retry copy.

## Phase 10: Cross-Browser Readiness

Static verification covered current platform use of:

- responsive CSS grid/flex layout;
- `100dvh` modal height handling;
- date and time inputs with backend validation;
- sticky headers and scrollable modal bodies;
- focus-visible and reduced-motion primitives;
- password show/hide controls;
- touch-friendly mobile stacking rules.

Browser automation status:

- The in-app browser connector could not attach because Windows returned `CreateProcessAsUserW failed: 5`.
- No real Chrome, Edge, Safari, Firefox, iOS Safari, or Android Chrome pass is claimed from this run.

Manual verification still required:

- Safari/iOS `100dvh` behavior;
- native date/time picker layout;
- mobile keyboard overlap on signup, login, and reservation forms;
- dashboard table behavior on tablet landscape;
- screen-reader behavior for modal focus and validation messages.

## Phase 11: Performance and Frontend Safety

| Area | Status | Notes |
| --- | --- | --- |
| Image loading | Improved | Inline `<img>` elements now include lazy loading and async decoding where appropriate. CSS background images remain used for hero/card art to preserve existing layout. |
| Layout shift | Working/static audit | Restaurant cards, modals, signup chips, and dashboard tables use stable responsive dimensions and wrappers. |
| Code splitting | Partial | The project is currently a single-app frontend bundle with shared route rendering. No framework migration was performed. |
| API behavior | Working/static audit | Frontend calls shared `/api` endpoints and carries session auth headers through the shared API client. |
| Pagination/unbounded lists | Partial | Tables/lists are bounded in many dashboard summaries, but large admin datasets should still receive server pagination as a future hardening task. |
| Console/runtime errors | Static audit | No new browser console logging was added. Existing server-side startup logs remain outside the browser. |
| Client-side secret exposure | Working/static audit | Existing static checks verify the frontend does not reference `SUPABASE_SERVICE_ROLE_KEY` or `RESEND_API_KEY`. |
| Private data in public source | Working/static audit | Public routes render restaurant/offer data only; protected guest/partner/admin data requires authenticated API calls. |

Phase 11 corrections made:

- Added image lazy loading/async decoding for restaurant-detail logo and feedback thumbnails.
- Added descriptive localized alt text for user-submitted photo thumbnails.
- Kept Resend and service-role secrets server-side; no new client secret references were introduced.

## Checks Added

- `npm run check:basic-ui`

This check verifies the BASIC route/state inventory, responsive-readiness primitives, accessibility shell safeguards, reduced-motion support, safe boot error state, lazy image attributes, and key localization strings. It is included in `npm test`.

## Current BASIC UX Risks

- Offer detail and reservation detail are implemented as card/modal states rather than standalone deep-link routes.
- A full generic error page is not separate; errors are handled through route-specific states, toasts, and auth fallbacks.
- The live viewport matrix still needs a manual/browser QA pass once browser automation is available.

## Out of Scope Confirmed

- No AI Concierge work was added.
- No POS integration was added.
- Resend webhook delivery tracking remains deferred.

## Phase 12: Automated UI and Static Checks

Added coverage:

- `npm run check:basic-ui-behavior`

This script checks the most important BASIC UI contracts without changing business logic:

- homepage renders through the BASIC guest shell;
- AI-only guest sections are guarded by `canShowFeature`;
- restaurant cards, empty states, and restaurant detail modal exist;
- inactive, expired, sold-out, and unavailable offers are blocked from public booking UI;
- backend offer availability still remains authoritative;
- booking form fields, validation hooks, and submit-loading state exist;
- booking success copy says the request was submitted and is not confirmed yet;
- reservation status labels map internal `rejected` to user-facing `Declined`;
- guest cancellation and partner accept/decline actions require confirmation;
- resolved reservations expose no further accept/decline actions;
- unauthorized, unavailable, and not-found route states exist;
- Super Admin-only controls are guarded;
- modal keyboard behavior, focus shell, loading, retry, and fatal error states exist;
- EN, ES, and HU locale keys exist for the covered BASIC UI text.

This check is now included in `npm test` alongside the existing public-experience, guest-account, reservation-lifecycle, route-protection, architecture, and email checks.

Defects fixed during Phase 12:

- Partner reservation decline now uses a distinct warning button style instead of the same neutral button treatment as secondary actions.
- Partner accept and decline now ask for confirmation before calling the reservation status API.
- Missing route/not-found locale keys were added for English, Spanish, and Hungarian.
- `reservations_pending_label` was added where missing so the static checks can verify pending reservation status consistently across all three supported languages.

Limitations:

- These are static/contract checks plus existing Node-based integration checks. They are not a replacement for real visual browser QA.
- Browser automation could not be completed in this environment because the in-app browser failed to attach with a Windows permission error.

## Phase 13: Manual QA Checklist

Created:

- `docs/BASIC-Launch-Manual-QA-Checklist.md`

The checklist covers:

- A. New guest on mobile
- B. Returning guest on desktop
- C. Partner on tablet
- D. Partner on mobile during service
- E. Super Admin on desktop
- F. English language
- G. Spanish language
- H. Hungarian language
- I. Slow network behavior
- J. Invalid data behavior
- K. Session expiration
- L. Permission-denied behavior

Every checklist row includes:

- route;
- account role needed;
- action;
- expected result;
- pass/fail field;
- screenshot field;
- notes field.

The checklist explicitly keeps AI Concierge, POS integrations, and Resend webhook delivery tracking out of BASIC launch QA scope.

## Phase 14: Safe Implementation Rules

Applied safeguards:

- Reused the existing component/CSS system instead of introducing a new UI framework.
- Preserved existing reservation, email, platform-mode, and authorization business logic.
- Avoided database schema changes.
- Did not modify the Resend email provider, webhook placeholders, or email delivery behavior.
- Did not activate AI Concierge features.
- Did not add or reference POS integrations.
- Did not add production mock customer data.
- Did not send real emails during this UI/static-check phase.
- Kept changes small and reviewable: static checks, localized labels, partner action confirmation UX, and documentation.

Required verification commands for this phase:

- `npm run build`
- `npm run lint`
- `npm run check:email`
- `npm test`
- `npm run check:basic-ui`
- `npm run check:basic-ui-behavior`
- `npm run check:public-experience`
- `npm run check:guest-design-system`

## Phase 15: Local QA Environment

Local development command:

- `npm run dev`
- This resolves to `node server.js`.

Preferred local URL:

- `http://localhost:4173`

Port status during this audit:

- Port `4173` was already occupied by a Node process running `server.js`.
- The existing process was reused instead of starting a second server.

Read-only local HTTP checks completed:

| Check | Result |
| --- | --- |
| `GET /` | `200 OK` |
| `GET /app.js` | `200 OK` |
| `GET /styles.css` | `200 OK` |
| `GET /assets/restaurant-hero.png` | `200 OK` |
| `GET /restaurants` | `200 OK` |
| `GET /signup` | `200 OK` |
| `GET /account` | `200 OK` |
| `GET /robots.txt` | `200 OK` |
| `GET /api/health` | `200 OK` |
| `GET /api/public/config` | `200 OK`, `platform_mode: basic` |
| `GET /api/public/offers?lang=en` | `200 OK`, active public offer payload returned |
| `GET /api/public/content` | `200 OK` |
| `GET /api/system/feature-status` | `200 OK` |

Known non-issue observed:

- `GET /api/restaurants`, `GET /api/public-content`, and `GET /api/platform-config` returned `404` because these are not current SmartTable API routes. The current public endpoints are `/api/public/offers`, `/api/public/content`, and `/api/public/config`.

Browser verification attempt:

- The in-app browser connection was attempted again.
- It failed with the same local Windows sandbox permission issue: `CreateProcessAsUserW failed: 5`.
- No live browser visual QA is claimed from this environment.

Project-supported browser runner:

- No Playwright, Cypress, or E2E browser npm script is currently exposed by `package.json`.
- No new browser test framework was added during this BASIC readiness pass.

Manual visual QA requirement:

- A human tester must still complete the viewport, browser, and touch-device checks in `docs/BASIC-Launch-Manual-QA-Checklist.md`.
- The recommended manual local URL is `http://localhost:4173`.
- If port `4173` is occupied by a non-SmartTable process, stop that process safely or run `PORT=4174 npm run dev` in a local shell and record the alternate URL in the checklist.

## Phase 16: Full BASIC User-Journey QA

Added coverage:

- `npm run check:basic-user-journey`

This check uses the existing Node-based project test style and forces demo/no-email mode before importing the application core:

- `SUPABASE_URL=""`
- `SUPABASE_ANON_KEY=""`
- `SUPABASE_SERVICE_ROLE_KEY=""`
- `RESEND_API_KEY=""`

That keeps the Phase 16 check production-safe: it does not write to a production database and does not send real emails.

Automated Phase 16 coverage:

| Area | Automated/static coverage |
| --- | --- |
| Public / guest landing | Verifies BASIC public config, public offers, card data, hero/search/list/detail/reservation UI hooks, loading/empty/error hooks, inactive/expired/sold-out offer guards, and responsive CSS primitives. |
| Search and filters | Verifies restaurant name, date, time, party size, neighborhood, cuisine, minimum discount, and clear-filter controls exist in the BASIC UI. |
| Restaurant detail and offer detail | Verifies restaurant detail modal, offer rows/cards, understandable offer data, CTA hooks, and modal scroll CSS primitives. |
| Reservation request | Verifies invalid reservation requests fail, successful requests create one pending reservation, duplicate active requests return conflict, and success state exposes truthful email delivery status. |
| Guest signup/login/logout | Verifies Terms consent enforcement, successful guest signup, login, logout endpoint, protected account blocking while logged out, and guest account data loading. |
| Guest favorites | Verifies BASIC follow/favorite creation and authenticated favorites listing. |
| Guest account reservations | Verifies pending reservations appear in the guest account and user-facing status mapping is present. |
| Partner login/dashboard | Verifies guest users are blocked, partner profile and offer list load, offer create/edit/deactivate works in demo mode, and partner cannot access another restaurant profile. |
| Partner reservations | Verifies incoming requests are visible, Accept changes status, repeated Accept is idempotent, Decline uses canonical internal `rejected`, repeated Decline is idempotent, and UI confirmation/style hooks exist. |
| Admin | Verifies guest/partner users cannot access admin APIs; regular admin can load dashboard stats, restaurants, offers, partners, and content. |
| Super Admin | Verifies regular admin cannot edit platform mode; Super Admin can view editable settings; BASIC remains active and consistent through public config. |
| BASIC mode | Verifies AI Concierge and Partner AI Demand are gated by feature visibility, AI demo visibility remains off, and POS terms are not exposed in the BASIC UI source. |
| Localization/statuses | Verifies EN, ES, and HU keys for status labels, confirmation prompts, reservation success copy, forbidden route, and 404 copy. |

Manual Phase 16 items still required:

- Real browser navigation clicks and touch interactions.
- Visual restaurant-card sizing and image fallback behavior.
- Native date/time picker usability on Safari/iOS and Android Chrome.
- Actual modal scroll/focus behavior in a browser.
- Real signup/login/password manager/autofill behavior.
- Visual confirmation dialog wording and button hierarchy.
- Long translated label wrapping in EN/ES/HU at all requested viewport widths.

Browser automation status:

- The in-app browser was attempted again during Phase 16.
- It failed with `CreateProcessAsUserW failed: 5`, matching the previous Windows sandbox permission failure.
- No Phase 16 visual browser pass is claimed from this environment.

The Phase 16 automated check is now included in `npm test`.

## Phase 17: Responsive Visual QA

Automated/static coverage added:

- `npm run check:basic-visual-readiness`
- The check is included in `npm test`.

Static readiness now verifies the requested viewport groups are represented:

| Group | Viewports |
| --- | --- |
| Desktop | `1440 x 900`, `1366 x 768`, `1280 x 720` |
| Tablet | `1024 x 768`, `820 x 1180`, `768 x 1024` |
| Mobile | `430 x 932`, `390 x 844`, `375 x 667`, `360 x 800` |

Static responsive protections verified:

- global box sizing and width containment;
- hero/search two-column containment with `minmax(0, ...)`;
- tablet and mobile single-column breakpoints;
- full-width form fields and 44px minimum touch targets;
- stable restaurant image ratios and `object-fit: cover`;
- internally scrollable restaurant modal with `100dvh` max-height;
- visible modal close-control styling;
- body scroll lock while modal is open;
- partner dashboard wide shell and table wrappers;
- account, favorites, and reservation mobile stacking hooks.

Responsive defects fixed in this phase:

- Added missing EN/ES/HU keys for the guest hero search panel so search labels no longer rely only on fallback text.
- Moved visible Super Admin sidebar/header labels to translation keys and added EN/ES/HU labels for them.

Live visual viewport testing status:

- NOT VERIFIED in this Codex environment.
- Browser attachment failed with Windows sandbox error `CreateProcessAsUserW failed: 5`.
- No claim is made that the requested viewports passed in a rendered browser.

## Phase 18: Cross-Browser QA

Browser verification status:

| Browser target | Status | Notes |
| --- | --- | --- |
| Google Chrome | NOT VERIFIED | Browser launch/attach blocked by local Windows sandbox permission error. |
| Microsoft Edge | NOT VERIFIED | No successful Edge browser session was available. |
| Safari / WebKit emulation | NOT VERIFIED | No WebKit runner is configured in `package.json`. |
| Mobile Chromium | NOT VERIFIED | No mobile browser automation session was available. |
| Mobile WebKit emulation | NOT VERIFIED | No WebKit mobile runner is configured. |

Static cross-browser-sensitive protections verified:

- `100dvh` modal sizing is present for modern mobile viewport behavior.
- Native `date`, `time`, `email`, `tel`, and password controls are used where relevant.
- Reduced-motion CSS is present.
- Modal scroll uses `-webkit-overflow-scrolling: touch`.
- Layout uses CSS grid/flex patterns with `min-width: 0` and `max-width: 100%`.

Manual browser QA remains required before production launch sign-off.

## Phase 19: Accessibility QA

Automated/static accessibility readiness verified:

- skip-to-content link and main landmark;
- visible `:focus-visible` styles;
- modal role and `aria-modal`;
- Escape closes guest modals;
- Tab handling traps focus inside the active modal;
- focus restoration hook after modal close;
- form labels for generated inputs;
- validation summary and field-error CSS hooks;
- `role="alert"` for critical states;
- loading states with `aria-busy`;
- image `alt` key wiring for guest-submitted and dining photos;
- Decline uses a warning button style and explicit text, not color alone;
- language selector buttons expose `data-lang` values and `aria-pressed` state;
- reduced-motion media query.

Manual accessibility checks still required:

- actual keyboard traversal order in a browser;
- screen reader announcement behavior;
- color contrast measurement in rendered states;
- 200% zoom behavior;
- mobile touch target confirmation on real devices;
- native browser date/time picker accessibility.

## Phase 20: Localization QA

Automated/static EN/ES/HU coverage now verifies BASIC keys for:

- public navigation;
- guest search;
- restaurant listing and detail CTAs;
- signup/login/password-reset;
- guest account menu;
- reservation success and statuses;
- guest/partner cancellation and accept/decline confirmation prompts;
- partner navigation and offer/reservation labels;
- Super Admin navigation, header, platform mode, loading, error, forbidden, and not-found states.

Localization defects fixed in this phase:

- Added `guest_search_kicker`, `guest_search_title`, `restaurant_search_placeholder`, `all_neighborhoods_label`, `all_cuisines_label`, `any_discount_label`, `search_offers_button`, and missing restaurant detail/search labels where needed.
- Added Super Admin navigation/header keys including `admin_nav_statistics`, `admin_nav_settings`, `admin_nav_content`, `admin_nav_restaurants`, `admin_nav_partners`, `admin_nav_offers`, `admin_nav_reviews`, `admin_nav_photo_rewards`, `admin_nav_notifications`, `admin_nav_reservations`, `admin_dashboard_kicker`, and `refresh_button`.
- Updated the Super Admin sidebar/header rendering to use translation keys instead of fixed English labels.

Live localization layout status:

- NOT VERIFIED visually in browser for long Spanish and Hungarian strings because browser automation is blocked.
- Static CSS and locale coverage passed, but rendered wrapping still requires manual QA.

Phase 17-20 command added:

- `npm run check:basic-visual-readiness`

## Phase 21: Security And Role Boundary Review

Scope:

- BASIC mode only.
- Non-destructive authorization review.
- No invasive penetration testing.
- No auth architecture change.
- No AI Concierge, POS, Stripe, webhook, or reservation-platform integration work.

Routes and areas reviewed:

| Area | Reviewed coverage |
| --- | --- |
| Public | `/`, `/restaurants`, `/restaurants/:slug`, `/offers`, `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/terms`, `/privacy`, `/contact`, `/help`, 404/unavailable states, and public API endpoints. |
| Guest protected | `/account`, `/account/reservations`, `/account/favorites`, `/account/profile`, `/account/preferences`, `/account/notifications`, `/account/reviews`, `/account/security`, and guest account/reservation APIs. |
| Partner protected | `/partner`, `/partner/offers`, `/partner/reservations`, `/partner/profile`, `/partner/settings`, partner profile API, partner reservations API, partner offer management paths. |
| Admin protected | `/admin`, `/admin/restaurants`, `/admin/offers`, `/admin/users`, `/admin/notifications`, `/admin/content`, `/admin/reservations`, admin stats/content/restaurant/offer/reservation APIs. |
| Super Admin protected | `/admin/platform-settings`, platform-mode edit action, Super Admin capability checks and editable settings metadata. |
| AI direct routes in BASIC | `/ai-concierge`, `/ai-preferences`, `/partner/ai-demand`, `/admin/ai-controls` route visibility and unavailable-state wiring. |

User roles reviewed:

- `guest`
- `partner`
- `admin`
- `super_admin`
- unauthenticated user

Security and route-boundary findings:

| Finding | Status |
| --- | --- |
| Public BASIC endpoints are reachable without authentication. | PASS via automated/API check. |
| Guest account endpoints reject logged-out users. | PASS via automated/API check. |
| Guest account endpoints reject partner-role access. | PASS via automated/API check. |
| Partner endpoints reject logged-out users and guests. | PASS via automated/API check. |
| Partner profile and reservations are scoped to the partner's own restaurant. | PASS via automated/API check. |
| Partners cannot access admin routes. | PASS via automated/API check. |
| Regular admins can view admin data but cannot change Super Admin platform mode settings. | PASS via automated/API check. |
| Guests, partners, and regular admins cannot PATCH Super Admin platform mode settings. | PASS via automated/API check. |
| Super Admin can view editable platform-mode settings. | PASS via automated/API check. |
| Direct protected frontend routes have guard/unavailable/forbidden handlers. | PASS via static check. |
| BASIC mode does not expose AI Concierge, Partner AI Demand, or Admin AI controls through feature visibility. | PASS via automated/API/static check. |
| Resolved reservation actions cannot be replayed or moved through invalid status transitions. | PASS via existing reservation lifecycle coverage. |

New security check added:

- `npm run check:basic-security-boundaries`
- The check forces demo/no-email mode before importing the app core:
  - `SUPABASE_URL=""`
  - `SUPABASE_ANON_KEY=""`
  - `SUPABASE_SERVICE_ROLE_KEY=""`
  - `RESEND_API_KEY=""`
- It is included in `npm test`.

Defects found in Phase 21:

- No concrete authorization defect was found.

Defects fixed in Phase 21:

- No auth/business-logic fix was required.
- Added automated security-boundary coverage so regressions are easier to catch.

Remaining security review limitations:

- This was not an invasive penetration test.
- Browser-based direct URL navigation could not be visually verified because browser automation is blocked in this environment.
- Production Supabase RLS/security posture still requires deployment-environment review with real credentials and policies.

## Phase 22: Final Automated Validation

Automated checks performed:

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

Additional check discovery:

- No Playwright, Cypress, Puppeteer, axe, or pa11y npm runner is configured in `package.json`.
- Browser automation remains NOT VERIFIED because the local browser connector previously failed with `CreateProcessAsUserW failed: 5`.

## Phase 23: Documentation And Final Launch Readiness

Documentation updated:

- `docs/BASIC-Launch-Manual-QA-Checklist.md`
- `docs/BASIC-UI-UX-Audit.md`
- `docs/BASIC-Final-QA-Report.md`

Manual QA checklist status:

- Every checklist row now records an explicit current status.
- Rows requiring real rendered-browser or device verification are marked `MANUAL VERIFICATION REQUIRED`.
- No manual item is marked `PASS` based only on assumption or static checks.

Browsers actually tested:

- Microsoft Edge Chromium in headless mode through Chrome DevTools Protocol.
- The in-app browser connector remains blocked by `CreateProcessAsUserW failed: 5`.
- Chrome, Firefox, Safari/WebKit, iOS Safari, Android Chrome, and physical devices remain NOT VERIFIED.

Viewports actually tested in rendered browser:

- Homepage: `320x800`, `375x667`, `390x844`, `430x932`, `768x1024`, `1024x768`, `1366x768`, `1440x900`.
- Route shells at `320x800`, `390x844`, `768x1024`, and `1366x768`: `/`, `/restaurants`, `/signup`, `/login`, `/forgot-password`, `/account`, `/partner`, `/admin`.
- CDP overflow metrics confirmed `documentElement.scrollWidth <= clientWidth` for the tested route/viewport combinations.

Accessibility findings:

- Static accessibility readiness checks passed for landmarks, skip link, focus-visible CSS, modal role wiring, Escape/Tab modal handling, error/loading states, image alt-key wiring, reduced-motion CSS, and warning/destructive button distinction.
- Edge DOM probes found no missing basic form labels, nameless buttons, or image elements missing `alt` attributes on `/`, `/signup`, `/login`, `/forgot-password`, `/account`, `/partner`, and `/admin`.
- Manual keyboard, screen-reader, contrast, zoom, touch target, and native date/time control checks remain required.

Phase 8-11 defects found and fixed:

- Mobile top navigation could overflow/crop in a rendered 390px Edge capture because the action area still used a three-column grid at phone-size screenshots. Fixed in `public/styles.css` by using a contained two-column action grid below `760px`, allowing wrapped button labels, and letting language buttons participate in the same grid.
- Direct `/login` access for logged-out users was stuck on the loading skeleton through a navigation loop. Root cause: `isGuestSession()` treated a missing session as `guest` because `normalizeRole(undefined)` defaults to `guest`; direct login routing also called the generic dashboard login renderer. Fixed in `public/app.js` by requiring an actual session for `isGuestSession()` and dispatching direct guest login/session-expired guest fallback to `renderGuestLogin()`.

Localization findings:

- Static EN/ES/HU locale coverage passed.
- Guest search and Super Admin navigation/header labels were moved fully into locale keys.
- Rendered Spanish/Hungarian wrapping still needs manual browser verification.

Environment limitations:

- Local API responded at `http://localhost:4173/api/health` with `ok: true`, `mode: demo`, `publicBaseUrl: https://smarttable.com`.
- In-app browser visual QA could not be completed due the Windows sandbox/browser launch limitation.
- Headless Edge/CDP verification was completed for the route shells listed above, but authenticated partner/admin/guest workflows still require human interactive browser QA with real test accounts.
- Resend webhook delivery tracking remains intentionally DEFERRED.

Exact manual steps still required:

1. Run `npm run dev` in `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking`.
2. Open `http://localhost:4173`.
3. Complete every `MANUAL VERIFICATION REQUIRED` row in `docs/BASIC-Launch-Manual-QA-Checklist.md`.
4. Test at least Chrome or Edge desktop, Firefox desktop, Safari/WebKit where available, one mobile-width browser simulation, and one real mobile browser.
5. Capture screenshots for any failed responsive, modal, localization, or role-boundary state.
6. Keep BASIC mode active and do not activate AI Concierge, POS, Stripe, or webhook work during BASIC QA.

Final launch-readiness recommendation:

- CONDITIONALLY READY.
- Code, API/static checks, email checks, route/role boundaries, BASIC platform gating, localization coverage, and automated reservation lifecycle checks pass.
- Manual rendered-browser/device QA is still required before a true production launch sign-off.
