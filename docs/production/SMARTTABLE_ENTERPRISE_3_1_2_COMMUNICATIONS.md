# SmartTable Enterprise 3.1.2 Communications

Date: 2026-07-22

## Scope

This phase adds centralized communication consent, guest communication preferences, restaurant-scoped partner email and SMS campaigns, Super Admin system broadcasts, and a generic in-app notification center. It uses the existing SmartTable backend, Resend email service, `email_queue`, and `email_logs`.

No POS integration was added. No AI, billing, or reservation-platform adapter work is included in this communications module.

## Database Migration

Migration:

- `supabase/migrations/0047_communication_preferences_campaigns.sql`
- `supabase/migrations/0048_sms_system_notifications.sql`
- `supabase/migrations/0049_enterprise_compliance_hardening.sql`

Tables added:

- `communication_preferences`
- `communication_consents`
- `suppression_list`
- `message_campaigns`
- `message_recipients`
- `sms_campaigns`
- `sms_recipients`
- `sms_delivery_logs`
- `sms_provider_events`
- `system_message_campaigns`
- `system_message_recipients`
- `notifications`

Columns added:

- `email_logs.message_campaign_id`
- `email_queue.message_campaign_id`
- queue lock, retry, dead-letter, retention, template-variable allowlist, and sanitization metadata on campaign recipient queues;
- restaurant, reservation, campaign, billing-event, IP-hash, and retention metadata on `audit_logs`;
- idempotency, retry, lock, dead-letter, and retention metadata on `billing_events`;
- retention/anonymization metadata on in-app notifications.

The migrations are additive and idempotent. They do not insert production recipient data and do not expose raw campaign recipient lists to restaurant users.

## Consent Rules

Transactional and marketing communications are stored separately.

Marketing email is eligible only when all are true:

- the user has marketing email enabled in `communication_preferences`;
- the latest email marketing consent event is granted in `communication_consents`;
- the destination is not present in `suppression_list`;
- the recipient belongs to the restaurant-scoped campaign audience.

Transactional reservation and account emails remain outside marketing consent gating.

Marketing SMS is eligible only when all are true:

- the user has marketing SMS enabled in `communication_preferences`;
- the latest SMS marketing consent event is granted in `communication_consents`;
- the normalized E.164 destination is not present in `suppression_list`;
- the recipient belongs to the restaurant-scoped campaign audience;
- the send is outside quiet hours in the recipient timezone.

STOP/UNSUBSCRIBE/CANCEL/END/QUIT requests received through the Twilio webhook add an SMS suppression record. HELP returns a support/preferences message. Raw phone numbers are not returned to partner users.

## Guest Preferences

Guest account notification settings now persist to the central communication preference endpoint:

- `GET /api/guest/communications`
- `PATCH /api/guest/communications`

The legacy guest preference marketing consent path is preserved for compatibility and mirrored into the new consent system.

## Partner Campaigns

Partner campaign endpoint:

- `GET /api/partner/campaigns`
- `POST /api/partner/campaigns`
- `PATCH /api/partner/campaigns`

Admin campaign endpoint:

- `GET /api/admin/campaigns`
- `POST /api/admin/campaigns`
- `PATCH /api/admin/campaigns`

Partner SMS campaign endpoint:

- `GET /api/partner/sms-campaigns`
- `POST /api/partner/sms-campaigns`
- `PATCH /api/partner/sms-campaigns`

Twilio webhook endpoint:

- `POST /api/webhooks/sms/twilio`

Super Admin system message endpoint:

- `GET /api/admin/system-messages`
- `POST /api/admin/system-messages`
- `PATCH /api/admin/system-messages`

User notification endpoint:

- `GET /api/notifications`
- `PATCH /api/notifications`

Supported actions:

- `estimate_audience`
- `save_draft`
- `test_email`
- `test_sms`
- `test_send`
- `schedule`
- `send_now`
- `process_scheduled`
- `retry_failed`
- `cancel`
- `archive`
- `clone`

Campaign audience is restaurant-scoped and can include:

- users who favorited or followed the restaurant;
- users with accepted or completed reservations at the restaurant;
- future restaurant-specific subscribed audiences when valid consent exists.

Raw bulk email lists are never returned to partners. Campaign recipients expose destination hashes and delivery statuses only.

Raw bulk phone lists are never returned to partners. SMS campaign recipients expose destination hashes, phone last four digits, statuses, segment estimates, and provider message IDs only.

The partner form uses a safe multilingual body editor with simple formatting controls. It inserts plain-text Markdown-style formatting and links into the campaign body fields; raw HTML is not trusted or rendered from partner input.

Backend campaign creation also normalizes content before persistence. Script/style/embed/form tags, inline event handlers, and `javascript:`/HTML data URLs are removed from partner, SMS, and admin broadcast content. Campaign template variables are restricted to a server-side allowlist so partners and admins cannot accidentally request passwords, tokens, private profile fields, or unsupported internal values in outbound messages.

## Queue Behavior

Production campaign sends snapshot eligible recipients into `message_recipients` before queueing email records. `send_now` creates persistent queue records using the existing `email_queue` architecture and idempotency keys:

`message-campaign:{campaignId}:{destinationHash}`

Large campaigns are not sent synchronously from the browser request. The backend queues at most `PARTNER_CAMPAIGN_QUEUE_BATCH_LIMIT` records per immediate send call.

Scheduled campaigns snapshot the eligible audience when scheduled. A backend processor action queues due scheduled campaigns later:

`POST /api/partner/campaigns { "action": "process_scheduled" }`

Super Admin can process due scheduled campaigns across restaurants through:

`POST /api/admin/campaigns { "action": "process_scheduled" }`

