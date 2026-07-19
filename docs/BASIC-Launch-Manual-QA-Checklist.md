# SmartTable BASIC Launch Manual QA Checklist

Date: 2026-07-19

Scope: BASIC discounted restaurant reservation marketplace only.

Do not test or activate AI Concierge, route planning, calendar intelligence, POS integrations, or Resend webhook delivery tracking during this pass. Resend webhook delivery tracking is deferred. Use only approved test accounts, test restaurants, and test offers. Do not send real emails to `.example` recipients.

## Test Conventions

| Field | Instruction |
| --- | --- |
| Pass/Fail | Record exactly one of: `PASS`, `FAIL`, `BLOCKED`, `NOT APPLICABLE`, or `MANUAL VERIFICATION REQUIRED`. |
| Screenshot | Add the screenshot filename or link when visual proof is useful. |
| Notes | Record exact viewport, browser, account, reservation reference, and defect summary. |

Current Codex status:

- Codex completed a limited Microsoft Edge Chromium headless/CDP pass for public/auth/protected route shells, responsive overflow metrics, and basic DOM accessibility checks.
- Authenticated workflow clicks, real mobile devices, Safari/WebKit, Firefox, and full human visual QA are still marked `MANUAL VERIFICATION REQUIRED`.
- Do not convert a row to `PASS` unless it was actually verified in a browser or on the target device.
- Automated/API/static checks are summarized in `docs/BASIC-UI-UX-Audit.md` and `docs/BASIC-Final-QA-Report.md`; they do not replace this manual checklist.

## Local Browser QA Setup

1. Open a terminal in `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking`.
2. Run `npm run dev`.
3. Open `http://localhost:4173`.
4. If port `4173` is already in use by SmartTable, reuse it and refresh the browser.
5. If port `4173` is occupied by another app, run SmartTable on another stable port and record the URL in the notes.
6. Test at minimum: Chrome or Edge on desktop, one mobile-width browser simulation, and one real mobile browser before production launch sign-off.
7. Do not mark a row as passed unless the expected result was visually confirmed in the browser.
8. Do not send real emails to `.example` recipients.
9. Keep BASIC mode active. Do not activate AI Concierge or webhook delivery tracking during this checklist.

Recommended viewport widths:

| Width | Device class |
| --- | --- |
| 320 px | Small mobile |
| 360 px | Android mobile |
| 375 px | iPhone mobile |
| 390 px | Modern iPhone mobile |
| 430 px | Large mobile |
| 768 px | Tablet portrait |
| 1024 px | Tablet landscape / small laptop |
| 1280 px | Desktop |
| 1440 px | Wide desktop |

## A. New Guest On Mobile

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | None | Open homepage at 390px width. | Hero, search panel, navigation, and restaurant cards fit without horizontal scroll. | MANUAL VERIFICATION REQUIRED |  |  |
| `/restaurants` | None | Browse restaurant list and clear filters. | Active restaurants and offers render; empty results show recovery text. | MANUAL VERIFICATION REQUIRED |  |  |
| `/restaurants/:slug` | None | Open a restaurant detail page/modal. | Modal scrolls internally; close button stays reachable. | MANUAL VERIFICATION REQUIRED |  |  |
| `/signup` | None | Create a new guest with required fields. | No skip option; validation blocks incomplete data; account is created after required consent. | MANUAL VERIFICATION REQUIRED |  |  |
| `/login` | Guest | Sign in after signup. | Guest lands in account area or intended destination. | MANUAL VERIFICATION REQUIRED |  |  |
| Booking modal | Guest | Submit one valid reservation request. | Submit button shows loading; exactly one pending request is created. | MANUAL VERIFICATION REQUIRED |  |  |
| Booking success | Guest | Read success message. | It says the request was submitted/saved and not yet confirmed. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/reservations` | Guest | View reservation status. | Pending status is readable and localized. | MANUAL VERIFICATION REQUIRED |  |  |

## B. Returning Guest On Desktop

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/login` | Guest | Sign in with valid guest account. | Login succeeds and redirects correctly. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account` | Guest | Review overview. | Name, verification status, city, reservations, favorites, and notifications show only this guest's data. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/profile` | Guest | Edit phone/city/transport preference. | Valid update saves; invalid update preserves previous data. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/preferences` | Guest | Remove a required preference and save. | Save is blocked until a valid replacement is selected. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/favorites` | Guest | Add and remove a restaurant favorite. | Duplicate favorites are prevented; unavailable restaurants fail safely. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/reservations` | Guest | Cancel an eligible reservation. | Confirmation appears; status becomes Cancelled; record is not deleted. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/security` | Guest | Request data export workflow. | Request status is shown without password hashes or other users' data. | MANUAL VERIFICATION REQUIRED |  |  |

