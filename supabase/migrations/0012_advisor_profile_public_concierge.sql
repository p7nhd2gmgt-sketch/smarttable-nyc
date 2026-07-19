-- AI Advisor, richer restaurant profiles, premium public restaurant layout,
-- expanded guest concierge preferences, and event dining planner CMS keys.

alter table public.restaurants
  add column if not exists logo_url text,
  add column if not exists hero_image_url text,
  add column if not exists menu_pdf_url text,
  add column if not exists price_range text,
  add column if not exists dress_code text,
  add column if not exists outdoor_seating boolean not null default false,
  add column if not exists parking_available boolean not null default false,
  add column if not exists kids_friendly boolean not null default false,
  add column if not exists pet_friendly boolean not null default false,
  add column if not exists wheelchair_accessible boolean not null default false,
  add column if not exists payment_methods text[] not null default '{}'::text[],
  add column if not exists chef_name text,
  add column if not exists year_opened integer,
  add column if not exists capacity integer,
  add column if not exists private_room_available boolean not null default false;

update public.restaurants
set
  logo_url = coalesce(logo_url, icon_image, card_image, cover_image),
  hero_image_url = coalesce(hero_image_url, cover_image, card_image),
  price_range = coalesce(price_range, '$$');

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
  r.gallery_images
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
  r.gallery_images
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved'
  and o.status = 'active'
  and o.offer_date >= current_date
  and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1);

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('advisor_name', 'SmartTable AI Advisor', 'Asesor IA de SmartTable', 'text', 'ai'),
  ('advisor_placeholder', 'Ask about demand, discounts, offers...', 'Pregunta sobre demanda, descuentos, ofertas...', 'text', 'ai'),
  ('advisor_send', 'Send', 'Enviar', 'text', 'ai'),
  ('advisor_typing', 'SmartTable is thinking...', 'SmartTable esta pensando...', 'text', 'ai'),
  ('advisor_future_note', 'Demo advisor now. OpenAI/API integration layer is prepared for later.', 'Asesor demo por ahora. La capa OpenAI/API esta preparada para despues.', 'textarea', 'ai'),
  ('restaurant_details_button', 'View details', 'Ver detalles', 'text', 'restaurant_detail'),
  ('restaurant_detail_kicker', 'Restaurant profile', 'Perfil del restaurante', 'text', 'restaurant_detail'),
  ('restaurant_ai_match_copy', 'SmartTable compares your preferences, location, quality signals, and available offers for this match.', 'SmartTable compara tus preferencias, ubicacion, calidad y ofertas disponibles para esta coincidencia.', 'textarea', 'restaurant_detail'),
  ('active_offers_label', 'Active offers', 'Ofertas activas', 'text', 'restaurant_detail'),
  ('restaurant_offers_title', 'Available tables', 'Mesas disponibles', 'text', 'restaurant_detail'),
  ('offer_default_title', 'SmartTable offer', 'Oferta SmartTable', 'text', 'restaurant_detail'),
  ('tables_left_label', 'tables left', 'mesas disponibles', 'text', 'restaurant_detail'),
  ('max_party_label', 'Max party', 'Grupo maximo', 'text', 'restaurant_detail'),
  ('business_hours_label', 'Business hours', 'Horario', 'text', 'restaurant_detail'),
  ('chef_name_label', 'Chef', 'Chef', 'text', 'restaurant_detail'),
  ('year_opened_label', 'Year opened', 'Ano de apertura', 'text', 'restaurant_detail'),
  ('capacity_label', 'Capacity', 'Capacidad', 'text', 'restaurant_detail'),
  ('dress_code_label', 'Dress code', 'Codigo de vestimenta', 'text', 'restaurant_detail'),
  ('amenities_title', 'Amenities', 'Comodidades', 'text', 'restaurant_detail'),
  ('amenities_empty', 'Amenities will appear here soon.', 'Las comodidades apareceran pronto.', 'text', 'restaurant_detail'),
  ('amenity_outdoor', 'Outdoor seating', 'Asientos al aire libre', 'text', 'restaurant_detail'),
  ('amenity_parking', 'Parking available', 'Estacionamiento disponible', 'text', 'restaurant_detail'),
  ('amenity_kids', 'Kids friendly', 'Apto para ninos', 'text', 'restaurant_detail'),
  ('amenity_pets', 'Pet friendly', 'Apto para mascotas', 'text', 'restaurant_detail'),
  ('amenity_accessible', 'Wheelchair accessible', 'Accesible en silla de ruedas', 'text', 'restaurant_detail'),
  ('amenity_private_room', 'Private room', 'Salon privado', 'text', 'restaurant_detail'),
  ('menu_link_label', 'View menu', 'Ver menu', 'text', 'restaurant_detail'),
  ('directions_link_label', 'Map / directions', 'Mapa / direcciones', 'text', 'restaurant_detail'),
  ('gallery_title', 'Gallery', 'Galeria', 'text', 'restaurant_detail'),
  ('restaurant_gallery_title', 'Dining room and dishes', 'Salon y platos', 'text', 'restaurant_detail'),
  ('reviews_title', 'Reviews', 'Resenas', 'text', 'restaurant_detail'),
  ('rating_summary_title', 'Rating summary', 'Resumen de calificaciones', 'text', 'restaurant_detail'),
  ('ai_walking_tolerance_label', 'Walking distance tolerance', 'Tolerancia de distancia caminando', 'text', 'ai'),
  ('ai_time_windows_label', 'Preferred time windows', 'Ventanas horarias preferidas', 'text', 'ai'),
  ('ai_occasion_label', 'Occasion', 'Ocasion', 'text', 'ai'),
  ('ai_parking_required_label', 'Parking required', 'Estacionamiento requerido', 'text', 'ai'),
  ('ai_subway_preferred_label', 'Subway preferred', 'Metro preferido', 'text', 'ai'),
  ('ai_kids_friendly_label', 'Kids friendly', 'Apto para ninos', 'text', 'ai'),
  ('ai_outdoor_seating_label', 'Outdoor seating', 'Asientos al aire libre', 'text', 'ai'),
  ('ai_travel_estimate_label', 'Travel estimate', 'Estimacion de viaje', 'text', 'ai'),
  ('ai_best_time_label', 'Best time', 'Mejor hora', 'text', 'ai'),
  ('ai_why_recommended_label', 'Why recommended', 'Por que recomendado', 'text', 'ai'),
  ('event_planner_kicker', 'Program + dining planner', 'Planificador de programa + cena', 'text', 'ai'),
  ('event_planner_title', 'Plan around an event', 'Planear alrededor de un evento', 'text', 'ai'),
  ('event_planner_body', 'Tell SmartTable about a show, meeting, game, or family event and get a dining window with travel and buffer time.', 'Cuenta a SmartTable sobre un show, reunion, partido o evento familiar y recibe una ventana para comer con viaje y margen.', 'textarea', 'ai'),
  ('event_name_label', 'Event name', 'Nombre del evento', 'text', 'ai'),
  ('event_location_label', 'Event location', 'Ubicacion del evento', 'text', 'ai'),
  ('event_start_label', 'Event start time', 'Inicio del evento', 'text', 'ai'),
  ('event_end_label', 'Event end time', 'Fin del evento', 'text', 'ai'),
  ('event_dinner_timing_label', 'Dinner timing', 'Momento de cena', 'text', 'ai'),
  ('event_before_label', 'Before event', 'Antes del evento', 'text', 'ai'),
  ('event_after_label', 'After event', 'Despues del evento', 'text', 'ai'),
  ('event_transport_label', 'Transportation preference', 'Preferencia de transporte', 'text', 'ai'),
  ('event_max_travel_label', 'Maximum travel time', 'Tiempo maximo de viaje', 'text', 'ai'),
  ('event_restaurant_label', 'Preferred restaurant', 'Restaurante preferido', 'text', 'ai'),
  ('event_plan_button', 'Create event dining plan', 'Crear plan de cena', 'text', 'ai'),
  ('event_recommended_window', 'Recommended dining window', 'Ventana recomendada', 'text', 'ai'),
  ('event_suggested_restaurant', 'Suggested restaurant', 'Restaurante sugerido', 'text', 'ai'),
  ('event_estimated_travel', 'Estimated travel', 'Viaje estimado', 'text', 'ai'),
  ('event_buffer_time', 'Buffer time', 'Tiempo de margen', 'text', 'ai'),
  ('event_future_integrations', 'Prepared for Google Calendar and Google Maps integration.', 'Preparado para integracion con Google Calendar y Google Maps.', 'textarea', 'ai'),
  ('event_plan_created', 'Event dining plan created.', 'Plan de cena creado.', 'text', 'ai')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
