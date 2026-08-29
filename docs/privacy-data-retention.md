# SmartTable privacy and data-retention policy

## Data minimization

SmartTable stores only data needed for account access, restaurant operations, reservations, offers, verified reviews, notifications, consent, billing references, abuse prevention, and security auditability. Raw payment-card data must never enter SmartTable; Stripe owns card collection and tokenization.

Do not place passwords, bearer/refresh tokens, authorization headers, provider secrets, full card data, or unrestricted free-form PII in application or audit logs. IP addresses are masked and hashed for security correlation. Audit metadata is recursively sanitized by the server.

## Guest rights

- The account Security page supports a personal-data export request.
- Account deletion anonymizes the guest profile and removes or unlinks optional personal data while preserving legally/operationally required reservation and audit records without direct identity where possible.
- Duplicate/cooldown protection applies to export requests to prevent email and processing abuse.
- Restaurant partners must only see guest data belonging to their own restaurant and operational need.

## Proposed retention schedule

The following schedule requires legal approval before it becomes the production policy:

| Data | Proposed retention | Disposal |
| --- | --- | --- |
| Active account/profile | Account lifetime | Anonymize/delete through verified request |
| Reservation record | 24 months after visit | Anonymize guest identifiers unless legally required |
| Verified review and photos | Until deletion/moderation request | Remove media and unlink author identity |
| Auth/security events | 12 months | Delete after investigation/legal hold |
| Admin/audit log | 24 months | Delete after compliance window/legal hold |
| Email/SMS/push delivery logs | 90 days | Delete provider payload and recipient identifiers |
| Marketing consent/suppression proof | Consent lifetime plus legally required proof period | Minimize, then delete |
| Export/download artifact | 24 hours | Delete object and invalidate token |
| Failed upload/quarantine | 7 days | Permanently delete |

Production cleanup must be scheduled, observable, tenant-safe, and tested in staging. No cleanup or deletion job is authorized by this document alone.

**MANUAL ACTION REQUIRED:** counsel/business owner must approve retention periods, lawful basis, cross-border handling, processor list, and deletion exceptions for each launch market.
