-- Restaurant Intelligence expansion:
-- service-time learning, route planning, dining photo rewards,
-- anonymized consumption analytics, trend dashboards, audit logs,
-- and background AI job scaffolding.

alter table public.restaurants
  add column if not exists restaurant_type text,
  add column if not exists service_time_learning_enabled boolean not null default true,
  add column if not exists route_planning_enabled boolean not null default true;

update public.restaurants
set restaurant_type = coalesce(restaurant_type, cuisine_type, cuisine, 'restaurant');

create table if not exists public.ai_service_time_observations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  profile_key text,
  reservation_time timestamptz,
  bill_close_time timestamptz,
  visit_duration_minutes integer check (visit_duration_minutes between 1 and 600),
  party_size integer check (party_size > 0),
  meal_category text,
  time_of_day text,
  day_of_week integer check (day_of_week between 0 and 6),
  customer_feedback_score integer check (customer_feedback_score between 1 and 5),
  source text not null default 'smarttable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_route_plans (
  id uuid primary key default gen_random_uuid(),
  profile_key text,
  user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  start_location text,
  event_location text,
  return_location text,
  reservation_time text,
  transport_mode text not null default 'driving',
  estimated_service_minutes integer,
  estimated_travel_to_restaurant_minutes integer,
  estimated_travel_to_event_minutes integer,
  estimated_return_home_minutes integer,
  parking_buffer_minutes integer,
  weather_buffer_minutes integer,
  estimated_total_minutes integer,
  providers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dining_consumption_uploads (
  id uuid primary key default gen_random_uuid(),
  profile_key text,
  user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  image_url text not null,
  media_type text not null default 'food',
  description text,
  rating numeric(3,1),
  short_review text,
  loyalty_points_awarded integer not null default 0,
  analysis_status text not null default 'queued_for_ai_review',
  ai_labels text[] not null default '{}'::text[],
  food_type text,
  drink_type text,
  cuisine text,
  ingredients text[] not null default '{}'::text[],
  flavor_profile text[] not null default '{}'::text[],
  price_perception text,
  popularity_signal numeric(8,2),
  anonymized_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  points_balance integer not null default 0,
  lifetime_points integer not null default 0,
  tier text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null default 'queued',
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  profile_key text,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  entity_type text,
  entity_id text,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_time_restaurant on public.ai_service_time_observations(restaurant_id, created_at desc);
create index if not exists idx_route_plans_profile on public.ai_route_plans(profile_key, created_at desc);
create index if not exists idx_consumption_restaurant on public.dining_consumption_uploads(restaurant_id, created_at desc);
create index if not exists idx_consumption_labels on public.dining_consumption_uploads using gin(ai_labels);
create index if not exists idx_loyalty_profile on public.loyalty_accounts(profile_key);
create index if not exists idx_ai_jobs_status on public.ai_processing_jobs(status, scheduled_at);
create index if not exists idx_analytics_restaurant on public.analytics_events(restaurant_id, event_type, created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id, created_at desc);

drop trigger if exists loyalty_accounts_set_updated_at on public.loyalty_accounts;
create trigger loyalty_accounts_set_updated_at
before update on public.loyalty_accounts
for each row execute function public.set_updated_at();

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('ai_service_time_title', 'Service time estimate', 'Estimacion de tiempo de servicio', 'text', 'ai'),
  ('ai_route_planner_title', 'Route planner', 'Planificador de ruta', 'text', 'ai'),
  ('ai_route_planner_body', 'Plan home, restaurant, event, and return-home timing with traffic, walking, transit, parking, and weather hooks ready for live providers.', 'Planifica casa, restaurante, evento y regreso con trafico, caminata, transporte, estacionamiento y clima listos para proveedores en vivo.', 'textarea', 'ai'),
  ('ai_consumption_title', 'Dining photo rewards', 'Recompensas por fotos', 'text', 'ai'),
  ('ai_consumption_body', 'Upload food or drink photos, add a short review, and earn loyalty points while helping SmartTable learn dining trends.', 'Sube fotos de comida o bebidas, agrega una resena corta y gana puntos mientras ayudas a SmartTable a aprender tendencias.', 'textarea', 'ai'),
  ('ai_consumption_submit', 'Submit photo intelligence', 'Enviar inteligencia de foto', 'text', 'ai'),
  ('ai_consumption_success', 'Thanks. Loyalty points were added and the photo is queued for AI analysis.', 'Gracias. Se agregaron puntos y la foto queda en cola para analisis de IA.', 'text', 'ai'),
  ('ai_business_intelligence_title', 'Restaurant intelligence', 'Inteligencia del restaurante', 'text', 'ai'),
  ('ai_privacy_note', 'Only aggregated, anonymized analytics are shared with restaurants. Personal behavior is never exposed.', 'Solo se comparten analiticas agregadas y anonimas con restaurantes. El comportamiento personal nunca se expone.', 'textarea', 'ai')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name;

create or replace function public.award_loyalty_points(p_profile_key text, p_points integer, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.loyalty_accounts;
begin
  insert into public.loyalty_accounts(profile_key, user_id, points_balance, lifetime_points)
  values (p_profile_key, p_user_id, greatest(p_points, 0), greatest(p_points, 0))
  on conflict (profile_key) do update set
    points_balance = public.loyalty_accounts.points_balance + greatest(excluded.points_balance, 0),
    lifetime_points = public.loyalty_accounts.lifetime_points + greatest(excluded.lifetime_points, 0),
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

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
        and p_restaurant_id is not null
        and not public.owns_restaurant(p_restaurant_id)
      then false
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
  durations as (
    select avg(visit_duration_minutes)::numeric(10,1) as avg_duration
    from public.ai_service_time_observations o
    where p_restaurant_id is null or o.restaurant_id = p_restaurant_id
  )
  select case
    when not exists (select 1 from access_check where allowed) then jsonb_build_object('error', 'Access denied')
    else jsonb_build_object(
      'restaurant_id', p_restaurant_id,
      'uploads_total', (select count(*) from uploads),
      'photos_total', (select count(*) from uploads where image_url is not null),
      'loyalty_points_awarded', coalesce((select sum(loyalty_points_awarded) from uploads), 0),
      'reservations_total', (select count(*) from public.reservations r where p_restaurant_id is null or r.restaurant_id = p_restaurant_id),
      'followers_total', (select count(*) from public.restaurant_followers rf where rf.notification_enabled = true and (p_restaurant_id is null or rf.restaurant_id = p_restaurant_id)),
      'average_dining_duration', (select avg_duration from durations),
      'satisfaction_score', (
        select round(avg((food_rating + service_rating + ambience_rating)::numeric / 3), 1)
        from public.restaurant_reviews rr
        where rr.status = 'approved'
          and (p_restaurant_id is null or rr.restaurant_id = p_restaurant_id)
      ),
      'top_trends', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count)) from labels), '[]'::jsonb),
      'privacy', 'aggregated_anonymized_no_pii'
    )
  end;
