# SmartTable BASIC Release Manifest

Date: 2026-07-28
Scope: SmartTable BASIC 1.0 local/static release audit

This manifest records only features with evidence in the current repository and local command results. It does not certify production launch readiness. Production release still requires verified staging migrations, browser manual QA, external provider configuration, and production smoke testing.

## A. Enabled and fully functional

These items are enabled for BASIC because the feature registry marks them working and local release checks verify backend, UI, route, localization, and security evidence.

| Feature | Audience | Evidence |
| --- | --- | --- |
| Public homepage and navigation | Public | `npm run check:public-experience`, `npm run check:basic-ui-readiness`, `npm run check:basic-ui-behavior`, `npm run check:accessibility-readiness` |
| Restaurant listings | Public, guest, admin | `basic.restaurantListings`, public restaurants/offers API checks, SEO checks |
| Discounted table offers | Public, guest, partner, admin | `basic.discountOffers`, offer validity checks, public offers checks |
| Reservation requests | Guest, partner, admin | `basic.reservations`, reservation lifecycle checks, duplicate prevention checks |
| Guest account surface | Guest | signup/account checks, route protection checks, role-boundary checks |
| Favorites and restaurant follows | Guest, admin | `basic.favorites`, guest account checks, route protection checks |
| Verified guest reviews where supported | Guest, partner, admin | `basic.reviews`, public experience and route checks |
| Partner dashboard | Partner, admin | `basic.partnerDashboard`, security-boundary checks, restaurant administration checks |
| Admin management | Admin | `basic.adminManagement`, route protection, restaurant administration, onboarding migration checks |
| Restaurant administration foundation | Admin, superadmin | restaurant administration check, onboarding migration check, migration chain check |
| Fixed-subscription billing code paths and diagnostics | Partner, admin, superadmin | billing, Stripe webhook, subscription-access, and billing UI checks; not production-enabled until Stripe staging validation |
| Analytics and reporting code paths | Partner, admin, superadmin | analytics check and BASIC release audit |
| SEO and public metadata support | Public | server metadata injection, robots, sitemap, canonical, favicon, Open Graph evidence |
| Operations health endpoint shape | Operations, admin | release audit verifies `/api/health` reports database/email/config state without secrets |

## B. Hidden because external configuration is missing

These items must remain unavailable or non-claiming unless the named external configuration is verified.

| Item | Missing or unverified configuration | Required before enabling |
| --- | --- | --- |
| Stripe Checkout subscription start | Stripe test products, monthly Price IDs, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, staging webhook | Configure Stripe test mode and complete test Checkout |
| Stripe Customer Portal | Stripe portal configuration and customer/subscription state | Configure portal and verify return URLs |
| Stripe webhook-backed billing state | Stripe webhook endpoint secret and event delivery | Verify signed webhook processing and duplicate event idempotency |
| Resend delivery webhook tracking | `RESEND_WEBHOOK_SECRET` and Resend webhook event configuration | Verify signed delivery events in staging/production |
| Production email provider acceptance | Resend API key, verified sender domain, `EMAIL_FROM`, `PUBLIC_BASE_URL` | Send controlled staging/production test messages |
| Supabase production mode release health | Supabase project URL, anon key, service role key, applied migrations | Verify `/api/health` database reachability after deployment |

## C. Hidden because manual QA is incomplete

These flows have implementation and automated evidence but must not be signed off for public release until the manual QA checklist is completed.

| Item | Manual evidence still required |
| --- | --- |
| Full guest signup, email confirmation, login, password reset, and session persistence | Browser QA with protected test guest account |
| Full reservation lifecycle | Real browser reservation, partner accept/decline, guest status update, email verification |
| Partner invitation lifecycle | Browser QA for pending, resend, revoke, expire, accept once |
| Restaurant administration wizard | Browser QA for draft creation, duplicate warning, override reason, activation, suspend/archive/reactivate |
| View-as Guest/Partner | Browser QA for read-only banner, blocked writes, audit trail |
| Billing Checkout/Portal | Stripe test Checkout, webhook confirmation, portal, cancellation and failed-payment test |
| Analytics exports | CSV/PDF files manually opened and verified |
| Mobile release readiness | 320, 375, 390, 430, 768, 1024, and 1440 px browser QA |

## D. Admin-only

