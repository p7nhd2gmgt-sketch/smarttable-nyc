# SmartTable Multi-Market Phase 4.0.1 Report

Date: 2026-07-23

## Executive Summary

Phase 4.0.1 adds the smallest additive multi-market foundation needed to represent New York City and Budapest in one shared SmartTable codebase.

Existing NYC behavior remains the default. Budapest is represented as a draft market and is not exposed as an active public market.

No live Stripe pricing, DNS, email, SMS, public routing, legal behavior, AI behavior, POS behavior, or reservation-provider integration behavior was changed.

## Exact Files Changed

- `supabase/migrations/0050_multi_market_foundation.sql`
- `src/market-config.js`
- `src/app-core.js`
- `scripts/check-market-foundation.js`
- `package.json`
- `docs/architecture/SMARTTABLE_MULTI_MARKET_ARCHITECTURE_AUDIT.md`
- `docs/enterprise/DATABASE_MIGRATION_NOTES.md`
- `docs/architecture/SMARTTABLE_MULTI_MARKET_PHASE_4_0_1_REPORT.md`

## Schema Introduced

The migration `supabase/migrations/0050_multi_market_foundation.sql` introduces `public.markets`.

Columns:

- `id uuid primary key`
- `code text`
- `name text`
- `country_code text`
- `city_name text`
- `currency_code text`
- `timezone text`
- `default_locale text`
- `supported_locales text[]`
- `status text`
- `configuration jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints and validation:

- Stable lowercase market code format.
- ISO-style two-letter country code format.
- ISO-style three-letter currency code format.
- Locale format validation.
- Default locale must be present in supported locales.
- Status limited to `active`, `inactive`, or `draft`.
- Trigger validates that the timezone is accepted by PostgreSQL.

Indexes:

- Unique market code index.
- Status/code lookup index.
- Country/city lookup index.

The migration adds `market_id uuid` to `public.restaurants`, creates a foreign key to `public.markets(id)`, sets the legacy default to NYC, and adds restaurant market lookup indexes.

## Seed Data

The migration seeds exactly two markets.

NYC:

- `code`: `nyc`
- `name`: `New York City`
- `country_code`: `US`
- `city_name`: `New York`
- `currency_code`: `USD`
- `timezone`: `America/New_York`
- `default_locale`: `en-US`
- `supported_locales`: `["en-US"]`
- `status`: `active`

Budapest:

- `code`: `budapest`
- `name`: `Budapest`
- `country_code`: `HU`
- `city_name`: `Budapest`
- `currency_code`: `HUF`
- `timezone`: `Europe/Budapest`
- `default_locale`: `hu-HU`
- `supported_locales`: `["hu-HU", "en-US"]`
- `status`: `draft`

## Backfill Behavior

All existing restaurants with `market_id is null` are backfilled to the seeded NYC market ID.

After the backfill, `restaurants.market_id` is defaulted to the NYC market ID and made `not null`. This is safe for the current schema because the migration inserts the NYC market before the restaurant backfill and only updates missing `market_id` values.

No restaurant records are deleted, renamed, or reassigned away from existing NYC-compatible behavior.

## Compatibility Decisions

- NYC remains the default market in application code through `DEFAULT_MARKET_CODE = "nyc"`.
- Unknown or legacy records resolve to NYC through `resolveMarketContext`.
- Budapest exists in configuration and database seed data, but its `draft` status prevents accidental public exposure.
- Public market configuration exposes only active markets by default.
- The public `/api/public/config` route now includes safe market metadata while preserving existing production behavior.
- Market resolution does not trust arbitrary request headers and does not use IP geolocation.
- HUF is documented centrally as a zero-decimal currency, but no live Stripe pricing or billing behavior was changed.

## Application Helpers

`src/market-config.js` centralizes:

- NYC and Budapest market definitions.
- Market validation.
- Lookup by market code and market ID.
- Safe NYC fallback.
- Server-side market resolution.
- Currency formatting for USD and HUF.
- Market timezone-aware date and time formatting.
- Supported-locale validation.

Only a low-risk representative path was updated: `/api/public/config` now exposes and resolves safe market configuration.

## RLS and Security Effects

The migration enables RLS on `public.markets`.

Policies added:

- Public/authenticated read access to active markets.
- Admin and service-role access to non-public markets.
- Admin and service-role write access.

The migration does not replace existing restaurant, offer, reservation, tenant, or user RLS policies.

Tenant and restaurant isolation was not weakened. Budapest is not publicly available because its market status is `draft`.

## Tests Executed and Actual Outcomes

The following checks were executed during Phase 4.0.1 implementation:

| Command | Result |
| --- | --- |
| `npm.cmd run check:market-foundation` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd test` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run check:stripe-billing` | PASS |
| `npm.cmd run check:partner-communications` | PASS |
| `npm.cmd run check:enterprise-communications` | PASS |
| `npm.cmd run test:e2e` | PASS, 12 Playwright smoke tests passed in Chromium and mobile Chromium |

`scripts/check-market-foundation.js` covers:

- NYC market configuration.
- Budapest market configuration.
- Unique market codes.
- ISO-style country and currency validation.
- IANA timezone validation.
- Locale validation.
- Legacy fallback to NYC.
- Backfill/default behavior in the migration.
- Budapest remaining non-public.
- Header-based market spoofing not being accepted.
- Public config preserving NYC behavior.
- USD and HUF formatting.
- New York and Budapest daylight-saving behavior.
- No destructive migration statements.
- No replacement of existing critical tenant/reservation RLS policies.

## Manual Migration Steps

Apply migrations in repository order using the existing SmartTable Supabase production migration process.

For Phase 4.0.1 specifically:

1. Back up the Supabase production database.
2. Open the production Supabase project.
3. Confirm the project is the intended SmartTable production project.
4. Apply `supabase/migrations/0050_multi_market_foundation.sql`.
5. Confirm `public.markets` exists.
6. Confirm `nyc` exists and is `active`.
7. Confirm `budapest` exists and is `draft`.
8. Confirm every `public.restaurants` row has a non-null `market_id`.
9. Confirm `public.public_markets` returns NYC and does not return Budapest.
10. Run `npm run check:market-foundation` after pulling the deployed code.

Suggested verification SQL:

```sql
select code, status, country_code, currency_code, timezone, default_locale
from public.markets
order by code;

