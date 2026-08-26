create extension if not exists pgcrypto;

alter table public.restaurants
  add column if not exists slug text,
  add column if not exists visible_on_guest_site boolean not null default true,
  add column if not exists is_test_restaurant boolean not null default false,
  add column if not exists accepts_reservation_requests boolean not null default true,
  add column if not exists reservation_provider text not null default 'smarttable',
  add column if not exists booking_interval_minutes integer not null default 30,
  add column if not exists minimum_advance_minutes integer not null default 0,
  add column if not exists maximum_booking_window_days integer not null default 30,
  add column if not exists min_party_size integer not null default 1,
  add column if not exists max_party_size integer not null default 8,
  add column if not exists auto_confirmation boolean not null default false,
  add column if not exists partner_approval_required boolean not null default true,
  add column if not exists opening_hours_json jsonb not null default '{}'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists primary_timezone text not null default 'America/New_York',
  add column if not exists restaurant_type text,
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists description_hu text,
  add column if not exists card_image text,
  add column if not exists icon_image text,
  add column if not exists logo_url text,
  add column if not exists hero_image_url text,
  add column if not exists cover_image text,
  add column if not exists menu_pdf_url text,
  add column if not exists price_range text,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists tiktok text,
  add column if not exists google_maps_url text,
  add column if not exists google_place_id text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists sort_order integer,
  add column if not exists outdoor_seating boolean not null default false,
  add column if not exists parking_available boolean not null default false,
  add column if not exists kids_friendly boolean not null default false,
  add column if not exists pet_friendly boolean not null default false,
  add column if not exists wheelchair_accessible boolean not null default false,
  add column if not exists private_room_available boolean not null default false,
  add column if not exists chef_name text,
  add column if not exists year_opened integer,
  add column if not exists capacity integer,
  add column if not exists dress_code text,
  add column if not exists billing_plan text,
  add column if not exists billing_status text,
  add column if not exists monthly_fee numeric not null default 0,
  add column if not exists fee_per_booking numeric not null default 0,
  add column if not exists ai_discount_enabled boolean not null default false,
  add column if not exists min_discount_percent integer not null default 0,
  add column if not exists max_discount_percent integer not null default 0,
  add column if not exists target_margin_percent numeric not null default 65,
  add column if not exists average_service_minutes integer not null default 75,
  add column if not exists views_count integer not null default 0;

alter table public.offers
  add column if not exists title_en text,
  add column if not exists title_es text,
  add column if not exists title_hu text,
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists description_hu text,
  add column if not exists discount_type text not null default 'percent',
  add column if not exists discount_value numeric not null default 20,
  add column if not exists valid_days text[] not null default array['mon','tue','wed','thu','fri','sat','sun'],
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists available_tables integer not null default 1,
  add column if not exists reserved_tables integer not null default 0,
  add column if not exists max_party_size integer not null default 4,
  add column if not exists min_party_size integer not null default 1,
  add column if not exists offer_image text,
  add column if not exists structured_conditions jsonb not null default '{}'::jsonb,
  add column if not exists source text,
  add column if not exists is_test_offer boolean not null default false;

alter table public.reservations
  add column if not exists is_test_reservation boolean not null default false,
  add column if not exists test_record boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_restaurants_slug on public.restaurants(slug);
create index if not exists idx_restaurants_test_visible on public.restaurants(is_test_restaurant, visible_on_guest_site);
create index if not exists idx_offers_test_availability on public.offers(is_test_offer, status, offer_date);
create index if not exists idx_reservations_test_records on public.reservations(is_test_reservation, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.restaurants'::regclass
      and conname = 'restaurants_party_size_bounds'
  ) then
    alter table public.restaurants
      add constraint restaurants_party_size_bounds
      check (min_party_size > 0 and max_party_size >= min_party_size);
  end if;
end $$;