| Item | Access boundary |
| --- | --- |
| Admin dashboard | Authenticated admin only |
| Restaurant creation and lifecycle management | Admin and superadmin only |
| Partner invitation management | Admin and superadmin only |
| Resend failed transactional emails | Superadmin-only secure resend where implemented |
| Billing diagnostics and overrides | Admin/superadmin according to billing authorization rules |
| Analytics aggregation | Admin sees authorized scope; superadmin sees global scope |
| Audit history | Authorized admin/superadmin only |
| Health/config diagnostics beyond public-safe status | Admin-only where detailed diagnostics exist |

## E. Test-only

| Item | Rule |
| --- | --- |
| SmartTable Test Bistro | Must be marked test data and excluded from ordinary public search unless test mode is explicit |
| Test guest, partner, admin, and superadmin accounts | Must be created through protected setup; no hardcoded passwords |
| Test offers and reservations | Must be marked `is_test_data` where schema supports it and excluded from billing/revenue analytics |
| Local/demo mode data | Development-only; production must not silently fall back to demo mode |

## F. Future/non-BASIC

| Item | Status |
| --- | --- |
| AI Dining Concierge | Future/non-BASIC; hidden |
| AI preference survey | Future/non-BASIC; hidden |
| AI restaurant recommendation | Future/non-BASIC; hidden |
| AI demand engine | Future/non-BASIC; hidden |
| AI route planning | Future/non-BASIC; hidden |
| Calendar sync | Disabled; hidden |
| Push notifications | Disabled; hidden |
| SMS notifications | Disabled; hidden |
| Referral program | Hidden |
| Loyalty/photo rewards | Demo; hidden from public BASIC |
| POS integrations | Prohibited |
| Stripe Connect, payouts, guest payments, deposits, tips | Out of scope for BASIC |
| Resy/OpenTable/SevenRooms live integrations | Future reservation-platform integration only; not live BASIC |

## G. Known low-risk limitations

| Limitation | Risk |
| --- | --- |
| Local tests intentionally log `EMAIL_PROVIDER_NOT_CONFIGURED` when live Resend credentials are absent | Low in local development; production must be verified separately |
| Billing implementation is present but gated until Stripe staging setup is complete | Low if user-facing billing actions remain unavailable or accurately blocked |
| Analytics depend on available reservation, offer, favorite, and profile data; empty states must remain truthful | Low if no fake values are shown |
| Historical migration `0028_remove_pos_integration_references.sql` contains cleanup statements and should be reviewed before full chain replay | Low for current local audit; requires migration review before fresh environment replay |

## H. Blocking issues

The production release gate is blocked until all items below are complete:

- Verified staging Supabase project is linked.
- Pending migrations are applied to staging only and schema verification passes.
- Staging RLS and tenant isolation are verified.
- Four protected role accounts are created without committed passwords.
- Full browser manual QA is completed.
- A real reservation lifecycle is tested end to end.
- Resend staging/production configuration and email delivery are verified.
- Stripe test Checkout, webhook, and Customer Portal are verified.
- CSV/PDF exports are manually opened.
- Mobile QA is completed.
- Production smoke test is completed after deployment.

## I. Required staging steps

1. Confirm the staging Supabase project reference without printing secrets.
2. Back up or snapshot staging where supported.
3. Apply pending migrations to staging only.
4. Run `npm run check:onboarding-migration`.
5. Run `npm run check:restaurant-administration`.
6. Run `npm run check:migration-chain`.
7. Verify RLS and tenant isolation for guest, partner, admin, and superadmin roles.
8. Configure Resend webhook secret and verify signed delivery tracking.
9. Configure Stripe test products, monthly prices, webhook endpoint, and Customer Portal.
10. Run Stripe test Checkout and webhook confirmation.
11. Complete browser manual QA using protected role accounts.
12. Re-run `npm run check:basic-release-audit`.

## J. Required production steps

1. Review staging results and confirm no blocking issues remain.
2. Confirm production environment variables without printing values.
3. Confirm Supabase Auth URL and redirect configuration.
4. Confirm Resend sender domain and webhook event configuration.
5. Confirm Stripe live/test-mode release policy before exposing billing.
6. Deploy only after explicit approval.
7. Verify `/api/health` and `/api/public/config`.
8. Run public smoke tests on desktop and mobile.
9. Run one controlled production reservation test using test data only.
10. Verify email delivery, reservation status, role isolation, and audit logs.
11. Keep rollback instructions ready before opening public traffic.
