# SmartTable Resend Webhook and Admin Resend

Date: 2026-07-27

## Scope

This note covers the production setup for Resend delivery tracking and the Super Admin reservation email resend action.

This does not change reservation status behavior. Delivery events update only SmartTable email queue and email log records.

## Production Webhook

Production URL:

```text
https://smarttablenyc.com/api/webhooks/resend
```

Enable these Resend webhook events:

```text
email.sent
email.delivered
email.delivery_delayed
email.bounced
email.complained
email.failed
```

Required Vercel environment variable:

```text
RESEND_WEBHOOK_SECRET
```

Use the signing secret shown by the Resend webhook configuration. Do not commit this value to source control and do not print it in logs.

After adding or rotating `RESEND_WEBHOOK_SECRET`, redeploy production so the Vercel runtime receives the value.

## Signature Verification

The webhook endpoint verifies Svix-style Resend signatures using:

```text
svix-id
svix-timestamp
svix-signature
```

The signed payload is the raw request body. In production, unsigned requests and legacy local-only HMAC signatures are rejected.

## Delivery Statuses

SmartTable supports these delivery states:

```text
queued
sending
sent
delivered
delayed
failed
bounced
complained
```

Migration required before relying on delayed/sending status writes in production:

```text
supabase/migrations/0051_resend_webhook_delivery_statuses.sql
```

The migration only widens existing status check constraints on `email_logs` and `email_queue`. It does not delete data, drop tables, weaken RLS, or modify reservation records.

## Idempotency

Webhook events are stored in `metadata.provider_events` on the matching email log. The endpoint uses the webhook event id to avoid reprocessing duplicate deliveries.

Status updates do not downgrade final states. For example, a later `email.sent` event cannot move a delivered message back to sent.

## Stored Provider Data

Stored fields are limited to:

- provider message id
- event type
- event timestamp
- mapped delivery status
- sanitized error details when relevant
- linked email log id and queue id

Secrets, API keys, full raw payloads, passwords, session tokens, and complete private payload data must not be stored or logged.

## Admin Resend

Endpoint:

```text
POST /api/admin/email-queue
```

Action:

```json
{
  "action": "resend_reservation_email",
  "id": "reservation-uuid",
  "target": "guest"
}
```

The `target` may be:

```text
guest
partner
```

Security behavior:

- only authenticated `super_admin` users may use the action
- anonymous users and restaurant partners are rejected
- the recipient is loaded from the reservation and restaurant records
- user-supplied recipient addresses are ignored
- a new queue/log attempt is created
- old failure history is preserved
- rapid duplicate retries are rate-limited
- an audit log entry is attempted
- reservation status is not changed

The Admin reservation table exposes:

```text
Resend guest email
Resend partner email
```

These controls are not shown on the partner reservation table.

## Verification Steps

1. Apply `supabase/migrations/0051_resend_webhook_delivery_statuses.sql` to production through the approved Supabase migration process.
2. Add `RESEND_WEBHOOK_SECRET` in Vercel Production.
3. Redeploy production.
4. In Resend, create or update the webhook endpoint for `https://smarttablenyc.com/api/webhooks/resend`.
5. Enable the six required events.
6. Send a controlled reservation email.
7. Confirm the email log and queue rows are created with provider message ids.
8. Trigger or wait for a Resend delivery event.
9. Confirm `email_logs.status` and `email_queue.status` update to the mapped delivery state.
10. Re-deliver the same webhook event and confirm no duplicate event is added.
11. Use a Super Admin account to resend a guest and partner reservation email separately.
12. Confirm new queue/log attempts are created and the original reservation status is unchanged.

## Manual Verification Still Required

Provider acceptance is not the same as inbox receipt. Do not mark inbox delivery as passed until a human or connected mailbox confirms the message arrived.

If Gmail access is unavailable, record:

- masked recipient
- subject
- approximate send time
- provider message id
- queue id
- email log id