insert into public.restaurants (
  id,
  slug,
  name,
  legal_name,
  contact_email,
  email,
  phone,
  address,
  district,
  cuisine,
  cuisine_type,
  restaurant_type,
  website,
  google_maps_url,
  latitude,
  longitude,
  opening_hours,
  opening_hours_json,
  description,
  description_en,
  description_es,
  description_hu,
  cover_image,
  card_image,
  icon_image,
  logo_url,
  hero_image_url,
  menu_pdf_url,
  price_range,
  dress_code,
  outdoor_seating,
  parking_available,
  kids_friendly,
  pet_friendly,
  wheelchair_accessible,
  payment_methods,
  chef_name,
  year_opened,
  capacity,
  private_room_available,
  gallery_images,
  billing_plan,
  billing_status,
  monthly_fee,
  fee_per_booking,
  status,
  visible_on_guest_site,
  is_test_restaurant,
  accepts_reservation_requests,
  reservation_provider,
  primary_timezone,
  booking_interval_minutes,
  minimum_advance_minutes,
  maximum_booking_window_days,
  min_party_size,
  max_party_size,
  auto_confirmation,
  partner_approval_required,
  sort_order,
  ai_discount_enabled,
  min_discount_percent,
  max_discount_percent,
  target_margin_percent,
  average_service_minutes,
  rating,
  views_count,
  settings
)
values (
  '10000000-0000-4000-8000-000000000123',
  'smarttable-test-bistro',
  'SmartTable Test Bistro',
  'SmartTable Test Bistro',
  'reservations@smarttable.test',
  'reservations@smarttable.test',
  '+1 212 555 0123',
  '123 Pilot Test Avenue, New York, NY 10001',
  'Manhattan',
  'Modern American',
  'Modern American',
  'Test / Demo restaurant',
  'https://smarttablenyc.com',
  'https://maps.google.com/?q=123+Pilot+Test+Avenue+New+York+NY+10001',
  40.7505,
  -73.9934,
  'Mon-Thu 5:00 PM - 10:00 PM; Fri 5:00 PM - 11:00 PM; Sat 12:00 PM - 11:00 PM; Sun 12:00 PM - 9:00 PM',
  '{
    "mon":[["17:00","22:00"]],
    "tue":[["17:00","22:00"]],
    "wed":[["17:00","22:00"]],
    "thu":[["17:00","22:00"]],
    "fri":[["17:00","23:00"]],
    "sat":[["12:00","23:00"]],
    "sun":[["12:00","21:00"]]
  }'::jsonb,
  'A SmartTable demonstration restaurant created for testing the complete guest reservation journey. No real reservation is created outside the SmartTable test environment.',
  'A SmartTable demonstration restaurant created for testing the complete guest reservation journey. No real reservation is created outside the SmartTable test environment.',
  'Un restaurante de demostración de SmartTable creado para probar el proceso completo de reservas de huéspedes. No se crea ninguna reserva real fuera del entorno de prueba de SmartTable.',
  'A SmartTable teljes vendégfoglalási folyamatának tesztelésére létrehozott bemutató étterem. A tesztkörnyezeten kívül nem jön létre valódi foglalás.',
  '/assets/restaurant-hero.png',
  '/assets/restaurant-hero.png',
  '/assets/restaurant-hero.png',
  '/assets/restaurant-hero.png',
  '/assets/restaurant-hero.png',
  null,
  '$$',
  'Casual',
  true,
  false,
  true,
  false,
  true,
  array['Visa','Mastercard','Amex'],
  'SmartTable Test Kitchen',
  2026,
  80,
  false,
  array['/assets/restaurant-hero.png'],
  'free',
  'active',
  0,
  0,
  'approved'::public.restaurant_status,
  true,
  true,
  true,
  'internal_test',
  'America/New_York',
  30,
  30,
  30,
  1,
  8,
  false,
  true,
  3,
  false,
  15,
  30,
  65,
  75,
  4.9,
  0,
  '{"test_record":true,"public_badge":"Test restaurant - no real reservation"}'::jsonb
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  legal_name = excluded.legal_name,
  contact_email = excluded.contact_email,
  email = excluded.email,
  phone = excluded.phone,
  address = excluded.address,
  district = excluded.district,
  cuisine = excluded.cuisine,
  cuisine_type = excluded.cuisine_type,
  restaurant_type = excluded.restaurant_type,
  website = excluded.website,
  google_maps_url = excluded.google_maps_url,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  opening_hours = excluded.opening_hours,
  opening_hours_json = excluded.opening_hours_json,
  description = excluded.description,
  description_en = excluded.description_en,
  description_es = excluded.description_es,
  description_hu = excluded.description_hu,
  cover_image = excluded.cover_image,
  card_image = excluded.card_image,
  icon_image = excluded.icon_image,
  logo_url = excluded.logo_url,
  hero_image_url = excluded.hero_image_url,
  price_range = excluded.price_range,
  dress_code = excluded.dress_code,
  outdoor_seating = excluded.outdoor_seating,
  parking_available = excluded.parking_available,
  kids_friendly = excluded.kids_friendly,
  pet_friendly = excluded.pet_friendly,
  wheelchair_accessible = excluded.wheelchair_accessible,
  payment_methods = excluded.payment_methods,
  chef_name = excluded.chef_name,
  year_opened = excluded.year_opened,
  capacity = excluded.capacity,
  private_room_available = excluded.private_room_available,
  gallery_images = excluded.gallery_images,
  billing_plan = excluded.billing_plan,
  billing_status = excluded.billing_status,
  monthly_fee = excluded.monthly_fee,
  fee_per_booking = excluded.fee_per_booking,
  status = excluded.status,
  visible_on_guest_site = excluded.visible_on_guest_site,
  is_test_restaurant = excluded.is_test_restaurant,
  accepts_reservation_requests = excluded.accepts_reservation_requests,
  reservation_provider = excluded.reservation_provider,
  primary_timezone = excluded.primary_timezone,
  booking_interval_minutes = excluded.booking_interval_minutes,
  minimum_advance_minutes = excluded.minimum_advance_minutes,
  maximum_booking_window_days = excluded.maximum_booking_window_days,
  min_party_size = excluded.min_party_size,
  max_party_size = excluded.max_party_size,
  auto_confirmation = excluded.auto_confirmation,
  partner_approval_required = excluded.partner_approval_required,
  sort_order = excluded.sort_order,
  ai_discount_enabled = excluded.ai_discount_enabled,
  min_discount_percent = excluded.min_discount_percent,
  max_discount_percent = excluded.max_discount_percent,
  target_margin_percent = excluded.target_margin_percent,
  average_service_minutes = excluded.average_service_minutes,
  rating = excluded.rating,
  settings = excluded.settings,
  updated_at = now();

