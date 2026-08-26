-- SmartTable Phase 4.0.1 multi-market foundation.
-- Additive and safe to rerun. Existing NYC behavior remains the default.

begin;

create extension if not exists pgcrypto;

create table if not exists public.markets (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  country_code text not null,
  city_name text not null,
  currency_code text not null,
  timezone text not null,
  default_locale text not null,
  supported_locales text[] not null default array[]::text[],
  status text not null default 'draft',
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.markets
  add column if not exists code text,
  add column if not exists name text,
  add column if not exists country_code text,
  add column if not exists city_name text,
  add column if not exists currency_code text,
  add column if not exists timezone text,
  add column if not exists default_locale text,
  add column if not exists supported_locales text[] not null default array[]::text[],
  add column if not exists status text not null default 'draft',
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.markets'::regclass
      and conname = 'markets_code_required'
  ) then
    alter table public.markets
      add constraint markets_code_required
      check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.markets'::regclass
      and conname = 'markets_country_code_format'
  ) then
    alter table public.markets
      add constraint markets_country_code_format
      check (country_code ~ '^[A-Z]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.markets'::regclass
      and conname = 'markets_currency_code_format'
  ) then
    alter table public.markets
      add constraint markets_currency_code_format
      check (currency_code ~ '^[A-Z]{3}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.markets'::regclass
      and conname = 'markets_default_locale_format'
  ) then
    alter table public.markets
      add constraint markets_default_locale_format
      check (default_locale ~ '^[a-z]{2}-[A-Z]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.markets'::regclass
      and conname = 'markets_supported_locales_required'
  ) then
    alter table public.markets
      add constraint markets_supported_locales_required
      check (array_length(supported_locales, 1) >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.markets'::regclass
      and conname = 'markets_default_locale_supported'
  ) then
    alter table public.markets
      add constraint markets_default_locale_supported
      check (default_locale = any(supported_locales));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.markets'::regclass
      and conname = 'markets_status_allowed'
  ) then
    alter table public.markets
      add constraint markets_status_allowed
      check (status in ('active', 'inactive', 'draft'));
  end if;
end $$;

create unique index if not exists idx_markets_code_unique on public.markets(code);
create index if not exists idx_markets_status_code on public.markets(status, code);
create index if not exists idx_markets_country_city on public.markets(country_code, city_name);

create or replace function public.validate_market_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code := lower(trim(new.code));
  new.name := trim(new.name);
  new.country_code := upper(trim(new.country_code));
  new.city_name := trim(new.city_name);
  new.currency_code := upper(trim(new.currency_code));
  new.timezone := trim(new.timezone);
  new.default_locale := trim(new.default_locale);
  new.status := lower(trim(new.status));

  if new.configuration is null then
    new.configuration := '{}'::jsonb;
  end if;

  perform now() at time zone new.timezone;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'Invalid market timezone: %', new.timezone using errcode = '22023';
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'markets_validate_record'
      and tgrelid = 'public.markets'::regclass
  ) then
    create trigger markets_validate_record
    before insert or update on public.markets
    for each row execute function public.validate_market_record();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'markets_set_updated_at'
      and tgrelid = 'public.markets'::regclass
  ) then
    create trigger markets_set_updated_at
    before update on public.markets
    for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.markets (
  id,
  code,
  name,
  country_code,
  city_name,
  currency_code,
  timezone,
  default_locale,
  supported_locales,
  status,
  configuration
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'nyc',
    'New York City',
    'US',
    'New York',
    'USD',
    'America/New_York',
    'en-US',
    array['en-US'],
    'active',
    '{"launch_stage":"public","default_neighborhood_label":"Neighborhood"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'budapest',
    'Budapest',
    'HU',
    'Budapest',
    'HUF',
    'Europe/Budapest',
    'hu-HU',
    array['hu-HU','en-US'],
    'draft',
    '{"launch_stage":"internal","default_neighborhood_label":"District"}'::jsonb
  )
on conflict (code) do update
set
  name = excluded.name,
  country_code = excluded.country_code,
  city_name = excluded.city_name,
  currency_code = excluded.currency_code,
  timezone = excluded.timezone,
  default_locale = excluded.default_locale,
  supported_locales = excluded.supported_locales,
  status = excluded.status,
  configuration = excluded.configuration,
  updated_at = now();

alter table public.restaurants
  add column if not exists market_id uuid;

update public.restaurants
set market_id = '10000000-0000-4000-8000-000000000001'
where market_id is null;

alter table public.restaurants
  alter column market_id set default '10000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.restaurants'::regclass
      and conname = 'restaurants_market_id_fkey'
  ) then
    alter table public.restaurants
      add constraint restaurants_market_id_fkey
      foreign key (market_id) references public.markets(id) on delete restrict;
  end if;
end $$;

alter table public.restaurants
  alter column market_id set not null;

create index if not exists idx_restaurants_market_status_visible
  on public.restaurants(market_id, status, visible_on_guest_site, sort_order);

create index if not exists idx_restaurants_market_district
  on public.restaurants(market_id, district);

alter table public.markets enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'markets'
      and policyname = 'markets_read_active_or_admin'
  ) then
    create policy markets_read_active_or_admin on public.markets
    for select using (
      status = 'active'
      or auth.role() = 'service_role'
      or public.is_admin()
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'markets'
      and policyname = 'markets_admin_write'
  ) then
    create policy markets_admin_write on public.markets
    for all using (
      auth.role() = 'service_role'
      or public.is_admin()
    )
    with check (
      auth.role() = 'service_role'
      or public.is_admin()
    );
  end if;
end $$;

create or replace view public.public_markets as
select
  id,
  code,
  name,
  country_code,
  city_name,
  currency_code,
  timezone,
  default_locale,
  supported_locales,
  status,
  configuration
from public.markets
where status = 'active';

grant select on public.markets to anon, authenticated;
grant select on public.public_markets to anon, authenticated;
grant insert, update on public.markets to authenticated;

comment on table public.markets is 'First-class SmartTable market configuration. Budapest is seeded as draft so current NYC production behavior remains unchanged.';
comment on column public.restaurants.market_id is 'Market relationship for multi-market rollout. Backfilled and defaulted to NYC for legacy records.';

commit;
