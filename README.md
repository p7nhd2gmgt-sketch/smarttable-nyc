# Smarttable.com

Production-ready MVP for discounted restaurant reservations.

## What is included

- Admin login and dashboard
- Restaurant login and dashboard
- Optional guest accounts
- Anonymous guest reservation flow
- Supabase PostgreSQL schema and RLS migrations
- Restaurant approval workflow
- Discounted table offer inventory
- Real reservation persistence through Supabase
- Reservation status tracking
- Confirmation/status emails through Resend
- Vercel API entry point
- SEO files for `smarttable.com`

## Local start

```powershell
.\start.ps1
```

Local URL:

```text
http://localhost:4173
```

Without Supabase env vars, the app runs in demo mode with:

```text
admin@smarttable.com / admin123
owner@hudsonhearth.com / restaurant123
guest@smarttable.com / guest123
```

## Environment

Copy `.env.example` into your host environment:

```text
PORT=4173
PUBLIC_BASE_URL=https://smarttable.com
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EMAIL_FROM=SmartTable <reservations@mail.smarttablenyc.com>
EMAIL_REPLY_TO=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
EMAIL_TEMPLATE_VERSION=2026-07-19
EMAIL_RETRY_LIMIT=3
EMAIL_WEBHOOK_TOLERANCE_SECONDS=300
ADMIN_NOTIFICATION_EMAIL=admin@smarttable.com
```

Local startup loads `.env` and `.env.local` from the project root before the
backend email service is initialized. Existing shell or hosting environment
variables take precedence, so production secrets should still be configured in
the host environment.

Transactional email is sent through the backend Resend adapter. If `RESEND_API_KEY`
or a verified `EMAIL_FROM` sender is missing, SmartTable records the email attempt
as failed and does not show delivery as successful.
Transactional emails are idempotent by type/reservation/recipient where applicable,
so refreshes or repeated partner clicks do not create duplicate provider sends.
When `RESEND_WEBHOOK_SECRET` is configured, provider delivery events can update
`email_logs` from accepted/sent to delivered, bounced, or failed. Without the
webhook secret, diagnostics truthfully report provider acceptance only.

## Email diagnostics and Resend webhooks

Super Admins can inspect email delivery health through:

```text
GET /api/admin/email-diagnostics
GET /api/admin/email-queue
POST /api/admin/email-queue
```

The diagnostics show provider configuration status, sender, reply-to, webhook
configuration, recent attempts, masked recipients, provider message IDs, delivery
status, attempt count, safe errors, and retry actions when a queued message is
retryable. They never expose `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, reset
tokens, passwords, or email body content.

Production Resend webhook endpoint:

```text
https://smarttablenyc.com/api/webhooks/resend
```

Configure these Resend events:

```text
email.sent
email.delivered
email.bounced
email.failed
email.complained
```

Copy the Resend webhook signing secret into the server environment as:

```text
RESEND_WEBHOOK_SECRET=<your Resend webhook signing secret>
```

Localhost cannot directly receive production Resend webhooks unless you use a
secure tunnel or a local webhook-forwarding tool. For local signature checks,
send a signed request to `/api/webhooks/resend` and confirm that invalid
signatures return `401`, while valid events update `email_logs` and `email_queue`
from `sent` to `delivered`, `bounced`, `failed`, or `complained`.

## Database

SQL migrations are in:

```text
supabase/migrations/
```

See [supabase/README.md](supabase/README.md).

## Architecture readiness

For the current scale-readiness audit, feature flag system, booking-source foundation, and safe refactor order, see [docs/SmartTable-Scale-Architecture.md](docs/SmartTable-Scale-Architecture.md).

Additional checks:

```powershell
npm run lint
npm run typecheck
npm run check:architecture
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md).

## Backups

Manual snapshot:

```powershell
.\save-project.ps1
```

Continuous autosave:

```powershell
.\autosave-project.ps1
```

Stop autosave:

```powershell
.\stop-autosave.ps1
```
