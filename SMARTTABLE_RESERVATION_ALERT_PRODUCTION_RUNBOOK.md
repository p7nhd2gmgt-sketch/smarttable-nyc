# SmartTable reservation alert production runbook

## Scope

This runbook covers the partner reservation alert chain:

1. in-dashboard real-time popup;
2. repeating reservation sound and supported-device vibration;
3. standards-based Web Push and application badge;
4. transactional email;
5. delayed Twilio SMS fallback;
6. delayed Twilio voice-call escalation.

Acknowledging an alert never accepts the reservation. Reservation actions remain separate server-authorized operations.

## Current release state

- The browser and server implementation is complete.
- Migration `0063_reservation_alert_voice_escalation.sql` has been verified on staging.
- Production has not been changed by this implementation task.
- Production delivery remains blocked until the environment, scheduler, and controlled delivery gates below pass.

## Protected production configuration

Configure these names in Vercel Production. Never paste their values into source control, screenshots, tickets, or this document.

### Web Push

- `PUSH_PROVIDER=web-push`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

### Worker

- `RESERVATION_ALERT_WORKER_SECRET`
- `CRON_SECRET` may remain as the supported Vercel fallback

The worker secret must be a cryptographically random value with at least 32 characters.

### Twilio SMS

- `SMS_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_STATUS_CALLBACK_URL=https://www.smarttablenyc.com/api/webhooks/sms/twilio`

### Twilio Voice

- `VOICE_PROVIDER=twilio`
- `TWILIO_VOICE_FROM_NUMBER`
- `TWILIO_VOICE_STATUS_CALLBACK_URL=https://www.smarttablenyc.com/api/webhooks/voice/twilio`

The voice number must be a Twilio-capable E.164 number permitted to call the approved QA destination.

### Operational limits

- `RESERVATION_ALERT_SMS_FALLBACK_SECONDS=60`
- `RESERVATION_ALERT_ESCALATION_SECONDS=300`
- `RESERVATION_ALERT_VOICE_DELAY_SECONDS=480`
- `RESERVATION_ALERT_SMS_MAX_ATTEMPTS=3`
- `RESERVATION_ALERT_PUSH_MAX_ATTEMPTS=3`
- `RESERVATION_ALERT_VOICE_MAX_ATTEMPTS=2`

Keep all rate limits and bounded retry settings enabled.

## Database gate

Before production application:

1. Verify the linked Supabase project reference is the approved production reference and is not staging.
2. Capture row counts for restaurants, profiles, offers, reservations, and alert tables.
3. Dry-run migration `0063_reservation_alert_voice_escalation.sql`.
4. Confirm it contains no `DROP TABLE`, `TRUNCATE`, or data `DELETE`.
5. Apply only the migration that is absent from production history.
6. Recheck row counts and required columns, constraint, index, RLS, and policy state.

Do not reset, seed, or repair production data as part of this release.

## One-minute scheduler

The escalation worker is:

`POST https://www.smarttablenyc.com/api/system/reservation-alerts/process`

It requires:

`Authorization: Bearer <RESERVATION_ALERT_WORKER_SECRET>`

The repository declares a one-minute schedule in `vercel.json`. If the active Vercel plan does not execute one-minute jobs, configure an external scheduler with the same one-minute interval and protected authorization header. Confirm two consecutive successful invocations before enabling SMS or Voice for a restaurant.

Never put the worker secret in a query string.

## Twilio configuration

1. Use the production Twilio account intended for SmartTable.
2. Attach the approved sender to the Messaging Service.
3. Configure geographic permissions and messaging compliance for intended destinations.
4. Set the SMS and Voice callback URLs exactly as listed above.
5. Limit test delivery to approved QA phone numbers.
6. Verify Twilio request signatures are accepted and unsigned callback requests return HTTP 401.
7. Confirm provider errors are recorded without credentials or unmasked phone numbers.

## Controlled production QA

Use only approved SmartTable test accounts, the hidden test restaurant, and approved QA contact destinations.

### Immediate channels

1. Sign in as the test restaurant partner on a registered tablet or phone.
2. Enable popup, sound, push, and email.
3. Register the device and confirm push permission is granted.
4. Create one controlled future QA reservation through the real guest UI.
5. Confirm the partner receives the popup without refresh.
6. Confirm the sound repeats while the alert is unacknowledged.
7. Confirm supported devices vibrate and receive Web Push.
8. Confirm the push preview contains no guest email, phone number, or other unnecessary personal data.
9. Confirm the transactional email is delivered.
10. Confirm the browser/app pending badge increments.

### Acknowledgement boundary

1. Acknowledge the alert.
2. Confirm the reservation remains pending.
3. Confirm no SMS or Voice fallback is sent after acknowledgement.
4. Accept or decline only through the separate reservation action.

### Escalation channels

1. Create a second controlled QA reservation.
2. Leave the alert unacknowledged.
3. Confirm one primary SMS after the configured fallback delay.
4. Confirm no unlimited duplicate SMS is produced.
5. Confirm one voice escalation after the configured voice delay.
6. Confirm provider message/call IDs and delivery status appear in protected dashboards.
7. Confirm temporary failures use bounded retries.

### Failure behavior

Temporarily disable the provider in a non-customer-impacting test window and confirm reservation creation still succeeds while the alert delivery is recorded as failed. Restore the provider immediately afterward.

## Verification commands

```powershell
npm.cmd run check:reservation-alerts
npm.cmd run check:reservation-alert-production-readiness
npm.cmd run check:reservation-alert-production-readiness -- --target=production --require-operational
npm.cmd run check
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

The production command reads protected local snapshots when present and reports only presence, format validity, and gate status. It must never print values.

## Operational proof flags

Set these to `true` only after the corresponding controlled production check has actually passed:

- `RESERVATION_ALERT_SCHEDULER_VERIFIED`
- `WEB_PUSH_PRODUCTION_VERIFIED`
- `TWILIO_PRODUCTION_VERIFIED`

These flags are release evidence, not feature switches.

## Emergency stop

1. Disable SMS and Voice channels in the restaurant notification configuration.
2. Disable the corresponding provider environment only if a global stop is required.
3. Stop the external scheduler if repeated sends are suspected.
4. Preserve alert and delivery records for investigation.
5. Do not reset the database or delete delivery history.
6. Re-enable channels only after idempotency, acknowledgement, and rate-limit behavior is reverified.

## Release gate

Production readiness requires all of the following:

- production Supabase identity verified;
- required migration verified and applied without data loss;
- one-minute scheduler operational;
- popup, sound, vibration, push, email, SMS, and Voice tested through the live application;
- acknowledgement suppresses fallbacks and does not accept reservations;
- restaurant isolation verified;
- no secret or guest personal data appears in notification previews or logs;
- all automated checks pass.

Until these conditions are complete, the reservation alert production gate remains blocked.