with clock as (
  select now() at time zone 'America/New_York' as local_now
),
dates as (
  select
    current_date + case
      when ((1 - extract(isodow from current_date)::integer + 7) % 7) = 0 then 7
      else ((1 - extract(isodow from current_date)::integer + 7) % 7)
    end as early_date,
    current_date + case
      when ((6 - extract(isodow from current_date)::integer + 7) % 7) = 0 then 7
      else ((6 - extract(isodow from current_date)::integer + 7) % 7)
    end as weekend_date,
    case when (select local_now::time from clock) < time '20:30'
      then (select local_now::date from clock)
      else (select local_now::date + 1 from clock)
    end as last_minute_date,
    case when (select local_now::time from clock) < time '20:30'
      then ((select date_trunc('hour', local_now) from clock) + interval '2 hours')::time
      else time '17:00'
    end as last_minute_start
),
offer_seed as (
  select
    '20000000-0000-4000-8000-000000000123'::uuid as id,
    'Early Dinner Special' as title_en,
    'Cena temprana especial' as title_es,
    'Korai vacsoraajánlat' as title_hu,
    'Twenty percent off an early dinner test table from Monday through Thursday.' as description_en,
    'Veinte por ciento de descuento en una mesa de prueba para cena temprana de lunes a jueves.' as description_es,
    'Húsz százalék kedvezmény korai tesztvacsora-asztalra hétfőtől csütörtökig.' as description_hu,
    early_date as offer_date,
    time '17:00' as start_time,
    time '18:30' as end_time,
    array['mon','tue','wed','thu'] as valid_days,
    20 as discount_value,
    10 as available_tables,
    2 as min_party_size,
    6 as max_party_size
  from dates
  union all
  select
    '20000000-0000-4000-8000-000000000124'::uuid,
    'Weekend Lunch',
    'Almuerzo de fin de semana',
    'Hétvégi ebéd',
    'Fifteen percent off a weekend lunch test reservation.',
    'Quince por ciento de descuento en una reserva de prueba para almuerzo de fin de semana.',
    'Tizenöt százalék kedvezmény hétvégi tesztebéd-foglalásra.',
    weekend_date,
    time '12:00',
    time '15:00',
    array['sat','sun'],
    15,
    10,
    1,
    8
  from dates
  union all
  select
    '20000000-0000-4000-8000-000000000125'::uuid,
    'Last-Minute Table',
    'Mesa de último minuto',
    'Utolsó pillanatos asztal',
    'Thirty percent off a configurable same-day SmartTable test slot.',
    'Treinta por ciento de descuento en un turno de prueba configurable para el mismo día.',
    'Harminc százalék kedvezmény konfigurálható, aznapi SmartTable tesztidősávra.',
    last_minute_date,
    last_minute_start,
    (last_minute_start + interval '90 minutes')::time,
    array['mon','tue','wed','thu','fri','sat','sun'],
    30,
    10,
    1,
    8
  from dates
)
insert into public.offers (
  id,
  restaurant_id,
  title_en,
  title_es,
  title_hu,
  description_en,
  description_es,
  description_hu,
  discount_type,
  discount_value,
  discount_percent,
  valid_days,
  offer_date,
  offer_time,
  start_time,
  end_time,
  available_tables,
  reserved_tables,
  min_party_size,
  max_party_size,
  structured_conditions,
  offer_image,
  seat_count,
  reserved_seats,
  is_test_offer,
  source,
  status
)
select
  id,
  '10000000-0000-4000-8000-000000000123'::uuid,
  title_en,
  title_es,
  title_hu,
  description_en,
  description_es,
  description_hu,
  'percent',
  discount_value,
  discount_value,
  valid_days,
  offer_date,
  start_time,
  start_time,
  end_time,
  available_tables,
  0,
  min_party_size,
  max_party_size,
  jsonb_build_object(
    'min_party_size', min_party_size,
    'max_party_size', max_party_size,
    'custom_terms', jsonb_build_object('test_record', 'No real reservation is created outside the SmartTable test environment.')
  ),
  '/assets/restaurant-hero.png',
  available_tables * max_party_size,
  0,
  true,
  'internal_test_seed',
  'active'::public.offer_status
