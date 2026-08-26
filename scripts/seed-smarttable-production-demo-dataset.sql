select
  'restaurants' as table_name,
  column_name,
  data_type,
  udt_schema,
  udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'restaurants'
order by ordinal_position;

select
  'offers' as table_name,
  column_name,
  data_type,
  udt_schema,
  udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'offers'
order by ordinal_position;

select
  'reservations' as table_name,
  column_name,
  data_type,
  udt_schema,
  udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reservations'
order by ordinal_position;

select
  'restaurant_status' as enum_name,
  enumlabel as enum_value
from pg_enum
where enumtypid = 'public.restaurant_status'::regtype
order by enumsortorder;

select
  'offer_status' as enum_name,
  enumlabel as enum_value
from pg_enum
where enumtypid = 'public.offer_status'::regtype
order by enumsortorder;

select
  'reservation_status' as enum_name,
  enumlabel as enum_value
from pg_enum
where enumtypid = 'public.reservation_status'::regtype
order by enumsortorder;

begin;

do $$
declare
  v_restaurant_name constant text := 'SmartTable Test Bistro';
  v_restaurant_id uuid;
  v_fixed_restaurant_id constant uuid := '10000000-0000-4000-8000-000000000123';
  v_payload jsonb;
  v_columns text;
  v_values text;
  v_updates text;
  v_restaurant_status text;
  v_offer_status text;
  v_pending_status text;
  v_accepted_status text;
  v_declined_status text;
  v_completed_status text;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_market_id uuid;
  v_i integer;
  v_offer_id uuid;
  v_offer_date date;
  v_start_time time;
  v_end_time time;
  v_discount integer;
  v_available_tables integer;
  v_max_party_size integer;
  v_min_party_size integer;
  v_reservation jsonb;
  v_relation text;