## C. Partner On Tablet

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/partner` | Partner | Open dashboard at 768px width. | Pending reservations and core actions are visible without Super Admin controls. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/offers` | Partner | Create a complete active offer. | Offer saves, appears in list, and is eligible for public display if active. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/offers` | Partner | Try to publish incomplete offer. | Validation prevents incomplete or invalid offer. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | Filter by status and date. | Reservation list updates and remains readable. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/profile` | Partner | Edit authorized restaurant profile. | Profile saves and public preview data remains coherent. | MANUAL VERIFICATION REQUIRED |  |  |

## D. Partner On Mobile During Service

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/partner/reservations` | Partner | Open pending reservation at 390px width. | Guest, reference, date/time, party size, offer, notes, and actions are readable. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | Tap Accept. | Confirmation appears; button shows loading; status becomes Accepted after server response. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | Tap Decline on a separate pending request. | Confirmation appears; Decline uses a distinct warning style; status displays as Declined to users. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | Try to accept an already resolved reservation. | No accept/decline action is available or backend rejects invalid transition. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | Cancel an accepted reservation. | Destructive confirmation appears; status becomes Cancelled. | MANUAL VERIFICATION REQUIRED |  |  |

## E. Super Admin On Desktop

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin` | Super Admin | Open dashboard. | Current platform mode is visible; BASIC features remain primary. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin/platform-settings` | Super Admin | View Platform Mode controls. | Mode can be changed only by Super Admin and requires confirmation. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin/reservations` | Super Admin | Search by guest, restaurant, email, and reference. | Results filter correctly; details are visible. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin/reservations` | Super Admin | Cancel a reservation. | Explicit confirmation is required; timestamp and actor update. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin/restaurants` | Super Admin | Disable/suspend a restaurant. | Confirmation appears; inactive restaurant is not public. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin/content` | Super Admin/Admin | Edit EN/ES/HU public content. | Editing one language does not overwrite the others. | MANUAL VERIFICATION REQUIRED |  |  |

## F. English Language

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Any public route | None | Select English. | Navigation, filters, empty states, modals, success, and errors are English. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/reservations` | Guest | Review statuses. | `rejected` appears as `Declined`; no raw internal status leaks. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | Review action buttons. | Accept, Decline, Cancel, Complete, and No actions available are clear. | MANUAL VERIFICATION REQUIRED |  |  |

## G. Spanish Language

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Any public route | None | Select Espanol. | Labels fit without clipping or horizontal scroll. | MANUAL VERIFICATION REQUIRED |  |  |
| Booking modal | Guest | Submit invalid data. | Validation and offer errors are Spanish and user-friendly. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin/content` | Admin/Super Admin | Edit Spanish content. | Spanish fields save without replacing English or Hungarian text. | MANUAL VERIFICATION REQUIRED |  |  |

## H. Hungarian Language

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Any public route | None | Select Magyar. | Long Hungarian labels wrap cleanly and do not overflow. | MANUAL VERIFICATION REQUIRED |  |  |
| `/signup` | None | Complete signup form in Hungarian. | Required validation, consent, and success messages are Hungarian. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/reservations` | Guest | Review statuses. | Pending, Accepted, Declined, Cancelled, and Completed display in Hungarian. | MANUAL VERIFICATION REQUIRED |  |  |