from offer_seed
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  title_en = excluded.title_en,
  title_es = excluded.title_es,
  title_hu = excluded.title_hu,
  description_en = excluded.description_en,
  description_es = excluded.description_es,
  description_hu = excluded.description_hu,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  discount_percent = excluded.discount_percent,
  valid_days = excluded.valid_days,
  offer_date = excluded.offer_date,
  offer_time = excluded.offer_time,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  available_tables = excluded.available_tables,
  reserved_tables = 0,
  min_party_size = excluded.min_party_size,
  max_party_size = excluded.max_party_size,
  structured_conditions = excluded.structured_conditions,
  offer_image = excluded.offer_image,
  seat_count = excluded.seat_count,
  reserved_seats = 0,
  is_test_offer = true,
  source = excluded.source,
  status = excluded.status,
  updated_at = now();

create or replace function public.mark_test_reservation_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_is_test boolean := false;
  v_offer_is_test boolean := false;
begin
  select
    coalesce(r.is_test_restaurant, false),
    coalesce(o.is_test_offer, false)
  into v_restaurant_is_test, v_offer_is_test
  from public.restaurants r
  left join public.offers o on o.id = new.offer_id
  where r.id = new.restaurant_id
  limit 1;

  if coalesce(v_restaurant_is_test, false) or coalesce(v_offer_is_test, false) then
    new.is_test_reservation := true;
    new.test_record := true;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'is_test_reservation', true,
      'reservation_provider', 'internal_test'
    );
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'reservations_mark_test_flags'
      and tgrelid = 'public.reservations'::regclass
  ) then
    create trigger reservations_mark_test_flags
    before insert on public.reservations
    for each row execute function public.mark_test_reservation_flags();
  end if;
end $$;

