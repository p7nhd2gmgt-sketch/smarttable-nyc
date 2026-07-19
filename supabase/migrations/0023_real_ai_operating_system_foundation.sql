-- SmartTable real AI Restaurant Operating System foundation.
-- This migration keeps existing MVP tables and adds the production pipeline
-- needed for recommendations, approval-based AI actions, integrations,
-- imported reservation data, snapshots, logs, and feature status labels.

alter table public.restaurants
  add column if not exists weak_hours jsonb not null default '[]'::jsonb,
  add column if not exists table_capacity integer,
  add column if not exists discount_rules jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_status text not null default 'incomplete',
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists primary_timezone text not null default 'America/New_York';

alter table public.offers
  add column if not exists redemption_rules jsonb not null default '{}'::jsonb,
  add column if not exists performance jsonb not null default '{}'::jsonb,
  add column if not exists source text not null default 'manual',
  add column if not exists ai_recommendation_id uuid;

alter table public.reservations
  add column if not exists source text not null default 'smarttable',
  add column if not exists external_reservation_id text,
  add column if not exists reservation_end_time timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists modified_at timestamptz;

create table if not exists public.restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'owner' check (role in ('owner', 'manager', 'staff', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, email)
);

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null unique,
  full_name text,
  phone text,
  status text not null default 'active' check (status in ('active', 'blocked', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  profile_key text not null unique,
  preferences jsonb not null default '{}'::jsonb,
  dietary_restrictions text[] not null default '{}'::text[],
  favorite_cuisines text[] not null default '{}'::text[],
  preferred_neighborhoods text[] not null default '{}'::text[],
  consent jsonb not null default '{}'::jsonb,
  total_points integer not null default 0,
  lifetime_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_type text not null default 'lead' check (source_type in ('lead', 'direct_booking', 'imported', 'integration')),
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'planned')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, source_type)
);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recommendation_type text not null default 'demand_recovery',
  status text not null default 'pending_approval' check (status in ('draft', 'pending_approval', 'viewed', 'approved', 'rejected', 'expired', 'measured')),
  demand_score integer check (demand_score between 0 and 100),
  recommended_discount integer check (recommended_discount between 0 and 90),
  recommended_start_time time,
  recommended_end_time time,
  recommended_date date,
  recommended_action text,
  marketing_action text,
  expected_bookings numeric(10,2),
  expected_revenue_lift numeric(12,2),
  confidence_score integer check (confidence_score between 0 and 100),
  explanation jsonb not null default '{}'::jsonb,
  data_used jsonb not null default '{}'::jsonb,
  missing_data jsonb not null default '[]'::jsonb,
  model_version text not null default 'rules-v1',
  source text not null default 'smarttable_rules',
  expires_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  action_type text not null,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'rejected', 'executing', 'completed', 'failed', 'measured')),
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  executed_at timestamptz,
  measured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_action_results (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.ai_actions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  metric_window_start timestamptz,
  metric_window_end timestamptz,
  bookings_generated integer not null default 0,
  guests_generated integer not null default 0,
  revenue_recovered numeric(12,2) not null default 0,
  conversion_rate numeric(6,2),
  notes text,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  action_id uuid references public.ai_actions(id) on delete set null,
  campaign_type text not null default 'favorite_guest_email',
  audience text not null default 'followers',
  status text not null default 'draft' check (status in ('draft', 'queued', 'sent', 'cancelled', 'failed')),
  subject text,
  message text not null,
  channel text not null default 'email',
  sent_count integer not null default 0,
  open_count integer not null default 0,
  click_count integer not null default 0,
  booking_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  event_type text not null,
  recipient text not null,
  subject text not null,
  provider text not null default 'resend',
  provider_id text,
  delivery_status text not null default 'queued',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  profile_key text,
  notification_type text not null,
  title text not null,
  message text not null,
  channel text not null default 'in_app',
  status text not null default 'queued',
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.guest_feedback (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  guest_email text,
  overall_rating integer check (overall_rating between 1 and 5),
  food_rating integer check (food_rating between 1 and 5),
  service_rating integer check (service_rating between 1 and 5),
  ambience_rating integer check (ambience_rating between 1 and 5),
  review text,
  ordered_items text,
  would_recommend boolean,
  would_return boolean,
  photo_urls text[] not null default '{}'::text[],
  ai_insights jsonb not null default '{}'::jsonb,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  category text not null check (category in ('reservation', 'calendar', 'maps', 'weather', 'events', 'email', 'sms')),
  display_name text not null,
  status text not null default 'planned' check (status in ('planned', 'beta', 'live', 'disabled')),
  required_scopes text[] not null default '{}'::text[],
  config_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'needs_reauth', 'syncing', 'error', 'disabled')),
  external_account_id text,
  access_token_ref text,
  refresh_token_ref text,
  settings jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.imported_reservations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.integration_connections(id) on delete set null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  external_reservation_id text not null,
  guest_external_id text,
  guest_name text,
  guest_email text,
  guest_phone text,
  party_size integer,
  reservation_start timestamptz,
  reservation_end timestamptz,
  status text,
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (provider, external_reservation_id)
);

