# SmartTable Enterprise 3.1.2 Final Report

Date: 2026-07-22

## What Already Existed

- BASIC guest, partner, admin, and Super Admin role separation.
- Guest reservation lifecycle and transactional email queue.
- Resend transactional email service.
- Supabase-backed production mode and demo fallback for local checks.
- Initial Stripe subscription tables and billing endpoints.
- Initial communication preference, campaign, SMS, and notification tables.

## What Was Added

- Signed Stripe webhook regression coverage for checkout, renewal, failed payment, cancellation, duplicate events, plan changes, and feature restriction.
- Communications regression coverage for consent enforcement, tenant isolation, recipient snapshotting, scheduled processing, duplicate prevention, provider failures, STOP/HELP, quiet hours, admin broadcast permissions, multilingual rendering, and no raw recipient-list exposure.
- Compliance hardening fields for audit logs, queues, campaign recipients, billing events, retention, locks, retry limits, and dead-letter state.
- Operational setup guides for Stripe, Resend, Twilio/A2P, consent, admin communications, partner campaigns, migrations, rollback, security, and legal review.

## Migrations Created

- `supabase/migrations/0049_enterprise_compliance_hardening.sql`

## Environment Variables Required

See `docs/enterprise/ENVIRONMENT_VARIABLE_LIST.md`.

## External Dashboard Configuration Still Required

- Stripe products and prices.
- Stripe webhook endpoint and signing secret.
- Stripe Customer Portal.
- SmartTable owner bank account in Stripe.
- Resend sender domain DNS and verified sender.
- Twilio messaging service, A2P 10DLC registration, and webhook URL.
- Production legal mailing address.

## Tests Executed

All commands below were run locally on 2026-07-22:

- `npm.cmd run lint` - PASS
- `npm.cmd run typecheck` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run check:stripe-billing` - PASS
- `npm.cmd run check:partner-communications` - PASS
- `npm.cmd run check:enterprise-communications` - PASS
- `npm.cmd test` - PASS
- `npm.cmd run test:e2e` - PASS, 12 Playwright smoke tests in desktop Chromium and mobile Chromium

The Stripe check uses the real SmartTable backend checkout route and real Stripe webhook signature verifier with deterministic Stripe-style signed payloads. Outbound Stripe HTTP calls are mocked at the network boundary so no live Stripe account or payment credentials are used in automated tests.

The communications checks validate consent gating, suppression, tenant isolation, queue snapshotting, provider-failure reporting, STOP/HELP handling, quiet-hour behavior, admin broadcast permissions, multilingual content, and no raw recipient-list exposure.

## Migration Validation

Static migration validation was run across `0046` through `0049`. `0048_sms_system_notifications.sql` intentionally uses `DROP POLICY IF EXISTS` before recreating RLS policies, which is an idempotent policy-replacement pattern. No table drops, truncation, production data inserts, or destructive data changes were added in this pass.

## Unresolved Issues

- Live Stripe billing and webhook delivery require external Stripe dashboard setup.
- Public marketing email requires a legal business mailing address and legal review.
- Public SMS requires Twilio/A2P approval and legal/operational review.
- Provider delivery webhooks must be configured in production before claiming delivered/bounced analytics.

## Manual QA Checklist

- [ ] Apply migrations through Supabase.
- [ ] Verify RLS on new tables.
- [ ] Configure Stripe products, prices, portal, and webhooks.
- [ ] Complete a Stripe test subscription checkout.
- [ ] Replay a Stripe webhook and confirm idempotency.
- [ ] Configure Resend campaign sender DNS.
- [ ] Send one approved marketing test email and verify unsubscribe link.
- [ ] Configure Twilio/A2P and send one approved test SMS.
- [ ] Verify STOP and HELP behavior from a controlled phone.
- [ ] Create a partner campaign and confirm audience count hides raw emails.
- [ ] Create an admin broadcast test send to one explicit recipient.
- [ ] Confirm legal review is complete before public marketing.
