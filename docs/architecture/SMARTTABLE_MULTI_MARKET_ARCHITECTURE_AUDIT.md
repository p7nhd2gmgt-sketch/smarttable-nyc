# SmartTable Multi-Market Architecture Audit

Date: 2026-07-23

Scope: read-only repository architecture audit for launching SmartTable BASIC in two initial markets:

- Budapest, Hungary
- New York City, USA

Long-term target: support additional US cities, European countries, and a separate SmartRoom product without rewriting the application or duplicating city-specific applications.

No application code, database schema, environment values, or production data were changed as part of this audit.

## 1. Current Technology Stack And Architecture

SmartTable is currently a single shared application rather than a multi-app monorepo.

Evidence:

- `package.json` defines one Node application with `node server.js` for local development and Vercel API handlers for production.
- `server.js` serves the static frontend, injects route-level SEO metadata, serves `robots.txt` and `sitemap.xml`, and delegates API calls to `src/app-core.js`.
- `api/index.js` and `api/[...path].js` route Vercel API requests to `src/app-core.js`.
- `src/app-core.js` is the central backend module. It contains runtime configuration, Supabase REST/Auth calls, auth/session logic, public offers, reservation creation, partner/admin APIs, email queueing, Stripe billing, campaigns, SMS, notifications, legal/privacy, AI-gated routes, and integration scaffolding.
- `public/app.js` is the main static browser application. It contains routing, rendering, state, signup, login, public guest flows, partner dashboard, admin dashboard, billing UI, communications UI, and AI-gated UI.
- `public/shared-contracts.js` contains shared frontend constants for languages, feature flags, platform modes, reservation statuses, and booking statuses.
- `public/locales/en.json`, `public/locales/es.json`, and `public/locales/hu.json` provide localized UI strings.
- `supabase/migrations/` contains migrations `0001` through `0049`.
- `src/email-service.js` implements Resend email sending.
- `src/sms-service.js` implements Twilio SMS provider access.
- `src/reservation-providers.js` provides placeholder/generic adapters for reservation platforms.
- `src/security-headers.js` centralizes CSP and other security headers.
- `vercel.json` configures rewrites and production security headers.

Current architecture summary:

```text
Browser static UI
  -> /api/*
    -> Vercel function api/index.js or local server.js
      -> src/app-core.js
        -> Supabase Auth
        -> Supabase PostgREST/RPC
        -> Resend email
        -> Stripe API when configured
        -> Twilio API when configured
        -> reservation-provider adapters, currently not live integrations
```

Strengths:

- One shared codebase is already in place.
- Supabase is centralized server-side through `supabaseFetch()`.
- Production safety checks exist for Supabase, Resend, sender, base URL, rate limiting, and request size.
- Feature visibility is centralized through platform mode and feature registry.
- Reservation integrations are explicitly reservation-only and POS references were intentionally removed.

Weaknesses:

- Market, country, city, currency, and product concepts are not first-class data models.
- `src/app-core.js` and `public/app.js` are very large modules, making cross-market changes harder to reason about.
- Several production-facing defaults still assume New York/USA.
- Billing, legal, email, and public SEO are configured around one SmartTable NYC public identity.

## 2. Existing Tenant And Restaurant Data Model

The current tenant model is restaurant-centric, not market-centric.

Observed core tables:

- `profiles` in `supabase/migrations/0001_initial_schema.sql`
  - linked to `auth.users`
  - stores `email`, `full_name`, `role`, `restaurant_id`
- `restaurants`
  - base fields: `name`, `legal_name`, `contact_email`, `phone`, `address`, `district`, `cuisine`, `status`, `rating`
  - later migrations add `owner_user_id`, `email`, `website`, social links, `cuisine_type`, images, descriptions, ordering, profile fields, `primary_timezone`, reservation settings, billing fields, test flags
- `restaurant_users` in `0023_real_ai_operating_system_foundation.sql`
  - maps users to restaurants with `owner`, `manager`, `staff`, `viewer`
  - scoped by `restaurant_id`
- `offers`
  - scoped by `restaurant_id`
  - includes offer date/time, seat/table capacity, discount, multilingual title/description, valid days, structured conditions, min/max party size
