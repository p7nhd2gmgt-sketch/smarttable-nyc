# SmartTable BASIC 1.0 Operations Checklist

Date prepared: 2026-07-28

Scope: SmartTable BASIC public MVP operations readiness. This checklist does not approve production deployment by itself; it must be completed together with staging migration verification, browser QA, and owner sign-off.

## Deployment Prerequisites

| Item | Required Result | Pass/Fail | Notes |
| --- | --- | --- | --- |
| Repository branch reviewed | Correct release branch selected; no unrelated destructive changes |  |  |
| Working tree reviewed | Expected code, docs, scripts, and migrations accounted for |  |  |
| Production build | `npm run build` passes |  |  |
| Lint | `npm run lint` passes |  |  |
| Unit/integration checks | `npm test` passes |  |  |
| Browser smoke | `npm run test:e2e` passes |  |  |
| BASIC release audit | `npm run check:basic-release-audit` passes |  |  |
| No production deploy from unverified state | Deployment is held until staging and manual QA pass |  |  |

## Required Migrations

Apply only to a verified staging Supabase project first. Do not use production as staging.

| Migration | Purpose | Staging Status | Production Status | Notes |
| --- | --- | --- | --- | --- |
| 0051_resend_webhook_delivery_statuses.sql | Resend webhook delivery status support |  |  |  |
| 0052_role_based_onboarding_foundation.sql | RBAC, partner invitations, onboarding foundation |  |  |  |
| 0053_restaurant_administration_fields.sql | Restaurant administration fields |  |  |  |
| 0054_restaurant_capacity_and_lifecycle.sql | Capacity, tables, lifecycle support |  |  |  |
| 0055_restaurant_admin_status_history.sql | Restaurant status history |  |  |  |
| 0056_fixed_monthly_restaurant_subscriptions.sql | Fixed monthly billing schema |  |  |  |

Verification command:

```bash
npm run check:migration-chain
npm run check:onboarding-migration
npm run check:restaurant-administration
```

Known historical review note: migration 0028 contains POS-removal cleanup statements and must be manually reviewed before replaying the full historical chain against any existing database.

## Required Environment Variables

Do not print or share values in tickets, screenshots, logs, chat, or reports.

| Variable | Required For | Environment | Present | Notes |
| --- | --- | --- | --- | --- |
| SMARTTABLE_ENV | Runtime mode | Production, Preview, Development |  | Production must resolve to production mode |
| PUBLIC_BASE_URL | Canonical URLs, email links, redirects | Production, Preview, Development |  | Production must be `https://smarttablenyc.com` unless domain changes |
| SUPABASE_URL | Supabase API | Production, Preview, Development |  | URL only, no credentials |
| SUPABASE_ANON_KEY | Browser-safe Supabase auth where applicable | Production, Preview, Development |  | Must not be service role |
| SUPABASE_SERVICE_ROLE_KEY | Server-only Supabase operations | Production, Preview, Development |  | Server-side only |
| EMAIL_FROM | Transactional sender | Production, Preview, Development |  | Must align with verified Resend sender domain |
| EMAIL_REPLY_TO | Reply handling | Production, Preview, Development |  | Optional but recommended |
| RESEND_API_KEY | Transactional email API | Production, Preview, Development |  | Server-side only |
| RESEND_WEBHOOK_SECRET | Resend webhook verification | Production, Preview, Development |  | Server-side only |
| STRIPE_SECRET_KEY | Stripe Billing server calls | Preview/Staging test mode |  | Test mode only for BASIC 1.0 validation |
| STRIPE_PUBLISHABLE_KEY | Stripe client handoff where needed | Preview/Staging test mode |  | Publishable only |
| STRIPE_WEBHOOK_SECRET | Stripe webhook verification | Preview/Staging test mode |  | Server-side only |
| STRIPE_BASIC_MONTHLY_PRICE_ID | Basic plan mapping | Preview/Staging test mode |  | Protected value |
| STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID | Professional plan mapping | Preview/Staging test mode |  | Protected value |
| STRIPE_ENTERPRISE_MONTHLY_PRICE_ID | Enterprise plan mapping | Preview/Staging test mode |  | Protected value |
| BILLING_DEFAULT_TRIAL_DAYS | Trial policy | Preview/Staging test mode |  | Numeric |
| BILLING_GRACE_PERIOD_DAYS | Payment grace policy | Preview/Staging test mode |  | Numeric |
| BILLING_OVERRIDE_MAX_DAYS | Admin override policy | Preview/Staging test mode |  | Numeric |
| SMARTTABLE_TEST_GUEST_EMAIL | Protected QA test account | Development/Staging only |  | No passwords in source |
| SMARTTABLE_TEST_PARTNER_EMAIL | Protected QA test account | Development/Staging only |  | No passwords in source |
| SMARTTABLE_TEST_ADMIN_EMAIL | Protected QA test account | Development/Staging only |  | No passwords in source |
| SMARTTABLE_TEST_SUPERADMIN_EMAIL | Protected QA test account | Development/Staging only |  | No passwords in source |

