# SmartTable BASIC 1.0 Manual QA Checklist

Date prepared: 2026-07-28

Instructions: complete this checklist in a verified staging environment first. Use production only after staging migration, release checks, and owner approval pass. Do not use real customer data.

## Public

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Anonymous | Open `/` | Homepage loads, one H1, hero copy is current, search visible |  |  |
| Anonymous | Open `/restaurants` | Restaurant listing loads with active non-test restaurants only |  |  |
| Anonymous | Open `/offers` | Offers load with active, public, non-test offers only |  |  |
| Anonymous | Use search filters | Results update without page break or horizontal overflow |  |  |
| Anonymous | Switch EN/ES/HU language | Visible public copy changes and page remains in place |  |  |
| Anonymous | Open footer Contact link | `/contact` loads; Contact is absent from top navigation |  |  |
| Anonymous | Open `/robots.txt` and `/sitemap.xml` | Public sitemap exists; private routes are disallowed/noindexed |  |  |
| Anonymous | Inspect page metadata | Title, description, canonical, Open Graph, favicon are present |  |  |

## Guest

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| New guest | Complete signup | Account creation succeeds or confirmation-required state appears |  |  |
| New guest | Confirm email if enabled | Confirmation callback shows success and login is possible |  |  |
| Guest | Log in | Account dashboard opens; session persists after refresh |  |  |
| Guest | Log out | Local session clears and protected pages redirect to login |  |  |
| Guest | Request password reset | Reset email is requested with neutral safe response |  |  |
| Guest | Complete password reset | Password changes and security notification is attempted |  |  |
| Guest | Update profile/preferences | Save succeeds; validation errors are readable |  |  |
| Guest | Add/remove favorite | Only own favorites update |  |  |
| Guest | Open partner/admin/superadmin route | Access denied or login route; no privileged data |  |  |

## Partner

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Partner owner | Accept valid invitation | Partner creates own password; invitation becomes accepted |  |  |
| Partner owner | Log in via partner entry | Assigned restaurant dashboard opens |  |  |
| Partner owner | View reservations | Only assigned restaurant reservations are visible |  |  |
| Partner owner | Create/edit offer | Allowed for assigned restaurant; audit/event recorded where supported |  |  |
| Partner owner | Accept reservation | Reservation status updates for guest and partner |  |  |
| Partner owner | Decline reservation | Reservation status updates for guest and partner |  |  |
| Partner read_only | Attempt write action | Server rejects write; UI shows safe error |  |  |
| Partner reservation_staff | Attempt owner-only action | Server rejects action |  |  |
| Partner marketing_staff | Attempt owner-only action | Server rejects action |  |  |
| Partner | Try another restaurant ID | Server rejects cross-restaurant access |  |  |

## Admin

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Admin | Log in to `/admin` | Admin dashboard opens |  |  |
| Admin | Create draft restaurant | Draft is created; not public until activation |  |  |
| Admin | Attempt duplicate restaurant | Duplicate warning appears and blocks by default |  |  |
| Admin | Override duplicate with reason | Override succeeds only with written reason and audit event |  |  |
| Admin | Invite partner | Secure invitation is created and email attempted |  |  |
| Admin | Resend invitation | Pending/expired invitation is resent; no raw token in UI/logs |  |  |
| Admin | Revoke invitation | Revoked invitation cannot be accepted |  |  |
| Admin | Activate restaurant | Required readiness checks pass; status change is audited |  |  |
| Admin | Suspend/archive restaurant | Reason required; public visibility follows safe rule |  |  |
| Admin | Open `/superadmin` | Access denied |  |  |
| Admin | Try self-promotion | Server rejects privilege escalation |  |  |

## Superadmin

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Superadmin | Open `/superadmin` | Superadmin dashboard opens |  |  |
| Superadmin | Open `/superadmin/settings` | Settings page opens without exposing secrets |  |  |
| Superadmin | View global analytics | Aggregated data only; no guest PII leakage |  |  |
| Superadmin | Use controlled billing diagnostics | Stripe IDs are masked where appropriate |  |  |
| Superadmin | Start View as Guest | Read-only banner appears; audit event recorded |  |  |
| Superadmin | Start View as Partner | Scoped partner view appears; audit event recorded |  |  |
| Superadmin | End View-as | Original admin context is restored |  |  |
| Superadmin | Sensitive action | Requires confirmation/reason where implemented and is audited |  |  |

## Restaurant Administration

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Admin/Superadmin | Open restaurant list | Search, pagination, filters, status badges visible |  |  |
| Admin/Superadmin | Complete Step 1 basic info | Required fields validate; slug suggestion is safe and unique |  |  |
| Admin/Superadmin | Complete public profile | URLs/images validate; unsafe input rejected |  |  |
| Admin/Superadmin | Configure hours | Structured periods save; overlaps rejected |  |  |
| Admin/Superadmin | Configure reservations | Party size, lead time, policies validate |  |  |
| Admin/Superadmin | Configure tables/capacity | Negative capacity and duplicate table names rejected |  |  |
| Admin/Superadmin | Manage partner access | Roles can be added, changed, deactivated without deleting users |  |  |
| Admin/Superadmin | Review activation readiness | Missing required fields and warnings are shown |  |  |
| Admin/Superadmin | View audit history | Relevant lifecycle and access events appear |  |  |