## I. Slow Network Behavior

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | None | Simulate slow network and reload. | Loading skeleton appears; no blank white screen. | MANUAL VERIFICATION REQUIRED |  |  |
| Booking modal | Guest | Submit while throttled. | Submit button disables and shows loading until server response. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | Accept while throttled. | Related action buttons disable; success only appears after response. | MANUAL VERIFICATION REQUIRED |  |  |
| Any route | Any | Force backend/network failure. | Generic retry/error state appears; no raw stack trace or secret is shown. | MANUAL VERIFICATION REQUIRED |  |  |

## J. Invalid Data Behavior

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Booking modal | Guest | Submit invalid email. | Field validation blocks submit or backend returns safe message. | MANUAL VERIFICATION REQUIRED |  |  |
| Booking modal | Guest | Submit too-large party size. | Request is rejected safely; no reservation is created. | MANUAL VERIFICATION REQUIRED |  |  |
| Booking modal | Guest | Submit expired/inactive offer. | Request is blocked with precise offer error. | MANUAL VERIFICATION REQUIRED |  |  |
| `/signup` | None | Submit duplicate email. | User sees clear duplicate-account path without account enumeration details. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/offers` | Partner | Save invalid date/time/capacity. | Validation rejects invalid offer and preserves entered data where possible. | MANUAL VERIFICATION REQUIRED |  |  |

## K. Session Expiration

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/account` | Guest | Expire or remove session and refresh. | User is redirected to login without private data flash. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner` | Partner | Expire or remove session and refresh. | Partner login appears; private reservation data is not visible. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin` | Admin/Super Admin | Expire or remove session and refresh. | Admin login appears; protected data is not rendered. | MANUAL VERIFICATION REQUIRED |  |  |
| Any protected route | Any | Perform action after session expiry. | Action is blocked and session-expired message appears. | MANUAL VERIFICATION REQUIRED |  |  |