## Resend Setup

| Item | Required Result | Pass/Fail | Notes |
| --- | --- | --- | --- |
| Sender domain verified | Resend domain for `EMAIL_FROM` is verified |  |  |
| API key active | `RESEND_API_KEY` exists in required Vercel environments |  | Do not reveal value |
| Webhook secret active | `RESEND_WEBHOOK_SECRET` exists where webhook is enabled |  | Do not reveal value |
| Webhook URL configured | `https://smarttablenyc.com/api/webhooks/resend` or current deployed endpoint |  | Confirm actual endpoint before enabling |
| Enabled events | sent, delivered, delivery_delayed, bounced, complained, failed |  |  |
| Test reservation email | Guest and partner emails accepted by provider |  |  |
| No fake tracking | UI/admin only show provider-tracked status where webhook exists |  |  |

## Stripe Setup

Stripe remains test-mode-only until a separate live billing release gate is approved.

| Item | Required Result | Pass/Fail | Notes |
| --- | --- | --- | --- |
| Test products | Basic and Professional products created in Stripe test mode |  |  |
| Monthly price IDs | Price IDs copied to protected Vercel env vars |  |  |
| Webhook endpoint | Stripe test webhook configured to `/api/webhooks/stripe` |  |  |
| Webhook secret | `STRIPE_WEBHOOK_SECRET` configured |  |  |
| Checkout test | Checkout creates session for authorized partner only |  |  |
| Portal test | Customer Portal opens for authorized partner only |  |  |
| No Connect | No Stripe Connect, payouts, deposits, or guest payments |  |  |

## Supabase Setup

| Item | Required Result | Pass/Fail | Notes |
| --- | --- | --- | --- |
| Project confirmed | Correct Supabase project reference verified without exposing keys |  |  |
| Auth Site URL | `https://smarttablenyc.com` |  |  |
| Redirect URLs | Canonical production domain and approved preview domains only |  |  |
| Migrations applied | Required migrations applied to staging first, then production after approval |  |  |
| RLS reviewed | RLS policies present for new protected tables |  |  |
| Service role server-only | No service-role key in browser bundles or public config |  |  |
| Backup/export plan | Manual export and rollback plan ready before production migration |  |  |

## Rollback Steps

| Step | Action | Pass/Fail | Notes |
| --- | --- | --- | --- |
| 1 | Identify last known-good Vercel production deployment |  |  |
| 2 | Promote/restore that Vercel deployment if app release fails |  |  |
| 3 | Stop new migration application if any database error appears |  |  |
| 4 | If migration was applied, follow migration-specific rollback guidance; do not reset production |  |  |
| 5 | Rotate any exposed secrets immediately |  |  |
| 6 | Re-run `/api/health`, public config, auth smoke, reservation smoke |  |  |

## Health Check

Required endpoint: `/api/health`

| Field | Required Production Result | Pass/Fail | Notes |
| --- | --- | --- | --- |
| HTTP status | 200 after required services are configured and reachable |  |  |
| environment | production |  |  |
| mode | supabase |  |  |
| database_reachable | true |  |  |
| email_configured | true |  |  |
| production_configuration_issues | empty list |  |  |
| secret exposure | no secret values or secret variable names |  |  |

## Smoke Test

| Area | Action | Expected Result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Public homepage | Open `/` | Page loads with correct header, hero, search, footer |  |  |
| Public offers | Open `/api/public/offers?lang=en` | Returns production-safe offers only |  |  |
| Public config | Open `/api/public/config` | BASIC mode, no secrets |  |  |
| Signup | Register a controlled test guest | Supabase Auth user and profile created |  |  |
| Reservation | Submit one test reservation | Pending reservation saved, duplicate blocked |  |  |
| Partner | Open partner dashboard | Assigned restaurant reservation visible |  |  |
| Admin | Open admin dashboard | Admin actions scoped and audited |  |  |

## Manual QA

Use `SMARTTABLE_BASIC_1_0_MANUAL_QA.md`. Manual QA is required before owner approval.

## Incident Contacts

Use placeholders until the owner supplies real operational contacts. Do not invent details.

| Role | Contact Placeholder | Notes |
| --- | --- | --- |
| Product owner | TBD_PRODUCT_OWNER |  |
| Engineering owner | TBD_ENGINEERING_OWNER |  |
| Supabase admin | TBD_SUPABASE_ADMIN |  |
| Vercel admin | TBD_VERCEL_ADMIN |  |
| Resend admin | TBD_RESEND_ADMIN |  |
| Stripe admin | TBD_STRIPE_ADMIN |  |
| Legal/privacy contact | TBD_LEGAL_PRIVACY_CONTACT | Legal review required |
