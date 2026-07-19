-- AI Restaurant Intelligence Platform foundation:
-- preference profiles, interaction learning events, smart discount guardrails,
-- demand forecast scaffolding, and future integration readiness.

alter table public.restaurants
  add column if not exists ai_discount_enabled boolean not null default true,
  add column if not exists min_discount_percent integer not null default 10,
  add column if not exists max_discount_percent integer not null default 30,
  add column if not exists target_margin_percent numeric(5,2) not null default 65,
  add column if not exists average_service_minutes integer not null default 75,
  add column if not exists reservation_integration_status text not null default 'not_connected',
  add column if not exists calendar_planning_enabled boolean not null default false;

update public.restaurants
set
  min_discount_percent = coalesce(min_discount_percent, 10),
  max_discount_percent = greatest(coalesce(max_discount_percent, 30), coalesce(min_discount_percent, 10)),
  target_margin_percent = coalesce(target_margin_percent, 65),
  average_service_minutes = coalesce(average_service_minutes, 75),
  reservation_integration_status = coalesce(reservation_integration_status, 'not_connected');

create table if not exists public.ai_preference_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  guest_email text,
  preferences jsonb not null default '{}'::jsonb,
  budget_per_person numeric(10,2),
  travel_distance_miles numeric(10,2),
  preferred_discount_range text,
  calendar_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_interaction_events (
  id uuid primary key default gen_random_uuid(),
  profile_key text,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  forecast_date date not null default current_date,
  demand_score integer not null default 50,
  suggested_action text not null default 'hold_current_strategy',
  suggested_discount_percent integer,
  confidence text not null default 'directional',
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  status text not null default 'planned',
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'planned',
  permissions jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists idx_ai_preference_profiles_user on public.ai_preference_profiles(user_id);
create index if not exists idx_ai_events_profile on public.ai_interaction_events(profile_key, created_at desc);
create index if not exists idx_ai_events_restaurant on public.ai_interaction_events(restaurant_id, event_type, created_at desc);
create index if not exists idx_ai_demand_forecasts_restaurant on public.ai_demand_forecasts(restaurant_id, forecast_date desc);
create index if not exists idx_restaurant_integrations_restaurant on public.restaurant_integrations(restaurant_id, provider);
create index if not exists idx_calendar_connections_user on public.calendar_connections(user_id, provider);

drop trigger if exists ai_preference_profiles_set_updated_at on public.ai_preference_profiles;
create trigger ai_preference_profiles_set_updated_at
before update on public.ai_preference_profiles
for each row execute function public.set_updated_at();

drop trigger if exists restaurant_integrations_set_updated_at on public.restaurant_integrations;
create trigger restaurant_integrations_set_updated_at
before update on public.restaurant_integrations
for each row execute function public.set_updated_at();

drop trigger if exists calendar_connections_set_updated_at on public.calendar_connections;
create trigger calendar_connections_set_updated_at
before update on public.calendar_connections
for each row execute function public.set_updated_at();

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('ai_concierge_title', 'AI Dining Concierge', 'Concierge gastronomico con IA', 'text', 'ai'),
  ('ai_concierge_body', 'Tell SmartTable what you like. The concierge recommends restaurants, estimates match quality, and protects restaurant margin with smarter discount suggestions.', 'Cuentale a SmartTable tus gustos. El concierge recomienda restaurantes, estima compatibilidad y protege el margen del restaurante con descuentos inteligentes.', 'textarea', 'ai'),
  ('ai_preferences_button', 'Set dining preferences', 'Configurar preferencias', 'text', 'ai'),
  ('ai_recommendations_title', 'Personalized picks for you', 'Recomendaciones para ti', 'text', 'ai'),
  ('ai_recommendations_empty', 'Add your preferences to unlock smarter recommendations.', 'Agrega tus preferencias para activar mejores recomendaciones.', 'textarea', 'ai'),
  ('ai_match_label', 'AI match', 'Compatibilidad IA', 'text', 'ai'),
  ('ai_smart_discount_label', 'Smart discount', 'Descuento inteligente', 'text', 'ai'),
  ('ai_reason_label', 'Why this fits', 'Por que encaja', 'text', 'ai'),
  ('ai_wizard_title', 'Build your dining profile', 'Crea tu perfil gastronomico', 'text', 'ai'),
  ('ai_wizard_save', 'Save preferences', 'Guardar preferencias', 'text', 'ai'),
  ('ai_wizard_saved', 'Your dining preferences were saved.', 'Tus preferencias fueron guardadas.', 'text', 'ai'),
  ('ai_cuisine_preferences_label', 'Cuisine preferences', 'Preferencias de cocina', 'text', 'ai'),
  ('ai_food_interests_label', 'Food interests', 'Intereses de comida', 'text', 'ai'),
  ('ai_drink_preferences_label', 'Drink preferences', 'Preferencias de bebidas', 'text', 'ai'),
  ('ai_atmosphere_label', 'Atmosphere', 'Ambiente', 'text', 'ai'),
  ('ai_budget_label', 'Preferred spend per person', 'Gasto preferido por persona', 'text', 'ai'),
  ('ai_distance_label', 'Preferred travel distance', 'Distancia preferida', 'text', 'ai'),
  ('ai_neighborhoods_label', 'Preferred neighborhoods', 'Barrios preferidos', 'text', 'ai'),
  ('ai_preferred_times_label', 'Preferred reservation times', 'Horarios preferidos', 'text', 'ai'),
  ('ai_preferred_days_label', 'Preferred days', 'Dias preferidos', 'text', 'ai'),
  ('ai_dietary_label', 'Dietary restrictions', 'Restricciones alimentarias', 'text', 'ai'),
  ('ai_favorite_restaurants_label', 'Favorite restaurants', 'Restaurantes favoritos', 'text', 'ai'),
  ('ai_discount_range_label', 'Preferred discount range', 'Rango de descuento preferido', 'text', 'ai'),
  ('ai_calendar_opt_in_label', 'Use calendar signals later when connected', 'Usar senales de calendario cuando este conectado', 'text', 'ai'),
  ('ai_notes_label', 'Extra preferences', 'Preferencias adicionales', 'text', 'ai'),
  ('ai_demand_title', 'AI demand outlook', 'Pronostico de demanda con IA', 'text', 'ai'),
  ('ai_time_planning_title', 'Future time planning', 'Planificacion de tiempo futura', 'text', 'ai'),
  ('ai_time_planning_body', 'Calendar, traffic, walking time, and service duration are modeled for future concierge planning.', 'Calendario, trafico, caminata y duracion del servicio estan modelados para futura planificacion.', 'textarea', 'ai')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name;

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
  coalesce(r.card_image, r.cover_image, '/assets/restaurant-hero.png') as card_image,
  coalesce(r.icon_image, r.card_image, r.cover_image, '/assets/restaurant-hero.png') as icon_image,
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
  ) as highest_discount
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
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved'
  and o.status = 'active'
  and o.offer_date >= current_date
  and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1);

