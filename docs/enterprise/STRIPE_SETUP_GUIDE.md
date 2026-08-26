# SmartTable Stripe Setup Guide

Scope: partner subscription billing and optional one-time video production services for SmartTable restaurant partners.

SmartTable charges restaurant partners through the SmartTable Stripe account. Do not use Stripe Connect for partner payouts; SmartTable is not paying restaurants through Stripe in this module.

## Required Stripe Objects

Create these Stripe Products and Prices in Test mode first, then repeat the approved catalog in Live mode:

- `SmartTable Partner`: recurring monthly Price, USD 149.00;
- `SmartTable Standard 3-second video`: one-time Price, USD 299.00;
- `SmartTable Premium 3-second video`: one-time Price, USD 499.00.

Store the resulting monthly Price IDs in protected server environment variables:

- `STRIPE_BASIC_MONTHLY_PRICE_ID`
- `STRIPE_VIDEO_STANDARD_PRICE_ID`
- `STRIPE_VIDEO_PREMIUM_PRICE_ID`

The launch catalog exposes one paid monthly subscription. Professional and Enterprise self-service plans remain disabled. Video package purchases are separate one-time payments and never activate, change, or renew a restaurant subscription.

Do not hardcode Price IDs in browser code. Do not store Stripe secret keys in the database.

## Payment Methods

Supported by the code:

- card payments;
- ACH / `us_bank_account` when `STRIPE_ENABLE_ACH=true`.

ACH availability depends on the Stripe account, country, verification state, and payment-method settings.

## Customer Portal

Enable Stripe Customer Portal in the Stripe Dashboard before exposing partner self-service billing. Configure:

- payment method update;
- invoice history;
- subscription cancellation;
- plan changes where supported by the active Stripe pricing model.

## Environment Variables

Required for live billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY` if a future browser Stripe.js flow needs it
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_BASIC_MONTHLY_PRICE_ID`
- `STRIPE_VIDEO_STANDARD_PRICE_ID`
- `STRIPE_VIDEO_PREMIUM_PRICE_ID`
- `STRIPE_PORTAL_CONFIGURATION_ID`
- `STRIPE_SELF_SERVICE_ENTERPRISE_ENABLED`
- `BILLING_DEFAULT_TRIAL_DAYS`
- `BILLING_GRACE_PERIOD_DAYS`
- `BILLING_OVERRIDE_MAX_DAYS`
- `PUBLIC_BASE_URL`

Optional:

- `STRIPE_API_VERSION`
- `STRIPE_ALLOW_PROMOTION_CODES`
- `STRIPE_ENABLE_ACH`
- `BILLING_ENFORCEMENT_MODE`

Never expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, protected Stripe Price IDs, raw webhook bodies, or raw card data to browser code. Only `STRIPE_PUBLISHABLE_KEY` may be public where a Stripe.js flow genuinely requires it; the current SmartTable flow creates Checkout and Portal sessions on the server.

## Verification

Run:

```bash
npm run check:billing
npm run check:stripe-webhook
npm run check:subscription-access
npm run check:billing-ui
npm run check:stripe-billing
```

The automated checks validate checkout creation through the SmartTable backend, protected plan mapping, signed webhook processing, duplicate webhook idempotency, out-of-order events, test/live separation, renewal, failed payment grace period, cancellation, plan changes through the portal, feature restriction behavior, admin override rules, and billing UI localization with mocked Stripe HTTP responses.

Manual live Stripe validation is still required before public billing.

For the optional $1 payment smoke test, create a separate one-time USD 1.00 Price in Stripe Test mode only. Do not expose it in the production partner UI and do not use a live card for automated verification.
