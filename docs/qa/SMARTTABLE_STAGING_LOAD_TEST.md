# SmartTable staging capacity test

## Purpose

This harness measures whether the current staging application can serve representative public browsing and partner dashboard read traffic at 100, 300, 1,000, and 3,000 simulated-user profiles.

It is a capacity signal, not a guarantee that 3,000 people can all submit reservations at the same instant. Write-heavy reservation, email, SMS, push, Stripe, and admin flows are deliberately excluded.

## Safety gates

- The Supabase CLI link must match `STAGING_SUPABASE_PROJECT_REF`.
- `/api/health` must report the same staging project ref.
- A remote target must report `runtime_mode=staging` or `preview`; a Vercel Preview may omit it only when `/api/health` still reports the exact staging Supabase project ref.
- `smarttablenyc.com`, `www.smarttablenyc.com`, and the known production Supabase ref are rejected.
- Every measured request is `GET`.
- One staging partner login occurs before measurement; its token remains in memory and is never printed or saved.
- Reports contain status, timing, route, byte-count, build, runtime, and staging ref only.
- Profiles above smoke require `--confirm-staging-load-test`.

## Traffic model

Public traffic covers configuration, restaurant listing, offers, Crave, newest restaurants, and public content. Authenticated traffic covers the assigned staging partner's profile, statistics, reservations list, offers list, reviews, analytics, and notification preferences.

The 1,000-user profile is intentionally partner-heavy. The 3,000-user profile models a mixed marketplace audience. A shared partner session is used, so the result measures API and database read capacity rather than 1,000 separate restaurant tenants.

## Commands

```powershell
npm run check:load-test-safety
npm run load:test:staging:smoke
npm run load:test:staging:100
npm run load:test:staging:300
npm run load:test:staging:1000
npm run load:test:staging:3000
```

The staging URL is read from `SMARTTABLE_STAGING_SITE_URL`, `STAGING_SITE_URL`, or `PLAYWRIGHT_STAGING_BASE_URL` in `.env.staging.local`. It can also be supplied explicitly with `--base-url`.

## Pass gates

- Error rate at or below 1%.
- Overall p95 latency at or below 2,500 ms.
- Overall p99 latency at or below 5,000 ms.

Machine-readable reports are written under `test-results/load/`, which is ignored by Git.

## Interpretation

A passing 3,000-user profile demonstrates that the current staging deployment sustained that synthetic read workload under the measured conditions. Before a high-traffic launch, repeat the test against an isolated production-equivalent environment, monitor Supabase and Vercel quotas, and separately test reservation writes with an approved disposable dataset and disabled outbound notifications.
