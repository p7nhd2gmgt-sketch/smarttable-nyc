# Twilio and A2P 10DLC Setup Guide

SmartTable SMS support is adapter-based. Twilio is the current supported provider path.

## Required Environment Variables

```text
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_FROM_NUMBER=
TWILIO_STATUS_CALLBACK_URL=
SMS_DAILY_SEND_LIMIT=
SMS_MONTHLY_SEND_LIMIT=
SMS_QUIET_HOURS_START=
SMS_QUIET_HOURS_END=
SMS_SEGMENT_COST_CENTS=
SMS_TEST_RECIPIENT_ALLOWLIST=
SMS_CAMPAIGN_QUEUE_BATCH_LIMIT=
```

## A2P 10DLC

Complete brand and campaign registration in Twilio before public SMS marketing. Carrier approval, opt-in language, HELP/STOP wording, and sending limits must be reviewed operationally and legally.

## Webhooks

Inbound and delivery callback endpoint:

```text
https://smarttablenyc.com/api/webhooks/sms/twilio
```

Production Twilio webhooks must include a valid `X-Twilio-Signature`. SmartTable rejects invalid signatures when `TWILIO_AUTH_TOKEN` is configured in production.

## Required Behavior

- STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT create suppression records.
- HELP returns support and preference instructions.
- Quiet hours are enforced by recipient timezone.
- Raw phone lists are not exposed to restaurant partners.
