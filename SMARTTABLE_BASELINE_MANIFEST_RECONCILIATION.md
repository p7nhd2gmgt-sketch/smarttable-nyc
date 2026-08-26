# SmartTable Baseline Manifest Reconciliation

Date: 2026-07-29

Scope: `smarttable-staging` only. No production project, deployment, DNS, Supabase production project, Resend configuration, Stripe configuration, seed data, or test users were touched.

## A. Initial Mismatch

The BASIC 1.0 baseline SQL had been applied to the verified empty staging project, but post-apply verification stopped because `supabase/baseline/basic-1.0/object-manifest.json` represented only 40 public tables while the baseline SQL created 51 public tables.

The failure was in the verifier/manifest layer, not in SQL application. No failed SQL statement was observed during baseline apply.

## B. Current Staging State

Linked staging project:

- project ref: `zwapighnwlwmdkqscrzn`
- project name: `smarttable-staging`

Captured machine-readable snapshot:

- `tmp/staging-baseline-diagnostics/staging-state-20260729-124704.json`

Final staging verification after reconciliation:

- public tables: 51
- public views: 7
- manifest SmartTable functions: 12
- required indexes: 71
- required triggers: 31
- required named constraints: 19
- RLS policies: 84
- auth users: 0
- Supabase migration history rows: 0
- baseline metadata rows: 1
- baseline metadata status: `verified`
- demo restaurant data: absent
- SmartTable Test Bistro data: absent
- sample reservations: absent
- fake users: absent
- POS/obsolete integration objects: absent

## C. Object-by-Object Decisions

| Object | Classification | Decision |
| --- | --- | --- |
| `admin_alerts` | required operational object | Keep. Admin-only operations and alert state; no rows seeded. |
| `admin_notifications` | required operational object | Keep. Supports admin notifications and `admin_notifications_overview`; no rows seeded. |
| `app_error_logs` | required observability object | Keep. Admin-only RLS; no rows seeded. |
| `dining_consumption_uploads` | required guest activity source | Keep. Required by current activity/review data model; no rows seeded. |
| `email_events` | required email audit object | Keep. Admin-only RLS; no rows seeded. |
| `guest_auth_events` | required auth security audit object | Keep. Service/admin write policy only; no rows seeded. |
| `guest_notifications` | required guest notification object | Keep. Guest/admin scoped RLS; no rows seeded. |
| `notification_logs` | required notification audit object | Keep. Admin-only RLS; no rows seeded. |
| `notifications` | required in-app notification object | Keep. User/admin scoped RLS; no rows seeded. |
| `privacy_requests` | required privacy operations object | Keep. Guest/admin scoped RLS; no rows seeded. |
| `site_content` | required localized content/reference object | Keep. Public read, admin write; required static email/content keys are seeded. |
| `rls_auto_enable` | Supabase platform helper function | Allow only as documented exception with `SECURITY DEFINER SET search_path=pg_catalog`. Not added as a SmartTable manifest function. |

No table was classified as obsolete, duplicate, accidental, test/demo-only, or POS-related.

## D. Manifest Additions

Added 11 required public tables to `object-manifest.json`:

- `admin_alerts`
- `admin_notifications`
- `app_error_logs`
- `dining_consumption_uploads`
- `email_events`
- `guest_auth_events`
- `guest_notifications`
- `notification_logs`
- `notifications`
- `privacy_requests`
- `site_content`

Added machine-readable required object inventory:

- 71 explicit indexes
- 31 triggers, including `on_auth_user_created`
- 19 critical named constraints
- required `site_content` keys

Corrected the `feature_flags` key-column manifest from legacy names to the actual schema:

- `flag_key` to `key`
- `is_enabled` to `enabled`
- `visibility` to `audience`

## E. Manifest Removals

No baseline objects were removed from the manifest.

No baseline SQL object was removed.

## F. SQL Changes, If Any

No baseline SQL changes were made.

Unchanged SQL hashes:

- `0001_basic_1_0_schema.sql`: `43b2bc3ce5d87c04c9e2c62acc2bf8bf4159ccb1ad36f43535044d2332937783`
- `0002_basic_1_0_required_reference_data.sql`: `6e4f2e3750c57f4638307b78e2c256f8efd251ce3bc93ddd23883edcd3d5ef00`

Only manifest, checksum, verification tooling, package script registration, and documentation changed.

## G. Verification Changes

Updated staging verification to detect:

- missing manifest tables
- unexpected public tables
- missing manifest key columns
- unexpected public views
- unexpected public enums
- unexpected public functions, except documented `rls_auto_enable`
- missing manifest indexes
- unexpected non-constraint indexes
- missing manifest triggers
- unexpected triggers on public tables or `auth.users`
- missing primary keys on manifest tables
- missing critical named constraints
- missing RLS on manifest tables
- overly broad public write policies
- missing required reference rows
- auth users before approved setup
- demo restaurant rows
- POS and obsolete integration objects
- missing or stale baseline metadata checksum/status

