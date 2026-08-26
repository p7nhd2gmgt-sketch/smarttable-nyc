# Admin Communications Guide

Super Admin communications support in-app, email, SMS, and combined broadcasts.

## Supported Categories

- service announcement;
- planned maintenance;
- outage;
- security alert;
- legal update;
- product update;
- marketing announcement;
- partner announcement;
- emergency notice.

## Audience Filters

Supported filters include guests, partners, active/trialing/past-due/canceled partners, language, city, restaurant, signup date where available, and explicit test recipients.

## Safety Rules

- Diagnostic test sends require an explicit recipient.
- Bulk recipient personal data is not exported.
- Marketing email and SMS broadcasts must pass consent and suppression checks.
- In-app marketing broadcasts require in-app notifications plus a marketing-consent signal.
- Mutating actions create audit logs.

## Operations

Use drafts and diagnostic test sends before scheduling or sending. Scheduled sends are processed by backend worker actions and must not rely on the browser staying open.
