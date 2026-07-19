-- BASIC reservation lifecycle hardening.
-- Additive migration: preserves existing reservations and only tightens status transitions.

alter table public.reservations
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists no_show_at timestamptz,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_by_label text;

create table if not exists public.reservation_status_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  previous_status text not null,
  new_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reservation_status_events_reservation
  on public.reservation_status_events(reservation_id, created_at desc);

alter table public.reservation_status_events enable row level security;

drop policy if exists reservation_status_events_admin_partner_read on public.reservation_status_events;
create policy reservation_status_events_admin_partner_read on public.reservation_status_events
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.reservations rv
    where rv.id = reservation_status_events.reservation_id
      and public.owns_restaurant(rv.restaurant_id)
  )
);

drop policy if exists reservation_status_events_service_insert on public.reservation_status_events;
create policy reservation_status_events_service_insert on public.reservation_status_events
for insert with check (auth.role() = 'service_role' or public.is_admin());

grant select, insert on public.reservation_status_events to authenticated;

create or replace view public.reservation_overview as
select
  rv.id as reservation_id,
  rv.reference,
  rv.restaurant_id,
  r.name as restaurant_name,
  coalesce(r.email, r.contact_email) as restaurant_email,
  r.phone as restaurant_phone,
  r.address as restaurant_address,
  r.cuisine_type as restaurant_cuisine,
  r.district as restaurant_neighborhood,
  r.status as restaurant_status,
  rv.offer_id,
  o.title_en as offer_title,
  coalesce(rv.reservation_date, o.offer_date) as offer_date,
  to_char(coalesce(rv.reservation_time, o.start_time, o.offer_time), 'HH24:MI') as offer_time,
  coalesce(rv.reservation_date, o.offer_date) as reservation_date,
  to_char(coalesce(rv.reservation_time, o.start_time, o.offer_time), 'HH24:MI') as reservation_time,
  o.discount_type,
  o.discount_value,
  o.discount_percent,
  rv.party_size,
  rv.guest_id,
  rv.guest_name,
  rv.guest_email,
  rv.guest_phone,
  rv.notes,
  rv.partner_notes,
  rv.status,
  rv.source,
  rv.booking_source,
  rv.booking_status,
  rv.created_at,
  rv.updated_at,
  rv.guest_language,
  rv.accepted_at,
  rv.rejected_at,
  rv.cancelled_at,
  rv.completed_at,
  rv.no_show_at,
  rv.status_changed_at,
  rv.status_changed_by,
  rv.cancelled_by_label,
  exists (
    select 1
    from public.dining_consumption_uploads dcu
    where dcu.reservation_id = rv.id
  ) as feedback_submitted,
  coalesce(p.preferred_language, 'en') as restaurant_language
from public.reservations rv
join public.offers o on o.id = rv.offer_id
join public.restaurants r on r.id = rv.restaurant_id
left join public.profiles p on p.id = r.owner_user_id;

create or replace function public.update_reservation_status(
  p_reservation_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_previous_status text;
  v_target_status text;
  v_booking_status text;
  v_now timestamptz := now();
  v_allowed boolean := false;
  v_result jsonb;
begin
  v_target_status := lower(trim(coalesce(p_status, '')));
  v_target_status := replace(v_target_status, '-', '_');
  v_target_status := replace(v_target_status, ' ', '_');

  if v_target_status = 'requested' then
    v_target_status := 'pending';
  elsif v_target_status = 'confirmed' then
    v_target_status := 'accepted';
  elsif v_target_status = 'declined' then
    v_target_status := 'rejected';
  elsif v_target_status = 'canceled' then
    v_target_status := 'cancelled';
  end if;

  if v_target_status not in ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'no_show') then
    raise exception 'INVALID_RESERVATION_STATUS';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if auth.role() <> 'service_role'
    and not public.is_admin()
    and not public.owns_restaurant(v_reservation.restaurant_id) then
    raise exception 'RESERVATION_FORBIDDEN';
  end if;

  v_previous_status := v_reservation.status::text;
  if v_previous_status = 'requested' then
    v_previous_status := 'pending';
  elsif v_previous_status = 'confirmed' then
    v_previous_status := 'accepted';
  elsif v_previous_status = 'declined' then
    v_previous_status := 'rejected';
  elsif v_previous_status = 'canceled' then
    v_previous_status := 'cancelled';
  end if;

  if v_previous_status = v_target_status then
    select to_jsonb(ro.*) into v_result
    from public.reservation_overview ro
    where ro.reservation_id = p_reservation_id;
    return v_result;
  end if;

  v_allowed := (
    (v_previous_status = 'pending' and v_target_status in ('accepted', 'rejected', 'cancelled'))
    or (v_previous_status = 'accepted' and v_target_status in ('cancelled', 'completed', 'no_show'))
  );

  if not v_allowed then
    raise exception 'INVALID_RESERVATION_STATUS_TRANSITION: % -> %', v_previous_status, v_target_status;
  end if;

  v_booking_status := case
    when v_target_status = 'accepted' then 'confirmed'
    when v_target_status = 'rejected' then 'declined'
    when v_target_status = 'cancelled' then 'cancelled'
    when v_target_status = 'completed' then 'completed'
    when v_target_status = 'no_show' then 'no_show'
    else 'pending'
  end;

  update public.reservations
  set
    status = v_target_status::public.reservation_status,
    booking_status = v_booking_status,
    status_changed_at = v_now,
    status_changed_by = auth.uid(),
    accepted_at = case when v_target_status = 'accepted' then v_now else accepted_at end,
    rejected_at = case when v_target_status = 'rejected' then v_now else rejected_at end,
    cancelled_at = case when v_target_status = 'cancelled' then v_now else cancelled_at end,
    completed_at = case when v_target_status = 'completed' then v_now else completed_at end,
    no_show_at = case when v_target_status = 'no_show' then v_now else no_show_at end
  where id = p_reservation_id
  returning * into v_reservation;

  if v_previous_status not in ('rejected', 'cancelled', 'no_show')
    and v_target_status in ('rejected', 'cancelled', 'no_show') then
    update public.offers
    set
      reserved_tables = greatest(coalesce(reserved_tables, 0) - 1, 0),
      reserved_seats = greatest(coalesce(reserved_seats, 0) - coalesce(v_reservation.party_size, 0), 0)
    where id = v_reservation.offer_id;
  end if;

  insert into public.reservation_status_events (
    reservation_id,
    previous_status,
    new_status,
    actor_user_id,
    actor_role,
    message
  )
  values (
    p_reservation_id,
    v_previous_status,
    v_target_status,
    auth.uid(),
    coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()),
    'Reservation status changed'
  );

  select to_jsonb(ro.*) into v_result
  from public.reservation_overview ro
  where ro.reservation_id = p_reservation_id;

  return v_result;
end;
$$;

grant select on public.reservation_overview to authenticated;
grant execute on function public.update_reservation_status(uuid, text) to authenticated;
