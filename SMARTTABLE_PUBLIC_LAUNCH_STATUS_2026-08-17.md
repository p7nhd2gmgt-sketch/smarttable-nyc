# SmartTable Public Launch Status

Date: 2026-08-17

## Current production evidence

- Production URL: `https://www.smarttablenyc.com`
- Runtime mode: `production`
- Health status: `ok`
- Database reachable: yes
- Transactional email configured: yes
- Production configuration issues reported by `/api/health`: none
- Public base URL: `https://www.smarttablenyc.com`
- `robots.txt`, `sitemap.xml`, Terms, Privacy, and restaurant listing: HTTP 200
- Production security headers include CSP, HSTS, and frame protection.

## Verified application status

- Production-hardening checks: PASS
- Billing production-readiness static checks: PASS
- Multi-market foundation checks: PASS
- Verified post-visit workflow static checks: PASS
- Latest complete browser suite: PASS, 38/38
- Stripe Sandbox Checkout, webhook processing, idempotency, Customer Portal, and the one-time video products have been verified in staging.

The release-audit wrapper was started again on 2026-08-17. Its completed checks passed, but the wrapper exceeded the command's 120-second execution limit while running the nested full suite. This was a command timeout, not a reported assertion failure.

## Completed Stripe Sandbox catalog

- SmartTable Partner: USD 149 per month
- SmartTable Standard Video Package: USD 299 one time
- SmartTable Premium Video Package: USD 499 one time

Price identifiers and secrets remain in protected environment configuration and are intentionally omitted from this report.

## Remaining public-launch blockers

1. Activate and verify the Stripe live account after the business and payout details are available.
2. Create the three products in Stripe live mode and configure protected live Price IDs.
3. Configure and verify the live webhook endpoint and Customer Portal.
4. Decide the sales-tax policy with qualified tax/accounting advice and configure Stripe Tax if required.
5. Apply the already tested migration `0062_partner_subscription_and_video_service_orders.sql` to production with a pre-apply snapshot and post-apply verification.
6. Deploy the final release candidate to production and run the complete role, reservation, email, review, mobile, and live Stripe smoke tests.
7. Replace remaining business placeholders in legal documents and obtain legal review before broad public promotion.
8. Confirm launch-day support ownership, monitoring, database backup/restore procedure, and incident contacts.

## Work that can continue without live Stripe

- Keep the release candidate and documentation synchronized.
- Run repeat mobile/tablet regression sweeps after UI changes.
- Audit and remove public QA artifacts while preserving approved test accounts.
- Prepare production migration `0062` preflight and rollback instructions without applying it.
- Prepare the live Stripe environment-variable and webhook checklist without storing secret values in source control.
- Prepare the final production smoke-test script and launch-day runbook.

## Current release decision

The non-Stripe application foundation is technically close to launch-ready. The complete public launch remains blocked by live Stripe activation, tax policy, production migration `0062`, final production deployment, and live payment verification.