- `reservations`
  - scoped by `restaurant_id` and `offer_id`
  - stores guest contact fields directly (`guest_name`, `guest_email`, `guest_phone`)
  - stores guest/auth linkage where available
  - lifecycle fields added through later migrations
- `guests` and `guest_profiles`
  - guest profile and preference records separate from Supabase Auth profile
- `restaurant_followers`, `restaurant_reviews`, `guest_feedback`, `guest_notifications`, `notifications`
  - guest engagement and notification models

Authorization model:

- PostgreSQL helpers such as `public.is_admin()` and `public.owns_restaurant(target_restaurant_id)` are used by many RLS policies.
- Backend functions such as `requireProfile()` and `getPartnerRestaurant()` in `src/app-core.js` enforce role and restaurant scoping before partner/admin actions.
- Partner access is currently tied to a restaurant ID or `owner_user_id`.

Multi-market gap:

- There is no `tenants` or `organizations` table as the primary business tenant.
- Restaurants act as the tenant boundary.
- There is no `market_id`, `country_code`, `city_id`, or `product_key` on restaurants, offers, reservations, campaigns, subscriptions, legal docs, public content, or integrations.
- A future multi-venue tenant or SmartRoom product would need a more general tenant/venue/product model layered in additively.

## 3. Existing Country, Currency, Timezone, Locale, And Language Support

Languages:

- Supported frontend languages are `en`, `es`, and `hu` in `public/shared-contracts.js`.
- Locale files exist in `public/locales/en.json`, `public/locales/es.json`, and `public/locales/hu.json`.
- Database content supports multilingual fields such as `value_en`, `value_es`, `value_hu`, `description_en`, `description_es`, `description_hu`, `title_en`, `title_es`, `title_hu`.
- `0026_hungarian_i18n.sql` adds Hungarian UI/content support and constrains profile/reservation language to `en`, `es`, `hu`.

Currency:

- `public/shared-contracts.js` sets currency to `USD` for `en`, `es`, and `hu`.
- Frontend money formatting uses the selected language config, so Hungarian currently still formats with USD.
- `0024_integration_hub_billing_monitoring.sql` adds `invoices.currency text not null default 'usd'`.
- `0046_stripe_partner_subscriptions.sql` stores `monthly_price_cents` and `annual_price_cents`, but no currency column on `subscription_plans`.
- Stripe plan/client rendering assumes cents and USD-style display.

Timezone:

- `src/offer-validity.js` is timezone-aware and uses restaurant timezone from offer/restaurant fields.
- `DEFAULT_RESTAURANT_TIMEZONE` is `America/New_York`.
- `0035_timezone_aware_offer_validity.sql` uses `restaurants.primary_timezone` for public offer validity and reservation creation.
- `0045_smarttable_test_bistro_seed.sql`, `0047_communication_preferences_campaigns.sql`, and `0048_sms_system_notifications.sql` default timezone fields to `America/New_York`.
- User communication preferences expose a timezone input, defaulting to `America/New_York`.

Country/city/market:

- Guest signup stores `city`, `region`, `postal_code`, and preferred dining areas.
- Restaurants store `district`, address, latitude, longitude, and optional Google place data.
- There is no normalized country, market, or city table.
- `district` is being used as the public "neighborhood" concept.

Conclusion:

- Language support is usable for EN/ES/HU.
- Timezone support exists but defaults to NYC when data is missing.
- Currency support is not multi-market ready.
- Country/market/city support is currently unstructured.

## 4. Existing Billing Architecture

Billing is Stripe-oriented and restaurant-partner scoped.

Evidence:

- `0046_stripe_partner_subscriptions.sql` creates:
  - `subscription_plans`
  - `restaurant_subscriptions`
  - `billing_events`
  - invoice compatibility fields
- `src/app-core.js` contains:
  - `stripeDiagnostics()`
  - `stripeRequest()`
  - `verifyStripeWebhookSignature()`
  - `stripeWebhook()`
  - `partnerBilling()`
  - `adminBilling()`
  - server-side billing access summaries and subscription feature gating
- `docs/enterprise/STRIPE_SETUP_GUIDE.md` states SmartTable charges restaurant partners through the SmartTable Stripe account and does not use Stripe Connect.
- `scripts/check-stripe-billing.js` tests checkout and webhook flows with mocked Stripe HTTP calls and signed deterministic payloads.