select count(*) as restaurants_without_market
from public.restaurants
where market_id is null;

select code
from public.public_markets
order by code;
```

## Rollback Instructions

Preferred rollback is application rollback:

1. Revert the application deployment to the previous Vercel deployment.
2. Leave the additive `markets` table and `restaurants.market_id` column in place.
3. Continue treating all restaurants as NYC while a follow-up fix is prepared.

Database rollback should be avoided in production because this migration is additive and may become referenced by new records after deployment.

If an emergency database rollback is absolutely required, first confirm no new records depend on non-NYC market data, then prepare a separate reviewed SQL rollback. Do not run destructive rollback SQL automatically.

## Unresolved Risks

- Production Supabase migration execution must still be verified in the actual production project if not already applied.
- Market-aware public pages, SEO, URLs, and routing are intentionally not implemented in this phase.
- Budapest launch remains blocked on future content, legal, billing, tax/VAT, email/SMS, and operational readiness work.
- Existing code outside the representative public config path may still use legacy location, currency, timezone, or locale assumptions until later phases migrate those paths.
- HUF zero-decimal behavior is centralized and tested, but live Stripe pricing remains unchanged by design.

## Explicit Non-Changes

Phase 4.0.1 did not change:

- Live Stripe pricing.
- Stripe products, prices, checkout, or subscription behavior.
- DNS.
- Email provider configuration.
- Email templates.
- SMS configuration.
- Public routing for Budapest.
- Public SEO/canonical behavior.
- Legal documents or legal consent behavior.
- SmartRoom.
- AI features.
- POS integrations.
- Reservation-provider integrations.
- Marketplace payouts.
- Existing reservation workflows.
- Existing authentication flows.

## Final Phase 4.0.1 Status

NYC behavior is preserved as the active default.

Budapest is safely represented in schema and configuration, but remains disabled for public use through `draft` market status.

The repository is ready for the next incremental multi-market task after the migration is applied and verified in the intended Supabase environment.
