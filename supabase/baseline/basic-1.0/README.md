# SmartTable BASIC 1.0 Fresh-Environment Baseline

This directory contains a clean database baseline for a brand-new empty Supabase staging environment. It represents the current SmartTable BASIC 1.0 schema surface without replaying obsolete historical transitions.

The normal historical migration chain in `supabase/migrations/0001` through `0056` is intentionally unchanged.

## Files

- `0001_basic_1_0_schema.sql` creates the current BASIC schema, helper functions, RPC functions, views, indexes, triggers, grants, and RLS policies.
- `0002_basic_1_0_required_reference_data.sql` inserts only required static reference data.
- `object-manifest.json` describes the expected database objects.
- `SHA256SUMS` records checksums for baseline artifacts after generation.

## Application Gate Commands

These commands are staging-only and load `.env.staging.local` without printing secret values.

```powershell
npm run staging:baseline:dry-run
npm run staging:baseline:apply -- --confirm-staging-baseline --project-ref=<STAGING_SUPABASE_PROJECT_REF>
npm run staging:baseline:verify -- --record-verification
npm run staging:baseline:compatibility
```

The dry-run command:

- confirms the linked Supabase project ref matches `STAGING_SUPABASE_PROJECT_REF`;
- rejects production-like project names and known production refs;
- rejects unexpected public tables;
- rejects existing Supabase migration history;
- rejects production-like SmartTable data;
- prints the object plan and Supabase dry-run migration list;
- performs no writes.

The apply command:

- requires `--confirm-staging-baseline`;
- requires `--project-ref=<STAGING_SUPABASE_PROJECT_REF>`;
- rechecks the staging project ref;
- refuses a non-empty database;
- applies only the two baseline files;
- records append-safe metadata in `public.smarttable_schema_baselines`;
- runs verification after apply.

The verify command:

- verifies tables, key columns, views, enums, functions, indexes, triggers, primary keys, named constraints, RLS, policies, static rows, test-data isolation, missing demo data, missing auth users before approved setup, baseline metadata, and missing legacy integration objects;
- fails on unexpected public tables, public views, public enums, public functions outside the documented Supabase `rls_auto_enable` helper, non-constraint indexes, and triggers;
- can record the reconciled verification status and checksum in staging metadata with `--record-verification`;
- does not seed test data;
- does not modify production.

The compatibility command:

- creates a temporary local Supabase workdir under `tmp/`;
- adds only a synthetic `0057_post_baseline_compatibility_probe.sql` migration to that temporary workdir;
- runs `supabase db push --dry-run` against verified staging;
- fails if any historical `0001` through `0056` migration or baseline file appears in the dry-run plan;
- performs no writes and does not forge Supabase migration history.

## What This Baseline Includes

- Supabase Auth profile linkage.
- Guest profile, consent, privacy, notification, and data export structures.
- Restaurants, offers, reservation requests, reservation lifecycle history, capacity fields, and public views.
- Restaurant Administration structures.
- Partner invitations and restaurant-level partner roles.
- Audit logging.
- Email queue and delivery log structures.
- Resend delivery-status compatible fields.
- Fixed monthly subscription billing schema and static internal plan names.
- Analytics source structures using real reservation, offer, view, favorite, and review data.
- Multi-market configuration for NYC and Budapest, with Budapest seeded as `draft`.
- RLS on all baseline tables listed in `object-manifest.json`.
- Append-safe baseline metadata in `public.smarttable_schema_baselines`.

## What This Baseline Excludes

- Legacy demo restaurants and demo offers.
- SmartTable Test Bistro seed data.
- Fake users, passwords, sample guests, sample reservations, and sample analytics.
- Historical production backfills.
- Destructive cleanup from historical migration `0028_remove_pos_integration_references.sql`.
- Historical POS integration remnants.
- Live restaurant payment collection, payouts, Stripe Connect, deposits, tips, or guest payment flows.
- Future AI feature tables as a public product dependency.

## Bootstrap Order For Fresh Staging

Use this baseline only after a staging project is verified. Do not use production as staging.