Gaps for Budapest + NYC:

- No per-market or per-country billing configuration.
- No `currency_code` on `subscription_plans`.
- No VAT/tax configuration model for Hungary/EU.
- Stripe price IDs are stored directly on plan records without market/currency scoping.
- ACH support is configured globally, but ACH is US-specific and should not be shown as a Budapest default.
- Existing plan seed text in `0046` contains mojibake in Hungarian values, which should be corrected before relying on those rows for production display.

Conclusion:

- Stripe architecture is a solid starting point for partner subscriptions.
- It is not ready for multi-currency or EU tax handling without additive market/currency fields and plan scoping.

## 5. Existing Authentication And Authorization Model

Authentication:

- Supabase Auth is the intended production auth system.
- `src/app-core.js` reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, with compatibility for some legacy/public names.
- Guest signup calls Supabase `/auth/v1/signup` with `redirect_to` set to `PUBLIC_BASE_URL/auth/callback`.
- Login calls Supabase Auth and maps unconfirmed email states to `EMAIL_NOT_CONFIRMED`.
- Forgot/reset password calls Supabase Auth recovery endpoints and uses `PUBLIC_BASE_URL`.
- `server.js` and `api/index.js` do not expose service-role secrets to the browser.

Authorization:

- Route protection and API protection are centralized through `requireProfile()` and role checks in `src/app-core.js`.
- Guest APIs use auth tokens and profile ownership.
- Partner APIs use `getPartnerRestaurant()` and restaurant ownership checks.
- Admin APIs require admin role.
- Super Admin appears to be modeled as a role/status in app logic, while many database helper policies use `public.is_admin()`.
- RLS exists across core tables and new subscription/communications tables.

Gaps for multi-market:

- Admin authorization is not market-scoped; admins appear global.
- Partner authorization is restaurant-scoped, not tenant/organization/market scoped.
- Future Budapest local admins or market operators would need explicit market-scoped admin roles.
- SmartRoom would need product-scoped roles without conflating restaurant partner roles.

## 6. Existing Assumptions Hard-Coded For NYC Or The USA

Confirmed NYC/USA assumptions:

- `package.json` project name is `smarttable-nyc-reservations`.
- `README.md` and many docs describe New York as the production market.
- `PUBLIC_BASE_URL` fallback in `src/app-core.js` and `server.js` is `https://smarttablenyc.com`.
- `EXPECTED_TRANSACTIONAL_SENDER_EMAIL` in `src/app-core.js` is `reservations@mail.smarttablenyc.com`.
- `public/index.html` title, description, Open Graph, canonical, and structured data describe New York.
- `server.js` route metadata uses New York-specific title/description text.
- `public/locales/en.json`, `es.json`, and `hu.json` contain New York-specific public copy.
- `src/app-core.js` default site content and demo restaurants use New York neighborhoods and addresses.
- `public/app.js` defaults many restaurant display fallbacks to `New York`.
- Search/filter UI uses "Neighborhood" and placeholder `West Village`.
- Guest signup scripts and tests use New York, West Village, SoHo, and Chelsea examples.
- `public/shared-contracts.js` sets all languages, including Hungarian, to USD currency.
- `src/offer-validity.js` defaults missing restaurant timezones to `America/New_York`.
- Communication preferences and SMS recipients default to `America/New_York`.
- Demo/test restaurant is a Brooklyn test bistro.
- `scripts/check-basic-security-hardening.js`, `scripts/check-email-service.js`, and related checks enforce `smarttablenyc.com` assumptions.

These assumptions do not require a rewrite, but they should be replaced by market configuration and default records before a two-market launch.

## 7. Existing Assumptions That Would Block Budapest/Hungary

Budapest blockers or near-blockers:

