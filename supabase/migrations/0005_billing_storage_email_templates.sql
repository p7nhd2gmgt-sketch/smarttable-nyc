-- Adds billing preparation, offer images, editable email templates,
-- Supabase Storage setup, and a date/time-aware reservation RPC.

alter table public.restaurants
  add column if not exists billing_plan text not null default 'free',
  add column if not exists monthly_fee numeric(10,2) not null default 0,
  add column if not exists fee_per_booking numeric(10,2) not null default 0,
  add column if not exists billing_status text not null default 'trialing';

alter table public.offers
  add column if not exists offer_image text;

update public.offers
set offer_image = coalesce(offer_image, '/assets/restaurant-hero.png');

do $$ begin
  alter table public.restaurants
    add constraint restaurants_billing_plan_check
    check (billing_plan in ('free', 'monthly', 'per_booking'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.restaurants
    add constraint restaurants_billing_status_check
    check (billing_status in ('trialing', 'active', 'past_due', 'cancelled'));
exception when duplicate_object then null;
end $$;

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('email_guest_received_subject', 'Your Smart Table reservation request was received', 'Recibimos tu solicitud de reserva en Smart Table', 'text', 'email'),
  ('email_guest_received_body', 'Hi {{guest_name}}, we received your reservation request for {{reservation_summary}}. Reference: {{reference}}. The restaurant will review it soon.', 'Hola {{guest_name}}, recibimos tu solicitud para {{reservation_summary}}. Referencia: {{reference}}. El restaurante la revisara pronto.', 'textarea', 'email'),
  ('email_restaurant_new_subject', 'New reservation request from Smart Table', 'Nueva solicitud de reserva de Smart Table', 'text', 'email'),
  ('email_restaurant_new_body', 'New reservation request: {{reservation_summary}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notes: {{notes}}.', 'Nueva solicitud de reserva: {{reservation_summary}}. Cliente: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notas: {{notes}}.', 'textarea', 'email'),
  ('email_admin_new_subject', 'Smart Table admin notice: new reservation request', 'Aviso admin de Smart Table: nueva solicitud de reserva', 'text', 'email'),
  ('email_admin_new_body', 'A new reservation was created for {{restaurant_name}}. {{reservation_summary}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}.', 'Se creo una nueva reserva para {{restaurant_name}}. {{reservation_summary}}. Cliente: {{guest_name}}, {{guest_email}}, {{guest_phone}}.', 'textarea', 'email'),
  ('email_guest_accepted_subject', 'Your reservation was confirmed', 'Tu reserva fue confirmada', 'text', 'email'),
  ('email_guest_accepted_body', 'Good news, {{guest_name}}. {{restaurant_name}} confirmed your reservation: {{reservation_summary}}. Reference: {{reference}}.', 'Buenas noticias, {{guest_name}}. {{restaurant_name}} confirmo tu reserva: {{reservation_summary}}. Referencia: {{reference}}.', 'textarea', 'email'),
  ('email_guest_rejected_subject', 'Your reservation request was not confirmed', 'Tu solicitud de reserva no fue confirmada', 'text', 'email'),
  ('email_guest_rejected_body', 'Hi {{guest_name}}, {{restaurant_name}} could not confirm your reservation request: {{reservation_summary}}. Reference: {{reference}}.', 'Hola {{guest_name}}, {{restaurant_name}} no pudo confirmar tu solicitud: {{reservation_summary}}. Referencia: {{reference}}.', 'textarea', 'email'),
  ('email_guest_cancelled_subject', 'Your reservation was cancelled', 'Tu reserva fue cancelada', 'text', 'email'),
  ('email_guest_cancelled_body', 'Hi {{guest_name}}, your Smart Table reservation was cancelled: {{reservation_summary}}. Reference: {{reference}}.', 'Hola {{guest_name}}, tu reserva de Smart Table fue cancelada: {{reservation_summary}}. Referencia: {{reference}}.', 'textarea', 'email')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'smarttable-media',
  'smarttable-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists smarttable_media_public_read on storage.objects;
create policy smarttable_media_public_read on storage.objects
for select using (bucket_id = 'smarttable-media');

drop policy if exists smarttable_media_partner_insert on storage.objects;
create policy smarttable_media_partner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'smarttable-media'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.owns_restaurant(split_part(name, '/', 1)::uuid)
);

drop policy if exists smarttable_media_partner_update on storage.objects;
create policy smarttable_media_partner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'smarttable-media'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.owns_restaurant(split_part(name, '/', 1)::uuid)
)
with check (
  bucket_id = 'smarttable-media'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.owns_restaurant(split_part(name, '/', 1)::uuid)
);

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
  o.title_en,
  o.title_es,
  o.description_en as offer_description_en,
  o.description_es as offer_description_es,
  coalesce(o.title_en, 'Discounted table') as offer_title,
  coalesce(o.description_en, '') as offer_description,
  coalesce(o.offer_image, r.cover_image, '/assets/restaurant-hero.png') as offer_image,
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
  o.discount_percent
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
where r.status = 'approved'
  and o.status = 'active'
  and o.offer_date >= current_date
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
    and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
  for update;

  if not found then
    raise exception 'Offer is not available.';
  end if;

  v_reservation_date := coalesce(p_reservation_date, v_offer.offer_date);
  v_reservation_time := coalesce(p_reservation_time, v_offer.start_time, v_offer.offer_time);
  v_day := trim(lower(to_char(v_reservation_date, 'dy')));

  if v_reservation_date < current_date then
    raise exception 'Reservation date must be in the future.';
  end if;

  if coalesce(array_length(v_offer.valid_days, 1), 0) > 0
    and not (v_day = any(v_offer.valid_days)) then
    raise exception 'This offer is not valid on the selected day.';
  end if;

  if p_party_size > coalesce(v_offer.max_party_size, 4) then
    raise exception 'Party size exceeds the maximum for this offer.';
  end if;

  if v_offer.start_time is not null
    and v_offer.end_time is not null
    and (v_reservation_time < v_offer.start_time or v_reservation_time > v_offer.end_time) then
    raise exception 'Reservation time is outside this offer window.';
  end if;

  select * into v_restaurant from public.restaurants where id = v_offer.restaurant_id;

  update public.offers
  set
    reserved_tables = coalesce(reserved_tables, 0) + 1,
    reserved_seats = coalesce(reserved_seats, 0) + p_party_size
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
    reservation_date,
    reservation_time,
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
    v_reservation_date,
    v_reservation_time,
    nullif(trim(coalesce(p_notes, '')), ''),
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
    'created_at', v_reservation.created_at,
    'updated_at', v_reservation.updated_at
  );
end;
$$;

grant execute on function public.create_reservation(uuid, text, text, text, integer, date, time, text) to anon, authenticated;
