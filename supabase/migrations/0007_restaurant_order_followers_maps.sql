-- Adds grouped restaurant ordering, map fields, email-based followers,
-- and editable text for the new guest booking controls.

alter table public.restaurants
  add column if not exists sort_order integer,
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists google_place_id text;

create index if not exists idx_restaurants_sort_order on public.restaurants(sort_order, name);
create index if not exists idx_restaurants_location on public.restaurants(latitude, longitude);

create table if not exists public.restaurant_followers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_email text not null,
  guest_name text,
  notification_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_followers_email_check check (guest_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint restaurant_followers_unique unique (restaurant_id, guest_email)
);

create index if not exists idx_restaurant_followers_restaurant on public.restaurant_followers(restaurant_id, created_at desc);
create index if not exists idx_restaurant_followers_email on public.restaurant_followers(guest_email);

drop trigger if exists restaurant_followers_set_updated_at on public.restaurant_followers;
create trigger restaurant_followers_set_updated_at
before update on public.restaurant_followers
for each row execute function public.set_updated_at();

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('offers_count_label', 'active offers', 'ofertas activas', 'text', 'offers'),
  ('filter_neighborhood_label', 'Neighborhood', 'Barrio', 'text', 'filters'),
  ('filter_cuisine_label', 'Cuisine', 'Cocina', 'text', 'filters'),
  ('filter_discount_label', 'Minimum discount', 'Descuento minimo', 'text', 'filters'),
  ('filter_date_label', 'Date', 'Fecha', 'text', 'filters'),
  ('filter_time_label', 'Time', 'Hora', 'text', 'filters'),
  ('filter_party_size_label', 'Party size', 'Personas', 'text', 'filters'),
  ('filter_restaurant_name_label', 'Restaurant name', 'Nombre del restaurante', 'text', 'filters'),
  ('filter_available_only_label', 'Only available offers', 'Solo ofertas disponibles', 'text', 'filters'),
  ('sort_label', 'Sort', 'Ordenar', 'text', 'filters'),
  ('sort_recommended_label', 'Recommended', 'Recomendado', 'text', 'filters'),
  ('sort_newest_label', 'Newest', 'Mas nuevo', 'text', 'filters'),
  ('sort_highest_discount_label', 'Highest discount', 'Mayor descuento', 'text', 'filters'),
  ('sort_soonest_label', 'Soonest available', 'Mas pronto disponible', 'text', 'filters'),
  ('sort_name_label', 'Restaurant name A-Z', 'Restaurante A-Z', 'text', 'filters'),
  ('sort_admin_order_label', 'Admin custom order', 'Orden del admin', 'text', 'filters'),
  ('view_list_label', 'List', 'Lista', 'text', 'filters'),
  ('view_map_label', 'Map', 'Mapa', 'text', 'filters'),
  ('map_key_missing', 'Google Maps is ready, but the API key is not configured yet.', 'Google Maps esta preparado, pero falta configurar la clave API.', 'text', 'map'),
  ('follow_button', 'Follow restaurant', 'Seguir restaurante', 'text', 'favorites'),
  ('favorite_button', 'Add to favorites', 'Agregar a favoritos', 'text', 'favorites'),
  ('follow_title', 'Follow this restaurant', 'Seguir este restaurante', 'text', 'favorites'),
  ('follow_copy', 'Get notified when this restaurant publishes new Smart Table offers.', 'Recibe avisos cuando este restaurante publique nuevas ofertas en Smart Table.', 'textarea', 'favorites'),
  ('follow_success', 'You are following this restaurant.', 'Ahora sigues este restaurante.', 'text', 'favorites'),
  ('reserve_modal_title', 'Reservation request', 'Solicitud de reserva', 'text', 'forms'),
  ('modal_offer_label', 'Selected offer', 'Oferta seleccionada', 'text', 'forms'),
  ('modal_submit_label', 'Send reservation request', 'Enviar solicitud de reserva', 'text', 'forms'),
  ('modal_cancel_label', 'Cancel', 'Cancelar', 'text', 'forms'),
  ('confirmation_done_label', 'Done', 'Listo', 'text', 'forms'),
  ('reservation_success_title', 'Reservation request sent', 'Solicitud de reserva enviada', 'text', 'forms'),
  ('reservation_success_body', 'Your reservation request has been successfully sent to the restaurant. You will receive a confirmation email shortly at the email address you provided. If your reservation time is very soon, we recommend contacting the restaurant directly at least 30 minutes before your reservation.', 'Tu solicitud de reserva se envio correctamente al restaurante. Recibiras un email de confirmacion en breve en la direccion que proporcionaste. Si la hora de tu reserva es muy pronto, recomendamos contactar directamente al restaurante al menos 30 minutos antes de la reserva.', 'textarea', 'forms')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name;

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
  coalesce(r.card_image, r.cover_image, '/assets/restaurant-hero.png') as card_image,
  coalesce(r.icon_image, r.card_image, r.cover_image, '/assets/restaurant-hero.png') as icon_image,
  o.title_en,
  o.title_es,
  o.description_en as offer_description_en,
  o.description_es as offer_description_es,
  coalesce(o.title_en, 'Discounted table') as offer_title,
  coalesce(o.description_en, '') as offer_description,
  coalesce(o.offer_image, r.card_image, r.cover_image, '/assets/restaurant-hero.png') as offer_image,
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
  o.created_at
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
where r.status = 'approved'
  and o.status = 'active'
  and o.offer_date >= current_date
  and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1);

alter table public.restaurant_followers enable row level security;

drop policy if exists restaurant_followers_insert_public on public.restaurant_followers;
create policy restaurant_followers_insert_public on public.restaurant_followers
for insert with check (true);

drop policy if exists restaurant_followers_select_owner on public.restaurant_followers;
create policy restaurant_followers_select_owner on public.restaurant_followers
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

grant insert on public.restaurant_followers to anon, authenticated;
grant select on public.restaurant_followers to authenticated;