## Reservations

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Guest | Select restaurant, offer, date, time, party size | Reservation form validates availability |  |  |
| Guest | Submit reservation | Pending reservation saved; success screen visible |  |  |
| Guest | Submit duplicate reservation | Duplicate request is blocked safely |  |  |
| Guest | Try invalid party size | Validation blocks submission |  |  |
| Partner | Accept pending reservation | Guest dashboard reflects accepted status |  |  |
| Partner | Decline pending reservation | Guest dashboard reflects declined status |  |  |
| Guest | Cancel eligible reservation | Status updates only for own reservation |  |  |
| Two sessions | Attempt final-slot concurrent booking | Only one succeeds; capacity never negative |  |  |

## Email

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Guest | Signup | Supabase confirmation email sent if confirmation enabled |  |  |
| Guest | Password reset | Reset email uses production URL and no localhost |  |  |
| Guest | Password changed | Security notification attempted after successful change |  |  |
| Admin | Invite partner | Invitation email accepted by provider |  |  |
| Guest | Create reservation | Guest confirmation and partner notification accepted |  |  |
| Partner | Accept reservation | Guest accepted email accepted/tracked |  |  |
| Partner | Decline reservation | Guest declined email accepted/tracked |  |  |
| Admin/Superadmin | Resend failed reservation email | Only authorized resend works; history preserved |  |  |
| Resend webhook | Deliver/bounce/complaint event | Queue/log status updates idempotently |  |  |

## Billing

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Guest | Try checkout endpoint | Rejected |  |  |
| Unauthorized partner | Try another restaurant billing | Rejected |  |  |
| Partner owner/manager | Open billing page | State loads; no raw Stripe secret or card data |  |  |
| Partner owner/manager | Start test Checkout | Stripe test Checkout URL returned only after authorization |  |  |
| Partner owner/manager | Open Customer Portal | Stripe test portal opens only for linked customer |  |  |
| Stripe webhook | Send signed event | Signature verified and event processed once |  |  |
| Stripe webhook | Send duplicate event | Idempotent success; no duplicate billing state |  |  |
| Admin/Superadmin | Apply billing override | Reason and expiration required; audit event recorded |  |  |

## Analytics

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Partner | Open analytics | Only assigned restaurant aggregate analytics visible |  |  |
| Partner | Apply date/status/offer filters | Cards and charts update with real data |  |  |
| Partner | Export CSV/XLS/PDF | Export downloads; no guest PII |  |  |
| Admin | Open admin analytics | Authorized restaurant aggregation visible |  |  |
| Superadmin | Open superadmin analytics | Global aggregation visible; no PII leakage |  |  |
| Partner/Admin | Review Health Score | Score is deterministic and non-AI |  |  |
| Partner/Admin | Review recommendations | Recommendations are rule-based and labeled |  |  |

## Mobile

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Anonymous | Test 320px, 375px, 390px, 430px | No horizontal overflow; CTA/search usable |  |  |
| Guest | Signup on mobile | Fields readable, no overlap, submit disabled during processing |  |  |
| Guest | Reservation on mobile | Date/time/party controls usable with 44px touch targets |  |  |
| Partner | Dashboard on mobile | Tables scroll within containers; actions remain reachable |  |  |
| Admin | Restaurant wizard on tablet/mobile | Forms stack safely and validation remains visible |  |  |

## Accessibility

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Keyboard user | Tab through public homepage | Focus order is logical and visible |  |  |
| Keyboard user | Use language selector | Arrow keys, Enter, Escape work |  |  |
| Keyboard user | Open/close modals | Focus is trapped and restored |  |  |
| Screen reader spot-check | Review forms | Labels and errors are announced |  |  |
| Reduced-motion user | Use CTA scroll/modal transitions | Motion is reduced where preference is set |  |  |
| Low vision spot-check | Review contrast and zoom | Text remains readable and unclipped |  |  |

## Security

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Anonymous | Open protected API routes | 401 authentication required |  |  |
| Guest | Open partner/admin APIs | 403 forbidden |  |  |
| Partner | Tamper restaurant_id | 403 forbidden |  |  |
| Admin | Try superadmin-only action | 403 forbidden |  |  |
| Any role | Submit unsafe URL/HTML fields | Unsafe input rejected or sanitized |  |  |
| Any role | Repeat sensitive request rapidly | Rate limit or duplicate protection applies |  |  |
| Auditor | Inspect public config/browser bundle | No service-role, Resend, Stripe, webhook secrets |  |  |
| Auditor | Review logs from QA session | No passwords, tokens, API keys, raw secrets |  |  |

## Operations

| Account/Role | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Operator | Open `/api/health` | Accurate status; no fake healthy state |  |  |
| Operator | Open `/api/public/config` | BASIC mode, no secrets |  |  |
| Operator | Verify database reachability | Health reports true only when Supabase is reachable |  |  |
| Operator | Verify email config | Health/config report email status safely |  |  |
| Operator | Verify Stripe config | Admin-only diagnostics report test-mode setup safely |  |  |
| Operator | Review deployment rollback | Last known-good Vercel deployment identified |  |  |
| Operator | Review incident contacts | Contact placeholders replaced with real owner-approved details |  |  |