- No first-class `market` or `country` model.
- No `Europe/Budapest` default at market/venue level.
- Missing `HUF` billing/currency support in frontend shared contracts and subscription plans.
- Billing plans do not identify currency or market.
- ACH payment option is global, but not suitable as a Budapest default.
- Legal documents are not scoped by country/market/product.
- Marketing consent, SMS quiet hours, and data export flows are not scoped to EU/Hungary legal requirements.
- Public SEO and canonical metadata are NYC-specific.
- Public domain and email sender identity are NYC-specific.
- Guest location fields use US-ish assumptions: region, postal code, miles, and neighborhood copy.
- Restaurant fields use `district` as an unstructured neighborhood, not Budapest district/city/market relation.
- Google Maps/place IDs are optional but no country-specific validation exists.
- Tests assert New York-specific copy in several places, so they would fail if copy were changed globally instead of market-configured.
- Reservation provider catalog is US/EU neutral in names, but real provider availability and compliance are not configured per market.

## 8. Database Changes Required

Recommended additive Phase 1 database changes:

1. Add market foundation tables.

```text
products
countries
markets
market_locales
cities
public_domains
market_email_senders
market_legal_requirements
```

2. Add market/country/city fields to existing records.

```text
restaurants.market_id nullable initially
restaurants.city_id nullable initially
restaurants.country_code nullable initially
restaurants.currency_code nullable initially
restaurants.primary_timezone keep existing, backfill from market
offers.market_id nullable snapshot or derived through restaurant
reservations.market_id nullable snapshot
restaurant_subscriptions.market_id nullable snapshot
subscription_plans.market_id nullable
subscription_plans.currency_code default existing USD initially
site_content.market_id nullable
legal_documents.market_id nullable
communication_preferences.timezone should default from user/market rather than NYC
message_campaigns.market_id nullable
system_message_campaigns.market_id nullable
integration_connections.market_id nullable or derived through restaurant
```

3. Add indexes for market-aware public and admin access.

```text
restaurants(market_id, status, visible_on_guest_site, sort_order)
offers(restaurant_id, offer_date, status)
offers(market_id, status, offer_date)
reservations(market_id, restaurant_id, created_at desc)
subscription_plans(market_id, currency_code, is_active, sort_order)
site_content(market_id, group_name, key)
```

4. Add views/RPC updates.

- Update `public_available_offers` to include `market_id`, `market_slug`, `country_code`, `currency_code`, `timezone`, `city_name`.
- Update `reservation_overview` to include market and country snapshot fields.
- Keep existing views backward-compatible by retaining existing columns.

5. Add backfill migration.

- Create NYC market.
- Create Budapest market.
- Assign existing restaurants with NYC addresses/defaults to NYC.
- Assign test/demo records explicitly.
- Do not infer Budapest from free text until restaurant data is reviewed.

6. Delay strict constraints.

- Do not make `market_id` not null until all production records are verified.
- Use nullable fields plus safe defaults first.

## 9. Application-Layer Changes Required

Recommended application-layer changes:

- Add a central `src/market-config.js` or equivalent.
- Add a public `/api/public/markets` endpoint or include safe market config in `/api/public/config`.
- Add market selection/filtering to public offers and restaurants.
- Add `market` query handling to `listPublicOffers()` and newest restaurants.
- Make homepage/public SEO copy market-aware.
- Make `server.js` route metadata market-aware.
- Replace hard-coded New York fallback text in `public/app.js`.
- Replace `SUPPORTED_LANGUAGE_CONFIG.currency = USD` for all languages with market-aware currency formatting.
- Add market/country/timezone/currency to restaurant admin/partner forms.
- Default new restaurants to the selected/assigned market.
- Default new guest signup location/timezone to selected market but allow user override.
- Use market config for `PUBLIC_BASE_URL` links only where appropriate. Keep canonical public base URL centralized.
- Scope legal documents and consent copy by country/market/product.
- Scope billing plans by market/currency.
- Treat HUF as a zero-decimal currency for display and future Stripe price configuration. Existing live Stripe prices and subscriptions must not be altered during the market foundation phase.
- Scope campaign audience and suppression diagnostics by market where admin users are market-limited.
- Keep reservation-provider integrations reservation-only and add per-market provider availability flags.
- Update static checks that currently require New York copy.

## 10. Migration And Rollback Risks

Primary risks:

