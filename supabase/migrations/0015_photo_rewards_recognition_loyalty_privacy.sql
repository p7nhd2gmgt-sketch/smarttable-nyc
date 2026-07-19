-- Dining Photo Rewards expansion: explicit AI recognition placeholders,
-- loyalty badge-ready fields, anonymized trend analytics, and consent copy.

alter table public.dining_consumption_uploads
  add column if not exists liked_highlight text,
  add column if not exists detected_dish text,
  add column if not exists detected_drink text,
  add column if not exists cuisine_category text,
  add column if not exists presentation_score numeric(5,2),
  add column if not exists image_recognition_status text not null default 'placeholder_ready_for_ai_image_recognition';

create index if not exists idx_consumption_detected_dish on public.dining_consumption_uploads(detected_dish);
create index if not exists idx_consumption_detected_drink on public.dining_consumption_uploads(detected_drink);

create or replace function public.restaurant_intelligence_summary(p_restaurant_id uuid default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with access_check as (
    select case
      when auth.role() <> 'service_role'
        and not public.is_admin()
        and p_restaurant_id is null
      then false
      else true
    end as allowed
  ),
  uploads as (
    select *
    from public.dining_consumption_uploads dcu
    where p_restaurant_id is null or dcu.restaurant_id = p_restaurant_id
  ),
  labels as (
    select label, count(*)::integer as count
    from uploads u, unnest(u.ai_labels) as label
    group by label
    order by count(*) desc, label asc
    limit 10
  ),
  dishes as (
    select coalesce(detected_dish, food_type) as label, count(*)::integer as count
    from uploads
    where coalesce(detected_dish, food_type) is not null
    group by coalesce(detected_dish, food_type)
    order by count(*) desc, label asc
    limit 10
  ),
  drinks as (
    select coalesce(detected_drink, drink_type) as label, count(*)::integer as count
    from uploads
    where coalesce(detected_drink, drink_type) is not null
    group by coalesce(detected_drink, drink_type)
    order by count(*) desc, label asc
    limit 10
  ),
  ingredients as (
    select ingredient as label, count(*)::integer as count
    from uploads u, unnest(u.ingredients) as ingredient
    group by ingredient
    order by count(*) desc, label asc
    limit 10
  ),
  flavors as (
    select flavor as label, count(*)::integer as count
    from uploads u, unnest(u.flavor_profile) as flavor
    group by flavor
    order by count(*) desc, label asc
    limit 10
  ),
  highly_rated as (
    select coalesce(detected_dish, food_type, detected_drink, drink_type, media_type) as label, count(*)::integer as count
    from uploads
    where rating >= 4.5
      and coalesce(detected_dish, food_type, detected_drink, drink_type, media_type) is not null
    group by coalesce(detected_dish, food_type, detected_drink, drink_type, media_type)
    order by count(*) desc, label asc
    limit 10
  ),
  durations as (
    select avg(visit_duration_minutes)::numeric(10,1) as avg_duration
    from public.ai_service_time_observations o
    where p_restaurant_id is null or o.restaurant_id = p_restaurant_id
  ),
  review_satisfaction as (
    select round(avg((food_rating + service_rating + ambience_rating)::numeric / 3), 1) as score
    from public.restaurant_reviews rr
    where rr.status = 'approved'
      and (p_restaurant_id is null or rr.restaurant_id = p_restaurant_id)
  ),
  upload_satisfaction as (
    select round(avg(rating), 1) as score
    from uploads
    where rating is not null
  )
  select case
    when not exists (select 1 from access_check where allowed) then jsonb_build_object('error', 'Access denied')
    else jsonb_build_object(
      'restaurant_id', p_restaurant_id,
      'uploads_total', (select count(*) from uploads),
      'photos_total', (select count(*) from uploads where image_url is not null),
      'uploaded_photo_count', (select count(*) from uploads where image_url is not null),
      'loyalty_points_awarded', coalesce((select sum(loyalty_points_awarded) from uploads), 0),
      'reservations_total', (select count(*) from public.reservations r where p_restaurant_id is null or r.restaurant_id = p_restaurant_id),
      'followers_total', (select count(*) from public.restaurant_followers rf where rf.notification_enabled = true and (p_restaurant_id is null or rf.restaurant_id = p_restaurant_id)),
      'average_dining_duration', (select avg_duration from durations),
      'satisfaction_score', coalesce((select score from review_satisfaction), (select score from upload_satisfaction)),
      'upload_satisfaction_score', (select score from upload_satisfaction),
      'top_trends', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from labels), '[]'::jsonb),
      'top_dishes', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from dishes), '[]'::jsonb),
      'fastest_growing_dishes', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from dishes), '[]'::jsonb),
      'most_uploaded_drinks', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from drinks), '[]'::jsonb),
      'most_photographed_foods', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from dishes), '[]'::jsonb),
      'popular_ingredients', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from ingredients), '[]'::jsonb),
      'flavor_profiles', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from flavors), '[]'::jsonb),
      'highest_rated_menu_categories', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from highly_rated), '[]'::jsonb),
      'value_perception_signals', 'Aggregated value-perception signal placeholder',
      'image_recognition_status', 'placeholder_ready_for_future_ai',
      'privacy', 'aggregated_anonymized_no_pii'
    )
  end;
$$;

