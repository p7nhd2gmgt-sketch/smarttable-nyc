-- Smart Table SaaS platform expansion:
-- editable site content, bilingual public copy, partner dashboard ownership,
-- expanded restaurant/offer fields, view statistics, and new reservation statuses.

alter table public.restaurants
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists cuisine_type text,
  add column if not exists opening_hours text,
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists cover_image text,
  add column if not exists gallery_images text[] not null default '{}'::text[],
  add column if not exists views_count integer not null default 0;

update public.restaurants
set
  email = coalesce(email, contact_email),
  cuisine_type = coalesce(cuisine_type, cuisine),
  description_en = coalesce(description_en, description),
  description_es = coalesce(description_es, ''),
  cover_image = coalesce(cover_image, '/assets/restaurant-hero.png'),
  gallery_images = case when gallery_images = '{}'::text[] then array['/assets/restaurant-hero.png'] else gallery_images end;

alter table public.offers
  add column if not exists title_en text,
  add column if not exists title_es text,
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists discount_type text not null default 'percent',
  add column if not exists discount_value numeric not null default 20,
  add column if not exists valid_days text[] not null default array['mon','tue','wed','thu','fri','sat','sun'],
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists available_tables integer not null default 1,
  add column if not exists reserved_tables integer not null default 0,
  add column if not exists max_party_size integer not null default 4;

update public.offers
set
  title_en = coalesce(title_en, 'Discounted table'),
  title_es = coalesce(title_es, ''),
  description_en = coalesce(description_en, ''),
  description_es = coalesce(description_es, ''),
  discount_value = coalesce(discount_value, discount_percent),
  start_time = coalesce(start_time, offer_time),
  end_time = coalesce(end_time, (offer_time + interval '2 hours')::time),
  available_tables = greatest(1, ceil(seat_count::numeric / greatest(coalesce(max_party_size, 4), 1))::integer),
  max_party_size = greatest(1, coalesce(max_party_size, 4));

alter table public.reservations
  add column if not exists reservation_date date,
  add column if not exists reservation_time time;

update public.reservations rv
set
  reservation_date = coalesce(rv.reservation_date, o.offer_date),
  reservation_time = coalesce(rv.reservation_time, o.start_time, o.offer_time)
from public.offers o
where o.id = rv.offer_id;