1. Confirm the target project reference is the verified SmartTable staging project.
2. Confirm the target database is empty or disposable.
3. Run `0001_basic_1_0_schema.sql`.
4. Run `0002_basic_1_0_required_reference_data.sql`.
5. Run the verification queries in `object-manifest.json`-based tooling or the repository check command.
6. Only after schema verification passes, create protected staging test accounts and staging-only test data.

## Baseline Metadata

The baseline creates `public.smarttable_schema_baselines` with:

- `baseline_name`
- `baseline_version`
- `checksum`
- `applied_at`
- `applied_environment`
- `source_commit`
- `applied_by`
- `verification_status`
- `metadata`

The application script records `SmartTable BASIC 1.0` after the baseline SQL files are applied. This table is append-safe operational history and must not contain secrets, passwords, raw tokens, or service keys.

## Safety Rules

- The schema baseline refuses to run if core SmartTable tables already exist.
- The reference-data script is idempotent and uses scoped `on conflict` updates only.
- No baseline script deletes production data.
- No baseline script truncates data.
- No baseline script drops tables or columns.
- No baseline script creates demo restaurant data.
- No baseline script stores or prints secrets.

## Manual Dry-Run Strategy

Because this baseline is intentionally outside `supabase/migrations`, it should not be pushed through the normal production migration history.

For a verified staging database, the safe dry-run path is:

1. Create or use a disposable staging branch/project.
2. Apply the two baseline files there only.
3. Run schema verification.
4. Run local release checks against staging.
5. If all checks pass, document the baseline as the staging bootstrap strategy.

Do not run the baseline against a database containing production data.

## Historical Migration Policy

Existing production databases:

- continue using forward-only migrations after `0056`;
- never receive this fresh baseline;
- keep historical migration records intact;
- must not have migration history rewritten for this baseline.

Fresh staging/local environments:

- may be bootstrapped from the BASIC 1.0 baseline;
- must not replay unsafe legacy/demo migrations;
- receive only post-baseline forward migrations after bootstrap.

Post-baseline migration tracking:

- new normal production migrations continue from `0057` onward;
- `object-manifest.json` records that the baseline semantically includes the final state through `0056`;
- `public.smarttable_schema_baselines` records the applied baseline checksum and verification status;
- do not forge Supabase migration history automatically.

Supabase `db push` compatibility still requires a deliberate environment-specific reconciliation step after schema verification. The safest supported manual process is:

1. Apply and verify this baseline in an empty staging project.
2. Run `npm run staging:baseline:verify -- --record-verification`.
3. Record the verification output and baseline checksum.
4. Only then, if the team decides to use Supabase migration history for future `db push`, repair the staging migration history as an audited manual operation for `0001` through `0056`.
5. Never run that repair against production as part of baseline setup.

This repository intentionally does not automate migration-history repair because doing so before independent schema verification could incorrectly claim that historical migrations were applied.

The supported no-forgery compatibility path for fresh baseline environments is to use a post-baseline migration workdir that begins at `0057`. The repository command `npm run staging:baseline:compatibility` proves this with a dry-run-only synthetic `0057` probe and no database writes. It does not create a real feature migration.

## Rollback Strategy

For a fresh staging environment:

1. Stop before adding test users or test data if baseline execution fails.
2. Capture the exact SQL error and line number.
3. Reset or recreate only the disposable staging environment.
4. Correct the baseline in source control.
5. Re-run from a clean empty staging database.

For production:

- This baseline is not a production migration.
- Existing production projects keep their historical migration state.
- Production changes must continue through reviewed additive migrations.

## Verification Expectations

After applying the baseline in staging, verify:

- Required tables exist.
- Required columns exist.
- Required indexes exist.
- RLS is enabled on all listed tables.
- RLS policies exist.
- RPC functions exist and compile.
- Public views exist and exclude test restaurant/test offer rows.
- NYC market is active.
- Budapest market is draft.
- Required subscription plan rows exist with no hardcoded live prices.
- No legacy demo rows are present.
- No secrets are present in public data.