grant execute on function public.restaurant_intelligence_summary(uuid) to anon, authenticated;

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('ai_consumption_kicker', 'SmartTable loyalty', 'Lealtad SmartTable', 'text', 'ai'),
  ('photo_type_label', 'Food or drink type', 'Tipo de comida o bebida', 'text', 'ai'),
  ('photo_type_food', 'Food', 'Comida', 'text', 'ai'),
  ('photo_type_drink', 'Drink', 'Bebida', 'text', 'ai'),
  ('photo_type_dessert', 'Dessert', 'Postre', 'text', 'ai'),
  ('photo_type_menu', 'Menu item', 'Plato del menu', 'text', 'ai'),
  ('photo_upload_label', 'Photo upload', 'Subir foto', 'text', 'ai'),
  ('photo_url_label', 'Optional image URL', 'URL de imagen opcional', 'text', 'ai'),
  ('photo_url_placeholder', 'Optional image URL', 'URL de imagen opcional', 'text', 'ai'),
  ('photo_description_label', 'Description', 'Descripcion', 'text', 'ai'),
  ('photo_description_placeholder', 'Steak, sushi, cocktail, pasta...', 'Carne, sushi, coctel, pasta...', 'text', 'ai'),
  ('photo_short_review_label', 'Short review', 'Resena corta', 'text', 'ai'),
  ('photo_short_review_placeholder', 'A quick note about the dish or drink', 'Una nota breve sobre el plato o bebida', 'text', 'ai'),
  ('photo_liked_label', 'What did you like?', 'Que te gusto?', 'text', 'ai'),
  ('photo_liked_placeholder', 'Texture, flavor, service moment, presentation...', 'Textura, sabor, servicio, presentacion...', 'text', 'ai'),
  ('consumer_uploaded_photo_count', 'Uploaded photo count', 'Fotos subidas', 'text', 'ai'),
  ('consumer_no_trends_yet', 'No trend data yet', 'Aun no hay datos de tendencias', 'text', 'ai'),
  ('photo_points_label', 'Photo points', 'Puntos por fotos', 'text', 'ai'),
  ('average_duration_label', 'Avg duration', 'Duracion media', 'text', 'ai'),
  ('loyalty_points_label', 'points', 'puntos', 'text', 'ai'),
  ('photo_labels_label', 'labels', 'etiquetas', 'text', 'ai'),
  ('consent_uses_permission', 'SmartTable only uses this data with your permission.', 'SmartTable solo usa estos datos con tu permiso.', 'textarea', 'privacy'),
  ('consent_restaurants_aggregated', 'Restaurants only see aggregated and anonymized analytics.', 'Los restaurantes solo ven analiticas agregadas y anonimizadas.', 'textarea', 'privacy'),
  ('consent_personal_never_shared', 'Personal behavior is never shared with restaurants.', 'El comportamiento personal nunca se comparte con restaurantes.', 'textarea', 'privacy'),
  ('loyalty_kicker', 'Loyalty gamification', 'Gamificacion de lealtad', 'text', 'ai'),
  ('loyalty_title', 'Points and badge progress', 'Puntos y progreso de insignias', 'text', 'ai'),
  ('loyalty_points_balance', 'Points', 'Puntos', 'text', 'ai'),
  ('loyalty_lifetime_points', 'Lifetime points', 'Puntos acumulados', 'text', 'ai'),
  ('loyalty_unlocked_badges', 'Unlocked badges', 'Insignias desbloqueadas', 'text', 'ai'),
  ('loyalty_badge_food_explorer', 'Food Explorer', 'Explorador gastronomico', 'text', 'ai'),
  ('loyalty_badge_steak_master', 'Steak Master', 'Maestro de carne', 'text', 'ai'),
  ('loyalty_badge_sushi_hunter', 'Sushi Hunter', 'Cazador de sushi', 'text', 'ai'),
  ('loyalty_badge_wine_lover', 'Wine Lover', 'Amante del vino', 'text', 'ai'),
  ('loyalty_badge_cocktail_expert', 'Cocktail Expert', 'Experto en cocteles', 'text', 'ai'),
  ('loyalty_badge_nyc_food_hunter', 'NYC Food Hunter', 'Cazador gastronomico de NYC', 'text', 'ai'),
  ('loyalty_badge_trend_spotter', 'Trend Spotter', 'Detector de tendencias', 'text', 'ai'),
  ('recognition_kicker', 'AI image recognition', 'Reconocimiento de imagen IA', 'text', 'ai'),
  ('recognition_title', 'Future-ready recognition placeholder', 'Placeholder preparado para reconocimiento futuro', 'text', 'ai'),
  ('recognition_detected_dish', 'Detected dish', 'Plato detectado', 'text', 'ai'),
  ('recognition_detected_drink', 'Detected drink', 'Bebida detectada', 'text', 'ai'),
  ('recognition_cuisine_category', 'Cuisine category', 'Categoria de cocina', 'text', 'ai'),
  ('recognition_ingredients', 'Ingredients', 'Ingredientes', 'text', 'ai'),
  ('recognition_flavor_profile', 'Flavor profile', 'Perfil de sabor', 'text', 'ai'),
  ('recognition_presentation_score', 'Presentation score', 'Puntaje de presentacion', 'text', 'ai'),
  ('recognition_popularity_signal', 'Popularity signal', 'Senal de popularidad', 'text', 'ai'),
  ('recognition_note', 'Placeholder values are stored now and can later be replaced by live AI image recognition.', 'Los valores placeholder se guardan ahora y luego pueden reemplazarse con reconocimiento de imagen IA en vivo.', 'textarea', 'ai')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
