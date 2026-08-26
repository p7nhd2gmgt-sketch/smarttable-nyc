# SmartTable Enterprise 3.1.2 - Stripe Partner Subscriptions

## Scope

SmartTable collects recurring subscription fees from restaurant partners through the SmartTable Stripe account. This module does not use Stripe Connect, restaurant payouts, POS integrations, order data, inventory data, payment card storage, or restaurant revenue imports.

## Required Production Configuration

Server-side only:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_API_VERSION`
- `STRIPE_WEBHOOK_TOLERANCE_SECONDS`
- `STRIPE_ENABLE_ACH`
- `STRIPE_ALLOW_PROMOTION_CODES`
- `STRIPE_BASIC_MONTHLY_PRICE_ID`
- `STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID`
- `STRIPE_ENTERPRISE_MONTHLY_PRICE_ID`
- `STRIPE_PORTAL_CONFIGURATION_ID`
- `STRIPE_SELF_SERVICE_ENTERPRISE_ENABLED`
- `BILLING_DEFAULT_TRIAL_DAYS`
- `BILLING_GRACE_PERIOD_DAYS`
- `BILLING_OVERRIDE_MAX_DAYS`
- `BILLING_ENFORCEMENT_MODE`

Existing required platform configuration remains unchanged:

- `PUBLIC_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional public key:

- `STRIPE_PUBLISHABLE_KEY`

The current implementation creates Checkout and Customer Portal sessions server-side, so `STRIPE_PUBLISHABLE_KEY` is documented for Stripe compatibility but does not need to be exposed through `/api/public/config`. No Stripe secret, webhook secret, protected Price ID, or raw card data may be exposed through `/api/public/config`, browser bundles, logs, or client-side HTML.

## Database

Migration:

- `supabase/migrations/0046_stripe_partner_subscriptions.sql`
- `supabase/migrations/0056_fixed_monthly_restaurant_subscriptions.sql`

Tables:

- `subscription_plans`
- `restaurant_subscriptions`
- `billing_events`

Invoice compatibility:

- `invoices.restaurant_subscription_id`
- `invoices.stripe_subscription_id`
- `invoices.invoice_pdf`
- `invoices.period_start`
- `invoices.period_end`
- `invoices.metadata`

The migration is additive and idempotent. It does not delete or reset existing restaurants, reservations, users, invoices, or legacy billing rows.

## Webhook

Production endpoint:

- `https://smarttablenyc.com/api/webhooks/stripe`

Required Stripe events:

- `checkout.session.completed`
- `customer.created`
- `customer.updated`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.created`
- `invoice.finalized`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

The endpoint verifies the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`, records each event in `billing_events`, and processes events idempotently by `stripe_event_id`.

## Partner Billing

Endpoint:

- `GET /api/partner/billing`
- `POST /api/partner/billing`

Supported actions:

- `checkout`
- `change_plan`
- `portal`
- `cancel_at_period_end`

Checkout and Customer Portal sessions are created server-side. The client receives only Stripe-hosted URLs and session IDs, never Stripe credentials.

## Admin Billing

Endpoint:

- `GET /api/admin/billing`
- `POST /api/admin/billing`

Supported admin actions:

- `save_plan`
- `grant_complimentary_access`
- `extend_trial`
- `grant_billing_override`
- `remove_billing_override`
- `resend_billing_email`
- `correct_billing_plan` for superadmin
- `set_enterprise_contract_state` for superadmin
- `reconcile_billing` for superadmin

Admins can view plan catalog records, restaurant subscription state, invoice history, and Stripe event logs. Price changes should be made in Stripe first, then linked by updating the corresponding Stripe price IDs in SmartTable.

## Billing Enforcement

`BILLING_ENFORCEMENT_MODE` controls partner feature gating:

- `warn`: return billing warnings but preserve current BASIC behavior.
- `strict`: require trialing, active, grace-period, or complimentary subscription access for partner offer and reservation mutations.
- `off`: expose billing status without enforcement.

Server-side checks live in `requirePartnerBillingMutationAccess()` and are applied to partner offer mutations and partner reservation mutations. UI hiding is not the enforcement boundary.

## Manual Production Setup

1. Apply `0046_stripe_partner_subscriptions.sql` and `0056_fixed_monthly_restaurant_subscriptions.sql` to a verified staging project first.
2. Create Stripe products and monthly recurring Prices in the SmartTable Stripe account. Annual billing is out of scope for this fixed-subscription phase.
3. Set `STRIPE_BASIC_MONTHLY_PRICE_ID`, `STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID`, and, when approved, `STRIPE_ENTERPRISE_MONTHLY_PRICE_ID` in the server environment.
4. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION_ID`, `BILLING_DEFAULT_TRIAL_DAYS`, `BILLING_GRACE_PERIOD_DAYS`, `BILLING_OVERRIDE_MAX_DAYS`, and `PUBLIC_BASE_URL`.
5. Configure the Stripe webhook endpoint and required events.
6. Set `BILLING_ENFORCEMENT_MODE=strict` only after all existing production restaurant partners have trial, active, or complimentary access rows.
7. Run `npm run check:billing`, `npm run check:stripe-webhook`, `npm run check:subscription-access`, `npm run check:billing-ui`, `npm run check:stripe-billing`, `npm run build`, `npm run lint`, and `npm test`.
