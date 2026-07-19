-- SmartTable scale-readiness foundation.
-- Adds central feature flag settings, generalized booking metadata,
-- structured offer conditions, review integrity constraints, and disabled
-- push-notification scaffolding without changing the current marketplace flow.

update public.app_settings
set setting_value = setting_value || jsonb_build_object(
  'feature_flags',
  coalesce(setting_value->'feature_flags', '{
    "restaurant_listings": true,
    "discount_offers": true,
    "reservations": true,
    "partner_dashboard": true,
    "admin_management": true,
    "reviews": true,
    "favorites": true,
    "loyalty": true,
    "ai_concierge": true,
    "ai_recommendation": true,
    "ai_route_planning": false,
    "ai_calendar": false,
    "push_notification": false,
    "sms": false,
    "referral_program": false,
    "restaurant_analytics": true
  }'::jsonb)
)
where setting_key = 'platform_mode';

alter table public.reservations
  add column if not exists booking_source text not null default 'SMARTTABLE',
  add column if not exists booking_status text not null default 'pending',
  add column if not exists external_provider text,
  add column if not exists external_sync_status text;

alter table public.reservations
  drop constraint if exists reservations_booking_source_check,
  add constraint reservations_booking_source_check
    check (booking_source in ('SMARTTABLE', 'RESY', 'OPENTABLE', 'SEVENROOMS', 'MANUAL')),
  drop constraint if exists reservations_booking_status_check,
  add constraint reservations_booking_status_check
    check (booking_status in ('pending', 'confirmed', 'declined', 'cancelled', 'expired', 'waiting_external_confirmation', 'completed', 'no_show'));

update public.reservations
set
  booking_source = case
    when upper(coalesce(source, 'smarttable')) = 'RESY' then 'RESY'
    when upper(coalesce(source, 'smarttable')) = 'OPENTABLE' then 'OPENTABLE'
    when upper(coalesce(source, 'smarttable')) = 'SEVENROOMS' then 'SEVENROOMS'
    when upper(coalesce(source, 'smarttable')) = 'MANUAL' then 'MANUAL'
    else 'SMARTTABLE'
  end,
  booking_status = case
    when status in ('accepted', 'confirmed') then 'confirmed'
    when status in ('rejected', 'declined') then 'declined'
    when status in ('cancelled', 'canceled') then 'cancelled'
    when status = 'completed' then 'completed'
    when status = 'no_show' then 'no_show'
    else 'pending'
  end;

create index if not exists idx_reservations_booking_source_status
  on public.reservations(booking_source, booking_status, created_at desc);

alter table public.offers
  add column if not exists minimum_spend numeric(12,2),
  add column if not exists applies_to_drinks boolean not null default true,
  add column if not exists min_party_size integer not null default 1,
  add column if not exists time_limit_minutes integer,
  add column if not exists blackout_periods jsonb not null default '[]'::jsonb,
  add column if not exists combinable boolean not null default false,
  add column if not exists custom_terms jsonb not null default '{}'::jsonb,
  add column if not exists structured_conditions jsonb not null default '{}'::jsonb;

alter table public.offers
  drop constraint if exists offers_party_size_conditions_check,
  add constraint offers_party_size_conditions_check
    check (min_party_size >= 1 and max_party_size >= min_party_size),
  drop constraint if exists offers_minimum_spend_check,
  add constraint offers_minimum_spend_check
    check (minimum_spend is null or minimum_spend >= 0),
  drop constraint if exists offers_time_limit_check,
  add constraint offers_time_limit_check
    check (time_limit_minutes is null or time_limit_minutes >= 0);

create index if not exists idx_offers_structured_conditions
  on public.offers using gin (structured_conditions);

alter table public.restaurant_reviews
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderated_at timestamptz;

create unique index if not exists idx_restaurant_reviews_one_per_reservation
  on public.restaurant_reviews(reservation_id)
  where reservation_id is not null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  profile_key text,
  provider text not null default 'disabled',
  endpoint text not null,
  token_hash text not null,
  user_agent text,
  status text not null default 'disabled'
    check (status in ('active', 'disabled', 'revoked', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, token_hash)
);

create table if not exists public.push_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  provider text not null default 'disabled',
  notification_type text not null,
  status text not null default 'skipped'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_logs enable row level security;

drop policy if exists push_subscriptions_owner_read on public.push_subscriptions;
create policy push_subscriptions_owner_read on public.push_subscriptions
for select using (user_id = auth.uid());

drop policy if exists push_subscriptions_owner_write on public.push_subscriptions;
create policy push_subscriptions_owner_write on public.push_subscriptions
for insert with check (user_id = auth.uid());

drop policy if exists push_logs_admin_read on public.push_delivery_logs;
create policy push_logs_admin_read on public.push_delivery_logs
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
);

grant select, insert, update on public.push_subscriptions to authenticated;
grant select on public.push_delivery_logs to authenticated;
