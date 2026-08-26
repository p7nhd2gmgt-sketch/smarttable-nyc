# SmartTable Backup and Recovery

Date: 2026-07-19

Scope: SmartTable BASIC production hardening. This document covers the shared SmartTable application, Supabase database, Vercel deployment, and Resend email configuration. SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.

## Current Backup Status

Automated Supabase backup status cannot be verified from this repository alone. Supabase backup availability depends on the active Supabase project plan and dashboard settings.

Treat production backup readiness as not complete until an owner verifies the Supabase dashboard and records:

- active project plan;
- automatic daily backup availability;
- point-in-time recovery availability, if enabled;
- latest successful backup timestamp;
- retention period;
- restore test result in a non-production project.

Do not claim automated backups exist unless they are visible and enabled in Supabase.

## Supabase Backup Capabilities To Verify

In the Supabase dashboard, verify:

| Capability | Status From Repository | Owner Action |
| --- | --- | --- |
| Managed daily backups | Not verifiable from source | Confirm in Supabase dashboard. |
| Point-in-time recovery | Not verifiable from source | Confirm plan and PITR setting. |
| Manual SQL export | Supported by Supabase tools | Perform controlled export before launch. |
| Table-level CSV export | Supported by Supabase dashboard | Use only for non-secret operational data. |
| Storage object backup | Not verifiable from source | Export uploaded restaurant/user media separately if used. |

## Manual Export Procedure

Use a non-destructive export. Do not reset or truncate production.

Recommended steps:

1. Announce a backup window to the internal team.
2. Confirm no migrations are being applied.
3. Export the database with the Supabase dashboard backup tools or a trusted PostgreSQL tool such as `pg_dump` using the production database connection string.
4. Store the export in an encrypted, access-controlled location.
5. Record:
   - export timestamp;
   - Supabase project reference;
   - migration version applied;
   - operator;
   - storage location;
   - restore test status.
6. If Supabase Storage is used for images or uploads, export buckets separately.

Do not commit exported data to Git.

## Migration Storage Procedure

Repository migrations are stored in:

```text
supabase/migrations/
```

Current production initialization documentation is:

```text
docs/SUPABASE_PRODUCTION_INITIALIZATION.md
```

Before production changes:

1. Confirm the current Git commit hash.
2. Confirm the latest migration applied in Supabase:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

3. Apply migrations first to staging or a disposable Supabase project.
4. Apply only additive, reviewed migrations to production.
5. Do not edit already-applied migration files.
6. Prefer corrective forward migrations over destructive rollback SQL.

## Configuration Backup Procedure

Back up configuration separately from data.

Record these without secret values in documentation:

- Vercel project name;
- GitHub repository and branch;
- required environment variable names;
- Supabase project reference;
- Resend verified domain and sender;
- custom domain configuration;
- Supabase Auth redirect allowlist;
- deployed Vercel URL and deployment ID.

Secrets must be backed up only in the approved password manager or secret manager:

- `SUPABASE_SERVICE_ROLE_KEY`;
- `SUPABASE_ANON_KEY`;
- database connection strings;
- `RESEND_API_KEY`;
- future `RESEND_WEBHOOK_SECRET`;
- any admin bootstrap or impersonation secrets.

## Recovery Sequence

Use this sequence when production is degraded.

1. Freeze deployments and migrations.
2. Identify the incident type:
   - application regression;
   - database migration issue;
   - data corruption;
   - Supabase outage;
   - Resend outage;
   - leaked key or credential;
   - DNS/custom-domain issue.
3. Preserve logs and current state.
4. If the application release is the issue, roll back Vercel first.
5. If the database is the issue, restore into a staging Supabase project first.
6. Verify guest, partner, admin, reservation, and email flows in staging.
7. Promote the fixed application or restored data only after approval.
8. Record the incident timeline and final state.

## Application Rollback Sequence

For a bad release where data is intact:

1. Open the Vercel project dashboard.
2. Go to Deployments.
3. Select the previous known-good deployment.
4. Use Vercel's Promote or Rollback action.
5. Confirm `/api/health` returns a safe response.
6. Confirm public pages, login, reservation request, partner dashboard, and admin routes load.
7. Confirm `PUBLIC_BASE_URL` and email links still use the intended production domain.

Do not change database schema while rolling back the application unless the migration itself caused the failure.

## Database Recovery Sequence

For data loss or corruption:

1. Do not run destructive SQL.
2. Capture the current production state if safe.
3. Restore the most recent backup into a separate recovery project.
4. Compare:
   - users;
   - restaurants;
   - offers;
   - reservations;
   - consents;
   - notifications;
   - email logs.
5. Decide whether to restore the whole database or repair selected rows.
6. Use a reviewed SQL plan.
7. Verify row-level security and server-side authorization after recovery.

## Restore Previous Vercel Deployment

1. Open Vercel.
2. Select the SmartTable project.
3. Open Deployments.
4. Find the last deployment that passed the release gate.
5. Promote that deployment to production.
6. Do not edit environment variables during the rollback unless the incident is configuration-related.
7. Verify:
   - `/api/health`;
   - public homepage;
   - guest login;
   - reservation request;
   - partner reservation management;
   - admin access protection.

## Rotate Supabase Keys

Rotate keys immediately if a Supabase key is exposed.

1. Identify which key was exposed: anon, service role, database password, or JWT secret.
2. Remove the exposed value from logs, screenshots, docs, and local files.
3. Rotate the key in Supabase.
4. Update the corresponding Vercel environment variable.
5. Redeploy the application.
6. Revoke old sessions if required by the exposed key type.
7. Review access logs for misuse.
8. Add the incident to the security log.

Special rule: if `SUPABASE_SERVICE_ROLE_KEY` is exposed, treat it as a high-severity incident because it can bypass RLS from trusted server contexts.

## Rotate Resend API Key

1. Create a new Resend API key with the minimum required permission.
2. Update `RESEND_API_KEY` in Vercel.
3. Redeploy.
4. Send one controlled diagnostic email to an approved test recipient.
5. Confirm the provider accepts the message.
6. Revoke the old Resend key.
7. Confirm no source file or log contains the old key.

Keep `EMAIL_FROM` aligned with the verified Resend sender configured in the dashboard.

## If A Service-Role Key Is Exposed

Immediate response:

1. Disable public access to affected deployment if necessary.
2. Rotate `SUPABASE_SERVICE_ROLE_KEY`.
3. Redeploy with the new secret.
4. Search code, logs, documentation, support screenshots, and chat artifacts for the exposed value.
5. Remove or redact exposed copies where possible.
6. Review Supabase logs for suspicious writes, deletes, exports, or auth changes.
7. Audit tables containing:
   - guest profiles;
   - reservations;
   - emails;
   - partner data;
   - admin settings;
   - consent records.
8. Notify affected parties if legal or policy requirements apply.
9. Document the root cause and prevention step.

Never put service-role keys into frontend code, public HTML, browser bundles, screenshots, or client-readable configuration.

## Launch Backup Gate

Before public testing, confirm:

- [ ] Supabase backup settings were verified in dashboard.
- [ ] A manual database export was created and stored securely.
- [ ] Migration version was recorded.
- [ ] Vercel previous deployment rollback was tested or rehearsed.
- [ ] Resend key rotation procedure is understood.
- [ ] Service-role key incident response owner is assigned.
