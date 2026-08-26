-- SmartTable fixed monthly restaurant subscriptions.
-- Additive only: this migration does not remove, clear, reset, or rewrite
-- existing restaurant, reservation, profile, invoice, or billing records.

begin;

create extension if not exists pgcrypto;

create table if not exists public.restaurant_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  billing_email text,
  billing_contact_name text,
  billing_country text,
  billing_state_region text,
  tax_identifier text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id)
);

create table if not exists public.billing_access_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  override_status text not null default 'active'
    check (override_status in ('active', 'expired', 'revoked')),
  reason text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_audit_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  result text not null default 'success' check (result in ('success', 'failure')),
  stripe_event_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  internal_plan text,
  subscription_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

alter table public.restaurant_subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists internal_plan text not null default 'no_subscription',
  add column if not exists subscription_status text not null default 'incomplete',
  add column if not exists payment_grace_period_end timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists last_invoice_id text,
  add column if not exists last_invoice_number text,
  add column if not exists last_invoice_status text,
  add column if not exists last_invoice_url text,
  add column if not exists last_payment_error_code text,
  add column if not exists last_payment_error_message_safe text,
  add column if not exists default_payment_method_summary jsonb not null default '{}'::jsonb,
  add column if not exists billing_access_override boolean not null default false,
  add column if not exists billing_access_override_reason text,
  add column if not exists billing_access_override_expires_at timestamptz,
  add column if not exists stripe_livemode boolean not null default false,
  add column if not exists billing_environment text not null default 'test';

alter table public.billing_events
  add column if not exists stripe_livemode boolean not null default false,
  add column if not exists billing_environment text not null default 'test',
  add column if not exists stripe_request_id text,
  add column if not exists sanitized_error jsonb not null default '{}'::jsonb;

alter table public.invoices
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists invoice_number text,
  add column if not exists payment_status text,
  add column if not exists billing_environment text not null default 'test';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_subscriptions_fixed_internal_plan_check'
      and conrelid = 'public.restaurant_subscriptions'::regclass
  ) then
    alter table public.restaurant_subscriptions
      add constraint restaurant_subscriptions_fixed_internal_plan_check
      check (internal_plan in ('no_subscription', 'trial', 'basic', 'professional', 'enterprise', 'complimentary_test'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_subscriptions_fixed_status_check'
      and conrelid = 'public.restaurant_subscriptions'::regclass
  ) then
    alter table public.restaurant_subscriptions
      add constraint restaurant_subscriptions_fixed_status_check
      check (subscription_status in ('no_subscription', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_subscriptions_fixed_environment_check'
      and conrelid = 'public.restaurant_subscriptions'::regclass
  ) then
    alter table public.restaurant_subscriptions
      add constraint restaurant_subscriptions_fixed_environment_check
      check (billing_environment in ('test', 'live'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_events_fixed_environment_check'
      and conrelid = 'public.billing_events'::regclass
  ) then
    alter table public.billing_events
      add constraint billing_events_fixed_environment_check
      check (billing_environment in ('test', 'live'));
  end if;
end $$;

create unique index if not exists idx_restaurant_billing_accounts_restaurant
  on public.restaurant_billing_accounts(restaurant_id);

create unique index if not exists idx_restaurant_billing_accounts_customer
  on public.restaurant_billing_accounts(stripe_customer_id)
  where stripe_customer_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'idx_restaurant_subscriptions_one_active_fixed'
  )
  and not exists (
    select 1
    from public.restaurant_subscriptions
    where subscription_status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused')
    group by restaurant_id
    having count(*) > 1
  ) then
    create unique index idx_restaurant_subscriptions_one_active_fixed
      on public.restaurant_subscriptions(restaurant_id)
      where subscription_status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');
  end if;
end $$;

create index if not exists idx_restaurant_subscriptions_fixed_access
  on public.restaurant_subscriptions(restaurant_id, internal_plan, subscription_status, current_period_end desc);

create index if not exists idx_billing_access_overrides_restaurant_active
  on public.billing_access_overrides(restaurant_id, override_status, expires_at desc);

create index if not exists idx_billing_audit_events_restaurant_created
  on public.billing_audit_events(restaurant_id, created_at desc);

create unique index if not exists idx_billing_audit_events_stripe_event
  on public.billing_audit_events(stripe_event_id, action)
  where stripe_event_id is not null;

do $$
begin
  if to_regclass('public.restaurant_billing_accounts') is not null
     and not exists (select 1 from pg_trigger where tgname = 'restaurant_billing_accounts_set_updated_at') then
    create trigger restaurant_billing_accounts_set_updated_at
    before update on public.restaurant_billing_accounts
    for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.billing_access_overrides') is not null
     and not exists (select 1 from pg_trigger where tgname = 'billing_access_overrides_set_updated_at') then
    create trigger billing_access_overrides_set_updated_at
    before update on public.billing_access_overrides
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.restaurant_billing_accounts enable row level security;
alter table public.billing_access_overrides enable row level security;
alter table public.billing_audit_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_billing_accounts'
      and policyname = 'restaurant_billing_accounts_scoped_read'
  ) then
    create policy restaurant_billing_accounts_scoped_read
      on public.restaurant_billing_accounts
      for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_billing_accounts'
      and policyname = 'restaurant_billing_accounts_admin_write'
  ) then
    create policy restaurant_billing_accounts_admin_write
      on public.restaurant_billing_accounts
      for all using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_access_overrides'
      and policyname = 'billing_access_overrides_admin_read'
  ) then
    create policy billing_access_overrides_admin_read
      on public.billing_access_overrides
      for select using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_access_overrides'
      and policyname = 'billing_access_overrides_admin_write'
  ) then
    create policy billing_access_overrides_admin_write
      on public.billing_access_overrides
      for all using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_audit_events'
      and policyname = 'billing_audit_events_admin_read'
  ) then
    create policy billing_audit_events_admin_read
      on public.billing_audit_events
      for select using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_audit_events'
      and policyname = 'billing_audit_events_admin_insert'
  ) then
    create policy billing_audit_events_admin_insert
      on public.billing_audit_events
      for insert with check (public.is_admin());
  end if;