create or replace function public.ai_demand_forecast(p_restaurant_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with access_check as (
    select case
      when auth.role() <> 'service_role'
        and not public.is_admin()
        and not public.owns_restaurant(p_restaurant_id)
      then false
      else true
    end as allowed
  ),
  metrics as (
    select
      r.id as restaurant_id,
      r.name as restaurant_name,
      coalesce(r.views_count, 0) as views_count,
      coalesce(r.min_discount_percent, 10) as min_discount_percent,
      coalesce(r.max_discount_percent, 30) as max_discount_percent,
      (select count(*) from public.reservations rv where rv.restaurant_id = r.id and rv.created_at >= now() - interval '7 days')::integer as reservations_7d,
      (select count(*) from public.reservations rv where rv.restaurant_id = r.id and rv.created_at >= now() - interval '30 days')::integer as reservations_30d,
      (select count(*) from public.offers o where o.restaurant_id = r.id and o.status = 'active')::integer as active_offers,
      (select count(*) from public.restaurant_followers rf where rf.restaurant_id = r.id and rf.notification_enabled = true)::integer as followers
    from public.restaurants r
    where r.id = p_restaurant_id
  ),
  scored as (
    select
      *,
      least(100, greatest(0, 30 + reservations_7d * 12 + active_offers * 6 + least(20, views_count / 5) + least(16, followers * 2)))::integer as demand_score
    from metrics
  )
  select case
    when not exists (select 1 from access_check where allowed) then jsonb_build_object('error', 'Access denied')
    when not exists (select 1 from scored) then jsonb_build_object('error', 'Restaurant not found')
    else (
      select jsonb_build_object(
        'restaurant_id', restaurant_id,
        'restaurant_name', restaurant_name,
        'demand_score', demand_score,
        'suggested_action', case
          when demand_score < 45 then 'increase_visibility_and_offer_discount'
          when demand_score > 78 then 'reduce_discount_and_protect_revenue'
          else 'hold_current_strategy'
        end,
        'suggested_discount_percent', case
          when demand_score < 45 then max_discount_percent
          when demand_score > 78 then min_discount_percent
          else round((min_discount_percent + max_discount_percent)::numeric / 2)::integer
        end,
        'confidence', 'directional',
        'inputs', jsonb_build_object(
          'reservations_7d', reservations_7d,
          'reservations_30d', reservations_30d,
          'active_offers', active_offers,
          'views', views_count,
          'followers', followers
        )
      )
      from scored
    )
  end;
$$;

alter table public.ai_preference_profiles enable row level security;
alter table public.ai_interaction_events enable row level security;
alter table public.ai_demand_forecasts enable row level security;
alter table public.restaurant_integrations enable row level security;
alter table public.calendar_connections enable row level security;

drop policy if exists ai_preference_profiles_owner on public.ai_preference_profiles;
create policy ai_preference_profiles_owner on public.ai_preference_profiles
for all using (public.is_admin() or user_id = auth.uid())
with check (public.is_admin() or user_id = auth.uid() or user_id is null);

drop policy if exists ai_interaction_events_insert_public on public.ai_interaction_events;
create policy ai_interaction_events_insert_public on public.ai_interaction_events
for insert with check (true);

drop policy if exists ai_interaction_events_select_scoped on public.ai_interaction_events;
create policy ai_interaction_events_select_scoped on public.ai_interaction_events
for select using (public.is_admin() or user_id = auth.uid() or public.owns_restaurant(restaurant_id));

drop policy if exists ai_demand_forecasts_scoped on public.ai_demand_forecasts;
create policy ai_demand_forecasts_scoped on public.ai_demand_forecasts
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists restaurant_integrations_scoped on public.restaurant_integrations;
create policy restaurant_integrations_scoped on public.restaurant_integrations
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists calendar_connections_owner on public.calendar_connections;
create policy calendar_connections_owner on public.calendar_connections
for all using (public.is_admin() or user_id = auth.uid())
with check (public.is_admin() or user_id = auth.uid());

grant select on public.public_restaurant_cards to anon, authenticated;
grant select on public.public_available_offers to anon, authenticated;
grant insert on public.ai_interaction_events to anon, authenticated;
grant select, insert, update on public.ai_preference_profiles to authenticated;
grant select on public.ai_interaction_events to authenticated;
grant select, insert, update, delete on public.ai_demand_forecasts to authenticated;
grant select, insert, update, delete on public.restaurant_integrations to authenticated;
grant select, insert, update, delete on public.calendar_connections to authenticated;
grant execute on function public.ai_demand_forecast(uuid) to authenticated;
