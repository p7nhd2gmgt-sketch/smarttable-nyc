-- SmartTable restaurant capacity configuration and lifecycle metadata.
-- Additive only: stores admin-managed dining areas, tables, capacity overrides,
-- and activation metadata without changing existing reservation allocation logic.

begin;

create extension if not exists pgcrypto;

alter table if exists public.restaurants
  add column if not exists restaurant_total_capacity integer,
  add column if not exists table_configuration_status text not null default 'not_configured',
  add column if not exists capacity_configuration jsonb not null default '{}'::jsonb,
  add column if not exists activation_confirmed_at timestamptz,
  add column if not exists activation_confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists status_reason text;

do $$
begin
  if to_regclass('public.restaurants') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurants_total_capacity_nonnegative'
  ) then
    alter table public.restaurants
      add constraint restaurants_total_capacity_nonnegative
      check (restaurant_total_capacity is null or restaurant_total_capacity >= 0);
  end if;

  if to_regclass('public.restaurants') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurants_table_configuration_status_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_table_configuration_status_check
      check (table_configuration_status in ('not_configured', 'partial', 'configured'));
  end if;
end $$;

create table if not exists public.restaurant_dining_areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  capacity integer not null default 0 check (capacity >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order integer not null default 0,
  is_test_data boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, code)
);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  dining_area_id uuid references public.restaurant_dining_areas(id) on delete set null,
  table_identifier text not null,
  display_name text,
  min_capacity integer not null default 1 check (min_capacity >= 0),
  max_capacity integer not null default 2 check (max_capacity >= 0),
  is_combinable boolean not null default false,
  combinable_with jsonb not null default '[]'::jsonb,
  is_accessible boolean not null default false,
  seating_type text not null default 'indoor' check (seating_type in ('indoor', 'outdoor', 'mixed', 'private')),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  has_reservations boolean not null default false,
  is_test_data boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, table_identifier),
  check (min_capacity <= max_capacity)
);

create table if not exists public.restaurant_service_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  dining_area_id uuid references public.restaurant_dining_areas(id) on delete cascade,
  service_period_key text not null,
  day_of_week text,
  effective_date date,
  start_time time,
  end_time time,
  capacity integer not null default 0 check (capacity >= 0),
  table_capacity integer not null default 0 check (table_capacity >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_dining_areas_restaurant_status
  on public.restaurant_dining_areas(restaurant_id, status, sort_order);

create index if not exists idx_restaurant_tables_restaurant_status
  on public.restaurant_tables(restaurant_id, status, table_identifier);

create index if not exists idx_restaurant_tables_dining_area
  on public.restaurant_tables(dining_area_id, status);

create index if not exists idx_restaurant_capacity_overrides_restaurant_status
  on public.restaurant_service_capacity_overrides(restaurant_id, status, effective_date, day_of_week);

create unique index if not exists idx_restaurant_capacity_overrides_identity
  on public.restaurant_service_capacity_overrides(
    restaurant_id,
    coalesce(dining_area_id, '00000000-0000-0000-0000-000000000000'::uuid),
    service_period_key,
    coalesce(day_of_week, ''),
    coalesce(effective_date, date '1900-01-01'),
    coalesce(start_time, time '00:00'),
    coalesce(end_time, time '00:00')
  );

alter table public.restaurant_dining_areas enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.restaurant_service_capacity_overrides enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_dining_areas' and policyname = 'restaurant_dining_areas_admin_all'
  ) then
    create policy restaurant_dining_areas_admin_all on public.restaurant_dining_areas
      for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_dining_areas' and policyname = 'restaurant_dining_areas_partner_read'
  ) then
    create policy restaurant_dining_areas_partner_read on public.restaurant_dining_areas
      for select using (public.owns_restaurant(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_tables' and policyname = 'restaurant_tables_admin_all'
  ) then
    create policy restaurant_tables_admin_all on public.restaurant_tables
      for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_tables' and policyname = 'restaurant_tables_partner_read'
  ) then
    create policy restaurant_tables_partner_read on public.restaurant_tables
      for select using (public.owns_restaurant(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_service_capacity_overrides' and policyname = 'restaurant_capacity_overrides_admin_all'
  ) then
    create policy restaurant_capacity_overrides_admin_all on public.restaurant_service_capacity_overrides
      for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'restaurant_service_capacity_overrides' and policyname = 'restaurant_capacity_overrides_partner_read'
  ) then
    create policy restaurant_capacity_overrides_partner_read on public.restaurant_service_capacity_overrides
      for select using (public.owns_restaurant(restaurant_id));
  end if;
end $$;

commit;
