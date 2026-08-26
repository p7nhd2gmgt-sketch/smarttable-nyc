-- SmartTable launch billing catalog.
-- One $149/month restaurant partner subscription plus optional one-time
-- 3-second video production packages. Additive and idempotent by design.

begin;

create extension if not exists pgcrypto;

create table if not exists public.video_service_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  package_key text not null check (package_key in ('video_standard_3s', 'video_premium_3s')),
  amount_cents integer not null check (amount_cents in (29900, 49900)),
  currency text not null default 'usd' check (currency = 'usd'),
  order_status text not null default 'checkout_created'
    check (order_status in ('checkout_created', 'processing', 'paid', 'failed', 'refunded', 'canceled', 'fulfilled')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  stripe_livemode boolean not null default false,
  billing_environment text not null default 'test' check (billing_environment in ('test', 'live')),
  paid_at timestamptz,
  failed_at timestamptz,
  fulfilled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_video_service_orders_checkout_session
  on public.video_service_orders(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists idx_video_service_orders_payment_intent
  on public.video_service_orders(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_video_service_orders_restaurant_created
  on public.video_service_orders(restaurant_id, created_at desc);

create index if not exists idx_video_service_orders_status_created
  on public.video_service_orders(order_status, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'video_service_orders_set_updated_at'
      and tgrelid = 'public.video_service_orders'::regclass
  ) then
    create trigger video_service_orders_set_updated_at
    before update on public.video_service_orders
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.video_service_orders enable row level security;

drop policy if exists video_service_orders_scoped_read on public.video_service_orders;
create policy video_service_orders_scoped_read
  on public.video_service_orders
  for select
  using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists video_service_orders_admin_update on public.video_service_orders;
create policy video_service_orders_admin_update
  on public.video_service_orders
  for update
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.video_service_orders from anon;
revoke all on public.video_service_orders from authenticated;
grant select on public.video_service_orders to authenticated;
grant all on public.video_service_orders to service_role;

-- This is reference catalog data only. Stripe remains authoritative for the
-- amount charged; the application checks the matching protected Price ID.
-- Fresh BASIC baseline environments may not contain the legacy catalog table.
do $$
begin
  if to_regclass('public.subscription_plans') is not null then
    update public.subscription_plans
    set display_name_en = 'SmartTable Partner',
        display_name_es = 'SmartTable Partner',
        display_name_hu = 'SmartTable Partner',
        description_en = 'Complete SmartTable restaurant partner access for $149 per month with automatic renewal and no additional mandatory platform fee.',
        description_es = 'Acceso completo de restaurante asociado a SmartTable por 149 USD al mes, con renovacion automatica y sin otra tarifa obligatoria de plataforma.',
        description_hu = 'Teljes SmartTable ettermi partnerhozzaferes havi 149 USD-ert, automatikus megujitassal, tovabbi kotelezo platformdij nelkul.',
        monthly_price_cents = 14900,
        is_active = true,
        updated_at = now()
    where internal_name = 'basic';

    update public.subscription_plans
    set is_active = false,
        updated_at = now()
    where internal_name in ('professional', 'enterprise');
  end if;
end $$;

commit;