## L. Permission-Denied Behavior

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `/partner` | Guest | Try to open partner dashboard. | Forbidden/login state appears; partner data is not shown. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin` | Guest | Try to open admin dashboard. | Forbidden/login state appears; admin data is not shown. | MANUAL VERIFICATION REQUIRED |  |  |
| `/admin/platform-settings` | Regular admin | Try to change platform mode. | Current mode may be visible; edit action is blocked. | MANUAL VERIFICATION REQUIRED |  |  |
| Partner reservation API/UI | Partner | Try another restaurant reservation ID. | Access denied or not found; no cross-restaurant data is exposed. | MANUAL VERIFICATION REQUIRED |  |  |
| Guest reservation API/UI | Guest | Try another guest reservation ID. | Access denied or not found; no other guest data is exposed. | MANUAL VERIFICATION REQUIRED |  |  |

## M. Phase 17 Responsive Visual QA

| Route | Role Needed | Viewport | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | None | 1440 x 900 | Open homepage and search panel. | Hero and search panel fit; no horizontal scrolling; Search and Clear are visible. | MANUAL VERIFICATION REQUIRED |  |  |
| `/` | None | 1366 x 768 | Open homepage and scroll. | Navigation, hero, cards, and search controls stay within viewport. | MANUAL VERIFICATION REQUIRED |  |  |
| `/` | None | 1280 x 720 | Search with long values. | Inputs and buttons remain readable and contained. | MANUAL VERIFICATION REQUIRED |  |  |
| `/restaurants` | None | 1024 x 768 | Browse cards and open detail modal. | Card grid is balanced; detail modal scrolls internally. | MANUAL VERIFICATION REQUIRED |  |  |
| `/restaurants/:slug` | None | 820 x 1180 | Open long restaurant content. | Hero, offers, gallery, and CTA remain reachable. | MANUAL VERIFICATION REQUIRED |  |  |
| `/signup` | None | 768 x 1024 | Move through signup steps. | No required controls are hidden; progress and buttons fit. | MANUAL VERIFICATION REQUIRED |  |  |
| `/login` | None | 430 x 932 | Open login and password reset. | Fields, password button, and links are tappable. | MANUAL VERIFICATION REQUIRED |  |  |
| Booking modal | Guest | 390 x 844 | Submit invalid data, then valid data. | Errors appear by fields; submit button remains visible; no duplicate submit. | MANUAL VERIFICATION REQUIRED |  |  |
| `/account/reservations` | Guest | 375 x 667 | Review statuses and cancel eligible booking. | Cards/statuses fit; confirmation can be closed or completed. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | 360 x 800 | Review pending request. | Reservation info and Accept/Decline actions are readable and reachable. | MANUAL VERIFICATION REQUIRED |  |  |

## N. Phase 18 Cross-Browser QA

| Browser | Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome | `/` | None | Run the public guest journey. | Layout, navigation, forms, modals, and date/time controls work. | MANUAL VERIFICATION REQUIRED |  |  |
| Edge | `/` | None | Run the public guest journey. | Layout, navigation, forms, modals, and date/time controls work. | MANUAL VERIFICATION REQUIRED |  |  |
| Safari or WebKit | `/restaurants/:slug` | None | Open restaurant detail and booking modal. | Scrolling, focus, and date/time controls work. | MANUAL VERIFICATION REQUIRED |  |  |
| iOS Safari | `/signup` | None | Complete signup on mobile. | Native keyboard does not hide critical controls; no overflow. | MANUAL VERIFICATION REQUIRED |  |  |
| Android Chrome | `/partner/reservations` | Partner | Accept/Decline pending request. | Touch controls are usable and confirmation dialogs are clear. | MANUAL VERIFICATION REQUIRED |  |  |

## O. Phase 19 Accessibility QA

| Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Any page | None | Press Tab from browser chrome into page. | Skip link appears and moves focus to main content. | MANUAL VERIFICATION REQUIRED |  |  |
| `/` | None | Navigate all header controls with keyboard. | Focus is visible and order is logical. | MANUAL VERIFICATION REQUIRED |  |  |
| Restaurant modal | None | Open modal, Tab through controls, press Escape. | Focus stays in modal, Escape closes it, and focus returns to opener. | MANUAL VERIFICATION REQUIRED |  |  |
| Booking modal | Guest | Submit invalid form with keyboard only. | Validation errors are clear and associated with the relevant inputs. | MANUAL VERIFICATION REQUIRED |  |  |
| `/partner/reservations` | Partner | Use keyboard to Accept and Decline. | Buttons have clear names; Decline is visually and textually distinct. | MANUAL VERIFICATION REQUIRED |  |  |
| Any loading/error state | Any | Trigger slow or failed response. | Loading/error state is visible and understandable; no raw stack trace. | MANUAL VERIFICATION REQUIRED |  |  |
| Any image-heavy route | Any | Inspect image alt text. | Images have meaningful alt text or safe decorative handling. | MANUAL VERIFICATION REQUIRED |  |  |
| Browser zoom | Any | Test at 200% zoom. | Content remains readable and core actions stay reachable. | MANUAL VERIFICATION REQUIRED |  |  |

## P. Phase 20 Localization QA

| Language | Route | Role Needed | Action | Expected Result | Pass/Fail | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| English | `/` | None | Open homepage and search. | No raw translation keys or mixed-language BASIC labels. | MANUAL VERIFICATION REQUIRED |  |  |
| Spanish | `/` | None | Open homepage and search. | Long search labels fit; no clipped text. | MANUAL VERIFICATION REQUIRED |  |  |
| Hungarian | `/` | None | Open homepage and search. | Long Hungarian search labels wrap cleanly. | MANUAL VERIFICATION REQUIRED |  |  |
| English | `/signup` | None | Complete signup validation path. | Validation, consent, and success copy are English. | MANUAL VERIFICATION REQUIRED |  |  |
| Spanish | `/signup` | None | Complete signup validation path. | Validation, consent, and success copy are Spanish. | MANUAL VERIFICATION REQUIRED |  |  |
| Hungarian | `/signup` | None | Complete signup validation path. | Validation, consent, and success copy are Hungarian with correct accents. | MANUAL VERIFICATION REQUIRED |  |  |
| English/Spanish/Hungarian | `/account/reservations` | Guest | Review statuses. | Pending, Accepted, Declined, Cancelled, Completed are localized; internal `rejected` is never shown. | MANUAL VERIFICATION REQUIRED |  |  |
| English/Spanish/Hungarian | `/partner/reservations` | Partner | Review Accept/Decline confirmations. | Confirmation prompts are localized and actions stay readable. | MANUAL VERIFICATION REQUIRED |  |  |
| English/Spanish/Hungarian | `/admin` | Super Admin | Review sidebar/header. | Super Admin nav/header labels are localized and no raw key appears. | MANUAL VERIFICATION REQUIRED |  |  |

## Completion Summary

| Area | Pass/Fail | Screenshot Folder | Notes |
| --- | --- | --- | --- |
| Mobile guest | MANUAL VERIFICATION REQUIRED |  |  |
| Desktop guest | MANUAL VERIFICATION REQUIRED |  |  |
| Tablet partner | MANUAL VERIFICATION REQUIRED |  |  |
| Mobile partner | MANUAL VERIFICATION REQUIRED |  |  |
| Desktop Super Admin | MANUAL VERIFICATION REQUIRED |  |  |
| English | MANUAL VERIFICATION REQUIRED |  |  |
| Spanish | MANUAL VERIFICATION REQUIRED |  |  |
| Hungarian | MANUAL VERIFICATION REQUIRED |  |  |
| Slow network | MANUAL VERIFICATION REQUIRED |  |  |
| Invalid data | MANUAL VERIFICATION REQUIRED |  |  |
| Session expiration | MANUAL VERIFICATION REQUIRED |  |  |
| Permission denied | MANUAL VERIFICATION REQUIRED |  |  |

Final launch sign-off should distinguish automated code readiness from real visual browser readiness and production manual readiness.

## Phase 24: Human QA Handoff

Use this sequence when automated browser testing is unavailable. The tester does not need to read the source code.

### 1. Start The Application

1. Open a terminal.
2. Go to:
   `C:\Users\budai\Documents\Codex\2026-06-15\szia\outputs\restaurant-booking`
3. Run:
   `npm run dev`
4. Keep the terminal open while testing.

### 2. Local URL

Open:

`http://localhost:4173`