end $$;

grant select on public.restaurant_billing_accounts to authenticated;
grant select, insert, update on public.restaurant_billing_accounts to authenticated;
grant select, insert, update on public.billing_access_overrides to authenticated;
grant select, insert on public.billing_audit_events to authenticated;

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
    'trial',
    'Trial',
    'Prueba',
    'Probaidoszak',
    'Configurable free trial for restaurant onboarding.',
    'Prueba gratuita configurable para la incorporacion de restaurantes.',
    'Konfiguralhato ingyenes probaidoszak ettermi bevezeteshez.',
    0,
    0,
    '{"fixed_subscription": true, "checkout_available": false, "onboarding": true}'::jsonb,
    null,
    null,
    true,
    10
  ),
  (
    'basic',
    'Basic',
    'Basico',
    'Alap',
    'Fixed monthly SmartTable Basic subscription. Stripe Price ID is configured in the server environment.',
    'Suscripcion mensual fija SmartTable Basic. El Price ID de Stripe se configura en el entorno del servidor.',
    'Fix havi SmartTable Basic elofizetes. A Stripe Price ID a szerver kornyezetben van beallitva.',
    0,
    0,
    '{"fixed_subscription": true, "checkout_available": true, "offers": true, "reservations": true}'::jsonb,
    null,
    null,
    true,
    20
  ),
  (
    'professional',
    'Professional',
    'Profesional',
    'Professional',
    'Fixed monthly SmartTable Professional subscription. Stripe remains authoritative for price amounts.',
    'Suscripcion mensual fija SmartTable Professional. Stripe sigue siendo la fuente autorizada para los importes.',
    'Fix havi SmartTable Professional elofizetes. Az arak hiteles forrasa a Stripe.',
    0,
    0,
    '{"fixed_subscription": true, "checkout_available": true, "offers": true, "reservations": true, "advanced_admin": true}'::jsonb,
    null,
    null,
    true,
    30
  ),
  (
    'enterprise',
    'Enterprise',
    'Enterprise',
    'Enterprise',
    'Fixed monthly or manually contracted enterprise subscription managed by SmartTable and Stripe.',
    'Suscripcion enterprise mensual fija o contratada manualmente gestionada por SmartTable y Stripe.',
    'Fix havi vagy kezzel szerzodott enterprise elofizetes, SmartTable es Stripe kezelessel.',
    0,
    0,
    '{"fixed_subscription": true, "checkout_available": false, "manual_contract_allowed": true}'::jsonb,
    null,
    null,
    true,
    40
  ),
  (
    'complimentary_test',
    'Complimentary test',
    'Prueba gratuita interna',
    'Dijmentes teszt',
    'Complimentary access for explicitly approved SmartTable test/demo restaurants only.',
    'Acceso gratuito solo para restaurantes de prueba/demo aprobados explicitamente por SmartTable.',
    'Dijmentes hozzaferes kizarolag kifejezetten jovahagyott SmartTable teszt/demo ettermeknek.',
    0,
    0,
    '{"fixed_subscription": true, "checkout_available": false, "test_restaurants_only": true}'::jsonb,
    null,
    null,
    false,
    90
  )
on conflict (internal_name) do update
set display_name_en = excluded.display_name_en,
    display_name_es = excluded.display_name_es,
    display_name_hu = excluded.display_name_hu,
    description_en = excluded.description_en,
    description_es = excluded.description_es,
    description_hu = excluded.description_hu,
    included_features = excluded.included_features,
    email_monthly_limit = excluded.email_monthly_limit,
    sms_monthly_limit = excluded.sms_monthly_limit,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.feature_flags (key, label, status, enabled, audience, description, owner)
values
  ('stripe_partner_subscriptions', 'Stripe fixed monthly partner subscriptions', 'beta', true, 'partners_admins', 'Fixed monthly Stripe Billing for restaurant subscriptions collected by SmartTable through its own Stripe account.', 'billing')
on conflict (key) do update
set label = excluded.label,
    status = excluded.status,
    enabled = excluded.enabled,
    audience = excluded.audience,
    description = excluded.description,
    owner = excluded.owner,
    updated_at = now();

commit;
