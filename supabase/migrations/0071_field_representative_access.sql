-- Restricted field-representative administration.
-- Additive only. Field representatives are deliberately NOT treated as platform admins.

begin;

alter type public.profile_role add value if not exists 'field_representative';

create table if not exists public.field_representative_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  can_manage_restaurants boolean not null default true,
  can_manage_capacity boolean not null default true,
  can_invite_partners boolean not null default true,
  can_manage_partner_access boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_representative_markets (
  user_id uuid not null references auth.users(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, market_id)
);

create table if not exists public.field_representative_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  market_ids uuid[] not null default '{}',
  can_manage_restaurants boolean not null default true,
  can_manage_capacity boolean not null default true,
  can_invite_partners boolean not null default true,
  can_manage_partner_access boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_field_representative_markets_market
  on public.field_representative_markets(market_id, status);
create index if not exists idx_field_representative_invitations_email_status
  on public.field_representative_invitations(lower(email), status, expires_at);

alter table public.field_representative_assignments enable row level security;
alter table public.field_representative_markets enable row level security;
alter table public.field_representative_invitations enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('super_admin', 'superadmin')
      and coalesce(status, 'active') = 'active'
  );
$$;

drop policy if exists field_rep_assignments_superadmin_all on public.field_representative_assignments;
create policy field_rep_assignments_superadmin_all on public.field_representative_assignments
for all using (auth.role() = 'service_role' or public.is_super_admin())
with check (auth.role() = 'service_role' or public.is_super_admin());

drop policy if exists field_rep_assignments_self_read on public.field_representative_assignments;
create policy field_rep_assignments_self_read on public.field_representative_assignments
for select using (auth.uid() = user_id);

drop policy if exists field_rep_markets_superadmin_all on public.field_representative_markets;
create policy field_rep_markets_superadmin_all on public.field_representative_markets
for all using (auth.role() = 'service_role' or public.is_super_admin())
with check (auth.role() = 'service_role' or public.is_super_admin());

drop policy if exists field_rep_markets_self_read on public.field_representative_markets;
create policy field_rep_markets_self_read on public.field_representative_markets
for select using (auth.uid() = user_id);

drop policy if exists field_rep_invitations_superadmin_all on public.field_representative_invitations;
create policy field_rep_invitations_superadmin_all on public.field_representative_invitations
for all using (auth.role() = 'service_role' or public.is_super_admin())
with check (auth.role() = 'service_role' or public.is_super_admin());

revoke all on public.field_representative_assignments from anon, authenticated;
revoke all on public.field_representative_markets from anon, authenticated;
revoke all on public.field_representative_invitations from anon, authenticated;
grant select on public.field_representative_assignments, public.field_representative_markets to authenticated;

comment on table public.field_representative_assignments is
  'Restricted operations permissions. This role is never equivalent to admin or super_admin.';
comment on table public.field_representative_markets is
  'Mandatory market scope for field representatives.';

commit;
