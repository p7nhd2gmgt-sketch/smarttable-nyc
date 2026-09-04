-- Keep reservation creation atomic while requiring every write to pass through
-- the SmartTable server API. Migration 0069 intentionally revoked direct
-- guest/client execution; the server supplies a verified auth user id when a
-- signed-in guest creates the reservation.

create or replace function public.create_reservation(
  p_offer_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_party_size integer,
  p_guest_id uuid,
  p_reservation_date date default null,
  p_reservation_time time default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.offers%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_reservation public.reservations%rowtype;
  v_reference text;
  v_reservation_date date;
  v_reservation_time time;
  v_day text;
  v_timezone text;
  v_start_time time;
  v_end_time time;
  v_offer_end_at timestamptz;
begin
  if p_party_size is null or p_party_size < 1 then
    raise exception 'OFFER_SOLD_OUT';
  end if;

  select o.* into v_offer
  from public.offers o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_offer_id
    and o.status = 'active'
    and r.status = 'approved'
    and coalesce(r.visible_on_guest_site, true) = true
    and coalesce(r.accepts_reservation_requests, true) = true
    and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
  for update of o;

  if not found then
    raise exception 'OFFER_UNAVAILABLE';
  end if;

  select r.* into v_restaurant
  from public.restaurants r
  where r.id = v_offer.restaurant_id;

  v_timezone := coalesce(nullif(v_restaurant.primary_timezone, ''), 'America/New_York');
  v_start_time := coalesce(v_offer.start_time, v_offer.offer_time);
  v_end_time := coalesce(v_offer.end_time, v_start_time, time '23:59');
  v_reservation_date := coalesce(p_reservation_date, v_offer.offer_date);
  v_reservation_time := coalesce(p_reservation_time, v_start_time);
  v_day := trim(lower(to_char(v_reservation_date, 'dy')));

  if v_reservation_date <> v_offer.offer_date then
    raise exception 'OFFER_DATE_MISMATCH';
  end if;

  if v_start_time is null or v_end_time is null or v_reservation_time is null then
    raise exception 'INVALID_OFFER_TIME';
  end if;

  v_offer_end_at := (
    v_offer.offer_date
    + v_end_time
    + case when v_end_time <= v_start_time then interval '1 day' else interval '0 day' end
  ) at time zone v_timezone;

  if now() > v_offer_end_at then
    raise exception 'OFFER_EXPIRED';
  end if;

  if coalesce(array_length(v_offer.valid_days, 1), 0) > 0
    and not (v_day = any(v_offer.valid_days)) then
    raise exception 'OFFER_DATE_MISMATCH';
  end if;

  if p_party_size < coalesce(v_offer.min_party_size, 1)
    or p_party_size > coalesce(v_offer.max_party_size, 4) then
    raise exception 'OFFER_SOLD_OUT';
  end if;

  if v_end_time <= v_start_time then
    if not (v_reservation_time >= v_start_time or v_reservation_time <= v_end_time) then
      raise exception 'INVALID_OFFER_TIME';
    end if;
  elsif v_reservation_time < v_start_time or v_reservation_time > v_end_time then
    raise exception 'INVALID_OFFER_TIME';
  end if;

  update public.offers
  set reserved_tables = coalesce(reserved_tables, 0) + 1,
      reserved_seats = coalesce(reserved_seats, 0) + p_party_size
  where id = v_offer.id
    and coalesce(reserved_tables, 0) < coalesce(available_tables, 1)
    and coalesce(reserved_seats, 0) + p_party_size
      <= coalesce(seat_count, coalesce(available_tables, 1) * coalesce(max_party_size, 4))
  returning * into v_offer;

  if not found then
    raise exception 'OFFER_SOLD_OUT';
  end if;

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
    reservation_date,
    reservation_time,
    notes,
    status,
    source,
    booking_source,
    booking_status,
    is_test_reservation,
    test_record,
    is_test_data
  )
  values (
    v_reference,
    v_offer.id,
    v_offer.restaurant_id,
    p_guest_id,
    trim(p_guest_name),
    lower(trim(p_guest_email)),
    trim(p_guest_phone),
    p_party_size,
    v_reservation_date,
    v_reservation_time,
    nullif(trim(coalesce(p_notes, '')), ''),
    'pending',
    'smarttable',
    'SMARTTABLE',
    'pending',
    coalesce(v_restaurant.is_test_restaurant, false) or coalesce(v_offer.is_test_offer, false),
    coalesce(v_restaurant.is_test_restaurant, false) or coalesce(v_offer.is_test_offer, false),
    coalesce(v_restaurant.is_test_data, false) or coalesce(v_offer.is_test_data, false)
  )
  returning * into v_reservation;

  return jsonb_build_object(
    'reservation_id', v_reservation.id,
    'reference', v_reservation.reference,
    'restaurant_id', v_restaurant.id,
    'restaurant_name', v_restaurant.name,
    'restaurant_email', coalesce(v_restaurant.email, v_restaurant.contact_email),
    'offer_id', v_offer.id,
    'offer_title', v_offer.title_en,
    'offer_date', v_reservation.reservation_date,
    'offer_time', to_char(v_reservation.reservation_time, 'HH24:MI'),
    'reservation_date', v_reservation.reservation_date,
    'reservation_time', to_char(v_reservation.reservation_time, 'HH24:MI'),
    'discount_type', v_offer.discount_type,
    'discount_value', v_offer.discount_value,
    'discount_percent', v_offer.discount_percent,
    'party_size', v_reservation.party_size,
    'guest_id', v_reservation.guest_id,
    'guest_name', v_reservation.guest_name,
    'guest_email', v_reservation.guest_email,
    'guest_phone', v_reservation.guest_phone,
    'notes', v_reservation.notes,
    'status', v_reservation.status,
    'source', v_reservation.source,
    'booking_source', v_reservation.booking_source,
    'booking_status', v_reservation.booking_status,
    'created_at', v_reservation.created_at,
    'updated_at', v_reservation.updated_at
  );
end;
$$;

revoke all privileges on function public.create_reservation(uuid, text, text, text, integer, uuid, date, time, text)
  from public, anon, authenticated;
grant execute on function public.create_reservation(uuid, text, text, text, integer, uuid, date, time, text)
  to service_role;
