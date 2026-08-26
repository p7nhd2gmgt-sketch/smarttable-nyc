# SmartTable Staging Migration Plan

Date: 2026-07-28
Scope: staging-only migration planning for a fresh Supabase database

No migrations were applied while preparing this plan. The verified staging project was linked earlier, but this document intentionally stops before any database write. No production project, DNS, deployment, or secret value is touched by this plan.

## A. Migration Inventory

Classification rules:

- `schema only`: creates or alters schema objects, policies, functions, triggers, indexes, constraints, views, or enums without seeding application/business records.
- `safe data migration`: idempotent reference/configuration/content data, template data, enum values, or controlled backfills required by the application.
- `legacy seed/demo migration`: creates demo/test restaurants, offers, reservations, or other sample business records.
- `destructive cleanup`: drops tables/columns, deletes rows, or otherwise removes historical data/schema.
- `historical one-time migration`: older expansion/backfill migration that is useful context for production history but should be folded into a clean baseline for new environments where practical.
- `production-only`: intended only for an existing production state. No migration currently requires this category.
- `obsolete`: no longer needed for new environments. No migration should be marked obsolete until a reviewed baseline supersedes it.

| Version | Filename | Category | Reason | Safe to replay on a new staging database? |
| --- | --- | --- | --- | --- |
| 0001 | `0001_initial_schema.sql` | schema only | Creates base profiles, restaurants, offers, reservations, email events, views, triggers, auth profile hook, and RLS. | YES |
| 0002 | `0002_seed_demo_availability.sql` | legacy seed/demo migration | Inserts Hudson Hearth, Casa Luna, and demo offers. This is business/demo data, not schema. | NO |
| 0003 | `0003_saas_enum_values.sql` | schema only | Adds enum values used by later SaaS roles/statuses. | YES |
| 0004 | `0004_saas_platform_content_partner.sql` | historical one-time migration | Adds partner/content fields, backfills old restaurant/offer/reservation rows, creates CMS/view objects, and inserts early NYC public copy. | YES |
| 0005 | `0005_billing_storage_email_templates.sql` | historical one-time migration | Adds early billing/storage/email template structures and safe content/template rows. | YES |
| 0006 | `0006_super_admin_socials_offer_management.sql` | safe data migration | Adds admin/social/offer-management structures and idempotent site content. | YES |
| 0007 | `0007_restaurant_order_followers_maps.sql` | safe data migration | Adds ordering, followers, map fields, public cards, and content; no destructive data removal. | YES |
| 0008 | `0008_reviews_notifications_newest.sql` | safe data migration | Adds reviews, admin notifications, newest ordering, summary view, and content. | YES |
| 0009 | `0009_ai_platform_foundation.sql` | historical one-time migration | Adds future AI foundation schema and content/backfills. BASIC hides these features, but schema is additive. | YES |
| 0010 | `0010_restaurant_intelligence_expansion.sql` | historical one-time migration | Adds restaurant intelligence, loyalty, analytics, and audit scaffolding plus backfills. Future-facing but additive. | YES |
| 0011 | `0011_partner_dashboard_demand_design.sql` | safe data migration | Inserts partner dashboard content keys only. | YES |
| 0012 | `0012_advisor_profile_public_concierge.sql` | historical one-time migration | Adds advisor/profile/public concierge fields, content, and restaurant backfills. | YES |
| 0013 | `0013_ai_score_revenue_marketplace_insights.sql` | safe data migration | Inserts feature/content labels for hidden/future AI score and insights. | YES |
| 0014 | `0014_benchmark_consumer_planner_expansion.sql` | historical one-time migration | Inserts benchmark, consumer-intelligence, event, and route planner labels including demo-estimate copy. Future-facing, no business records. | YES |
| 0015 | `0015_photo_rewards_recognition_loyalty_privacy.sql` | historical one-time migration | Adds photo reward, recognition, loyalty, and privacy structures/content. Hidden from BASIC public release. | YES |
| 0016 | `0016_partner_ai_revenue_operating_system.sql` | historical one-time migration | Inserts future AI/revenue operating content labels. | YES |
| 0017 | `0017_partner_portfolio_ops_marketing_ai.sql` | historical one-time migration | Inserts future portfolio, pricing, staffing, VIP, and marketing generator copy with demo/future wording. | YES |
| 0018 | `0018_partner_ai_competitor_menu_reputation.sql` | historical one-time migration | Inserts future competitor/menu/reputation AI content. | YES |
| 0019 | `0019_post_visit_photo_rewards.sql` | historical one-time migration | Adds post-visit/photo rewards/notifications structures and content. | YES |
| 0020 | `0020_partner_post_visit_feedback.sql` | historical one-time migration | Adds feedback content and backfills reservation/offer fields. | YES |
| 0021 | `0021_partner_ai_operating_system.sql` | historical one-time migration | Inserts future partner AI operating content. | YES |
| 0022 | `0022_partner_dashboard_simplification.sql` | safe data migration | Inserts simplified partner dashboard content. | YES |
| 0023 | `0023_real_ai_operating_system_foundation.sql` | historical one-time migration | Adds extensive future AI, imported data, integrations, campaigns, email logs, notifications, and feature status schema/content. | YES |
| 0024 | `0024_integration_hub_billing_monitoring.sql` | historical one-time migration | Adds integration, import, billing, privacy, monitoring, and feature-flag foundation. Some later cleanup depends on it. | YES |
| 0025 | `0025_ai_truth_status_updates.sql` | safe data migration | Inserts/updates AI truth/status and feature flag metadata. | YES |
| 0026 | `0026_hungarian_i18n.sql` | safe data migration | Adds Hungarian content/localization support. | YES |
| 0027 | `0027_platform_mode_settings.sql` | safe data migration | Adds app settings/platform mode and content; required for BASIC mode gating. | YES |
| 0028 | `0028_remove_pos_integration_references.sql` | destructive cleanup | Deletes integration/content/feature rows, drops `public.mobility_provider_integrations`, drops POS-derived columns, and replaces an integration constraint. | NO |
| 0029 | `0029_guest_signup_onboarding_consents.sql` | schema only | Adds guest signup/onboarding consent columns. | YES |
| 0030 | `0030_guest_signup_profile_preference_fields.sql` | schema only | Adds guest profile/preference fields. | YES |
| 0031 | `0031_guest_account_auth_system.sql` | schema only | Adds guest auth/account event support and policies. | YES |
| 0032 | `0032_guest_reservation_cancellation.sql` | schema only | Adds guest reservation cancellation support. | YES |
| 0033 | `0033_guest_privacy_security_controls.sql` | schema only | Adds privacy/security control fields. | YES |
| 0034 | `0034_scale_readiness_feature_flags_booking.sql` | historical one-time migration | Adds scale-readiness tables/feature flags and backfills reservations/app settings. | YES |
| 0035 | `0035_timezone_aware_offer_validity.sql` | historical one-time migration | Adds timezone-aware offer validity function/view and updates existing offers. | YES |
| 0036 | `0036_email_service_templates.sql` | safe data migration | Inserts transactional email templates. | YES |
| 0037 | `0037_email_delivery_log_idempotency.sql` | historical one-time migration | Extends email logs and backfills idempotency/status metadata. | YES |
| 0038 | `0038_post_visit_email_templates_and_webhooks.sql` | safe data migration | Inserts post-visit/rating email templates and webhook content. | YES |
| 0039 | `0039_email_queue_retry.sql` | schema only | Adds email queue retry table/policies and retry fields. | YES |
| 0040 | `0040_basic_email_flow_content.sql` | safe data migration | Inserts BASIC transactional email flow content. | YES |
| 0041 | `0041_reservation_lifecycle_policy.sql` | historical one-time migration | Adds reservation lifecycle status events, functions, views, policies, and backfills reservation/offer status state. | YES |
| 0042 | `0042_lock_guest_notifications_rls.sql` | schema only | Tightens guest notification RLS policies. | YES |
| 0043 | `0043_account_security_events.sql` | safe data migration | Adds account security events and password-change notification content. | YES |
| 0044 | `0044_legal_consents_and_data_exports.sql` | safe data migration | Adds legal consent/data export structures and current legal document/content rows. | YES |
| 0045 | `0045_smarttable_test_bistro_seed.sql` | legacy seed/demo migration | Adds schema compatibility fields and seeds SmartTable Test Bistro/test offers. It is not data-only and should not be part of fresh staging bootstrap unless test data is explicitly requested. | NO |
| 0046 | `0046_stripe_partner_subscriptions.sql` | safe data migration | Adds Stripe subscription structures and plan/reference rows. | YES |
| 0047 | `0047_communication_preferences_campaigns.sql` | schema only | Adds communication preferences, consents, suppression, campaigns, and recipient structures. | YES |
| 0048 | `0048_sms_system_notifications.sql` | schema only | Adds SMS/system notification structures and replaces some policies using idempotent policy replacement. SMS remains hidden for BASIC. | YES |
| 0049 | `0049_enterprise_compliance_hardening.sql` | schema only | Adds compliance hardening columns/constraints. | YES |
| 0050 | `0050_multi_market_foundation.sql` | safe data migration | Adds markets, seeds NYC/Budapest market configuration, and backfills restaurants to NYC. | YES |
| 0051 | `0051_resend_webhook_delivery_statuses.sql` | schema only | Extends email queue/log status constraints for Resend delivery tracking. | YES |
| 0052 | `0052_role_based_onboarding_foundation.sql` | schema only | Adds RBAC/onboarding foundation, partner invitations, helpers, policies, and audit extensions. | YES |
| 0053 | `0053_restaurant_administration_fields.sql` | schema only | Adds restaurant administration fields and constraints. | YES |
| 0054 | `0054_restaurant_capacity_and_lifecycle.sql` | schema only | Adds dining areas, tables, capacity overrides, constraints, policies, and updated_at triggers. | YES |
| 0055 | `0055_restaurant_admin_status_history.sql` | schema only | Adds restaurant status history/audit tables and policies. | YES |
| 0056 | `0056_fixed_monthly_restaurant_subscriptions.sql` | safe data migration | Adds fixed monthly billing tables, RLS, indexes, plan rows, and feature-flag rows. | YES |