This action reuses the central email queue and does not expose raw recipient addresses.

Partner SMS sends snapshot eligible recipients into `sms_recipients`. `send_now` processes a bounded batch from the backend using `SMS_CAMPAIGN_QUEUE_BATCH_LIMIT`, records every attempt in `sms_delivery_logs`, and uses idempotency keys:

`sms-campaign:{campaignId}:{destinationHash}`

Failed or quiet-hour-delayed SMS recipients can be retried through the partner SMS campaign action `retry_failed`. Retries reuse the same delivery-log idempotency key and stop after three failed attempts, so repeated clicks cannot create unlimited provider sends.

SMS and system-message recipient queues now record attempt counts, locks, next retry time, and dead-letter timestamps. These fields are intended for backend workers and diagnostics; partner-facing payloads still expose only safe delivery status summaries.

SMS provider status callbacks update `sms_delivery_logs` and insert idempotent rows in `sms_provider_events`. In production, Twilio webhook requests must include a valid `X-Twilio-Signature` generated with `TWILIO_AUTH_TOKEN`.

Super Admin broadcasts snapshot deterministic recipients into `system_message_recipients`. In-app channel delivery creates user-scoped `notifications`. Email channel uses the existing Resend email service and idempotent email logging. SMS channel uses the SMS adapter with consent and suppression checks.

Super Admin diagnostic test sends are handled by `test_send`. They require one explicit recipient, are marked as test campaigns in `audience_definition.test_only`, and never use the bulk audience resolver. Supported admin audience filters include all users, guests, partners, active partners, trialing partners, past-due partners, canceled partners, language, city, restaurant, and manually selected users. Subscription-status partner filters resolve against `restaurant_subscriptions` when Supabase is configured.

Marketing system broadcasts must satisfy channel consent before recipients are snapshotted. Email/SMS marketing broadcasts use the same suppression and consent checks as partner campaigns. In-app marketing broadcasts require the user to have in-app notifications enabled and a valid marketing consent signal.

## Audit Logging

Every mutating partner/admin campaign and billing action records an audit event through `audit_logs`:

- campaign create/update/clone/archive/cancel/schedule/send/test/process actions;
- SMS campaign create/update/clone/cancel/retry/schedule/send/test actions;
- system broadcast create/update/duplicate/cancel/schedule/send/test actions;
- Stripe Checkout, Customer Portal, cancellation, subscription-plan, trial-extension, and complimentary-access actions.

Audit metadata is redacted for secret-like keys and stores aggregate counts or destination hashes only. It must not be used as a raw recipient export.

## In-App Notifications

The `notifications` table stores user-scoped messages with category, title, body, action URL, severity, read state, optional expiry, and non-dismissible critical banner support.

Guest account notifications now merge:

- legacy reservation notifications from `guest_notifications`;
- generic system notifications from `notifications`.

Users can mark one notification or all notifications as read. Reads are scoped to the authenticated user.

## Environment Variables

Optional configuration:

- `COMMUNICATION_CONSENT_VERSION`
- `MESSAGE_CAMPAIGN_TEMPLATE_VERSION`
- `PARTNER_CAMPAIGN_QUEUE_BATCH_LIMIT`
- `SMS_PROVIDER`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_FROM_NUMBER`
- `TWILIO_STATUS_CALLBACK_URL`
- `SMS_DAILY_SEND_LIMIT`
- `SMS_MONTHLY_SEND_LIMIT`
- `SMS_QUIET_HOURS_START`
- `SMS_QUIET_HOURS_END`
- `SMS_SEGMENT_COST_CENTS`
- `SMS_TEST_RECIPIENT_ALLOWLIST`
- `SMS_CAMPAIGN_QUEUE_BATCH_LIMIT`

Existing required email configuration remains unchanged:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `PUBLIC_BASE_URL`
- `BUSINESS_MAILING_ADDRESS` should be configured before public marketing email is enabled. The repository placeholder is intentionally not a legal mailing-address substitute.

## Legal And Operational Review Required

The code enforces consent separation, suppression checks, idempotency, queue retry limits, webhook signature verification, and privacy-safe recipient displays. This does not by itself establish TCPA, CAN-SPAM, GDPR/CCPA, or other privacy-law compliance.

Before enabling public marketing email or SMS, SmartTable still needs legal and operational review for:

- approved marketing consent copy and consent-text versioning;
- business mailing address to place in marketing email footers;
- unsubscribe wording and processing deadlines;
- Twilio A2P 10DLC registration and carrier-compliance review;
- quiet-hour policy by market and recipient timezone;
- data-retention schedule for delivery logs, campaign analytics, and suppression records;
- incident-response procedures for provider compromise, suppression-list errors, or mistaken campaign sends;
- privacy notice updates covering campaign analytics and restaurant-scoped audiences.

## Verification

Automated check:

`npm run check:partner-communications`

`npm run check:enterprise-communications`

This verifies:

- migration structure;
- tenant-scoped partner campaign access;
- guest preference endpoint;
- marketing opt-out exclusion;
- audience estimation;
- draft saving;
- recipient snapshot duplicate prevention;
- due scheduled campaign queueing;
- queue creation;
- invalid test recipient rejection;
- admin campaign listing;
- no raw guest emails in partner/admin campaign payloads.

The enterprise communications check verifies:

- SMS and system notification migration structure;
- SMS environment placeholders;
- guest SMS preference persistence;
- partner SMS route protection;
- SMS audience estimation without raw phone exposure;
- SMS STOP suppression handling;
- Super Admin system message audience estimation, subscription-status audience filters, and diagnostic test-send handling;
- in-app broadcast creation;
- authenticated user notification listing and mark-all-read behavior.
