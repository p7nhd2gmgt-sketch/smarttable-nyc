-- SmartTable role-based account and restaurant onboarding foundation.
-- Additive and compatibility-preserving: no production data is deleted.

begin;

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists is_test_data boolean not null default false,
  add column if not exists status text not null default 'active',
  add column if not exists invited_at timestamptz,
  add column if not exists invitation_status text;

alter table if exists public.restaurants
  add column if not exists is_test_data boolean not null default false,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists currency_code text,
  add column if not exists price_level text,
  add column if not exists reservation_interval_minutes integer,
  add column if not exists min_party_size integer,
  add column if not exists max_party_size integer,
  add column if not exists partner_approval_required boolean not null default true,
  add column if not exists accepts_reservation_requests boolean not null default true,
  add column if not exists visible_on_guest_site boolean not null default true,
  add column if not exists reservation_provider text,
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table if exists public.offers
  add column if not exists is_test_data boolean not null default false;

alter table if exists public.reservations
  add column if not exists is_test_data boolean not null default false;

alter table if exists public.restaurant_users
  add column if not exists is_test_data boolean not null default false,
  add column if not exists revoked_at timestamptz;

alter table if exists public.audit_logs
  add column if not exists previous_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists ip_address text,
  add column if not exists request_id text,
  add column if not exists success boolean,
  add column if not exists target_user_id uuid references auth.users(id) on delete set null,
  add column if not exists target_role text,
  add column if not exists impersonation_session_id uuid;

do $$
begin
  if to_regclass('public.restaurant_users') is not null then
    alter table public.restaurant_users drop constraint if exists restaurant_users_role_check;
    alter table public.restaurant_users
      add constraint restaurant_users_role_check
      check (role in ('owner', 'manager', 'reservation_staff', 'marketing_staff', 'read_only', 'staff', 'viewer'));

    alter table public.restaurant_users drop constraint if exists restaurant_users_status_check;
    alter table public.restaurant_users
      add constraint restaurant_users_status_check
      check (status in ('invited', 'active', 'disabled', 'revoked', 'expired'));
  end if;
end $$;

create table if not exists public.partner_invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null,
  full_name text,
  restaurant_role text not null default 'owner'
    check (restaurant_role in ('owner', 'manager', 'reservation_staff', 'marketing_staff', 'read_only')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  is_test_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, email, status)
);

create index if not exists idx_partner_invitations_restaurant_status
  on public.partner_invitations(restaurant_id, status, expires_at);

create index if not exists idx_partner_invitations_email_status
  on public.partner_invitations(lower(email), status);

create index if not exists idx_audit_logs_impersonation_session
  on public.audit_logs(impersonation_session_id, created_at desc)
  where impersonation_session_id is not null;

alter table public.partner_invitations enable row level security;
alter table if exists public.audit_logs enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role::text in ('admin', 'super_admin', 'superadmin')
  );
$$;

create or replace function public.owns_restaurant(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.restaurants r on r.id = target_restaurant_id
    where p.id = auth.uid()
      and (
        p.role::text in ('admin', 'super_admin', 'superadmin')
        or (
          p.role::text in ('partner', 'restaurant', 'restaurant_partner')
          and (
            p.restaurant_id = target_restaurant_id
            or r.owner_user_id = p.id
            or exists (
              select 1
              from public.restaurant_users ru
              where ru.restaurant_id = target_restaurant_id
                and ru.status = 'active'
                and (
                  ru.user_id = p.id
                  or lower(ru.email) = lower(p.email)
                )
            )
          )
        )
      )
  );
$$;

drop policy if exists partner_invitations_admin_all on public.partner_invitations;
create policy partner_invitations_admin_all on public.partner_invitations
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists partner_invitations_restaurant_owner_read on public.partner_invitations;
create policy partner_invitations_restaurant_owner_read on public.partner_invitations
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists audit_admin_update on public.audit_logs;
drop policy if exists audit_admin_delete on public.audit_logs;
revoke update, delete on public.audit_logs from anon, authenticated;

commit;