create table if not exists public.imported_guests (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.integration_connections(id) on delete set null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null,
  external_guest_id text not null,
  email text,
  full_name text,
  phone text,
  visits_count integer,
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (provider, external_guest_id)
);

create table if not exists public.demand_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  service_date date not null default current_date,
  time_window text,
  demand_score integer check (demand_score between 0 and 100),
  expected_bookings numeric(10,2),
  expected_guests numeric(10,2),
  inputs jsonb not null default '{}'::jsonb,
  source text not null default 'smarttable',
  created_at timestamptz not null default now()
);

create table if not exists public.revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  service_date date not null default current_date,
  revenue_without_ai numeric(12,2),
  revenue_with_ai numeric(12,2),
  recovered_revenue numeric(12,2),
  discount_cost numeric(12,2),
  bookings_generated integer,
  inputs jsonb not null default '{}'::jsonb,
  source text not null default 'smarttable',
  created_at timestamptz not null default now()
);

create table if not exists public.feature_status (
  key text primary key,
  label text not null,
  status text not null check (status in ('live', 'beta', 'demo_only', 'coming_soon', 'requires_integration', 'requires_more_data')),
  description text,
  data_source text,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'offers_ai_recommendation_id_fkey'
      and conrelid = 'public.offers'::regclass
  ) then
    alter table public.offers
      add constraint offers_ai_recommendation_id_fkey
      foreign key (ai_recommendation_id) references public.ai_recommendations(id) on delete set null;
  end if;
end $$;

create index if not exists idx_restaurant_users_restaurant on public.restaurant_users(restaurant_id, status);
create index if not exists idx_guests_email on public.guests(email);
create index if not exists idx_guest_profiles_guest on public.guest_profiles(guest_id);
create index if not exists idx_ai_recommendations_restaurant on public.ai_recommendations(restaurant_id, status, created_at desc);
create index if not exists idx_ai_actions_restaurant on public.ai_actions(restaurant_id, status, created_at desc);
create index if not exists idx_ai_action_results_action on public.ai_action_results(action_id);
create index if not exists idx_campaigns_restaurant on public.marketing_campaigns(restaurant_id, status, created_at desc);
create index if not exists idx_email_logs_restaurant on public.email_logs(restaurant_id, event_type, created_at desc);
create index if not exists idx_notification_logs_guest on public.notification_logs(profile_key, created_at desc);
create index if not exists idx_guest_feedback_restaurant on public.guest_feedback(restaurant_id, moderation_status, created_at desc);
create index if not exists idx_connections_restaurant on public.integration_connections(restaurant_id, status);
create index if not exists idx_imported_reservations_restaurant on public.imported_reservations(restaurant_id, reservation_start desc);
create index if not exists idx_imported_guests_restaurant on public.imported_guests(restaurant_id, imported_at desc);
create index if not exists idx_demand_snapshots_restaurant on public.demand_snapshots(restaurant_id, service_date desc, snapshot_at desc);
create index if not exists idx_revenue_snapshots_restaurant on public.revenue_snapshots(restaurant_id, service_date desc, snapshot_at desc);

drop trigger if exists restaurant_users_set_updated_at on public.restaurant_users;
create trigger restaurant_users_set_updated_at before update on public.restaurant_users
for each row execute function public.set_updated_at();

drop trigger if exists guests_set_updated_at on public.guests;
create trigger guests_set_updated_at before update on public.guests
for each row execute function public.set_updated_at();

drop trigger if exists guest_profiles_set_updated_at on public.guest_profiles;
create trigger guest_profiles_set_updated_at before update on public.guest_profiles
for each row execute function public.set_updated_at();

drop trigger if exists reservation_sources_set_updated_at on public.reservation_sources;
create trigger reservation_sources_set_updated_at before update on public.reservation_sources
for each row execute function public.set_updated_at();