create table if not exists public.site_content (
  key text primary key,
  value_en text not null default '',
  value_es text not null default '',
  content_type text not null default 'text',
  group_name text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_view_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurants_owner_user on public.restaurants(owner_user_id);
create index if not exists idx_offers_restaurant_start on public.offers(restaurant_id, offer_date, start_time);
create index if not exists idx_view_events_restaurant on public.restaurant_view_events(restaurant_id, created_at desc);
create index if not exists idx_site_content_group on public.site_content(group_name, key);

drop trigger if exists site_content_set_updated_at on public.site_content;
create trigger site_content_set_updated_at
before update on public.site_content
for each row execute function public.set_updated_at();

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('seo_title', 'Smarttable.com | Discounted New York restaurant reservations', 'Smarttable.com | Reservas con descuento en restaurantes de Nueva York', 'text', 'seo'),
  ('seo_meta_description', 'Book discounted restaurant tables across New York and get confirmation from the restaurant by email.', 'Reserva mesas con descuento en Nueva York y recibe confirmacion del restaurante por email.', 'textarea', 'seo'),
  ('hero_kicker', 'New York dining deals', 'Ofertas para comer en Nueva York', 'text', 'home'),
  ('hero_title', 'Reserve discounted tables at New York restaurants.', 'Reserva mesas con descuento en restaurantes de Nueva York.', 'text', 'home'),
  ('hero_subtitle', 'Smarttable connects guests with off-peak dining offers, then keeps restaurants and guests in sync with email confirmations.', 'Smarttable conecta a los clientes con ofertas fuera de horas pico y mantiene a restaurantes y clientes informados por email.', 'textarea', 'home'),
  ('company_description', 'Smart Table is a SaaS reservation marketplace for New York restaurants that want to fill open tables with controlled discounts.', 'Smart Table es una plataforma SaaS de reservas para restaurantes de Nueva York que quieren llenar mesas disponibles con descuentos controlados.', 'textarea', 'home'),
  ('marketplace_status_title', 'Marketplace status', 'Estado del marketplace', 'text', 'home'),
  ('marketplace_status_demo', 'Demo mode is active. Connect Supabase environment variables for production storage.', 'El modo demo esta activo. Conecta las variables de Supabase para almacenamiento en produccion.', 'textarea', 'home'),
  ('marketplace_status_live', 'Live Supabase storage is enabled for reservations, offers, users, and content.', 'Supabase esta activo para reservas, ofertas, usuarios y contenido.', 'textarea', 'home'),
  ('offers_kicker', 'Guest booking', 'Reserva de clientes', 'text', 'offers'),
  ('offers_title', 'Available discounted tables', 'Mesas con descuento disponibles', 'text', 'offers'),
  ('offers_empty', 'No active offers yet.', 'Todavia no hay ofertas activas.', 'text', 'offers'),
  ('reserve_button', 'Reserve', 'Reservar', 'text', 'offers'),
  ('guest_name_label', 'Name', 'Nombre', 'text', 'forms'),
  ('guest_email_label', 'Email', 'Email', 'text', 'forms'),
  ('guest_phone_label', 'Phone', 'Telefono', 'text', 'forms'),
  ('party_size_label', 'Party size', 'Personas', 'text', 'forms'),
  ('notes_label', 'Notes', 'Notas', 'text', 'forms'),
  ('about_title', 'About Smart Table', 'Sobre Smart Table', 'text', 'about'),
  ('about_body', 'We help restaurants turn quiet service windows into booked revenue while guests discover better-value tables across New York.', 'Ayudamos a restaurantes a convertir horarios tranquilos en ingresos reservados mientras los clientes descubren mejores mesas en Nueva York.', 'textarea', 'about'),
  ('how_it_works_title', 'How it works', 'Como funciona', 'text', 'about'),
  ('how_it_works_body', 'Restaurants publish discounted table offers, guests request a reservation, and the restaurant accepts or rejects it from the partner dashboard.', 'Los restaurantes publican ofertas con descuento, los clientes solicitan una reserva y el restaurante la acepta o rechaza desde su panel.', 'textarea', 'about'),
  ('restaurants_title', 'For restaurants', 'Para restaurantes', 'text', 'audience'),
  ('restaurants_body', 'Control discounts, table availability, profile content, reservation decisions, and performance from one partner dashboard.', 'Controla descuentos, disponibilidad, perfil, decisiones de reservas y rendimiento desde un solo panel de partner.', 'textarea', 'audience'),
  ('guests_title', 'For guests', 'Para clientes', 'text', 'audience'),
  ('guests_body', 'Find a deal, request a table, and receive email updates when the restaurant reviews your reservation.', 'Encuentra una oferta, solicita una mesa y recibe emails cuando el restaurante revise tu reserva.', 'textarea', 'audience'),
  ('footer_text', 'Smarttable.com serves New York restaurants and guests with discounted reservation technology.', 'Smarttable.com conecta restaurantes y clientes de Nueva York con tecnologia de reservas con descuento.', 'textarea', 'footer'),
  ('banner_image', '/assets/restaurant-hero.png', '/assets/restaurant-hero.png', 'image', 'media'),
  ('nav_offers', 'Offers', 'Ofertas', 'text', 'navigation'),
  ('nav_admin', 'Admin', 'Admin', 'text', 'navigation'),
  ('nav_partner', 'Partner', 'Partner', 'text', 'navigation'),
  ('login_button', 'Login', 'Entrar', 'text', 'navigation'),
  ('logout_button', 'Logout', 'Salir', 'text', 'navigation')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name;

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
        p.role = 'admin'
        or (
          p.role in ('partner', 'restaurant')
          and (
            p.restaurant_id = target_restaurant_id
            or r.owner_user_id = p.id
          )
        )
      )
  );
$$;

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

