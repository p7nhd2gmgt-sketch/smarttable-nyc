-- SmartTable Enterprise Phase 3.1.2
-- Stripe partner subscription catalog, restaurant subscription state,
-- webhook event log, and invoice compatibility columns.
--
-- This migration is additive and idempotent. It does not delete, truncate,
-- reset, or overwrite existing restaurant, reservation, profile, or billing
-- records.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  stripe_product_id text,
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  internal_name text not null unique,
  display_name_en text not null,
  display_name_es text not null,
  display_name_hu text not null,
  description_en text not null default '',
  description_es text not null default '',
  description_hu text not null default '',
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  annual_price_cents integer not null default 0 check (annual_price_cents >= 0),
  included_features jsonb not null default '{}'::jsonb,
  email_monthly_limit integer check (email_monthly_limit is null or email_monthly_limit >= 0),
  sms_monthly_limit integer check (sms_monthly_limit is null or sms_monthly_limit >= 0),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'annual')),
  status text not null default 'incomplete'
    check (status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused')),
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  last_payment_status text,
  grace_period_ends_at timestamptz,
  complimentary_access_until timestamptz,
  complimentary_reason text,
  trial_extension_count integer not null default 0 check (trial_extension_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'failed', 'ignored', 'duplicate')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.restaurant_subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_id uuid references public.subscription_plans(id) on delete set null,
  add column if not exists billing_interval text not null default 'monthly',
  add column if not exists status text not null default 'incomplete',
  add column if not exists trial_start timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_payment_status text,
  add column if not exists grace_period_ends_at timestamptz,
  add column if not exists complimentary_access_until timestamptz,
  add column if not exists complimentary_reason text,
  add column if not exists trial_extension_count integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.billing_events
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete set null,
  add column if not exists stripe_event_id text,
  add column if not exists event_type text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists processing_status text not null default 'received',
  add column if not exists error_message text,
  add column if not exists processed_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

alter table public.invoices
  add column if not exists restaurant_subscription_id uuid references public.restaurant_subscriptions(id) on delete set null,
  add column if not exists stripe_subscription_id text,
  add column if not exists invoice_pdf text,
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz,
  add column if not exists hosted_invoice_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_subscription_plans_internal_name on public.subscription_plans(internal_name);
create index if not exists idx_subscription_plans_active_sort on public.subscription_plans(is_active, sort_order, monthly_price_cents);
create unique index if not exists idx_restaurant_subscriptions_stripe_subscription on public.restaurant_subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists idx_restaurant_subscriptions_restaurant on public.restaurant_subscriptions(restaurant_id, status, current_period_end desc);
create index if not exists idx_restaurant_subscriptions_customer on public.restaurant_subscriptions(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists idx_billing_events_stripe_event on public.billing_events(stripe_event_id);
create index if not exists idx_billing_events_restaurant_created on public.billing_events(restaurant_id, created_at desc);
create index if not exists idx_invoices_restaurant_subscription on public.invoices(restaurant_subscription_id, created_at desc);
create unique index if not exists idx_invoices_stripe_invoice on public.invoices(stripe_invoice_id) where stripe_invoice_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'subscription_plans_set_updated_at'
      and tgrelid = 'public.subscription_plans'::regclass
  ) then
    create trigger subscription_plans_set_updated_at
    before update on public.subscription_plans
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'restaurant_subscriptions_set_updated_at'
      and tgrelid = 'public.restaurant_subscriptions'::regclass
  ) then
    create trigger restaurant_subscriptions_set_updated_at
    before update on public.restaurant_subscriptions
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.subscription_plans enable row level security;
alter table public.restaurant_subscriptions enable row level security;
alter table public.billing_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscription_plans'
      and policyname = 'subscription_plans_read_active_or_admin'
  ) then
    create policy subscription_plans_read_active_or_admin on public.subscription_plans
    for select using (is_active = true or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscription_plans'
      and policyname = 'subscription_plans_admin_write'
  ) then
    create policy subscription_plans_admin_write on public.subscription_plans
    for all using (public.is_admin())
    with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_subscriptions'
      and policyname = 'restaurant_subscriptions_scoped_read'
  ) then
    create policy restaurant_subscriptions_scoped_read on public.restaurant_subscriptions
    for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_subscriptions'
      and policyname = 'restaurant_subscriptions_admin_write'
  ) then
    create policy restaurant_subscriptions_admin_write on public.restaurant_subscriptions
    for all using (public.is_admin())
    with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_events'
      and policyname = 'billing_events_admin_read'
  ) then
    create policy billing_events_admin_read on public.billing_events
    for select using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_events'
      and policyname = 'billing_events_admin_write'
  ) then
    create policy billing_events_admin_write on public.billing_events
    for all using (public.is_admin())
    with check (public.is_admin());
  end if;
end $$;

grant select on public.subscription_plans to anon, authenticated;
grant select on public.restaurant_subscriptions to authenticated;
grant select on public.billing_events to authenticated;
grant insert, update on public.subscription_plans to authenticated;
grant insert, update on public.restaurant_subscriptions to authenticated;
grant insert, update on public.billing_events to authenticated;

insert into public.subscription_plans (
  internal_name,
  display_name_en,
  display_name_es,
  display_name_hu,
  description_en,
  description_es,
  description_hu,
  monthly_price_cents,
  annual_price_cents,
  included_features,
  email_monthly_limit,
  sms_monthly_limit,
  is_active,
  sort_order
)
values
  (
    'starter',
    'Starter',
    'Inicial',
    'Kezdő',
    'Basic SmartTable partner access for onboarding and limited offer management.',
    'Acceso basico de socio SmartTable para incorporacion y gestion limitada de ofertas.',
    'Alap SmartTable partner hozzáférés onboardinghoz és korlátozott ajánlatkezeléshez.',
    9900,
    99000,
    '{"offers": 5, "reservations": true, "partner_email_notifications": true}'::jsonb,
    500,
    0,
    false,
    10
  ),
  (
    'growth',
    'Growth',
    'Crecimiento',
    'Növekedés',
    'Recurring SmartTable subscription for active restaurant partners.',
    'Suscripcion recurrente de SmartTable para restaurantes socios activos.',
    'Ismétlődő SmartTable előfizetés aktív étterempartnereknek.',
    19900,
    199000,
    '{"offers": "unlimited", "reservations": true, "email_notifications": true, "customer_portal": true}'::jsonb,
    2500,
    0,
    false,
    20
  )
on conflict (internal_name) do nothing;

insert into public.feature_flags (key, label, status, enabled, audience, description, owner)
values
  ('stripe_partner_subscriptions', 'Stripe partner subscriptions', 'beta', true, 'partners_admins', 'Stripe Checkout, Customer Portal, webhooks, restaurant subscription state, invoices, and server-side feature gating for partner subscriptions.', 'billing')
on conflict (key) do update
set label = excluded.label,
    status = excluded.status,
    enabled = excluded.enabled,
    audience = excluded.audience,
    description = excluded.description,
    owner = excluded.owner,
    updated_at = now();