drop trigger if exists ai_recommendations_set_updated_at on public.ai_recommendations;
create trigger ai_recommendations_set_updated_at before update on public.ai_recommendations
for each row execute function public.set_updated_at();

drop trigger if exists ai_actions_set_updated_at on public.ai_actions;
create trigger ai_actions_set_updated_at before update on public.ai_actions
for each row execute function public.set_updated_at();

drop trigger if exists marketing_campaigns_set_updated_at on public.marketing_campaigns;
create trigger marketing_campaigns_set_updated_at before update on public.marketing_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists guest_feedback_set_updated_at on public.guest_feedback;
create trigger guest_feedback_set_updated_at before update on public.guest_feedback
for each row execute function public.set_updated_at();

drop trigger if exists integrations_set_updated_at on public.integrations;
create trigger integrations_set_updated_at before update on public.integrations
for each row execute function public.set_updated_at();

drop trigger if exists integration_connections_set_updated_at on public.integration_connections;
create trigger integration_connections_set_updated_at before update on public.integration_connections
for each row execute function public.set_updated_at();

insert into public.reservation_sources (provider, source_type, display_name, status)
values
  ('smarttable', 'lead', 'SmartTable reservation lead', 'active'),
  ('resy', 'integration', 'Resy', 'planned'),
  ('opentable', 'integration', 'OpenTable', 'planned'),
  ('sevenrooms', 'integration', 'SevenRooms', 'planned')
on conflict (provider, source_type) do update
set display_name = excluded.display_name,
    status = excluded.status,
    updated_at = now();

insert into public.integrations (provider, category, display_name, status, required_scopes)
values
  ('resy', 'reservation', 'Resy', 'planned', array['reservations:read', 'guests:read']),
  ('opentable', 'reservation', 'OpenTable', 'planned', array['reservations:read', 'guests:read']),
  ('sevenrooms', 'reservation', 'SevenRooms', 'planned', array['reservations:read', 'guests:read']),
  ('google_maps', 'maps', 'Google Maps', 'beta', array['maps:read']),
  ('weather', 'weather', 'Weather provider', 'planned', array['weather:read']),
  ('local_events', 'events', 'Local events provider', 'planned', array['events:read']),
  ('resend', 'email', 'Resend', 'live', array['email:send'])
on conflict (provider) do update
set category = excluded.category,
    display_name = excluded.display_name,
    status = excluded.status,
    required_scopes = excluded.required_scopes,
    updated_at = now();

insert into public.feature_status (key, label, status, description, data_source)
values
  ('restaurant_onboarding', 'Restaurant onboarding', 'beta', 'Restaurants can be created and managed; team invites and full onboarding completion tracking are now scaffolded.', 'restaurants, restaurant_users'),
  ('guest_booking_leads', 'Guest reservation leads', 'live', 'Guests can request reservations and restaurants approve or decline them.', 'reservations, offers'),
  ('transactional_email', 'Transactional email', case when current_setting('request.jwt.claims', true) is null then 'requires_integration' else 'requires_integration' end, 'Requires a configured email provider key such as Resend in production.', 'email_logs, email_events'),
  ('ai_demand_recommendations', 'AI demand recommendations', 'beta', 'Rules-v1 uses stored restaurant, offer, reservation, view, and follower data; weather/events/imported reservations improve confidence when connected.', 'ai_recommendations, demand_snapshots'),
  ('ai_autonomous_actions', 'AI autonomous actions', 'coming_soon', 'AI recommends first. Restaurants must approve actions before execution.', 'ai_actions'),
  ('marketplace_insights', 'Marketplace insights', 'requires_more_data', 'Requires larger search, booking, upload, and feedback volume before showing live market analytics.', 'analytics_events'),
  ('reservation_integrations', 'Reservation platform integrations', 'requires_integration', 'Resy/OpenTable/SevenRooms/Tock/Google Reserve and approved reservation API schemas are ready; provider OAuth/API sync is not connected yet.', 'integration_connections, imported_reservations')
on conflict (key) do update
set label = excluded.label,
    status = excluded.status,
    description = excluded.description,
    data_source = excluded.data_source,
    updated_at = now();

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('missing_data_label', 'Data still missing', 'Datos aun faltantes', 'text', 'partner_dashboard')
on conflict (key) do update
set value_en = excluded.value_en,
    value_es = excluded.value_es,
    content_type = excluded.content_type,
    group_name = excluded.group_name,
    updated_at = now();

