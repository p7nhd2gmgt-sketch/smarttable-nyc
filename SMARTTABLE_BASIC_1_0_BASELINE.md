# SmartTable BASIC 1.0 Database Baseline

Date: 2026-07-28

Scope: fresh empty staging/local Supabase environments for SmartTable BASIC 1.0.

This document describes the approved baseline strategy. It does not authorize production deployment, production migration-history rewriting, test-user creation, Stripe setup, Resend setup, or demo data seeding.

## A. Purpose

The BASIC 1.0 baseline provides a clean current-schema bootstrap for a brand-new empty SmartTable staging database without replaying obsolete historical transitions, legacy demo seed data, destructive cleanup migrations, or one-time production backfills.

The historical migration files `0001` through `0056` remain unchanged. Existing production databases continue through normal forward-only migrations after `0056`.

## B. Baseline Contents

Baseline files live in `supabase/baseline/basic-1.0/`:

- `0001_basic_1_0_schema.sql`
- `0002_basic_1_0_required_reference_data.sql`
- `object-manifest.json`
- `SHA256SUMS`
- `README.md`

The schema baseline includes:

- Supabase Auth profile linkage;
- guest account, profile, consent, privacy, notification, and data-export structures;
- restaurants, offers, reservations, reservation status history, and public views;
- Restaurant Administration structures;
- partner invitations and restaurant-level roles;
- audit logs and append-safe history structures;
- email queue and email log structures;
- billing tables for fixed monthly restaurant subscriptions;
- analytics source structures based on real events and reservations;
- markets for New York City and Budapest;
- RLS, policies, helper functions, RPC functions, indexes, triggers, and constraints;
- append-safe `public.smarttable_schema_baselines` metadata.

### Manifest Reconciliation, 2026-07-29

The first staging apply succeeded, but verification stopped because `object-manifest.json` listed 40 tables while the baseline SQL created 51 public tables. A read-only staging snapshot was captured at `tmp/staging-baseline-diagnostics/staging-state-20260729-124704.json`.

The omitted tables were reviewed against the baseline SQL, historical migrations, and current application references. They are required BASIC support objects, not demo data and not POS artifacts:

| Table | Classification | Decision |
| --- | --- | --- |
| `admin_alerts` | Required operational object | Keep in SQL and manifest. Admin-only RLS. |
| `admin_notifications` | Required operational object | Keep in SQL and manifest. Used by admin notification views and routes. |
| `app_error_logs` | Required observability object | Keep in SQL and manifest. Admin-only RLS. |
| `dining_consumption_uploads` | Required guest activity source | Keep in SQL and manifest for existing review/activity flows; no rows are seeded. |
| `email_events` | Required audit/observability object | Keep in SQL and manifest. Admin-only RLS. |
| `guest_auth_events` | Required auth security audit object | Keep in SQL and manifest. Service/admin write policy only. |
| `guest_notifications` | Required guest notification object | Keep in SQL and manifest. Guest-scoped RLS. |
| `notification_logs` | Required notification audit object | Keep in SQL and manifest. Admin-only RLS. |
| `notifications` | Required in-app notification object | Keep in SQL and manifest. User/admin scoped RLS. |
| `privacy_requests` | Required privacy operations object | Keep in SQL and manifest. Guest/admin scoped RLS. |
| `site_content` | Required localized content/reference object | Keep in SQL and manifest. Public read, admin write. |

The staging-only extra public function `rls_auto_enable` was classified as a Supabase platform RLS helper, not a SmartTable baseline function. It uses `SECURITY DEFINER SET search_path TO pg_catalog`; the staging verifier allows only that known helper outside the SmartTable manifest.

## C. Excluded Historical Content

The baseline excludes:

- `0002_seed_demo_availability.sql` demo restaurants and offers;
- `0045_smarttable_test_bistro_seed.sql` SmartTable Test Bistro seed data;
- fake users and passwords;
- sample guests, reservations, analytics, and notifications;
- historical production backfills;
- destructive cleanup operations from historical migration `0028`;
- obsolete compatibility transitions that are no longer part of the final BASIC schema.

## D. POS Exclusion

SmartTable BASIC has no POS integration.

The executable baseline SQL excludes POS-related tables, columns, policies, functions, seeds, and provider references. The baseline verification checks reject known obsolete integration object names and common POS-provider terms in executable SQL.

## E. Fresh Environment Procedure

Use only for a verified empty staging/local environment.

1. Confirm `.env.staging.local` exists and is ignored by Git.
2. Confirm `supabase/.temp/project-ref` matches `STAGING_SUPABASE_PROJECT_REF`.
3. Run `npm run check:basic-baseline`.
4. Run `npm run check:baseline-equivalence`.
5. Run `npm run check:baseline-security`.
6. Run `npm run staging:baseline:dry-run`.
7. Confirm the dry-run reports:
   - linked project name `smarttable-staging`;
   - public table count `0`;
   - migration history count `0`;
   - only the two baseline files in the plan.