Updated static baseline checks to verify manifest constraints and all manifest reference-data groups.

Added:

- `npm run staging:baseline:compatibility`

This command performs a no-write dry run using a temporary local workdir with only `0057_post_baseline_compatibility_probe.sql`.

## H. Reset Decision

Reset required: NO.

In-place continuation is safe because:

- the baseline schema and reference SQL completed before the verifier stopped;
- no SQL statement failure was observed;
- both baseline SQL files are transaction-wrapped;
- the reconciled verifier now passes against staging;
- required reference data is complete;
- exactly one baseline metadata row exists and is verified;
- no duplicate application rows exist;
- no auth users exist;
- no demo restaurants, test bistro rows, sample reservations, or fake users exist;
- no POS or obsolete integration objects exist;
- rerunning verification without `--record-verification` passes, so verification is not masking an incomplete apply.

No destructive reset was performed or requested.

## I. RLS Verification

Final staging verifier result:

- RLS enabled on all 51 manifest tables.
- 84 policies verified.
- Direct public insert policies rejected by the verifier.
- Overly broad write policies rejected by the verifier.
- Missing policy set would fail verification.

The verifier also validates SECURITY DEFINER search paths:

- SmartTable SECURITY DEFINER functions must use `search_path=public`.
- The only allowed extra public SECURITY DEFINER function is Supabase `rls_auto_enable` with `search_path=pg_catalog`.

## J. Demo/POS Exclusion

Verified absent:

- `Hudson Hearth`
- `Casa Luna Trattoria`
- `SmartTable Test Bistro`
- demo offers
- sample reservations
- fake users
- obsolete POS/integration tables
- provider names rejected by baseline checks: Toast, Square, Clover, Lightspeed, Micros

No demo or test data was seeded.

## K. Migration-History Compatibility

Production history remains untouched:

- historical migrations `0001` through `0056` remain unchanged;
- production migration history was not read, repaired, or modified;
- staging Supabase migration history remains absent by design.

Compatibility demonstrated:

- command: `npm run staging:baseline:compatibility`
- result: PASS
- recognized dry-run probe: `0057_post_baseline_compatibility_probe.sql`
- writes performed: false
- historical `0001` through `0056` migrations were not included in the dry-run plan
- baseline files were not included in the dry-run plan

Supported path for fresh baseline environments:

1. Apply and verify the BASIC 1.0 baseline.
2. Store verified baseline metadata.
3. Use a reviewed post-baseline migration workdir beginning at `0057`.
4. Do not blindly forge Supabase migration history.

If the team later requires regular Supabase migration-history repair for the full repo migration folder, that must be a separate audited staging-only operation after schema verification.

## L. Remaining Risks

- Staging has no test users yet by design.
- Stripe and Resend staging configuration are not part of this baseline task.
- Browser QA against staging app deployment is not part of this baseline task.
- Default `supabase/migrations` historical replay remains intentionally blocked for fresh staging because of legacy demo and destructive cleanup migrations.
- Any future decision to repair Supabase migration history for `0001` through `0056` still requires explicit operational approval.

## Command Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run check:basic-baseline` | PASS | Manifest, checksum, SQL safety, required objects. |
| `npm run check:baseline-equivalence` | PASS | Baseline final-state coverage through `0056`. |
| `npm run check:baseline-security` | PASS | RLS, policies, SECURITY DEFINER, secrets/POS/demo rejection. |
| `npm run staging:baseline:dry-run` | PASS | Staging `baseline_present`; no writes. |
| `npm run staging:baseline:verify -- --record-verification` | PASS | Metadata checksum/status reconciled. |
| `npm run staging:baseline:verify` | PASS | Read-only verification after metadata reconciliation. |
| `npm run staging:baseline:compatibility` | PASS | Synthetic 0057 no-write dry run. |
| `npm run typecheck` | PASS | JavaScript syntax/type-adjacent check. |
| `npm run lint` | PASS | Static quality checks. |
| `npm test` | PASS | Aggregate local checks. |
| `npm run build` | PASS | Build maps to `npm run check`. |
| `npm run test:e2e` | PASS | 14 Playwright tests passed. |
| `npm run check:migration-chain` | PASS | Reports expected historical warning for `0028`. |
| `npm run check:onboarding-migration` | PASS | Onboarding/RBAC migration readiness. |
| `npm run check:restaurant-administration` | PASS | Restaurant admin checks. |
| `npm run check:billing` | PASS | Billing checks. |
| `npm run check:stripe-webhook` | PASS | Stripe webhook checks. |
| `npm run check:subscription-access` | PASS | Subscription access checks. |
| `npm run check:analytics` | PASS | Analytics checks. |
| `npm run check:basic-feature-completeness` | PASS | BASIC feature completeness checks. |
| `npm run check:basic-release-audit` | PASS | Sequential rerun passed. One earlier parallel run failed only because it contended with a simultaneous E2E server on port 4174. |
