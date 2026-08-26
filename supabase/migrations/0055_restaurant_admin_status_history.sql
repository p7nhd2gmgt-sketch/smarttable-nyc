-- SmartTable restaurant administration status history and timestamp upkeep.
-- Additive only: no restaurant, reservation, offer, or user data is deleted.

begin;

create extension if not exists pgcrypto;

create table if not exists public.restaurant_status_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  previous_status text,
  new_status text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  result text not null default 'success' check (result in ('success', 'failure')),
  changed_fields jsonb not null default '[]'::jsonb,
  request_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  is_test_data boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurant_status_history_restaurant_created
  on public.restaurant_status_history(restaurant_id, created_at desc);

create index if not exists idx_restaurant_status_history_actor_created
  on public.restaurant_status_history(actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table public.restaurant_status_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_status_history'
      and policyname = 'restaurant_status_history_admin_read'
  ) then
    create policy restaurant_status_history_admin_read on public.restaurant_status_history
      for select using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_status_history'
      and policyname = 'restaurant_status_history_admin_insert'
  ) then
    create policy restaurant_status_history_admin_insert on public.restaurant_status_history
      for insert with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_status_history'
      and policyname = 'restaurant_status_history_partner_read'
  ) then
    create policy restaurant_status_history_partner_read on public.restaurant_status_history
      for select using (public.owns_restaurant(restaurant_id));
  end if;
end $$;

do $$
begin
  if to_regclass('public.restaurant_dining_areas') is not null
     and not exists (select 1 from pg_trigger where tgname = 'restaurant_dining_areas_set_updated_at') then
    create trigger restaurant_dining_areas_set_updated_at
    before update on public.restaurant_dining_areas
    for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.restaurant_tables') is not null
     and not exists (select 1 from pg_trigger where tgname = 'restaurant_tables_set_updated_at') then
    create trigger restaurant_tables_set_updated_at
    before update on public.restaurant_tables
    for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.restaurant_service_capacity_overrides') is not null
     and not exists (select 1 from pg_trigger where tgname = 'restaurant_capacity_overrides_set_updated_at') then
    create trigger restaurant_capacity_overrides_set_updated_at
    before update on public.restaurant_service_capacity_overrides
    for each row execute function public.set_updated_at();
  end if;
end $$;

revoke update, delete on public.restaurant_status_history from anon, authenticated;

commit;