create or replace view public.public_restaurant_cards as
select
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
  r.ai_discount_enabled,
  r.min_discount_percent,
  r.max_discount_percent,
  r.target_margin_percent,
  r.average_service_minutes,
  r.reservation_integration_status,
  r.calendar_planning_enabled,
  coalesce(r.card_image, r.hero_image_url, r.cover_image, '/assets/restaurant-hero.png') as card_image,
  coalesce(r.icon_image, r.logo_url, r.card_image, r.cover_image, '/assets/restaurant-hero.png') as icon_image,
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
  (
    select count(*)::integer
    from public.offers o
    where o.restaurant_id = r.id
      and o.status = 'active'
      and o.offer_date >= current_date
      and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
  ) as offer_count,
  (
    select o.id
    from public.offers o
    where o.restaurant_id = r.id
      and o.status = 'active'
      and o.offer_date >= current_date
      and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
    order by o.offer_date asc, coalesce(o.start_time, o.offer_time) asc
    limit 1
  ) as first_offer_id,
  (
    select coalesce(max(coalesce(o.discount_value, o.discount_percent)), 0)
    from public.offers o
    where o.restaurant_id = r.id
      and o.status = 'active'
      and o.offer_date >= current_date
  ) as highest_discount,
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
  r.gallery_images,
  r.description_hu as restaurant_description_hu,
  r.slug,
  coalesce(r.visible_on_guest_site, true) as visible_on_guest_site,
  coalesce(r.is_test_restaurant, false) as is_test_restaurant,
  case when coalesce(r.is_test_restaurant, false) then 'Test restaurant - no real reservation' else '' end as test_badge,
  coalesce(r.accepts_reservation_requests, true) as accepts_reservation_requests,
  coalesce(r.reservation_provider, 'smarttable') as reservation_provider,
  coalesce(r.booking_interval_minutes, 30) as booking_interval_minutes,
  coalesce(r.minimum_advance_minutes, 0) as minimum_advance_minutes,
  coalesce(r.maximum_booking_window_days, 30) as maximum_booking_window_days,
  coalesce(r.min_party_size, 1) as restaurant_min_party_size,
  coalesce(r.max_party_size, 8) as restaurant_max_party_size,
  coalesce(r.auto_confirmation, false) as auto_confirmation,
  coalesce(r.partner_approval_required, true) as partner_approval_required,
  coalesce(r.opening_hours_json, '{}'::jsonb) as opening_hours_json
from public.restaurants r
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved'
  and coalesce(r.visible_on_guest_site, true) = true;

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
  r.gallery_images,
  r.slug,
  r.status as restaurant_status,
  coalesce(r.visible_on_guest_site, true) as visible_on_guest_site,
  coalesce(r.is_test_restaurant, false) as is_test_restaurant,
  case when coalesce(r.is_test_restaurant, false) then 'Test restaurant - no real reservation' else '' end as test_badge,
  coalesce(r.accepts_reservation_requests, true) as accepts_reservation_requests,
  coalesce(r.reservation_provider, 'smarttable') as reservation_provider,
  coalesce(r.booking_interval_minutes, 30) as booking_interval_minutes,
  coalesce(r.minimum_advance_minutes, 0) as minimum_advance_minutes,
  coalesce(r.maximum_booking_window_days, 30) as maximum_booking_window_days,
  coalesce(r.min_party_size, 1) as restaurant_min_party_size,
  coalesce(r.max_party_size, 8) as restaurant_max_party_size,
  coalesce(r.auto_confirmation, false) as auto_confirmation,
  coalesce(r.partner_approval_required, true) as partner_approval_required,
  coalesce(r.opening_hours_json, '{}'::jsonb) as opening_hours_json,
  coalesce(o.min_party_size, 1) as min_party_size,
  coalesce(o.is_test_offer, false) as is_test_offer
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved'
  and coalesce(r.visible_on_guest_site, true) = true
  and coalesce(r.accepts_reservation_requests, true) = true
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
  coalesce(p.preferred_language, 'en') as restaurant_language,
  coalesce(rv.is_test_reservation, rv.test_record, r.is_test_restaurant, o.is_test_offer, false) as is_test_reservation,
  coalesce(rv.test_record, rv.is_test_reservation, r.is_test_restaurant, o.is_test_offer, false) as test_record
from public.reservations rv
join public.offers o on o.id = rv.offer_id
join public.restaurants r on r.id = rv.restaurant_id
left join public.profiles p on p.id = r.owner_user_id;

grant select on public.public_restaurant_cards to anon, authenticated;
grant select on public.public_available_offers to anon, authenticated;
grant select on public.reservation_overview to authenticated;