create or replace view public.reservation_overview as
select
  rv.id as reservation_id,
  rv.reference,
  rv.restaurant_id,
  r.name as restaurant_name,
  coalesce(r.email, r.contact_email) as restaurant_email,
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
    and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
  for update;

  if not found then
    raise exception 'Offer is not available.';
  end if;

  if p_party_size > coalesce(v_offer.max_party_size, 4) then
    raise exception 'Party size exceeds the maximum for this offer.';
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
    v_offer.offer_date,
    coalesce(v_offer.start_time, v_offer.offer_time),
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
  v_result jsonb;
begin
  if p_status not in ('pending', 'accepted', 'rejected', 'cancelled', 'completed') then
    raise exception 'Invalid reservation status.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  if auth.role() <> 'service_role'
    and not public.is_admin()
    and not public.owns_restaurant(v_reservation.restaurant_id) then
    raise exception 'You do not have access to this reservation.';
  end if;

  v_previous_status := v_reservation.status::text;

  update public.reservations
  set status = p_status::public.reservation_status
  where id = p_reservation_id
  returning * into v_reservation;

  if v_previous_status not in ('rejected', 'cancelled')
    and p_status in ('rejected', 'cancelled') then
    update public.offers
    set
      reserved_tables = greatest(coalesce(reserved_tables, 0) - 1, 0),
      reserved_seats = greatest(coalesce(reserved_seats, 0) - coalesce(v_reservation.party_size, 0), 0)
    where id = v_reservation.offer_id;
  end if;

  select to_jsonb(ro.*) into v_result
  from public.reservation_overview ro
  where ro.reservation_id = p_reservation_id;

  return v_result;
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
    'partners_total', (select count(*) from public.profiles where role in ('partner', 'restaurant')),
    'offers_active', (select count(*) from public.offers where status = 'active'),
    'reservations_total', (select count(*) from public.reservations),
    'reservations_pending', (select count(*) from public.reservations where status::text in ('pending', 'requested')),
    'reservations_accepted', (select count(*) from public.reservations where status::text in ('accepted', 'confirmed')),
    'reservations_rejected', (select count(*) from public.reservations where status::text = 'rejected'),
    'seats_reserved', coalesce((select sum(party_size) from public.reservations), 0),
    'views_total', coalesce((select sum(views_count) from public.restaurants), 0)
  );
$$;

create or replace function public.partner_dashboard_stats(p_restaurant_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when auth.role() <> 'service_role'
      and not public.is_admin()
      and not public.owns_restaurant(p_restaurant_id)
    then jsonb_build_object('error', 'Access denied')
    else jsonb_build_object(
      'views', coalesce((select views_count from public.restaurants where id = p_restaurant_id), 0),
      'bookings', (select count(*) from public.reservations where restaurant_id = p_restaurant_id),
      'accepted', (select count(*) from public.reservations where restaurant_id = p_restaurant_id and status::text in ('accepted', 'confirmed')),
      'rejected', (select count(*) from public.reservations where restaurant_id = p_restaurant_id and status::text = 'rejected')
    )
  end;
$$;

create or replace function public.track_restaurant_view(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.restaurant_view_events (restaurant_id)
  select id from public.restaurants
  where id = p_restaurant_id
    and status = 'approved';

  update public.restaurants
  set views_count = views_count + 1
  where id = p_restaurant_id
    and status = 'approved';
end;
$$;

alter table public.site_content enable row level security;
alter table public.restaurant_view_events enable row level security;

drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read on public.site_content
for select using (true);

drop policy if exists site_content_admin_all on public.site_content;
create policy site_content_admin_all on public.site_content
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists restaurants_partner_update on public.restaurants;
create policy restaurants_partner_update on public.restaurants
for update using (public.owns_restaurant(id))
with check (public.owns_restaurant(id));

drop policy if exists restaurant_view_events_insert on public.restaurant_view_events;
create policy restaurant_view_events_insert on public.restaurant_view_events
for insert with check (true);

drop policy if exists restaurant_view_events_select_owner on public.restaurant_view_events;
create policy restaurant_view_events_select_owner on public.restaurant_view_events
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

grant select on public.site_content to anon, authenticated;
grant insert, select on public.restaurant_view_events to anon, authenticated;
grant execute on function public.track_restaurant_view(uuid) to anon, authenticated;
grant execute on function public.partner_dashboard_stats(uuid) to authenticated;
grant execute on function public.update_reservation_status(uuid, text) to authenticated;
