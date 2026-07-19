-- Hungarian i18n support for public content, restaurant/offer copy,
-- reservation language, and user profile language preference.

alter table public.site_content
  add column if not exists value_hu text not null default '';

alter table public.profiles
  add column if not exists preferred_language text not null default 'en';

alter table public.restaurants
  add column if not exists description_hu text not null default '';

alter table public.offers
  add column if not exists title_hu text not null default '',
  add column if not exists description_hu text not null default '';

alter table public.reservations
  add column if not exists guest_language text not null default 'en';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_preferred_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_language_check
      check (preferred_language in ('en', 'es', 'hu'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'reservations_guest_language_check'
  ) then
    alter table public.reservations
      add constraint reservations_guest_language_check
      check (guest_language in ('en', 'es', 'hu'));
  end if;
end $$;

insert into public.site_content (key, value_en, value_es, value_hu, content_type, group_name)
values
  ('brand_title', 'SmartTable AI', 'SmartTable AI', 'SmartTable AI', 'text', 'site'),
  ('brand_subtitle', 'The AI Revenue Operating System for Restaurants', 'El sistema operativo de ingresos con IA para restaurantes', 'AI Revenue Operating System éttermeknek', 'text', 'site'),
  ('nav_offers', 'Offers', 'Ofertas', 'Ajánlatok', 'text', 'site'),
  ('nav_admin', 'Super Admin', 'Super Admin', 'Super Admin', 'text', 'site'),
  ('nav_partner', 'Partner', 'Partner', 'Partner', 'text', 'site'),
  ('login_button', 'Login', 'Entrar', 'Bejelentkezés', 'text', 'auth'),
  ('logout_button', 'Logout', 'Salir', 'Kijelentkezés', 'text', 'auth'),
  ('hero_title', 'The AI Revenue Operating System for Restaurants', 'El sistema operativo de ingresos con IA para restaurantes', 'AI Revenue Operating System éttermeknek', 'text', 'home'),
  ('hero_subtitle', 'Personalized dining for guests, predictive demand intelligence for restaurants, and smarter revenue recovery across New York.', 'Experiencias personalizadas para clientes, inteligencia predictiva de demanda para restaurantes y recuperación inteligente de ingresos en Nueva York.', 'Személyre szabott étteremajánlás vendégeknek, prediktív keresleti intelligencia éttermeknek, okosabb bevétel-visszanyerés New Yorkban.', 'textarea', 'home'),
  ('offers_title', 'Available discounted tables', 'Mesas con descuento disponibles', 'Elérhető kedvezményes asztalok', 'text', 'offers'),
  ('reserve_button', 'Reserve', 'Reservar', 'Foglalás', 'text', 'offers'),
  ('reservation_success_title', 'Reservation request sent', 'Solicitud de reserva enviada', 'Foglalási kérelem elküldve', 'text', 'forms'),
  ('reservation_success_body', 'Your reservation request has been successfully sent to the restaurant. You will receive a confirmation email shortly at the email address you provided. If your reservation time is very soon, we recommend contacting the restaurant directly at least 30 minutes before your reservation.', 'Tu solicitud de reserva se envió correctamente al restaurante. Recibirás un email de confirmación en breve en la dirección que proporcionaste. Si la hora de tu reserva es muy pronto, recomendamos contactar directamente al restaurante al menos 30 minutos antes de la reserva.', 'A foglalási kérelmedet sikeresen elküldtük az étteremnek. Hamarosan visszaigazoló emailt kapsz a megadott email címre. Ha a foglalási időpont nagyon közeli, javasoljuk, hogy legalább 30 perccel a foglalás előtt közvetlenül is vedd fel a kapcsolatot az étteremmel.', 'textarea', 'forms'),
  ('email_guest_received_subject', 'Your Smart Table reservation request was received', 'Recibimos tu solicitud de reserva en Smart Table', 'Megkaptuk a SmartTable foglalási kérelmedet', 'text', 'emails'),
  ('email_guest_received_body', 'Hi {{guest_name}}, we received your reservation request for {{reservation_summary}}. Reference: {{reference}}.', 'Hola {{guest_name}}, recibimos tu solicitud para {{reservation_summary}}. Referencia: {{reference}}.', 'Szia {{guest_name}}, megkaptuk a foglalási kérelmedet: {{reservation_summary}}. Hivatkozás: {{reference}}.', 'textarea', 'emails'),
  ('email_restaurant_new_subject', 'New reservation request from Smart Table', 'Nueva solicitud de reserva de Smart Table', 'Új foglalási kérelem érkezett a SmartTable-től', 'text', 'emails'),
  ('email_restaurant_new_body', 'New reservation request: {{reservation_summary}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notes: {{notes}}.', 'Nueva solicitud de reserva: {{reservation_summary}}. Cliente: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notas: {{notes}}.', 'Új foglalási kérelem: {{reservation_summary}}. Vendég: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Megjegyzés: {{notes}}.', 'textarea', 'emails'),
  ('email_guest_accepted_subject', 'Your reservation was confirmed', 'Tu reserva fue confirmada', 'A foglalásodat visszaigazolták', 'text', 'emails'),
  ('email_guest_rejected_subject', 'Your reservation request was not confirmed', 'Tu solicitud de reserva no fue confirmada', 'A foglalási kérelmedet nem tudták visszaigazolni', 'text', 'emails'),
  ('post_visit_notification_title', 'How was {{restaurant_name}}?', '¿Cómo estuvo {{restaurant_name}}?', 'Milyen volt: {{restaurant_name}}?', 'text', 'notifications'),
  ('post_visit_notification_message', 'Rate your visit and upload dining photos to earn extra SmartTable points.', 'Valora tu visita y sube fotos para ganar puntos SmartTable extra.', 'Értékeld a látogatást és tölts fel fotókat extra SmartTable pontokért.', 'textarea', 'notifications'),
  ('post_visit_notification_cta', 'Earn points', 'Ganar puntos', 'Pontok gyűjtése', 'text', 'notifications')
on conflict (key) do update set
  value_hu = excluded.value_hu,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();

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
  r.description_hu as restaurant_description_hu
from public.restaurants r
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved';

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
  o.description_en as offer_description_en,
  o.description_es as offer_description_es,
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
  r.description_hu as restaurant_description_hu,
  o.title_hu,
  o.description_hu as offer_description_hu
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
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
  rv.partner_notes,
  rv.status,
  rv.created_at,
  rv.updated_at,
  rv.guest_language,
  coalesce(p.preferred_language, 'en') as restaurant_language
from public.reservations rv
join public.offers o on o.id = rv.offer_id
join public.restaurants r on r.id = rv.restaurant_id
left join public.profiles p on p.id = r.owner_user_id;

grant select on public.public_restaurant_cards to anon, authenticated;
grant select on public.public_available_offers to anon, authenticated;
grant select on public.reservation_overview to authenticated;