$$;

alter table public.ai_service_time_observations enable row level security;
alter table public.ai_route_plans enable row level security;
alter table public.dining_consumption_uploads enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.ai_processing_jobs enable row level security;
alter table public.analytics_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists service_time_insert_public on public.ai_service_time_observations;
create policy service_time_insert_public on public.ai_service_time_observations
for insert with check (true);

drop policy if exists service_time_select_scoped on public.ai_service_time_observations;
create policy service_time_select_scoped on public.ai_service_time_observations
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists route_plans_insert_public on public.ai_route_plans;
create policy route_plans_insert_public on public.ai_route_plans
for insert with check (true);

drop policy if exists route_plans_select_private on public.ai_route_plans;
create policy route_plans_select_private on public.ai_route_plans
for select using (public.is_admin() or user_id = auth.uid());

drop policy if exists consumption_insert_public on public.dining_consumption_uploads;
create policy consumption_insert_public on public.dining_consumption_uploads
for insert with check (true);

drop policy if exists consumption_select_aggregators on public.dining_consumption_uploads;
create policy consumption_select_aggregators on public.dining_consumption_uploads
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists loyalty_owner on public.loyalty_accounts;
create policy loyalty_owner on public.loyalty_accounts
for select using (public.is_admin() or user_id = auth.uid());

drop policy if exists ai_jobs_admin on public.ai_processing_jobs;
create policy ai_jobs_admin on public.ai_processing_jobs
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists analytics_admin_partner on public.analytics_events;
create policy analytics_admin_partner on public.analytics_events
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists audit_admin on public.audit_logs;
create policy audit_admin on public.audit_logs
for select using (public.is_admin());

grant insert on public.ai_service_time_observations to anon, authenticated;
grant insert on public.ai_route_plans to anon, authenticated;
grant insert on public.dining_consumption_uploads to anon, authenticated;
grant select on public.ai_service_time_observations to authenticated;
grant select on public.dining_consumption_uploads to authenticated;
grant select on public.loyalty_accounts to authenticated;
grant select, insert, update, delete on public.ai_processing_jobs to authenticated;
grant select, insert on public.analytics_events to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant execute on function public.award_loyalty_points(text, integer, uuid) to anon, authenticated;
grant execute on function public.restaurant_intelligence_summary(uuid) to authenticated;