- Existing migration history contains both additive migrations and intentional destructive cleanup, especially `0028_remove_pos_integration_references.sql`.
- Several migrations update existing rows to fill defaults.
- Multi-market backfills could assign restaurants to the wrong market if based only on free-text address/district.
- Adding `not null` constraints too early could break production records.
- Updating public views could break `src/app-core.js` if column names are changed rather than extended.
- Changing currency display globally could accidentally alter NYC pricing.
- Stripe price IDs are market/currency-specific; mixing them could charge wrong amounts.
- Legal documents are immutable once accepted; retroactive changes can create compliance and audit problems.
- Tests currently assert New York domain/copy/sender behavior; changing them globally could hide regressions.

Rollback guidance:

- Phase 1 should be additive only.
- Add new market fields nullable.
- Backfill with explicit, auditable SQL.
- Preserve old columns and views.
- Deploy app compatibility before enforcing constraints.
- Keep a rollback script that removes only new code references, not production data.
- Do not delete existing restaurant, offer, reservation, guest, subscription, or email data.

## 11. Security And Privacy Risks

Security/privacy risks for multi-market launch:

- Market scoping is absent. Existing tenant isolation is restaurant/user scoped, not market scoped.
- Global admins may see all markets by design; market-limited admin roles do not exist yet.
- Public APIs may return all active restaurants/offers unless market filtering is added.
- Guest PII is stored in reservations and guest tables; market expansion increases privacy and data residency considerations.
- Hungary/EU launch requires GDPR-oriented legal review for privacy policy, consent, export, deletion, and marketing preferences. Code scaffolding does not prove legal compliance.
- Communication campaigns and SMS require country/channel-specific consent rules.
- `BUSINESS_MAILING_ADDRESS` in `.env.example` is still a placeholder.
- Stripe billing must handle EU VAT/tax and local currency correctly before Budapest partner billing.
- Email sender/domain is NYC-branded; using it for Budapest may be misleading or misaligned.
- Service-role key usage is server-side in code, but `src/app-core.js` is large and should remain under static checks to prevent accidental frontend leakage.
- AI scaffolding exists and must remain feature-gated for BASIC; future SmartRoom must not reuse guest restaurant data without product/tenant scoping.

## 12. Recommended Phased Implementation Plan

### Phase 1 - Market Foundation, No Behavior Regression

- Add `products`, `countries`, `markets`, `market_locales`, and `cities`.
- Seed `smarttable`, `US`, `HU`, `nyc-us`, and `budapest-hu`.
- Add nullable `market_id`, `country_code`, `city_id`, `currency_code` to restaurants and compatible snapshots.
- Backfill existing restaurants to NYC unless explicitly marked otherwise.
- Expose safe market config to frontend.
- Add tests proving current NYC behavior is unchanged.

### Phase 2 - Public Market Selection And Copy

- Add market selector or market-aware routes.
- Make homepage, restaurant list, SEO, canonical metadata, and filters market-aware.
- Update EN/ES/HU content keys to use market placeholders instead of hard-coded New York.
- Add Budapest public copy and neighborhoods/district labels.

### Phase 3 - Booking And Timezone Enforcement

- Require every venue/restaurant to have a valid IANA timezone.
- Default `America/New_York` only through NYC market config.
- Default `Europe/Budapest` through Budapest market config.
- Add tests for NYC/Budapest same-day and DST cases.

### Phase 4 - Billing And Tax Readiness

- Add plan currency and market scoping.
- Keep NYC/USD Stripe prices separate from Budapest/HUF or EUR prices.
- Add tax/VAT configuration fields and legal review notes.
- Keep ACH hidden outside eligible US markets.

### Phase 5 - Legal, Privacy, And Communications

- Scope legal documents by market, country, product, and language.
- Scope consent text versions by market.
- Add country-aware marketing/SMS gating.
- Update data export and privacy docs for EU/Hungary review.

### Phase 6 - Admin Market Operations

- Add market-scoped admin filters.
- Add market-limited admin roles if operationally required.
- Add market filters to restaurants, offers, reservations, subscriptions, campaigns, and diagnostics.

### Phase 7 - Reservation Integrations By Market

- Keep only reservation platforms.
- Add market/provider availability configuration for Resy, OpenTable, SevenRooms, Tock, Google Reserve, or future approved platforms.
- Do not implement POS.

### Phase 8 - SmartRoom Preparation Only

