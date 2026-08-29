# SmartTable security operations

## Production secrets

- Configure secrets only in the production provider's encrypted environment store.
- `IMPERSONATION_SECRET` must be a unique random value of at least 32 bytes and must not reuse a Supabase, Stripe, Resend, JWT, or encryption key.
- Rotate Supabase service-role, Resend, Stripe/webhook, push, and impersonation secrets after suspected exposure and after any verified historical commit exposure.
- Never paste secret values into tickets, reports, screenshots, terminal output, or Git.

## Admin and superadmin controls

- Privileged web sessions are session-scoped and must not survive a browser restart.
- Server-side privileged access tokens have a configurable maximum age (`ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS`, default 3600 seconds).
- Set `ADMIN_MFA_REQUIRED=true` only after every admin/superadmin Supabase account is enrolled with an `aal2` factor and recovery procedure is tested.
- Sensitive role, tenant, restaurant-status, billing-override, and impersonation actions must remain server-authorized and audited.

## Abuse controls

The application has endpoint-specific IP and identity throttles for login,
signup, password recovery/verification, reservation creation, messaging and
privileged actions. When `DISTRIBUTED_RATE_LIMIT_ENABLED=true`, server instances
consume the atomic `consume_api_rate_limit` RPC created by migration `0070`.
The backing table is RLS protected and service-role only. Raw IP addresses are
never persisted; the limiter stores only a SHA-256 bucket hash.

Staging is configured fail-closed and has been verified with two independent
application instances sharing one quota. The recovery endpoints retain their
enumeration-safe, route-specific response codes. Keep provider WAF rules as an
additional edge layer, not as a replacement for the persistent limiter.

Production activation requires separate approval: apply `0069` and `0070`, set
the distributed limiter environment controls in the protected provider store,
then repeat the direct RBAC and two-instance limit verification. Never use the
production environment as a staging fallback.

## Staging verification commands

- `npm run staging:security-hardening:preflight`
- `npm run staging:security-hardening:verify`
- `npm run staging:distributed-rate-limit:preflight`
- `npm run staging:distributed-rate-limit:verify`

The apply commands are intentionally separate and must only be run after the
preflight confirms the expected non-production project identity.

## Email authentication

**MANUAL ACTION REQUIRED:** verify the active sending domain in Resend and DNS, then record passing SPF and DKIM. Publish a DMARC policy, begin with monitored rollout if necessary, review aggregate reports, and move toward enforcement. Repository code cannot prove live DNS ownership or provider verification.

## Incident minimums

1. Revoke affected sessions and rotate suspected credentials.
2. Preserve sanitized audit evidence; never copy raw secrets into the incident record.
3. Identify impacted restaurants/guests and legal notification requirements.
4. Restore only through the documented non-production recovery proof.
5. Add a regression test for the root cause before closing the incident.
