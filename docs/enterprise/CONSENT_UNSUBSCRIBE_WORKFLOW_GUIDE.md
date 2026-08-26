# Consent and Unsubscribe Workflow Guide

SmartTable separates transactional and marketing communications.

## Transactional

Transactional reservation and account messages are not marketing. They should be sent only when required for the product flow and should not include promotional content unless consent rules permit it.

## Marketing Email

Marketing email requires:

- `communication_preferences.marketing_email_enabled=true`;
- current `communication_consents` granted for channel `email` and type `marketing`;
- destination not present in `suppression_list`;
- restaurant-scoped audience relationship;
- unsubscribe/preferences link in the email footer.

## Marketing SMS

Marketing SMS requires:

- `communication_preferences.marketing_sms_enabled=true`;
- current SMS marketing consent;
- destination not present in `suppression_list`;
- restaurant-scoped audience relationship;
- quiet-hour check;
- provider and send-limit checks.

## Withdrawal

Users can withdraw optional marketing consent without closing their account. Mandatory legal consent is handled separately through the legal consent system.

## Partner Visibility

Restaurants see counts, delivery status, and destination hashes. They must never receive unrestricted raw SmartTable guest email or phone lists.