- Introduce product/venue abstractions if needed.
- Do not implement SmartRoom UI or workflows in this conversion phase.

## 13. Exact Files That Should Be Modified In Phase 1

Suggested Phase 1 files:

- `supabase/migrations/0050_multi_market_foundation.sql` - new additive market/country/city/product tables and nullable columns.
- `src/market-config.js` - new centralized market normalization/config helper.
- `src/app-core.js` - read/write market fields, expose public config, filter public offers/restaurants by market, preserve existing behavior.
- `public/shared-contracts.js` - move currency from language-only config toward market-aware formatting.
- `public/app.js` - consume market config for public copy, filters, signup defaults, and currency display without changing booking logic.
- `server.js` - make SEO metadata and sitemap/canonical logic market-aware while preserving existing default routes.
- `public/index.html` - replace static NYC-only metadata only after server-side injection and market defaults are in place.
- `public/locales/en.json`
- `public/locales/es.json`
- `public/locales/hu.json`
- `.env.example` - add safe placeholders such as `DEFAULT_MARKET_SLUG`, `SUPPORTED_MARKETS`, or equivalent if chosen.
- `scripts/check-basic-security-hardening.js` - update checks to validate configured public base URL and market-aware copy instead of hard-coded NYC text where appropriate.
- `scripts/check-public-experience.js`
- `scripts/check-basic-user-journey.js`
- `scripts/check-reservation-lifecycle.js`
- `scripts/check-stripe-billing.js`
- `docs/production/SMARTTABLE_PUBLIC_LAUNCH_CHECKLIST.md` or equivalent release docs.

Files that should not be modified in Phase 1 unless a defect is found:

- Existing historical migrations `0001` through `0049`.
- Existing reservation lifecycle logic beyond adding market snapshots.
- Existing email queue implementation.
- Existing Stripe webhook implementation.
- Existing RLS policies except additive market-scoped policies for new tables.

## 14. Proposed Market Configuration Model

Recommended database model:

```text
products
  id uuid
  product_key text unique -- smarttable, future smartroom
  display_name text
  status text

countries
  code text primary key -- US, HU
  name_en text
  name_es text
  name_hu text
  default_currency_code text
  default_language text
  legal_region text -- us, eu, other

markets
  id uuid
  product_key text references products(product_key)
  country_code text references countries(code)
  slug text unique -- nyc-us, budapest-hu
  display_name_en text
  display_name_es text
  display_name_hu text
  default_city_name text
  default_timezone text -- America/New_York, Europe/Budapest
  default_currency_code text -- USD, HUF/EUR as chosen
  default_language text
  supported_languages text[]
  public_base_url text nullable
  support_email text nullable
  transactional_sender text nullable
  is_active boolean
  launch_stage text -- internal, pilot, public

cities
  id uuid
  market_id uuid
  country_code text
  name text
  slug text
  timezone text
  admin_region text

market_locales
  market_id uuid
  language text
  locale text
  is_default boolean
```

Recommended configuration for initial launch:

```text
product_key: smarttable

market nyc-us
  country_code: US
  default_city_name: New York City
  default_timezone: America/New_York
  default_currency_code: USD
  supported_languages: en, es, hu

market budapest-hu
  country_code: HU
  default_city_name: Budapest
  default_timezone: Europe/Budapest
  default_currency_code: HUF or EUR, subject to billing/legal decision
  supported_languages: hu, en
```

Recommendation:

- Store restaurant/venue timezone explicitly even when inherited from market.
- Snapshot `market_id`, `currency_code`, and timezone into reservations and billing records where legal/audit history matters.
- Use market config for defaults, not browser locale alone.

## 15. Proposed Naming Model

Use these meanings consistently:

- `product`: The product line and feature/legal/billing namespace. Examples: `smarttable`; future `smartroom`.
- `tenant`: The business account or organization that owns one or more venues and pays for subscription services. Do not equate tenant with a single restaurant forever.
- `venue`: A customer-facing bookable location. For SmartTable this is a restaurant; for future SmartRoom it could be another hospitality venue type.
- `restaurant`: A SmartTable venue subtype. Keep the existing table/API name for backward compatibility, but document it as the SmartTable venue implementation.
- `country`: ISO country jurisdiction such as `US` or `HU`.
- `market`: Commercial launch region for a product, such as `nyc-us` or `budapest-hu`. A market controls defaults for language, currency, timezone, legal docs, sender, public copy, integrations, and billing availability.
- `city`: Geographic municipality within a market, such as New York City or Budapest.
- `district` / `neighborhood`: Local search/display area inside a city. Keep as text initially, then normalize later if needed.