8. Apply only with:
   `npm run staging:baseline:apply -- --confirm-staging-baseline --project-ref=<STAGING_SUPABASE_PROJECT_REF>`
9. Run `npm run staging:baseline:verify -- --record-verification`.
10. Run `npm run staging:baseline:compatibility`.
11. Only after verification, create staging test accounts and optional test data through reviewed setup processes.

## F. Existing Production Procedure

Existing production databases must not receive this baseline.

Production procedure:

- keep historical migration records intact;
- continue new migrations forward-only from `0057`;
- do not replay `0001` through `0056` into production;
- do not repair production migration history for this baseline;
- use additive reviewed migrations for production changes.

## G. Post-Baseline Migration Procedure

After a fresh environment is bootstrapped and verified:

- create new migrations from `0057` onward;
- keep them additive and forward-only;
- validate against staging before production;
- do not reintroduce demo data, POS artifacts, or destructive cleanup into the baseline path.
- use the demonstrated post-baseline migration workdir strategy for fresh baseline environments until an independently approved migration-history reconciliation policy exists.

## H. Migration History Reconciliation

The baseline records semantic coverage through historical migration `0056` in `object-manifest.json` and `public.smarttable_schema_baselines`.

The repository does not automatically repair Supabase migration history. Current staging compatibility is proven by `npm run staging:baseline:compatibility`, which creates a temporary local workdir containing only a synthetic `0057` dry-run probe. That command confirmed that post-baseline migrations can be recognized without replaying `0001` through `0056` and without forging migration history.

If future operational policy still requires marking `0001` through `0056` as represented in a fresh baseline environment, perform that only as a controlled manual staging-only operation after:

- the baseline apply succeeds;
- `npm run staging:baseline:verify` passes;
- baseline checksum and verification output are recorded;
- the operator confirms the target is not production.

Do not blindly forge migration history before schema verification.

## I. Rollback Procedure

If baseline apply fails:

1. Stop immediately.
2. Capture the exact failing statement and error.
3. Do not attempt partial manual repair automatically.
4. Report the failure.
5. Because this procedure is for empty staging only, the proposed recovery is to reset or recreate the staging database.
6. Do not reset staging without explicit owner approval.
7. Correct the baseline in source control and rerun from a clean empty staging database.

Production rollback is not applicable because this baseline must not run against production.

## J. Verification Procedure

Run:

```powershell
npm run check:basic-baseline
npm run check:baseline-equivalence
npm run check:baseline-security
npm run staging:baseline:dry-run
npm run staging:baseline:apply -- --confirm-staging-baseline --project-ref=<STAGING_SUPABASE_PROJECT_REF>
npm run staging:baseline:verify -- --record-verification
npm run staging:baseline:compatibility
```

Additional repository checks remain required before release:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run check:migration-chain
npm run check:onboarding-migration
npm run check:restaurant-administration
npm run check:billing
npm run check:stripe-webhook
npm run check:subscription-access
npm run check:analytics
npm run check:basic-feature-completeness
npm run check:basic-release-audit
```

## K. Security Assumptions

- Staging credentials are stored only in ignored local environment files.
- Service role keys are never printed.
- The baseline is staging/local only.
- RLS is enabled on all manifest tables.
- SECURITY DEFINER functions set `search_path = public`.
- Invitation tokens are stored as hashes.
- Audit/history tables are append-safe through normal app roles.
- Billing webhook events are idempotent by provider event ID.
- Stripe state cannot be authored by the browser.
- Public views exclude test restaurants and test offers.
- Demo data and POS remnants are rejected by checks.

## L. Known Limitations

- Default Supabase migration-history repair remains manual by design; post-baseline 0057+ compatibility is verified through the temporary dry-run workdir.
- The baseline does not seed test users or the SmartTable Test Bistro fixture.
- Stripe and Resend are not configured by this baseline.
- Browser QA and role-account setup are separate release gates.
- The baseline does not prove production readiness until staging verification and full app checks pass.

## M. Emergency Stop Conditions

Stop immediately if any of the following occurs:

- linked project ref does not match `STAGING_SUPABASE_PROJECT_REF`;
- project name or known ref appears production-like;
- public table count is non-zero before apply;
- Supabase migration history exists before apply;
- auth users exist before apply;
- any production-like restaurant, offer, reservation, guest, or profile data exists;
- dry-run includes anything except the two baseline files;
- baseline apply returns an SQL error;
- verification finds missing RLS, policies, functions, indexes, constraints, or required static rows;
- demo restaurant data exists;
- POS-related objects exist;
- secrets appear in output.
