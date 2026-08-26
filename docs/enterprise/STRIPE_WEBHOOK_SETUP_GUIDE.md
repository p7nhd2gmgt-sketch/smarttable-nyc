# SmartTable Stripe Webhook Setup Guide

Production endpoint:

```text
https://smarttablenyc.com/api/webhooks/stripe
```

## Required Events

Enable at least:

- `checkout.session.completed`
- `customer.created`
- `customer.updated`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.created`
- `invoice.finalized`
- `invoice.payment_succeeded`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Signature Secret

Copy the Stripe webhook signing secret into Vercel as:

```text
STRIPE_WEBHOOK_SECRET=
```

Never commit this value.

## Processing Rules

SmartTable verifies the Stripe signature server-side before processing. Events are stored in `billing_events` with `stripe_event_id` as the idempotency key. Repeated delivery of the same event must not create duplicate billing-event rows.

## Local Testing

Use Stripe CLI or dashboard test events against a local tunnel when needed. Automated repository checks generate Stripe-style HMAC signatures and exercise the real webhook handler without calling Stripe.

Run:

```bash
npm run check:stripe-webhook
```

This rejects invalid signatures, verifies duplicate-event idempotency, stores test/live event separation, and confirms missing restaurant metadata or unknown customers are handled safely.

## Production Verification

After setup:

1. Create a test checkout session.
2. Complete a test payment.
3. Confirm `billing_events.processing_status=processed`.
4. Confirm the restaurant subscription status is updated.
5. Replay the same event and confirm no duplicate billing record is created.
