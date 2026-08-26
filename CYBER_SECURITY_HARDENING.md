# SmartTable cyber security hardening

## Implemented application controls

- Strict production security headers, including CSP, HSTS, frame denial, MIME sniffing protection, referrer policy, COOP, CORP, and a restrictive permissions policy.
- Production configuration validation and generic public error responses.
- Origin and referer validation for state-changing browser requests.
- Request body limits, mutation rate limits, server-side role checks, and signed Stripe webhook verification.
- Service-role credentials remain server-side and protected local environment files are excluded from deployment and Git.

## Dining photo reward remediation

The dining photo reward flow previously accepted browser-supplied profile, guest, and restaurant identifiers. The hardened flow now:

- requires an authenticated guest session;
- derives guest and restaurant identity from the guest's reservation on the server;
- permits uploads only for an eligible attended/completed reservation;
- binds the signed storage path to that authenticated guest and reservation;
- validates JPEG, PNG, and WebP files with a 5 MB maximum;
- rejects duplicate uploads for the same reservation;
- removes anonymous table inserts and anonymous loyalty-point RPC execution;
- keeps all writes behind the protected server endpoint.

Migration `0067_dining_consumption_upload_security.sql` is additive and permission-hardening only. It does not delete, truncate, or update application rows. It aborts if conflicting duplicate reservation or storage-path rows make the unique security guarantees unsafe to add.

## Operational launch requirements

1. Require phishing-resistant MFA for Vercel, Supabase, Stripe, Cloudflare, Google Cloud, Resend, GitHub, and domain registrar accounts.
2. Keep separate production and staging credentials; rotate any credential ever shown in a screenshot, chat, terminal recording, or shared document.
3. Enable provider audit logs, account-change alerts, billing alerts, and Supabase database backup/PITR appropriate to the launch plan.
4. Add Cloudflare managed WAF and rate-limit rules for authentication, signup, password recovery, reservation mutations, upload signing, and test-notification endpoints.
5. Run dependency auditing and secret scanning in CI; block deployment on critical findings.
6. Maintain and rehearse an incident-response runbook covering key rotation, session revocation, provider access review, backup restore, user notification, and evidence preservation.

## Data handling

Passwords and tokens are handled by Supabase Auth and are never stored in SmartTable profile tables. Payment card data remains on Stripe-hosted flows. Public APIs must not expose private guest contact details, internal storage paths, service credentials, or raw provider errors.