If this URL does not load, record the terminal output and browser error before changing anything.

### 3. Test Accounts

For local/demo QA, use:

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Guest | `guest@smarttable.com` | `guest123` | Use for returning guest/account checks. |
| Partner | `owner@hudsonhearth.com` | `restaurant123` | Use for partner dashboard and reservations. |
| Admin | `ops@smarttable.com` | `admin123` | Use for regular admin checks. |
| Super Admin | `admin@smarttable.com` | `admin123` | Use only for Super Admin checks. |

Also create one new guest account during QA to verify signup. Do not use real customer data.

### 4. Guest Testing Sequence

1. Open `/`.
2. Confirm BASIC marketplace copy is visible and no AI Concierge claims appear.
3. Search restaurants by name, cuisine, neighborhood, date, time, party size, and discount.
4. Clear filters.
5. Open a restaurant detail page or modal.
6. Confirm the modal scrolls and can be closed.
7. Start a reservation request.
8. Submit invalid data and confirm useful validation errors.
9. Submit a valid reservation request.
10. Confirm the success screen says the request was submitted, not confirmed.
11. Refresh the success screen and confirm no duplicate reservation is created.
12. Log in as the guest.
13. Open `/account/reservations`.
14. Confirm Pending, Accepted, Declined, Cancelled, and Completed labels are readable where present.
15. Cancel only an eligible reservation and confirm the reservation record remains visible.

### 5. Partner Testing Sequence

1. Open `/partner`.
2. Log in with the partner account.
3. Confirm no Super Admin controls appear.
4. Open reservations.
5. Confirm pending requests are easy to find.
6. Accept one pending request and confirm an explicit confirmation dialog appears.
7. Confirm the accepted reservation becomes non-actionable for accept/decline.
8. Decline a separate pending request and confirm the warning/finality is clear.
9. Confirm the UI displays “Declined,” not internal `rejected`.
10. Create an offer with valid data.
11. Try to save an incomplete offer and confirm validation blocks it.
12. Edit and deactivate/delete a test offer only if it is clearly safe test data.