## B. Replay-Safe Migrations

The following migrations are individually replay-safe on a new empty staging database from a SQL safety perspective:

- `0001`
- `0003` through `0027`
- `0029` through `0044`
- `0046` through `0056`

Important nuance: "replay-safe" here means the migration does not itself contain destructive table/data operations or actual demo business seeding. It does not mean the full historical chain should be approved. Many replay-safe migrations are historical one-time migrations that should be folded into a clean baseline for new environments.

## C. Migrations That Should Not Replay

These migrations should not be replayed automatically into a fresh staging database:

| Version | Filename | Reason |
| --- | --- | --- |
| 0002 | `0002_seed_demo_availability.sql` | Seeds demo restaurants and offers. The current task explicitly says not to seed production-like data yet. |
| 0028 | `0028_remove_pos_integration_references.sql` | Contains destructive cleanup: deletes rows, drops a table, drops columns, and replaces constraints. |
| 0045 | `0045_smarttable_test_bistro_seed.sql` | Seeds SmartTable Test Bistro/test offers and also contains schema-changing compatibility statements. It should be separated into a data-only optional seed after schema bootstrap. |

## D. Historical/Demo Migrations

Historical one-time migrations remain valuable as production history, but they are not an ideal bootstrap mechanism for a brand-new staging project. They include old backfills, early content, hidden AI scaffolds, future feature copy, and integration placeholders. The strongest examples are:

- `0004` through `0027`
- `0034`
- `0035`
- `0037`
- `0041`
- `0050`

Demo/test seed migrations are separate and should stay optional:

- `0002_seed_demo_availability.sql`
- `0045_smarttable_test_bistro_seed.sql`

## E. Destructive Cleanup Migrations

`0028_remove_pos_integration_references.sql` is the only migration identified as destructive cleanup. It includes:

- `delete from public.integration_error_logs`
- `delete from public.integration_connections`
- `delete from public.integrations`
- `delete from public.reservation_sources`
- `delete from public.feature_status`
- `delete from public.feature_flags`
- `delete from public.site_content`
- `drop table if exists public.mobility_provider_integrations`
- `alter table ... drop column`
- `alter table ... drop constraint`

This migration may have been correct for an existing historical database state, but it should not be part of an automatic fresh-staging bootstrap. A clean baseline should simply omit the obsolete POS artifacts rather than create them and then delete/drop them.

## F. Recommended Staging Bootstrap Sequence

Recommended approach: create a clean baseline for fresh staging without rewriting existing production history.

1. Keep the existing migration files unchanged.
2. Do not run `npx.cmd supabase db push --linked` against fresh staging while `0002`, `0028`, and `0045` remain pending.
3. Generate a reviewed baseline SQL from the desired current schema, excluding:
   - demo restaurant/offer/reservation data from `0002`;
   - destructive replay from `0028`;
   - SmartTable Test Bistro/test offer seed data from `0045`;
   - obsolete POS artifacts that `0028` would otherwise remove.
4. Include required current reference/configuration data in the baseline:
   - enums;
   - RLS policies;
   - helper functions;
   - views;
   - indexes;
   - constraints;
   - app settings for BASIC mode;
   - required transactional email templates;
   - required legal documents where applicable;
   - required market rows for NYC/Budapest if `0050` remains in scope;
   - required subscription plan reference rows if billing checks remain in scope.
5. Apply the reviewed baseline SQL to the fresh staging project through a controlled process.
6. Verify tables, columns, indexes, constraints, functions, views, triggers, RLS, and policies directly against staging.
7. Do not repair Supabase migration history automatically.
8. Verify future-migration compatibility with `npm run staging:baseline:compatibility`; this command creates a temporary local workdir containing only a dry-run synthetic `0057` probe and performs no writes.
9. From migration `0057` onward, use a reviewed post-baseline migration workdir for fresh baseline environments unless the team separately approves a controlled staging-only migration-history reconciliation.
10. Seed test data only after schema verification, using a separate reviewed data-only seed.

