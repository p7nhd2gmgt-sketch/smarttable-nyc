# SmartTable Owner Bank Payout Configuration

SmartTable collects partner subscription fees into the SmartTable Stripe account. No restaurant payout flow is implemented.

## Dashboard Steps

In Stripe Dashboard:

1. Complete business verification.
2. Add the SmartTable business bank account.
3. Configure payout schedule.
4. Confirm tax and legal entity details.
5. Enable required payment methods.
6. Enable Customer Portal.
7. Review failed-payment and invoice email settings.

## Important Boundary

Do not configure Stripe Connect for this module unless a future, separate marketplace-payout architecture is approved. Partner subscription fees are SmartTable revenue.

## Operational Checks

Before public billing:

- confirm the bank account is verified;
- run a test subscription;
- confirm test invoices are visible;
- confirm failed-payment recovery emails are configured;
- confirm refund and cancellation policies with legal/accounting.
