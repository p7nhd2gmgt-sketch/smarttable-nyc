# Enterprise Rollback Procedure

## Code Rollback

1. Identify the last known-good Git commit or Vercel deployment.
2. Revert the deployment in Vercel.
3. Confirm `/api/health` and `/api/public/config`.
4. Run smoke tests for guest booking and partner dashboard.

## Database Rollback

The Enterprise migrations are additive. Prefer disabling feature access through configuration over dropping tables or columns.

If a migration problem occurs:

1. Stop public campaign sending.
2. Disable billing enforcement or set it to warning mode if subscription gating is causing access issues.
3. Preserve new tables for forensic review.
4. Create a new corrective migration instead of editing applied migration history.

## Provider Rollback

- Stripe: disable public checkout links and webhook endpoint configuration.
- Resend: pause campaign sends and rotate compromised API keys.
- Twilio: pause the messaging service, preserve suppression records, and rotate auth tokens if exposed.

Do not delete reservation, account, legal-consent, or delivery-log records as part of rollback.