alter table public.restaurant_users enable row level security;
alter table public.guests enable row level security;
alter table public.guest_profiles enable row level security;
alter table public.reservation_sources enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_action_results enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.email_logs enable row level security;
alter table public.notification_logs enable row level security;
alter table public.guest_feedback enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_connections enable row level security;
alter table public.imported_reservations enable row level security;
alter table public.imported_guests enable row level security;
alter table public.demand_snapshots enable row level security;
alter table public.revenue_snapshots enable row level security;
alter table public.feature_status enable row level security;

drop policy if exists restaurant_users_scoped on public.restaurant_users;
create policy restaurant_users_scoped on public.restaurant_users
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists guests_admin_or_self on public.guests;
create policy guests_admin_or_self on public.guests
for all using (public.is_admin() or user_id = auth.uid())
with check (public.is_admin() or user_id = auth.uid());

drop policy if exists guest_profiles_admin_or_self on public.guest_profiles;
create policy guest_profiles_admin_or_self on public.guest_profiles
for all using (
  public.is_admin()
  or exists (select 1 from public.guests g where g.id = guest_id and g.user_id = auth.uid())
)
with check (
  public.is_admin()
  or exists (select 1 from public.guests g where g.id = guest_id and g.user_id = auth.uid())
);

drop policy if exists reservation_sources_read on public.reservation_sources;
create policy reservation_sources_read on public.reservation_sources
for select using (true);

drop policy if exists ai_recommendations_scoped on public.ai_recommendations;
create policy ai_recommendations_scoped on public.ai_recommendations
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists ai_actions_scoped on public.ai_actions;
create policy ai_actions_scoped on public.ai_actions
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists ai_action_results_scoped on public.ai_action_results;
create policy ai_action_results_scoped on public.ai_action_results
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists campaigns_scoped on public.marketing_campaigns;
create policy campaigns_scoped on public.marketing_campaigns
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists email_logs_scoped on public.email_logs;
create policy email_logs_scoped on public.email_logs
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists notification_logs_scoped on public.notification_logs;
create policy notification_logs_scoped on public.notification_logs
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists guest_feedback_scoped on public.guest_feedback;
create policy guest_feedback_scoped on public.guest_feedback
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists integrations_read on public.integrations;
create policy integrations_read on public.integrations
for select using (true);

drop policy if exists integration_connections_scoped on public.integration_connections;
create policy integration_connections_scoped on public.integration_connections
for all using (public.is_admin() or restaurant_id is null or public.owns_restaurant(restaurant_id) or user_id = auth.uid())
with check (public.is_admin() or restaurant_id is null or public.owns_restaurant(restaurant_id) or user_id = auth.uid());

drop policy if exists imported_reservations_scoped on public.imported_reservations;
create policy imported_reservations_scoped on public.imported_reservations
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists imported_guests_scoped on public.imported_guests;
create policy imported_guests_scoped on public.imported_guests
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists demand_snapshots_scoped on public.demand_snapshots;
create policy demand_snapshots_scoped on public.demand_snapshots
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists revenue_snapshots_scoped on public.revenue_snapshots;
create policy revenue_snapshots_scoped on public.revenue_snapshots
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists feature_status_read on public.feature_status;
create policy feature_status_read on public.feature_status
for select using (true);

grant select, insert, update, delete on public.restaurant_users to authenticated;
grant select, insert, update on public.guests to authenticated;
grant select, insert, update on public.guest_profiles to authenticated;
grant select on public.reservation_sources to anon, authenticated;
grant select, insert, update, delete on public.ai_recommendations to authenticated;
grant select, insert, update, delete on public.ai_actions to authenticated;
grant select, insert, update, delete on public.ai_action_results to authenticated;
grant select, insert, update, delete on public.marketing_campaigns to authenticated;
grant select, insert on public.email_logs to authenticated;
grant select, insert, update on public.notification_logs to authenticated;
grant select, insert, update on public.guest_feedback to authenticated;
grant select on public.integrations to anon, authenticated;
grant select, insert, update, delete on public.integration_connections to authenticated;
grant select on public.imported_reservations to authenticated;
grant select on public.imported_guests to authenticated;
grant select, insert on public.demand_snapshots to authenticated;
grant select, insert on public.revenue_snapshots to authenticated;
grant select on public.feature_status to anon, authenticated;