begin
  select enumlabel
  into v_restaurant_status
  from pg_enum
  where enumtypid = 'public.restaurant_status'::regtype
    and enumlabel = 'approved'
  limit 1;

  select enumlabel
  into v_offer_status
  from pg_enum
  where enumtypid = 'public.offer_status'::regtype
    and enumlabel = 'active'
  limit 1;

  select enumlabel
  into v_pending_status
  from pg_enum
  where enumtypid = 'public.reservation_status'::regtype
    and enumlabel in ('pending', 'requested')
  order by array_position(array['pending', 'requested'], enumlabel)
  limit 1;

  select enumlabel
  into v_accepted_status
  from pg_enum
  where enumtypid = 'public.reservation_status'::regtype
    and enumlabel in ('accepted', 'confirmed')
  order by array_position(array['accepted', 'confirmed'], enumlabel)
  limit 1;

  select enumlabel
  into v_declined_status
  from pg_enum
  where enumtypid = 'public.reservation_status'::regtype
    and enumlabel in ('rejected', 'declined')
  order by array_position(array['rejected', 'declined'], enumlabel)
  limit 1;

  select enumlabel
  into v_completed_status
  from pg_enum
  where enumtypid = 'public.reservation_status'::regtype
    and enumlabel = 'completed'
  limit 1;

  if v_restaurant_status is null then
    raise exception 'Required restaurant status approved is not available.';
  end if;

  if v_offer_status is null then
    raise exception 'Required offer status active is not available.';
  end if;

  select id
  into v_restaurant_id
  from public.restaurants
  where lower(name) = lower(v_restaurant_name)
     or id = v_fixed_restaurant_id
  order by case when id = v_fixed_restaurant_id then 0 else 1 end, created_at nulls last
  limit 1;

  v_restaurant_id := coalesce(v_restaurant_id, v_fixed_restaurant_id);

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restaurants'
      and column_name = 'market_id'
  ) then
    if to_regclass('public.markets') is not null then
      execute 'select id from public.markets where code = $1 order by created_at nulls last limit 1'
      into v_market_id
      using 'nyc';
    end if;
    v_market_id := coalesce(v_market_id, '10000000-0000-4000-8000-000000000001'::uuid);
  end if;

  v_payload := jsonb_build_object(
    'id', v_restaurant_id,
    'market_id', v_market_id,
    'slug', 'smarttable-test-bistro',
    'name', v_restaurant_name,
    'legal_name', v_restaurant_name,
    'contact_email', 'reservations@smarttable.test',
    'email', 'reservations@smarttable.test',
    'phone', '+1 212 555 0123',
    'address', '123 Pilot Test Avenue, New York, NY 10001',
    'district', 'Manhattan',
    'cuisine', 'Modern American',
    'cuisine_type', 'Modern American',
    'restaurant_type', 'Test / Demo restaurant',
    'description', 'A permanent SmartTable demonstration restaurant used only for public reservation testing. No real restaurant reservation is created outside the SmartTable test environment.',
    'description_en', 'A permanent SmartTable demonstration restaurant used only for public reservation testing. No real restaurant reservation is created outside the SmartTable test environment.',
    'description_es', 'Un restaurante permanente de demostración de SmartTable usado solo para probar reservas públicas. No se crea ninguna reserva real fuera del entorno de prueba de SmartTable.',
    'description_hu', 'Állandó SmartTable bemutató étterem nyilvános foglalási teszteléshez. A SmartTable tesztkörnyezetén kívül nem jön létre valódi éttermi foglalás.',
    'rating', 4.8,
    'website', 'https://smarttablenyc.com',
    'google_maps_url', 'https://maps.google.com/?q=123+Pilot+Test+Avenue+New+York+NY+10001',
    'latitude', 40.7505,
    'longitude', -73.9934,
    'sort_order', 1,
    'primary_timezone', 'America/New_York',
    'card_image', '/assets/restaurant-hero.png',
    'icon_image', '/assets/restaurant-hero.png',
    'logo_url', '/assets/restaurant-hero.png',
    'hero_image_url', '/assets/restaurant-hero.png',
    'cover_image', '/assets/restaurant-hero.png',
    'price_range', '$$',
    'dress_code', 'Casual',
    'outdoor_seating', true,
    'parking_available', false,
    'kids_friendly', true,
    'pet_friendly', false,
    'wheelchair_accessible', true,
    'capacity', 120,
    'private_room_available', false,
    'opening_hours', '{"mon":[["11:30","14:30"],["17:30","21:30"]],"tue":[["11:30","14:30"],["17:30","21:30"]],"wed":[["11:30","14:30"],["17:30","21:30"]],"thu":[["11:30","14:30"],["17:30","21:30"]],"fri":[["11:30","14:30"],["17:30","22:30"]],"sat":[["12:00","15:00"],["17:00","22:30"]],"sun":[["12:00","15:00"],["17:00","21:00"]]}'::jsonb,
    'opening_hours_json', '{"mon":[["11:30","14:30"],["17:30","21:30"]],"tue":[["11:30","14:30"],["17:30","21:30"]],"wed":[["11:30","14:30"],["17:30","21:30"]],"thu":[["11:30","14:30"],["17:30","21:30"]],"fri":[["11:30","14:30"],["17:30","22:30"]],"sat":[["12:00","15:00"],["17:00","22:30"]],"sun":[["12:00","15:00"],["17:00","21:00"]]}'::jsonb,
    'table_capacity', 120,
    'discount_rules', '{"test_record":true,"public_badge":"Test restaurant - no real reservation"}'::jsonb,
    'settings', '{"test_record":true,"public_badge":"Test restaurant - no real reservation"}'::jsonb,
    'onboarding_status', 'complete',
    'onboarding_completed_at', now(),
    'ai_discount_enabled', false,
    'min_discount_percent', 10,
    'max_discount_percent', 50,
    'target_margin_percent', 65,
    'average_service_minutes', 75,
    'reservation_integration_status', 'manual',
    'reservation_provider', 'internal_test',
    'calendar_planning_enabled', false,
    'visible_on_guest_site', true,
    'accepts_reservation_requests', true,
    'is_test_restaurant', true,
    'status', v_restaurant_status,
    'updated_at', now()
  );

  select
    string_agg(format('%I', a.attname), ', ' order by a.attnum),
    string_agg(
      case
        when a.atttypid = 'jsonb'::regtype then format('($1->%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod))
        else format('($1->>%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod))
      end,
      ', ' order by a.attnum
    ),
    string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
      filter (where a.attname not in ('id', 'created_at'))
  into v_columns, v_values, v_updates
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  where n.nspname = 'public'
    and c.relname = 'restaurants'
    and a.attnum > 0
    and not a.attisdropped
    and coalesce(a.attgenerated, '') = ''
    and coalesce(a.attidentity, '') = ''
    and t.typcategory <> 'A'
    and v_payload ? a.attname;

  execute format(
    'insert into public.restaurants (%s) values (%s) on conflict (id) do update set %s',
    v_columns,
    v_values,
    v_updates
  ) using v_payload;

  for v_i in 1..20 loop
    v_offer_id := ('20000000-0000-4000-8000-000000000' || lpad((200 + v_i)::text, 3, '0'))::uuid;
    v_offer_date := v_today + (((v_i - 1) % 14) + 1);
    v_discount := (array[10, 20, 30, 40, 50])[((v_i - 1) % 5) + 1];
    v_available_tables := (array[6, 8, 10, 12, 14])[((v_i - 1) % 5) + 1];
    v_min_party_size := case when v_i % 3 = 0 then 2 else 1 end;
    v_max_party_size := (array[2, 4, 6, 8])[((v_i - 1) % 4) + 1];
    if v_max_party_size < v_min_party_size then
      v_max_party_size := v_min_party_size;
    end if;

    if v_i % 4 = 1 then
      v_start_time := time '11:30';
      v_end_time := time '13:30';
    elsif v_i % 4 = 2 then
      v_start_time := time '12:30';
      v_end_time := time '14:30';
    elsif v_i % 4 = 3 then
      v_start_time := time '17:30';
      v_end_time := time '19:30';
    else
      v_start_time := time '19:00';
      v_end_time := time '21:00';
    end if;

    v_payload := jsonb_build_object(
      'id', v_offer_id,
      'restaurant_id', v_restaurant_id,
      'title_en', case when extract(isodow from v_offer_date) in (6, 7) then 'Weekend SmartTable Demo Offer ' || v_i else 'Weekday SmartTable Demo Offer ' || v_i end,
      'title_es', case when extract(isodow from v_offer_date) in (6, 7) then 'Oferta demo de fin de semana SmartTable ' || v_i else 'Oferta demo entre semana SmartTable ' || v_i end,
      'title_hu', case when extract(isodow from v_offer_date) in (6, 7) then 'Hétvégi SmartTable demó ajánlat ' || v_i else 'Hétköznapi SmartTable demó ajánlat ' || v_i end,
      'description_en', 'A permanent public demo offer for testing the complete SmartTable reservation workflow.',
      'description_es', 'Una oferta pública permanente de demostración para probar el flujo completo de reservas de SmartTable.',
      'description_hu', 'Állandó nyilvános demó ajánlat a teljes SmartTable foglalási folyamat teszteléséhez.',
      'offer_date', v_offer_date,
      'offer_time', v_start_time,
      'start_time', v_start_time,
      'end_time', v_end_time,
      'available_tables', v_available_tables,
      'reserved_tables', 0,
      'min_party_size', v_min_party_size,
      'max_party_size', v_max_party_size,
      'seat_count', v_available_tables * v_max_party_size,
      'reserved_seats', 0,
      'discount_type', 'percent',
      'discount_value', v_discount,
      'discount_percent', v_discount,
      'redemption_rules', '{"test_record":true}'::jsonb,
      'performance', '{}'::jsonb,
      'source', 'smarttable_permanent_demo_dataset',
      'minimum_spend', null,
      'applies_to_drinks', true,
      'time_limit_minutes', 120,
      'blackout_periods', '[]'::jsonb,
      'combinable', false,
      'custom_terms', '{"test_record":true,"note":"No real reservation is created outside the SmartTable test environment."}'::jsonb,
      'structured_conditions', jsonb_build_object(
        'test_record', true,
        'demo_dataset', 'smarttable_permanent_demo_dataset',
        'min_party_size', v_min_party_size,
        'max_party_size', v_max_party_size
      ),
      'offer_image', '/assets/restaurant-hero.png',
      'is_test_offer', true,
      'status', v_offer_status,
      'updated_at', now()
    );

    select
      string_agg(format('%I', a.attname), ', ' order by a.attnum),
      string_agg(
        case
          when a.atttypid = 'jsonb'::regtype then format('($1->%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod))
          else format('($1->>%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod))
        end,
        ', ' order by a.attnum
      ),
      string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
        filter (where a.attname not in ('id', 'created_at'))
    into v_columns, v_values, v_updates
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public'
      and c.relname = 'offers'
      and a.attnum > 0
      and not a.attisdropped
      and coalesce(a.attgenerated, '') = ''
      and coalesce(a.attidentity, '') = ''
      and t.typcategory <> 'A'
      and v_payload ? a.attname;

    execute format(
      'insert into public.offers (%s) values (%s) on conflict (id) do update set %s',
      v_columns,
      v_values,
      v_updates
    ) using v_payload;
  end loop;

  if v_pending_status is not null then
    for v_i in 1..4 loop
      v_offer_id := ('20000000-0000-4000-8000-000000000' || lpad((200 + v_i)::text, 3, '0'))::uuid;
      v_reservation := jsonb_build_object(
        'id', ('30000000-0000-4000-8000-000000000' || lpad((300 + v_i)::text, 3, '0'))::uuid,
        'reference', case v_i
          when 1 then 'ST-DEMO-PENDING'
          when 2 then 'ST-DEMO-ACCEPTED'
          when 3 then 'ST-DEMO-DECLINED'
          else 'ST-DEMO-COMPLETED'
        end,
        'offer_id', v_offer_id,
        'restaurant_id', v_restaurant_id,
        'guest_name', case v_i
          when 1 then 'SmartTable Demo Pending Guest'
          when 2 then 'SmartTable Demo Accepted Guest'
          when 3 then 'SmartTable Demo Declined Guest'
          else 'SmartTable Demo Completed Guest'
        end,
        'guest_email', case v_i
          when 1 then 'demo.pending@smarttable.test'
          when 2 then 'demo.accepted@smarttable.test'
          when 3 then 'demo.declined@smarttable.test'
          else 'demo.completed@smarttable.test'
        end,
        'guest_phone', '+1 212 555 0199',
        'party_size', case v_i when 4 then 2 else 4 end,
        'notes', 'Production-safe SmartTable demo reservation record.',
        'reservation_date', case when v_i = 4 then v_today - 1 else v_today + v_i end,
        'reservation_time', case when v_i in (1, 3) then time '18:00' else time '12:30' end,
        'source', 'smarttable_demo_dataset',
        'booking_source', 'SMARTTABLE_DEMO',
        'booking_status', case v_i
          when 1 then coalesce(v_pending_status, 'pending')
          when 2 then coalesce(v_accepted_status, v_pending_status)
          when 3 then coalesce(v_declined_status, v_pending_status)
          else coalesce(v_completed_status, v_accepted_status, v_pending_status)
        end,
        'guest_language', 'en',
        'status', case v_i
          when 1 then coalesce(v_pending_status, 'pending')
          when 2 then coalesce(v_accepted_status, v_pending_status)
          when 3 then coalesce(v_declined_status, v_pending_status)
          else coalesce(v_completed_status, v_accepted_status, v_pending_status)
        end,
        'accepted_at', case when v_i in (2, 4) then now() - interval '2 hours' else null end,
        'rejected_at', case when v_i = 3 then now() - interval '1 hour' else null end,
        'completed_at', case when v_i = 4 then now() - interval '30 minutes' else null end,
        'status_changed_at', now(),
        'is_test_reservation', true,
        'test_record', true,
        'modified_at', now(),
        'updated_at', now()
      );

      select
        string_agg(format('%I', a.attname), ', ' order by a.attnum),
        string_agg(
          case
            when a.atttypid = 'jsonb'::regtype then format('($1->%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod))
            else format('($1->>%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod))
          end,
          ', ' order by a.attnum
        ),
        string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
          filter (where a.attname not in ('id', 'created_at'))
      into v_columns, v_values, v_updates
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_type t on t.oid = a.atttypid
      where n.nspname = 'public'
        and c.relname = 'reservations'
        and a.attnum > 0
        and not a.attisdropped
        and coalesce(a.attgenerated, '') = ''
        and coalesce(a.attidentity, '') = ''
        and t.typcategory <> 'A'
        and v_reservation ? a.attname;

      execute format(
        'insert into public.reservations (%s) values (%s) on conflict (id) do update set %s',
        v_columns,
        v_values,
        v_updates
      ) using v_reservation;
    end loop;
  end if;
end $$;

commit;

with demo_restaurant as (
  select r.*
  from public.restaurants r
  where lower(r.name) = lower('SmartTable Test Bistro')
  order by case when r.id = '10000000-0000-4000-8000-000000000123'::uuid then 0 else 1 end
  limit 1
)
select
  'demo_restaurant_exists' as requirement,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as result,
  count(*) as record_count,
  max(id::text) as restaurant_id,
  max(name) as restaurant_name,
  max(status::text) as restaurant_status,
  max(to_jsonb(demo_restaurant)->>'visible_on_guest_site') as visible_on_guest_site,
  max(to_jsonb(demo_restaurant)->>'accepts_reservation_requests') as accepts_reservation_requests,
  max(to_jsonb(demo_restaurant)->>'is_test_restaurant') as is_test_restaurant,
  max(to_jsonb(demo_restaurant)->>'primary_timezone') as primary_timezone
from demo_restaurant;

with demo_restaurant as (
  select id
  from public.restaurants
  where lower(name) = lower('SmartTable Test Bistro')
  order by case when id = '10000000-0000-4000-8000-000000000123'::uuid then 0 else 1 end
  limit 1
),
expected_offers as (
  select ('20000000-0000-4000-8000-000000000' || lpad((200 + n)::text, 3, '0'))::uuid as id
  from generate_series(1, 20) as n
),
demo_offers as (
  select o.*
  from public.offers o
  join demo_restaurant r on r.id = o.restaurant_id
  join expected_offers e on e.id = o.id
)
select
  'demo_offers_exist' as requirement,
  case when count(*) = 20 then 'PASS' else 'FAIL' end as result,
  count(*) as total_demo_offer_count,
  count(*) filter (
    where status = 'active'::public.offer_status
      and offer_date > (now() at time zone 'America/New_York')::date
      and coalesce(available_tables, 0) > coalesce(reserved_tables, 0)
      and coalesce(seat_count, 0) > coalesce(reserved_seats, 0)
  ) as active_future_demo_offer_count,
  min(offer_date) as earliest_offer_date,
  max(offer_date) as latest_offer_date,
  min(available_tables) as min_available_tables,
  max(available_tables) as max_available_tables,
  max(reserved_tables) as max_reserved_tables,
  min(seat_count) as min_seat_count,
  max(seat_count) as max_seat_count,
  max(reserved_seats) as max_reserved_seats
from demo_offers;

with expected_offers as (
  select ('20000000-0000-4000-8000-000000000' || lpad((200 + n)::text, 3, '0'))::uuid as id
  from generate_series(1, 20) as n
)
select
  'public_available_offers_visible' as requirement,
  case when count(*) = 20 then 'PASS' else 'FAIL' end as result,
  count(*) as public_available_offer_count
from public.public_available_offers p
join expected_offers e on e.id = p.offer_id
where lower(p.restaurant_name) = lower('SmartTable Test Bistro');

with demo_restaurant as (
  select id
  from public.restaurants
  where lower(name) = lower('SmartTable Test Bistro')
  order by case when id = '10000000-0000-4000-8000-000000000123'::uuid then 0 else 1 end
  limit 1
)
select
  'demo_reservations_exist' as requirement,
  case when count(*) >= 4 then 'PASS' else 'FAIL' end as result,
  count(*) as demo_reservation_count,
  string_agg(reference || ':' || status::text, ', ' order by reference) as reservation_statuses
from public.reservations rv
join demo_restaurant r on r.id = rv.restaurant_id
where reference in ('ST-DEMO-PENDING', 'ST-DEMO-ACCEPTED', 'ST-DEMO-DECLINED', 'ST-DEMO-COMPLETED');

select
  p.offer_id,
  p.restaurant_id,
  p.restaurant_name,
  p.offer_title,
  p.offer_date,
  p.start_time,
  p.end_time,
  p.available_tables,
  p.available_seats,
  p.max_party_size,
  p.discount_value,
  p.discount_percent
from public.public_available_offers p
where lower(p.restaurant_name) = lower('SmartTable Test Bistro')
order by p.offer_date, p.start_time, p.offer_id;
