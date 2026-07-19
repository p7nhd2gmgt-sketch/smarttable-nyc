-- Offer availability must be evaluated against the restaurant's local IANA
-- timezone. Do not use PostgreSQL current_date here; on New York evenings the
-- server UTC date may already be tomorrow while the restaurant service day has
-- not ended yet.

create or replace view public.public_available_offers as
select
  o.id as offer_id,
  r.id as restaurant_id,
  r.name as restaurant_name,
  coalesce(r.email, r.contact_email) as restaurant_email,
  r.district,
  r.address,
  coalesce(r.cuisine_type, r.cuisine) as cuisine,
  coalesce(r.cuisine_type, r.cuisine) as cuisine_type,
  r.rating,
  r.description,
  r.description_en as restaurant_description_en,
  r.description_es as restaurant_description_es,
  r.description_hu as restaurant_description_hu,
  r.website,
  r.instagram,
  r.facebook,
  r.tiktok,
  r.google_maps_url,
  r.google_place_id,
  r.latitude,
  r.longitude,
  r.sort_order,
  r.created_at as restaurant_created_at,
  r.primary_timezone,
  r.ai_discount_enabled,
  r.min_discount_percent,
  r.max_discount_percent,
  r.target_margin_percent,
  r.average_service_minutes,
  r.reservation_integration_status,
  r.calendar_planning_enabled,
  coalesce(rs.food_rating_avg, null) as food_rating_avg,
  coalesce(rs.service_rating_avg, null) as service_rating_avg,
  coalesce(rs.ambience_rating_avg, null) as ambience_rating_avg,
  coalesce(rs.overall_rating_avg, null) as overall_rating_avg,
  coalesce(rs.review_count, 0) as review_count,
  (
    select count(*)::integer
    from public.restaurant_followers rf
    where rf.restaurant_id = r.id
      and rf.notification_enabled = true
  ) as favorites_count,
  coalesce(r.card_image, r.hero_image_url, r.cover_image, '/assets/restaurant-hero.png') as card_image,
  coalesce(r.icon_image, r.logo_url, r.card_image, r.cover_image, '/assets/restaurant-hero.png') as icon_image,
  o.title_en,
  o.title_es,
  o.title_hu,
  o.description_en as offer_description_en,
  o.description_es as offer_description_es,
  o.description_hu as offer_description_hu,
  coalesce(o.title_en, 'Discounted table') as offer_title,
  coalesce(o.description_en, '') as offer_description,
  coalesce(o.offer_image, r.card_image, r.hero_image_url, r.cover_image, '/assets/restaurant-hero.png') as offer_image,
  o.offer_date,
  to_char(coalesce(o.start_time, o.offer_time), 'HH24:MI') as offer_time,
  to_char(coalesce(o.start_time, o.offer_time), 'HH24:MI') as start_time,
  to_char(o.end_time, 'HH24:MI') as end_time,
  o.valid_days,
  greatest(coalesce(o.available_tables, 1) - coalesce(o.reserved_tables, 0), 0) as available_tables,
  greatest(
    (coalesce(o.available_tables, 1) - coalesce(o.reserved_tables, 0)) * coalesce(o.max_party_size, 4),
    coalesce(o.seat_count, 0) - coalesce(o.reserved_seats, 0)
  ) as available_seats,
  coalesce(o.max_party_size, 4) as max_party_size,
  o.discount_type,
  o.discount_value,
  o.discount_percent,
  o.created_at,
  r.logo_url,
  r.hero_image_url,
  r.cover_image,
  r.menu_pdf_url,
  r.price_range,
  r.dress_code,
  r.outdoor_seating,
  r.parking_available,
  r.kids_friendly,
  r.pet_friendly,
  r.wheelchair_accessible,
  r.payment_methods,
  r.chef_name,
  r.year_opened,
  r.capacity,
  r.private_room_available,
  r.opening_hours,
  r.gallery_images
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved'
  and o.status = 'active'
  and (
    (
      o.offer_date
      + coalesce(o.end_time, o.start_time, o.offer_time, time '23:59')
      + case
        when coalesce(o.end_time, o.start_time, o.offer_time, time '23:59') <= coalesce(o.start_time, o.offer_time, time '00:00')
          then interval '1 day'
        else interval '0 day'
      end
    ) at time zone coalesce(nullif(r.primary_timezone, ''), 'America/New_York')
  ) > now()
  and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1);

create or replace function public.create_reservation(
  p_offer_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_party_size integer,
  p_reservation_date date default null,
  p_reservation_time time default null,
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

  select o, r into v_offer, v_restaurant
  from public.offers o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_offer_id
    and o.status = 'active'
    and r.status = 'approved'
    and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
  for update of o;

  if not found then
    raise exception 'OFFER_UNAVAILABLE';
  end if;

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

  if p_party_size > coalesce(v_offer.max_party_size, 4) then
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
  set
    reserved_tables = coalesce(reserved_tables, 0) + 1,
    reserved_seats = coalesce(reserved_seats, 0) + p_party_size
  where id = v_offer.id
    and coalesce(reserved_tables, 0) < coalesce(available_tables, 1)
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
    booking_status
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
    v_reservation_date,
    v_reservation_time,
    nullif(trim(coalesce(p_notes, '')), ''),
    'pending',
    'smarttable',
    'SMARTTABLE',
    'pending'
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

grant execute on function public.create_reservation(uuid, text, text, text, integer, date, time, text) to anon, authenticated;
