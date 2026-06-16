-- Smarttable.com production MVP schema
-- Apply with: supabase db push

create extension if not exists pgcrypto;

do $$ begin
  create type public.profile_role as enum ('admin', 'restaurant', 'guest');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.restaurant_status as enum ('pending', 'approved', 'suspended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.offer_status as enum ('active', 'paused', 'sold_out', 'expired');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reservation_status as enum ('requested', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.profile_role not null default 'guest',
  restaurant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  contact_email text not null,
  phone text,
  address text not null,
  district text not null,
  cuisine text not null,
  description text,
  status public.restaurant_status not null default 'pending',
  rating numeric(2,1) not null default 4.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id) on delete set null;

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  offer_date date not null,
  offer_time time not null,
  seat_count integer not null check (seat_count > 0),
  reserved_seats integer not null default 0 check (reserved_seats >= 0),
  discount_percent integer not null check (discount_percent between 1 and 90),
  status public.offer_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_reserved_not_over_capacity check (reserved_seats <= seat_count)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  offer_id uuid not null references public.offers(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  guest_id uuid references auth.users(id) on delete set null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text not null,
  party_size integer not null check (party_size > 0),
  notes text,
  status public.reservation_status not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  event_type text not null,
  recipient text not null,
  subject text not null,
  provider text not null default 'resend',
  provider_id text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_restaurants_status on public.restaurants(status);
create index if not exists idx_offers_restaurant_date on public.offers(restaurant_id, offer_date, offer_time);
create index if not exists idx_offers_status_date on public.offers(status, offer_date);
create index if not exists idx_reservations_restaurant on public.reservations(restaurant_id, created_at desc);
create index if not exists idx_reservations_guest_email on public.reservations(guest_email);
create index if not exists idx_reservations_status on public.reservations(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists restaurants_set_updated_at on public.restaurants;
create trigger restaurants_set_updated_at
before update on public.restaurants
for each row execute function public.set_updated_at();

drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'guest'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
      and role = 'admin'
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
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('restaurant', 'admin')
      and (role = 'admin' or restaurant_id = target_restaurant_id)
  );
$$;

create or replace view public.public_available_offers as
select
  o.id as offer_id,
  r.id as restaurant_id,
  r.name as restaurant_name,
  r.contact_email as restaurant_email,
  r.district,
  r.address,
  r.cuisine,
  r.rating,
  r.description,
  o.offer_date,
  to_char(o.offer_time, 'HH24:MI') as offer_time,
  (o.seat_count - o.reserved_seats) as available_seats,
  o.discount_percent
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
where r.status = 'approved'
  and o.status = 'active'
  and o.offer_date >= current_date
  and o.reserved_seats < o.seat_count;

create or replace view public.reservation_overview as
select
  rv.id as reservation_id,
  rv.reference,
  rv.restaurant_id,
  r.name as restaurant_name,
  r.contact_email as restaurant_email,
  rv.offer_id,
  o.offer_date,
  to_char(o.offer_time, 'HH24:MI') as offer_time,
  o.discount_percent,
  rv.party_size,
  rv.guest_id,
  rv.guest_name,
  rv.guest_email,
  rv.guest_phone,
  rv.notes,
  rv.status,
  rv.created_at,
  rv.updated_at
from public.reservations rv
join public.offers o on o.id = rv.offer_id
join public.restaurants r on r.id = rv.restaurant_id;

create or replace function public.create_reservation(
  p_offer_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_party_size integer,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.offers%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_reservation public.reservations%rowtype;
  v_reference text;
begin
  if p_party_size is null or p_party_size < 1 then
    raise exception 'Party size must be at least 1.';
  end if;

  select o.* into v_offer
  from public.offers o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_offer_id
    and o.status = 'active'
    and r.status = 'approved'
    and o.offer_date >= current_date
  for update;

  if not found then
    raise exception 'Offer is not available.';
  end if;

  select * into v_restaurant from public.restaurants where id = v_offer.restaurant_id;

  if (v_offer.seat_count - v_offer.reserved_seats) < p_party_size then
    raise exception 'Not enough seats available.';
  end if;

  update public.offers
  set reserved_seats = reserved_seats + p_party_size
  where id = v_offer.id
  returning * into v_offer;

  loop
    v_reference := 'ST-' || lpad(floor(random() * 90000 + 10000)::text, 5, '0');
    exit when not exists (select 1 from public.reservations where reference = v_reference);
  end loop;

  insert into public.reservations (
    reference,
    offer_id,
    restaurant_id,
    guest_id,
    guest_name,
    guest_email,
    guest_phone,
    party_size,
    notes,
    status
  )
  values (
    v_reference,
    v_offer.id,
    v_offer.restaurant_id,
    auth.uid(),
    trim(p_guest_name),
    lower(trim(p_guest_email)),
    trim(p_guest_phone),
    p_party_size,
    nullif(trim(coalesce(p_notes, '')), ''),
    'requested'
  )
  returning * into v_reservation;

  return jsonb_build_object(
    'reservation_id', v_reservation.id,
    'reference', v_reservation.reference,
    'restaurant_id', v_restaurant.id,
    'restaurant_name', v_restaurant.name,
    'restaurant_email', v_restaurant.contact_email,
    'offer_id', v_offer.id,
    'offer_date', v_offer.offer_date,
    'offer_time', to_char(v_offer.offer_time, 'HH24:MI'),
    'discount_percent', v_offer.discount_percent,
    'party_size', v_reservation.party_size,
    'guest_id', v_reservation.guest_id,
    'guest_name', v_reservation.guest_name,
    'guest_email', v_reservation.guest_email,
    'guest_phone', v_reservation.guest_phone,
    'notes', v_reservation.notes,
    'status', v_reservation.status,
    'created_at', v_reservation.created_at,
    'updated_at', v_reservation.updated_at
  );
end;
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'restaurants_total', (select count(*) from public.restaurants),
    'restaurants_pending', (select count(*) from public.restaurants where status = 'pending'),
    'offers_active', (select count(*) from public.offers where status = 'active'),
    'reservations_total', (select count(*) from public.reservations),
    'reservations_requested', (select count(*) from public.reservations where status = 'requested'),
    'seats_reserved', coalesce((select sum(party_size) from public.reservations), 0)
  );
$$;

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.offers enable row level security;
alter table public.reservations enable row level security;
alter table public.email_events enable row level security;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
for update using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists restaurants_public_approved on public.restaurants;
create policy restaurants_public_approved on public.restaurants
for select using (status = 'approved' or public.is_admin() or public.owns_restaurant(id));

drop policy if exists restaurants_admin_all on public.restaurants;
create policy restaurants_admin_all on public.restaurants
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists offers_public_active on public.offers;
create policy offers_public_active on public.offers
for select using (
  status = 'active'
  and exists (
    select 1 from public.restaurants r
    where r.id = restaurant_id
      and r.status = 'approved'
  )
);

drop policy if exists offers_restaurant_manage on public.offers;
create policy offers_restaurant_manage on public.offers
for all using (public.owns_restaurant(restaurant_id))
with check (public.owns_restaurant(restaurant_id));

drop policy if exists reservations_guest_read on public.reservations;
create policy reservations_guest_read on public.reservations
for select using (guest_id = auth.uid() or public.owns_restaurant(restaurant_id) or public.is_admin());

drop policy if exists reservations_restaurant_update on public.reservations;
create policy reservations_restaurant_update on public.reservations
for update using (public.owns_restaurant(restaurant_id) or public.is_admin())
with check (public.owns_restaurant(restaurant_id) or public.is_admin());

drop policy if exists email_events_admin_only on public.email_events;
create policy email_events_admin_only on public.email_events
for select using (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.public_available_offers to anon, authenticated;
grant select on public.reservation_overview to authenticated;
grant execute on function public.create_reservation(uuid, text, text, text, integer, text) to anon, authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
