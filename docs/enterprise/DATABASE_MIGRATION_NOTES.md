# Enterprise Database Migration Notes

Apply migrations in repository order.

Relevant Enterprise 3.1.2 migrations:

- `0046_stripe_partner_subscriptions.sql`
- `0047_communication_preferences_campaigns.sql`
- `0048_sms_system_notifications.sql`
- `0049_enterprise_compliance_hardening.sql`

Relevant multi-market foundation migrations:

- `0050_multi_market_foundation.sql`

## Safety

The migrations are intended to be additive and idempotent. They create tables, add columns, add indexes, add policies, and add constraints needed for subscriptions and communications.

`0050_multi_market_foundation.sql` is additive. It creates `public.markets`, seeds NYC as the active default market, seeds Budapest as a draft market, adds `restaurants.market_id`, and backfills existing restaurants to NYC. It must be applied after the existing restaurant schema exists.

Do not run destructive resets against production. Back up Supabase before applying new migrations.

## Verification

After applying migrations:

1. Confirm the migration history in Supabase.
2. Confirm RLS is enabled on new tables.
3. Confirm partner users cannot read another restaurant's campaigns or subscriptions.
4. Confirm guests can read only their own preferences and notifications.
5. For the multi-market foundation, confirm:
   - `public.markets` contains `nyc` with `status = 'active'`.
   - `public.markets` contains `budapest` with `status = 'draft'`.
   - all existing `public.restaurants` rows have a non-null `market_id`.
   - `public.public_markets` exposes NYC and does not expose draft Budapest.
6. Run the repository checks:

```bash
npm run check:stripe-billing
npm run check:partner-communications
npm run check:enterprise-communications
npm run check:market-foundation
```