Naming rule:

- Do not create separate applications named for each city.
- Do not overload language as market.
- Do not use country as the tenant boundary.
- Do not use venue/restaurant as the long-term billing tenant boundary unless a tenant has exactly one venue.

## 16. Required, Recommended, And Out Of Scope

### Required For Budapest + NYC Launch

- First-class market config for NYC and Budapest.
- Explicit restaurant timezone for every public restaurant.
- Market-aware currency formatting.
- Market-aware public copy and SEO.
- Market-aware restaurant filtering.
- Market-aware legal documents and consent text.
- Market-safe signup location defaults.
- Market-scoped Stripe plan/currency model before paid Budapest billing.
- Production QA in EN/HU for Budapest and EN/ES/HU for NYC.
- Manual legal review for Hungarian/EU privacy, terms, marketing, data export, and SMS.

### Recommended For Future Expansion

- Tenant/organization table above restaurants.
- Market-scoped admin roles.
- Normalized neighborhoods/districts.
- Market-specific provider availability table.
- Product abstraction for SmartRoom.
- Per-market support/sender domains.
- Per-market analytics and reporting boundaries.
- More granular test fixtures for US/EU timezones and currencies.

### Explicitly Out Of Scope

- Implementing SmartRoom.
- Creating separate Budapest and NYC codebases.
- Adding POS integrations.
- Rewriting the frontend framework.
- Replacing Supabase Auth.
- Replacing Resend, Stripe, or Twilio architecture.
- Running destructive migrations.
- Claiming live Stripe/Twilio/reservation integrations are production-ready without dashboard/live verification.

## Final Summary

### Ready For Incremental Conversion?

Yes. The repository is structurally ready for incremental conversion because it already uses one shared backend, one shared frontend, centralized runtime configuration, Supabase-backed data, server-side authorization, feature flags, localization files, and reservation-only integration boundaries.

It is not ready for a Budapest + NYC public launch without market/country/currency work because NYC/USA assumptions are still embedded in public copy, defaults, billing display, tests, and seed/demo data.

### Estimated Implementation Complexity

Medium-high.

Reasoning:

- Adding market tables and nullable references is straightforward.
- Keeping all existing behavior stable while making public copy, SEO, currency, billing, legal documents, communications, and admin filters market-aware is cross-cutting.
- The largest risk is not code volume alone; it is avoiding silent behavior changes to reservations, emails, billing, and RLS.

Estimated safe implementation shape:

- 1 small audit/report task: complete.
- 1 additive database foundation task.
- 3 to 5 focused application tasks.
- 2 to 3 test/localization/documentation tasks.
- separate manual legal/billing/provider verification.

### Five Highest-Risk Areas

1. Missing first-class market model: current restaurant and public APIs cannot reliably separate NYC and Budapest.
2. Currency and billing: frontend uses USD by language, and Stripe plans lack currency/market scoping.
3. Timezone defaults: missing timezone falls back to `America/New_York`, which can create false offer validity for Budapest.
4. Legal/privacy/communications: EU/Hungary consent, privacy, marketing, SMS, and data-export requirements need market-specific legal review.
5. Hard-coded public identity: SEO, canonical URLs, email sender assumptions, tests, and content still center on SmartTable NYC.

### Safest First Coding Task

Create an additive market foundation without changing current behavior:

- Add `0050_multi_market_foundation.sql`.
- Seed `smarttable`, `US`, `HU`, `nyc-us`, and `budapest-hu`.
- Add nullable market/country/city/currency fields.
- Backfill current restaurants to `nyc-us`.
- Add `src/market-config.js`.
- Expose read-only market config through `/api/public/config`.
- Add tests proving existing NYC behavior remains unchanged.

This gives the codebase a market vocabulary before changing UI, billing, legal, or reservation behavior.