Alternative not recommended: marking only `0002`, `0028`, and `0045` as applied and then pushing the rest. This would avoid demo data and destructive cleanup, but it may leave obsolete POS/integration artifacts from earlier historical migrations and does not produce a clean current baseline.

## G. Recommended Production Policy

Production history must not be rewritten.

- Do not run the full historical migration chain against production.
- Do not repair production migration history unless the database schema has been independently verified to match the repaired versions.
- Use forward-only corrective migrations for production.
- Keep demo/test seeds out of production migration replay.
- Keep future baseline work scoped to new staging or disposable environments.
- Treat `0028` as historical cleanup that must be reviewed against the actual target database before any replay.
- Keep POS integrations prohibited; fresh baselines should omit POS artifacts rather than rely on destructive cleanup.

## H. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Full CLI replay applies demo restaurants/offers | Staging data becomes polluted and may affect public/API tests | Exclude `0002` and `0045`; seed test data separately only when requested |
| Full CLI replay runs `0028` destructive cleanup | Tables/columns/rows are dropped/deleted as part of bootstrap | Use a clean baseline that omits obsolete POS artifacts |
| Skipping `0028` without a baseline leaves obsolete POS artifacts | Schema/content may contradict current SmartTable policy | Do not use partial skip strategy as the main plan |
| Historical AI/future-feature content appears in staging | Hidden features may have backing content despite BASIC release mode | Keep BASIC feature flags/server gating enforced and verify public surfaces |
| Migration repair used incorrectly | Supabase migration history could claim objects exist when schema is incomplete | Repair only after baseline schema verification passes |
| Production history copied into staging without review | Staging may inherit obsolete or sensitive assumptions | Use fresh baseline and no real customer data |

## I. Approved BASIC 1.0 Baseline Strategy

The reviewed fresh-environment baseline now lives in:

- `supabase/baseline/basic-1.0/0001_basic_1_0_schema.sql`
- `supabase/baseline/basic-1.0/0002_basic_1_0_required_reference_data.sql`
- `supabase/baseline/basic-1.0/object-manifest.json`
- `supabase/baseline/basic-1.0/SHA256SUMS`
- `supabase/baseline/basic-1.0/README.md`

The top-level runbook is `SMARTTABLE_BASIC_1_0_BASELINE.md`.

Approved staging-only commands:

```powershell
npm run check:basic-baseline
npm run check:baseline-equivalence
npm run check:baseline-security
npm run staging:baseline:dry-run
npm run staging:baseline:apply -- --confirm-staging-baseline --project-ref=<STAGING_SUPABASE_PROJECT_REF>
npm run staging:baseline:verify -- --record-verification
npm run staging:baseline:compatibility
```

The baseline creates `public.smarttable_schema_baselines` for append-safe metadata. It does not modify production migration history and does not automatically repair Supabase migration history. Any migration-history reconciliation for a fresh baseline environment must be a separate audited staging-only operation after schema verification passes.

Pre-apply staging check on 2026-07-28 confirmed:

- linked project ref: `zwapighnwlwmdkqscrzn`;
- linked project name: `smarttable-staging`;
- public application table count: `0`;
- Supabase migration history: absent;
- auth user count: `0`;
- dry-run plan: only `0001_basic_1_0_schema.sql` and `0002_basic_1_0_required_reference_data.sql`.

Post-apply reconciliation on 2026-07-29 confirmed:

- the baseline SQL applied to `smarttable-staging`;
- the manifest was reconciled from 40 to 51 required public tables;
- manifest key-column expectations were corrected to match the actual `feature_flags` schema (`key`, `enabled`, `audience`);
- the manifest now includes required static `site_content` keys, critical named constraints, required indexes, and required triggers;
- omitted objects were required operational, audit, observability, notification, privacy, auth-event, or localized-content tables;
- no demo restaurants, demo offers, users, reservations, partner assignments, or invitations exist;
- no POS or obsolete integration objects exist;
- `npm run staging:baseline:verify -- --record-verification` passed;
- `npm run staging:baseline:verify` passed after the metadata checksum update;
- `npm run staging:baseline:compatibility` passed with only `0057_post_baseline_compatibility_probe.sql` recognized in a no-write dry run;
- baseline metadata now records `verification_status = verified`;
- Supabase migration history remains absent by design and has not been repaired automatically.

## J. Final Recommendation

Do not approve the full historical migration chain for the fresh staging project.

The correct bootstrap path is the approved BASIC 1.0 fresh-environment baseline, not replaying the historical chain. For `smarttable-staging`, the baseline has now been applied and verified. Future fresh-environment migrations should start from a post-baseline `0057` workdir or an independently approved staging-only migration-history reconciliation process.

The BASIC 1.0 baseline staging gate is `PASS` for schema/RLS verification. It does not include test users, demo data, Stripe setup, Resend setup, deployment, or browser QA.
