# Resend Campaign Domain Setup Guide

SmartTable uses Resend for backend email sending. Campaign and transactional email must use verified sender domains only.

## Required Configuration

Vercel environment variables:

```text
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_REPLY_TO=
PUBLIC_BASE_URL=
BUSINESS_MAILING_ADDRESS=
```

`EMAIL_FROM` must use a domain verified in Resend. Do not use an unverified sender for public campaigns.

## DNS

Configure the SPF, DKIM, and DMARC records Resend provides for the selected sending domain. DNS values depend on the Resend dashboard and DNS provider.

## Campaign Requirements

Marketing emails must include:

- unsubscribe/preferences link;
- business mailing address;
- SmartTable branding;
- restaurant context;
- valid consent and suppression checks.

## Verification

Before public marketing:

1. Send a diagnostic test email to an approved inbox.
2. Confirm provider acceptance.
3. Confirm inbox arrival.
4. Confirm links use `PUBLIC_BASE_URL`.
5. Confirm unsubscribe/preferences links render.
6. Confirm no raw template placeholders remain.