### 6. Admin Testing Sequence

1. Open `/admin`.
2. Log in with the regular admin account.
3. Confirm admin dashboard loads.
4. Confirm restaurants, offers, users/partners, notifications, and content areas are reachable where implemented.
5. Confirm regular admin can view current platform mode but cannot change Super Admin-only platform settings.
6. Confirm invalid direct URLs show a safe forbidden or unavailable state.

### 7. Super Admin Testing Sequence

1. Log out of regular admin.
2. Log in with the Super Admin account.
3. Open `/admin`.
4. Confirm the current mode is Basic.
5. Confirm Platform Mode controls are visible.
6. Do not activate AI Concierge for BASIC QA unless a separate AI test is explicitly requested.
7. Search/filter reservations.
8. Open reservation details.
9. Cancel/correct only clearly labeled test reservations and only after the confirmation dialog.
10. Confirm no unfinished controls are presented as production-ready.

### 8. English, Spanish, And Hungarian Checks

For each language:

1. Select the language in the header.
2. Open `/`.
3. Open `/signup`.
4. Open a restaurant detail modal.
5. Open the booking form.
6. Open `/account/reservations`.
7. Open `/partner/reservations`.
8. Open `/admin`.
9. Confirm there are no raw translation keys, mixed-language BASIC labels, broken accents, or clipped long labels.

### 9. Desktop, Tablet, And Mobile Checks

Test at minimum:

| Device class | Viewports |
| --- | --- |
| Desktop | `1440 x 900`, `1366 x 768`, `1280 x 720` |
| Tablet | `1024 x 768`, `820 x 1180`, `768 x 1024` |
| Mobile | `430 x 932`, `390 x 844`, `375 x 667`, `360 x 800` |

At every size, check:

- no horizontal page scrolling;
- no clipped buttons or fields;
- modals scroll internally;
- header/navigation remains usable;
- date/time controls fit;
- tables or cards remain readable;
- touch targets are usable on mobile.

### 10. How To Record A Failure

For every failure, record:

1. Browser and version.
2. Device or viewport size.
3. Language.
4. Logged-in role.
5. Route.
6. Exact action taken.
7. Expected result.
8. Actual result.
9. Screenshot filename.
10. Console error, if any.
11. Reservation reference or restaurant name, if relevant.

### 11. Screenshots To Capture

Capture screenshots for:

- homepage at desktop, tablet, and mobile;
- restaurant detail modal with long content;
- booking form before submit;
- booking success state;
- guest reservations page;
- partner reservations page before and after Accept;
- partner reservations page before and after Decline;
- Super Admin dashboard with Basic mode visible;
- each failure;
- EN, ES, and HU homepage/search state.

### 12. When BASIC Can Be Declared Complete

BASIC can be declared complete only when:

1. All automated checks pass.
2. Chrome or Edge desktop manual QA passes.
3. At least one mobile-width browser simulation passes.
4. At least one real mobile browser/device pass is completed.
5. Guest reservation request, partner accept/decline, guest cancellation, admin review, and Super Admin controls are manually verified.
6. EN, ES, and HU are visually verified.
7. No critical accessibility or responsive blocker remains.
8. No AI Concierge, webhook, POS, Stripe, or unfinished feature appears in BASIC mode.

### 13. Simple Human QA Result Table

| Test area | Chrome desktop | Edge desktop | Mobile | Result | Notes |
|-----------|----------------|--------------|--------|--------|-------|
| Guest homepage/search |  |  |  |  |  |
| Restaurant detail modal |  |  |  |  |  |
| Booking form and success |  |  |  |  |  |
| Guest account/reservations |  |  |  |  |  |
| Partner reservations |  |  |  |  |  |
| Partner offers/profile |  |  |  |  |  |
| Admin dashboard |  |  |  |  |  |
| Super Admin platform mode |  |  |  |  |  |
| English localization |  |  |  |  |  |
| Spanish localization |  |  |  |  |  |
| Hungarian localization |  |  |  |  |  |
| Accessibility keyboard pass |  |  |  |  |  |
| Permission-denied states |  |  |  |  |  |
