-- SmartTable BASIC auth/registration production bootstrap migration
-- Date: 2026-07-19
--
-- Purpose:
--   Additively initializes or repairs the Supabase schema required by the
--   current SmartTable BASIC signup, login, onboarding, reservation, account,
--   and transactional email flows.
--
-- Safety:
--   - No DELETE, TRUNCATE, DROP TABLE, DROP COLUMN, or database reset.
--   - Creates missing objects and adds missing columns only.
--   - Replaces functions/views only; table data is preserved.
--   - Does not seed demo restaurants, demo users, or test reservations.
--   - Does not enable AI Concierge or any POS integration.
--
-- Important:
--   The historical repository migration 0028_remove_pos_integration_references.sql
--   contains data/column removal. Do not blindly run the full migration chain
--   against an existing production database until that migration is reviewed
--   separately for the actual production data state.

create extension if not exists pgcrypto;

do $$ begin
  create type public.profile_role as enum ('admin', 'restaurant', 'partner', 'super_admin', 'guest');
exception when duplicate_object then null;
end $$;

alter type public.profile_role add value if not exists 'partner';
alter type public.profile_role add value if not exists 'super_admin';

do $$ begin
  create type public.restaurant_status as enum ('pending', 'approved', 'suspended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.offer_status as enum ('active', 'paused', 'sold_out', 'expired');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reservation_status as enum (
    'requested',
    'confirmed',
    'pending',
    'accepted',
    'rejected',
    'declined',
    'cancelled',
    'canceled',
    'completed',
    'no_show',
    'expired',
    'waiting_external_confirmation'
  );
exception when duplicate_object then null;
end $$;

alter type public.reservation_status add value if not exists 'pending';
alter type public.reservation_status add value if not exists 'accepted';
alter type public.reservation_status add value if not exists 'rejected';
alter type public.reservation_status add value if not exists 'declined';
alter type public.reservation_status add value if not exists 'cancelled';
alter type public.reservation_status add value if not exists 'canceled';
alter type public.reservation_status add value if not exists 'completed';
alter type public.reservation_status add value if not exists 'no_show';
alter type public.reservation_status add value if not exists 'expired';
alter type public.reservation_status add value if not exists 'waiting_external_confirmation';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  address text,
  district text,
  cuisine text,
  status public.restaurant_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurants
  add column if not exists legal_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists cuisine_type text,
  add column if not exists description text,
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists description_hu text,
  add column if not exists rating numeric(2,1) not null default 4.5,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists tiktok text,
  add column if not exists google_maps_url text,
  add column if not exists google_place_id text,
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists sort_order integer,
  add column if not exists primary_timezone text not null default 'America/New_York',
  add column if not exists card_image text,
  add column if not exists icon_image text,
  add column if not exists logo_url text,
  add column if not exists hero_image_url text,
  add column if not exists cover_image text,
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
  add column if not exists private_room_available boolean not null default false,
  add column if not exists opening_hours jsonb not null default '{}'::jsonb,
  add column if not exists gallery_images text[] not null default '{}'::text[],
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists weak_hours jsonb not null default '[]'::jsonb,
  add column if not exists table_capacity integer,
  add column if not exists discount_rules jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_status text not null default 'incomplete',
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists ai_discount_enabled boolean not null default false,
  add column if not exists min_discount_percent integer,
  add column if not exists max_discount_percent integer,
  add column if not exists target_margin_percent numeric(6,2),
  add column if not exists average_service_minutes integer,
  add column if not exists reservation_integration_status text not null default 'manual',
  add column if not exists calendar_planning_enabled boolean not null default false;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.profile_role not null default 'guest',
  restaurant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists preferred_language text not null default 'en',
  add column if not exists phone text,
  add column if not exists status text not null default 'active',
  add column if not exists last_login_at timestamptz,
  add column if not exists suspended_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_restaurant_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_restaurant_id_fkey
      foreign key (restaurant_id) references public.restaurants(id) on delete set null;
  end if;
end $$;

create table if not exists public.restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'owner',
  status text not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_restaurant_users_restaurant_email
  on public.restaurant_users(restaurant_id, lower(email));

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  offer_date date not null,
  offer_time time,
  seat_count integer not null default 1,
  reserved_seats integer not null default 0,
  discount_percent integer not null default 15,
  status public.offer_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.offers
  add column if not exists title_en text,
  add column if not exists title_es text,
  add column if not exists title_hu text,
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists description_hu text,
  add column if not exists offer_image text,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists valid_days text[] not null default '{}'::text[],
  add column if not exists available_tables integer not null default 1,
  add column if not exists reserved_tables integer not null default 0,
  add column if not exists max_party_size integer not null default 4,
  add column if not exists discount_type text not null default 'percentage',
  add column if not exists discount_value numeric(10,2),
  add column if not exists redemption_rules jsonb not null default '{}'::jsonb,
  add column if not exists performance jsonb not null default '{}'::jsonb,
  add column if not exists source text not null default 'manual',
  add column if not exists ai_recommendation_id uuid,
  add column if not exists minimum_spend numeric(12,2),
  add column if not exists applies_to_drinks boolean not null default true,
  add column if not exists min_party_size integer not null default 1,
  add column if not exists time_limit_minutes integer,
  add column if not exists blackout_periods jsonb not null default '[]'::jsonb,
  add column if not exists combinable boolean not null default false,
  add column if not exists custom_terms jsonb not null default '{}'::jsonb,
  add column if not exists structured_conditions jsonb not null default '{}'::jsonb;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  offer_id uuid not null references public.offers(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  guest_id uuid references auth.users(id) on delete set null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text not null,
  party_size integer not null,
  notes text,
  status public.reservation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservations
  add column if not exists partner_notes text,
  add column if not exists reservation_date date,
  add column if not exists reservation_time time,
  add column if not exists source text not null default 'smarttable',
  add column if not exists booking_source text not null default 'SMARTTABLE',
  add column if not exists booking_status text not null default 'pending',
  add column if not exists external_provider text,
  add column if not exists external_sync_status text,
  add column if not exists external_reservation_id text,
  add column if not exists reservation_end_time timestamptz,
  add column if not exists guest_language text not null default 'en',
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists no_show_at timestamptz,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_by_label text,
  add column if not exists modified_at timestamptz;

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null unique,
  full_name text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guests
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists preferred_dining_areas text[] not null default '{}'::text[],
  add column if not exists max_travel_distance_miles numeric,
  add column if not exists transportation_method text,
  add column if not exists selected_language text,
  add column if not exists deleted_at timestamptz;

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

alter table public.guest_profiles
  add column if not exists cuisine_preferences text[] not null default '{}'::text[],
  add column if not exists food_preferences text[] not null default '{}'::text[],
  add column if not exists drink_preferences text[] not null default '{}'::text[],
  add column if not exists dietary_needs text[] not null default '{}'::text[],
  add column if not exists allergy_notes text,
  add column if not exists atmosphere_preferences text[] not null default '{}'::text[],
  add column if not exists dining_occasions text[] not null default '{}'::text[],
  add column if not exists dining_companions text[] not null default '{}'::text[],
  add column if not exists typical_party_size text,
  add column if not exists preferred_days text[] not null default '{}'::text[],
  add column if not exists preferred_times text[] not null default '{}'::text[],
  add column if not exists booking_lead_time text,
  add column if not exists preferred_dining_duration text,
  add column if not exists spending_range text,
  add column if not exists selected_discount_levels text[] not null default '{}'::text[],
  add column if not exists minimum_interesting_discount numeric,
  add column if not exists willingness_without_discount text,
  add column if not exists discovery_preference text,
  add column if not exists selection_priorities text[] not null default '{}'::text[],
  add column if not exists favorite_restaurants text[] not null default '{}'::text[],
  add column if not exists excluded_categories text[] not null default '{}'::text[],
  add column if not exists new_restaurant_interest text,
  add column if not exists new_menu_item_interest text,
  add column if not exists notification_preferences text[] not null default '{}'::text[],
  add column if not exists notification_frequency text,
  add column if not exists event_recommendation_interest text,
  add column if not exists future_calendar_interest text;

create table if not exists public.guest_consents (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guests(id) on delete cascade,
  guest_email text,
  consent_type text not null,
  status text not null default 'granted',
  source text not null default 'smarttable',
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.guest_consents
  add column if not exists user_id uuid,
  add column if not exists terms_accepted boolean,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted boolean,
  add column if not exists privacy_policy_version text,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists marketing_consent boolean,
  add column if not exists marketing_consent_timestamp timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists language text,
  add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists public.ai_preference_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  preferences jsonb not null default '{}'::jsonb,
  budget_per_person text,
  travel_distance_miles numeric,
  preferred_discount_range text,
  minimum_interesting_discount numeric,
  calendar_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_followers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_email text not null,
  guest_name text,
  profile_key text,
  notification_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_restaurant_followers_unique
  on public.restaurant_followers(restaurant_id, lower(guest_email));

create table if not exists public.restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  guest_id uuid references auth.users(id) on delete set null,
  guest_name text,
  guest_email text,
  food_rating integer,
  service_rating integer,
  ambience_rating integer,
  overall_rating integer,
  comment text,
  status text not null default 'pending',
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_feedback (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  guest_email text,
  overall_rating integer,
  food_rating integer,
  service_rating integer,
  ambience_rating integer,
  review text,
  ordered_items text,
  would_recommend boolean,
  would_return boolean,
  photo_urls text[] not null default '{}'::text[],
  moderation_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dining_consumption_uploads (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  guest_email text,
  photo_urls text[] not null default '{}'::text[],
  notes text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_notifications (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guests(id) on delete cascade,
  guest_email text,
  reservation_id uuid references public.reservations(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  notification_type text not null,
  title text not null,
  message text not null,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  guest_email text not null,
  request_type text not null,
  status text not null default 'received',
  message text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  guest_email text not null,
  scope text not null default 'marketing',
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  token_hash text,
  unsubscribed_at timestamptz not null default now(),
  reason text
);

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  title text not null,
  version text not null,
  status text not null default 'draft',
  content text not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.site_content (
  key text primary key,
  value_en text,
  value_es text,
  value_hu text,
  content_type text not null default 'text',
  group_name text not null default 'general',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values (
  'platform',
  jsonb_build_object(
    'platform_mode', 'basic',
    'ai_demo_visibility', false,
    'show_ai_mode_badge', true,
    'feature_flags', jsonb_build_object()
  )
)
on conflict (key) do nothing;

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  event_type text not null,
  recipient text not null,
  subject text not null,
  provider text not null default 'resend',
  provider_id text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  campaign_id uuid,
  event_type text not null default 'email',
  recipient text,
  subject text,
  provider text not null default 'resend',
  provider_id text,
  delivery_status text not null default 'queued',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.email_logs
  add column if not exists email_type text,
  add column if not exists recipient_email text,
  add column if not exists recipient_user_id uuid references auth.users(id) on delete set null,
  add column if not exists provider_message_id text,
  add column if not exists status text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists locale text,
  add column if not exists template_version text,
  add column if not exists idempotency_key text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.email_queue (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid references public.email_logs(id) on delete set null,
  email_type text not null,
  event_type text,
  recipient_email text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  campaign_id uuid,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  locale text not null default 'en',
  template_version text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_status_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  previous_status text not null,
  new_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  profile_key text,
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  key text primary key,
  label text not null,
  status text not null default 'beta',
  enabled boolean not null default true,
  audience text not null default 'all',
  description text,
  owner text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'error',
  source text not null default 'server',
  message text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'info',
  title text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(lower(email));
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_restaurants_status on public.restaurants(status);
create index if not exists idx_restaurants_sort_order on public.restaurants(sort_order nulls last, name);
create index if not exists idx_offers_restaurant_date on public.offers(restaurant_id, offer_date, offer_time);
create index if not exists idx_offers_status_date on public.offers(status, offer_date);
create index if not exists idx_reservations_restaurant on public.reservations(restaurant_id, created_at desc);
create index if not exists idx_reservations_guest_email on public.reservations(lower(guest_email));
create index if not exists idx_reservations_guest_id on public.reservations(guest_id, created_at desc);
create index if not exists idx_reservations_status on public.reservations(status);
create index if not exists idx_guests_user_email on public.guests(user_id, lower(email));
create index if not exists idx_guest_profiles_min_discount on public.guest_profiles(minimum_interesting_discount);
create index if not exists idx_guest_profiles_preferred_days on public.guest_profiles using gin(preferred_days);
create index if not exists idx_guest_profiles_preferred_times on public.guest_profiles using gin(preferred_times);
create index if not exists idx_guest_consents_guest_type_created on public.guest_consents(guest_id, consent_type, created_at desc);
create unique index if not exists idx_email_logs_idempotency_key on public.email_logs(idempotency_key) where idempotency_key is not null;
create index if not exists idx_email_logs_status_created on public.email_logs((coalesce(status, delivery_status)), created_at desc);
create index if not exists idx_email_logs_recipient_user on public.email_logs(recipient_user_id, created_at desc) where recipient_user_id is not null;
create index if not exists idx_email_logs_reservation_type on public.email_logs(reservation_id, email_type, created_at desc);
create unique index if not exists idx_email_queue_idempotency_key on public.email_queue(idempotency_key);
create index if not exists idx_email_queue_status_next_attempt on public.email_queue(status, next_attempt_at) where status in ('pending', 'queued');
create index if not exists idx_email_queue_provider_message on public.email_queue(provider_message_id) where provider_message_id is not null;
create index if not exists idx_email_queue_reservation_type on public.email_queue(reservation_id, email_type, created_at desc) where reservation_id is not null;
create index if not exists idx_reservation_status_events_reservation on public.reservation_status_events(reservation_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, preferred_language)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'guest',
    coalesce(new.raw_user_meta_data->>'preferred_language', 'en')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    preferred_language = coalesce(public.profiles.preferred_language, excluded.preferred_language),
    updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

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
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'super_admin')
        or p.restaurant_id = target_restaurant_id
        or exists (
          select 1
          from public.restaurant_users ru
          where ru.restaurant_id = target_restaurant_id
            and ru.user_id = auth.uid()
            and ru.status = 'active'
        )
      )
  );
$$;

create or replace view public.restaurant_review_summary as
select
  restaurant_id,
  avg(food_rating)::numeric(4,2) as food_rating_avg,
  avg(service_rating)::numeric(4,2) as service_rating_avg,
  avg(ambience_rating)::numeric(4,2) as ambience_rating_avg,
  avg(overall_rating)::numeric(4,2) as overall_rating_avg,
  count(*)::integer as review_count
from public.restaurant_reviews
where status = 'approved'
group by restaurant_id;

create or replace view public.restaurant_reviews_overview as
select
  rr.*,
  r.name as restaurant_name,
  r.district as restaurant_neighborhood
from public.restaurant_reviews rr
join public.restaurants r on r.id = rr.restaurant_id;

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
  r.description_hu as restaurant_description_hu,
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
  r.primary_timezone,
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
  o.title_hu,
  o.description_en as offer_description_en,
  o.description_es as offer_description_es,
  o.description_hu as offer_description_hu,
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
  and (
    (
      o.offer_date
      + coalesce(o.end_time, o.start_time, o.offer_time, time '23:59')
      + case
        when coalesce(o.end_time, o.start_time, o.offer_time, time '23:59') <= coalesce(o.start_time, o.offer_time, time '00:00')
          then interval '1 day'
        else interval '0 day'
      end
    ) at time zone coalesce(nullif(r.primary_timezone, ''), 'America/New_York')
  ) > now()
  and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1);

create or replace view public.reservation_overview as
select
  rv.id as reservation_id,
  rv.reference,
  rv.restaurant_id,
  r.name as restaurant_name,
  coalesce(r.email, r.contact_email) as restaurant_email,
  r.phone as restaurant_phone,
  r.address as restaurant_address,
  coalesce(r.cuisine_type, r.cuisine) as restaurant_cuisine,
  r.district as restaurant_neighborhood,
  r.status as restaurant_status,
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
  rv.source,
  rv.booking_source,
  rv.booking_status,
  rv.created_at,
  rv.updated_at,
  rv.guest_language,
  rv.accepted_at,
  rv.rejected_at,
  rv.cancelled_at,
  rv.completed_at,
  rv.no_show_at,
  rv.status_changed_at,
  rv.status_changed_by,
  rv.cancelled_by_label,
  exists (
    select 1
    from public.dining_consumption_uploads dcu
    where dcu.reservation_id = rv.id
  ) as feedback_submitted,
  coalesce(p.preferred_language, 'en') as restaurant_language
from public.reservations rv
join public.offers o on o.id = rv.offer_id
join public.restaurants r on r.id = rv.restaurant_id
left join public.profiles p on p.id = r.owner_user_id;

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
  v_timezone text;
  v_start_time time;
  v_end_time time;
  v_offer_end_at timestamptz;
begin
  if p_party_size is null or p_party_size < 1 then
    raise exception 'OFFER_SOLD_OUT';
  end if;

  select o, r into v_offer, v_restaurant
  from public.offers o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_offer_id
    and o.status = 'active'
    and r.status = 'approved'
    and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
  for update of o;

  if not found then
    raise exception 'OFFER_UNAVAILABLE';
  end if;

  v_timezone := coalesce(nullif(v_restaurant.primary_timezone, ''), 'America/New_York');
  v_start_time := coalesce(v_offer.start_time, v_offer.offer_time);
  v_end_time := coalesce(v_offer.end_time, v_start_time, time '23:59');
  v_reservation_date := coalesce(p_reservation_date, v_offer.offer_date);
  v_reservation_time := coalesce(p_reservation_time, v_start_time);
  v_day := trim(lower(to_char(v_reservation_date, 'dy')));

  if v_reservation_date <> v_offer.offer_date then
    raise exception 'OFFER_DATE_MISMATCH';
  end if;

  if v_start_time is null or v_end_time is null or v_reservation_time is null then
    raise exception 'INVALID_OFFER_TIME';
  end if;

  v_offer_end_at := (
    v_offer.offer_date
    + v_end_time
    + case when v_end_time <= v_start_time then interval '1 day' else interval '0 day' end
  ) at time zone v_timezone;

  if now() > v_offer_end_at then
    raise exception 'OFFER_EXPIRED';
  end if;

  if coalesce(array_length(v_offer.valid_days, 1), 0) > 0
    and not (v_day = any(v_offer.valid_days)) then
    raise exception 'OFFER_DATE_MISMATCH';
  end if;

  if p_party_size > coalesce(v_offer.max_party_size, 4) then
    raise exception 'OFFER_SOLD_OUT';
  end if;

  if v_end_time <= v_start_time then
    if not (v_reservation_time >= v_start_time or v_reservation_time <= v_end_time) then
      raise exception 'INVALID_OFFER_TIME';
    end if;
  elsif v_reservation_time < v_start_time or v_reservation_time > v_end_time then
    raise exception 'INVALID_OFFER_TIME';
  end if;

  update public.offers
  set
    reserved_tables = coalesce(reserved_tables, 0) + 1,
    reserved_seats = coalesce(reserved_seats, 0) + p_party_size
  where id = v_offer.id
    and coalesce(reserved_tables, 0) < coalesce(available_tables, 1)
  returning * into v_offer;

  if not found then
    raise exception 'OFFER_SOLD_OUT';
  end if;

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
    status,
    source,
    booking_source,
    booking_status
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
    'pending',
    'smarttable',
    'SMARTTABLE',
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
    'source', v_reservation.source,
    'booking_source', v_reservation.booking_source,
    'booking_status', v_reservation.booking_status,
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
  v_target_status text;
  v_booking_status text;
  v_now timestamptz := now();
  v_allowed boolean := false;
  v_result jsonb;
begin
  v_target_status := lower(trim(coalesce(p_status, '')));
  v_target_status := replace(v_target_status, '-', '_');
  v_target_status := replace(v_target_status, ' ', '_');

  if v_target_status = 'requested' then
    v_target_status := 'pending';
  elsif v_target_status = 'confirmed' then
    v_target_status := 'accepted';
  elsif v_target_status = 'declined' then
    v_target_status := 'rejected';
  elsif v_target_status = 'canceled' then
    v_target_status := 'cancelled';
  end if;

  if v_target_status not in ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'no_show') then
    raise exception 'INVALID_RESERVATION_STATUS';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if auth.role() <> 'service_role'
    and not public.is_admin()
    and not public.owns_restaurant(v_reservation.restaurant_id) then
    raise exception 'RESERVATION_FORBIDDEN';
  end if;

  v_previous_status := v_reservation.status::text;
  if v_previous_status = 'requested' then
    v_previous_status := 'pending';
  elsif v_previous_status = 'confirmed' then
    v_previous_status := 'accepted';
  elsif v_previous_status = 'declined' then
    v_previous_status := 'rejected';
  elsif v_previous_status = 'canceled' then
    v_previous_status := 'cancelled';
  end if;

  if v_previous_status = v_target_status then
    select to_jsonb(ro.*) into v_result
    from public.reservation_overview ro
    where ro.reservation_id = p_reservation_id;
    return v_result;
  end if;

  v_allowed := (
    (v_previous_status = 'pending' and v_target_status in ('accepted', 'rejected', 'cancelled'))
    or (v_previous_status = 'accepted' and v_target_status in ('cancelled', 'completed', 'no_show'))
  );

  if not v_allowed then
    raise exception 'INVALID_RESERVATION_STATUS_TRANSITION: % -> %', v_previous_status, v_target_status;
  end if;

  v_booking_status := case
    when v_target_status = 'accepted' then 'confirmed'
    when v_target_status = 'rejected' then 'declined'
    when v_target_status = 'cancelled' then 'cancelled'
    when v_target_status = 'completed' then 'completed'
    when v_target_status = 'no_show' then 'no_show'
    else 'pending'
  end;

  update public.reservations
  set
    status = v_target_status::public.reservation_status,
    booking_status = v_booking_status,
    status_changed_at = v_now,
    status_changed_by = auth.uid(),
    accepted_at = case when v_target_status = 'accepted' then v_now else accepted_at end,
    rejected_at = case when v_target_status = 'rejected' then v_now else rejected_at end,
    cancelled_at = case when v_target_status = 'cancelled' then v_now else cancelled_at end,
    completed_at = case when v_target_status = 'completed' then v_now else completed_at end,
    no_show_at = case when v_target_status = 'no_show' then v_now else no_show_at end
  where id = p_reservation_id
  returning * into v_reservation;

  if v_previous_status not in ('rejected', 'cancelled', 'no_show')
    and v_target_status in ('rejected', 'cancelled', 'no_show') then
    update public.offers
    set
      reserved_tables = greatest(coalesce(reserved_tables, 0) - 1, 0),
      reserved_seats = greatest(coalesce(reserved_seats, 0) - coalesce(v_reservation.party_size, 0), 0)
    where id = v_reservation.offer_id;
  end if;

  insert into public.reservation_status_events (
    reservation_id,
    previous_status,
    new_status,
    actor_user_id,
    actor_role,
    message
  )
  values (
    p_reservation_id,
    v_previous_status,
    v_target_status,
    auth.uid(),
    coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()),
    'Reservation status changed'
  );

  select to_jsonb(ro.*) into v_result
  from public.reservation_overview ro
  where ro.reservation_id = p_reservation_id;

  return v_result;
end;
$$;

insert into public.site_content (key, value_en, value_es, value_hu, content_type, group_name)
values
  ('email_guest_registration_subject', 'Welcome to SmartTable', 'Bienvenido a SmartTable', 'Udvozolunk a SmartTable-ben', 'text', 'email'),
  ('email_guest_registration_body', 'Hi {{guest_name}}, your SmartTable account is ready. You can now explore restaurants, save favorites, and request discounted tables.', 'Hola {{guest_name}}, tu cuenta de SmartTable esta lista. Ahora puedes explorar restaurantes, guardar favoritos y solicitar mesas con descuento.', 'Szia {{guest_name}}, elkeszult a SmartTable fiokod. Mostantol bongeszhetsz ettermeket, menthetsz kedvenceket es kedvezmenyes asztalokat kerhetsz.', 'textarea', 'email'),
  ('email_cta_explore_restaurants', 'Explore Restaurants', 'Explorar restaurantes', 'Ettermek bongeszese', 'text', 'email'),
  ('email_verification_subject', 'Verify your SmartTable email', 'Verifica tu email de SmartTable', 'Erositsd meg a SmartTable email cimedet', 'text', 'email'),
  ('email_verification_body', 'Hi {{guest_name}}, verify your SmartTable email address here: {{verification_url}}', 'Hola {{guest_name}}, verifica tu direccion de email de SmartTable aqui: {{verification_url}}', 'Szia {{guest_name}}, itt tudod megerositeni a SmartTable email cimedet: {{verification_url}}', 'textarea', 'email'),
  ('email_cta_verify_email', 'Verify email', 'Verificar email', 'Email megerositese', 'text', 'email'),
  ('email_password_reset_subject', 'Reset your SmartTable password', 'Restablece tu contrasena de SmartTable', 'SmartTable jelszo visszaallitasa', 'text', 'email'),
  ('email_password_reset_body', 'If you requested a SmartTable password reset, use this link: {{reset_url}}. If you did not request it, you can ignore this message.', 'Si solicitaste restablecer tu contrasena de SmartTable, usa este enlace: {{reset_url}}. Si no lo solicitaste, puedes ignorar este mensaje.', 'Ha SmartTable jelszo-visszaallitast kertel, hasznald ezt a linket: {{reset_url}}. Ha nem te kerted, hagyd figyelmen kivul ezt az uzenetet.', 'textarea', 'email'),
  ('email_cta_reset_password', 'Reset password', 'Restablecer contrasena', 'Jelszo visszaallitasa', 'text', 'email'),
  ('email_password_changed_subject', 'Your SmartTable password was changed', 'Tu contrasena de SmartTable fue cambiada', 'A SmartTable jelszavad megvaltozott', 'text', 'email'),
  ('email_password_changed_body', 'Hi {{guest_name}}, your SmartTable password was changed successfully. If you did not make this change, contact SmartTable support immediately.', 'Hola {{guest_name}}, tu contrasena de SmartTable se cambio correctamente. Si no hiciste este cambio, contacta al soporte de SmartTable de inmediato.', 'Szia {{guest_name}}, a SmartTable jelszavad sikeresen megvaltozott. Ha nem te vegezted ezt a modositast, azonnal vedd fel a kapcsolatot a SmartTable ugyfelszolgalattal.', 'textarea', 'email'),
  ('email_cta_my_account', 'Open my account', 'Abrir mi cuenta', 'Fiokom megnyitasa', 'text', 'email'),
  ('email_guest_received_subject', 'We received your SmartTable reservation request', 'Recibimos tu solicitud de reserva de SmartTable', 'Megkaptuk a SmartTable foglalasi kerelmedet', 'text', 'email'),
  ('email_guest_received_body', 'Hi {{guest_name}}, we received your reservation request for {{reservation_summary}}. Reference: {{reference}}.', 'Hola {{guest_name}}, recibimos tu solicitud de reserva: {{reservation_summary}}. Referencia: {{reference}}.', 'Szia {{guest_name}}, megkaptuk a foglalasi kerelmedet: {{reservation_summary}}. Hivatkozas: {{reference}}.', 'textarea', 'email'),
  ('email_guest_pending_notice', 'Status: pending. This is a reservation request, not a confirmed reservation yet. The restaurant must accept it before it is confirmed.', 'Estado: pendiente. Esta es una solicitud de reserva, no una reserva confirmada todavia. El restaurante debe aceptarla antes de que quede confirmada.', 'Allapot: fuggoben. Ez meg foglalasi kerelem, nem visszaigazolt foglalas. Az etteremnek el kell fogadnia, mielott visszaigazolta valik.', 'textarea', 'email'),
  ('email_cta_my_reservations', 'View My Reservations', 'Ver mis reservas', 'Foglalasaim megtekintese', 'text', 'email'),
  ('email_restaurant_new_subject', 'New reservation request from SmartTable', 'Nueva solicitud de reserva de SmartTable', 'Uj foglalasi kerelem erkezett a SmartTable-tol', 'text', 'email'),
  ('email_restaurant_new_body', 'New pending reservation request for {{restaurant_name}}. Reference: {{reference}}. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notes: {{notes}}.', 'Nueva solicitud de reserva pendiente para {{restaurant_name}}. Referencia: {{reference}}. Oferta: {{offer_title}}. Fecha/hora: {{reservation_date}} {{reservation_time}}. Personas: {{party_size}}. Cliente: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notas: {{notes}}.', 'Uj fuggoben levo foglalasi kerelem itt: {{restaurant_name}}. Hivatkozas: {{reference}}. Ajanlat: {{offer_title}}. Datum/ido: {{reservation_date}} {{reservation_time}}. Letszam: {{party_size}}. Vendeg: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Megjegyzes: {{notes}}.', 'textarea', 'email'),
  ('email_cta_open_dashboard', 'Open dashboard', 'Abrir dashboard', 'Dashboard megnyitasa', 'text', 'email'),
  ('email_admin_new_subject', 'SmartTable admin notice: new reservation request', 'Aviso admin de SmartTable: nueva solicitud de reserva', 'SmartTable admin ertesites: uj foglalasi kerelem', 'text', 'email'),
  ('email_admin_new_body', 'A new reservation was created for {{restaurant_name}}. {{reservation_summary}}.', 'Se creo una nueva reserva para {{restaurant_name}}. {{reservation_summary}}.', 'Uj foglalas jott letre itt: {{restaurant_name}}. {{reservation_summary}}.', 'textarea', 'email'),
  ('email_guest_accepted_subject', 'Your reservation was accepted', 'Tu reserva fue aceptada', 'A foglalasodat visszaigazoltak', 'text', 'email'),
  ('email_guest_accepted_body', 'Good news, {{guest_name}}. {{restaurant_name}} confirmed your reservation. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Discount: {{discount}}%. Address: {{restaurant_address}}. Reference: {{reference}}.', 'Buenas noticias, {{guest_name}}. {{restaurant_name}} confirmo tu reserva. Oferta: {{offer_title}}. Fecha/hora: {{reservation_date}} {{reservation_time}}. Personas: {{party_size}}. Descuento: {{discount}}%. Direccion: {{restaurant_address}}. Referencia: {{reference}}.', '{{restaurant_name}} visszaigazolta a foglalasodat. Ajanlat: {{offer_title}}. Datum/ido: {{reservation_date}} {{reservation_time}}. Letszam: {{party_size}}. Kedvezmeny: {{discount}}%. Cim: {{restaurant_address}}. Hivatkozas: {{reference}}.', 'textarea', 'email'),
  ('email_guest_accepted_notice', 'Status: accepted. Your reservation is confirmed by the restaurant.', 'Estado: aceptada. Tu reserva esta confirmada por el restaurante.', 'Allapot: elfogadva. A foglalasodat az etterem visszaigazolta.', 'textarea', 'email'),
  ('email_guest_rejected_subject', 'Your reservation request could not be confirmed', 'Tu solicitud de reserva no pudo confirmarse', 'A foglalasi kerelmedet nem tudtak visszaigazolni', 'text', 'email'),
  ('email_guest_rejected_body', 'Hi {{guest_name}}, {{restaurant_name}} could not confirm your reservation request for {{reservation_date}} at {{reservation_time}}. Reference: {{reference}}.', 'Hola {{guest_name}}, {{restaurant_name}} no pudo confirmar tu solicitud para {{reservation_date}} a las {{reservation_time}}. Referencia: {{reference}}.', '{{restaurant_name}} nem tudta visszaigazolni a {{reservation_date}} {{reservation_time}} idopontra kert foglalasi kerelmedet. Hivatkozas: {{reference}}.', 'textarea', 'email'),
  ('email_guest_rejected_notice', 'Status: declined. You can return to SmartTable to find another available table.', 'Estado: rechazada. Puedes volver a SmartTable para encontrar otra mesa disponible.', 'Allapot: elutasitva. Visszaterhetsz a SmartTable-re, hogy masik elerheto asztalt talalj.', 'textarea', 'email'),
  ('email_cta_find_another_table', 'Find another table', 'Buscar otra mesa', 'Masik asztal keresese', 'text', 'email'),
  ('email_guest_cancelled_subject', 'Your reservation was cancelled', 'Tu reserva fue cancelada', 'A foglalasodat toroltek', 'text', 'email'),
  ('email_guest_cancelled_body', 'Hi {{guest_name}}, your SmartTable reservation at {{restaurant_name}} for {{reservation_date}} at {{reservation_time}} was cancelled. Reference: {{reference}}. Cancelled at: {{cancelled_at}}. Cancelled by: {{cancelled_by_label}}.', 'Hola {{guest_name}}, tu reserva de SmartTable en {{restaurant_name}} para {{reservation_date}} a las {{reservation_time}} fue cancelada. Referencia: {{reference}}. Cancelada a las: {{cancelled_at}}. Cancelada por: {{cancelled_by_label}}.', 'A SmartTable foglalasod itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}} idopontra torolve lett. Hivatkozas: {{reference}}. Torles ideje: {{cancelled_at}}. Torlest vegezte: {{cancelled_by_label}}.', 'textarea', 'email'),
  ('email_guest_cancelled_notice', 'Status: cancelled. This reservation is no longer active.', 'Estado: cancelada. Esta reserva ya no esta activa.', 'Allapot: torolve. Ez a foglalas mar nem aktiv.', 'textarea', 'email'),
  ('email_restaurant_cancelled_subject', 'SmartTable reservation cancelled: {{reference}}', 'Reserva de SmartTable cancelada: {{reference}}', 'SmartTable foglalas torolve: {{reference}}', 'text', 'email'),
  ('email_restaurant_cancelled_body', 'Reservation {{reference}} for {{restaurant_name}} on {{reservation_date}} at {{reservation_time}} was cancelled. Guest: {{guest_name}}. Cancelled at: {{cancelled_at}}. Cancelled by: {{cancelled_by_label}}.', 'La reserva {{reference}} para {{restaurant_name}} el {{reservation_date}} a las {{reservation_time}} fue cancelada. Cliente: {{guest_name}}. Cancelada a las: {{cancelled_at}}. Cancelada por: {{cancelled_by_label}}.', 'A(z) {{reference}} hivatkozasu foglalas itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}} idopontra torolve lett. Vendeg: {{guest_name}}. Torles ideje: {{cancelled_at}}. Torlest vegezte: {{cancelled_by_label}}.', 'textarea', 'email'),
  ('reservation_success_body', 'Your reservation request was saved. A confirmation email has been queued. This is not a confirmed reservation yet; the restaurant still needs to accept it.', 'Tu solicitud de reserva fue guardada. El email de confirmacion se puso en cola. Todavia no es una reserva confirmada; el restaurante debe aceptarla.', 'A foglalasi kerelmedet mentettuk. A visszaigazolo email sorba lett allitva. Ez meg nem visszaigazolt foglalas; az etteremnek el kell fogadnia.', 'textarea', 'forms'),
  ('reservation_success_body_email_unconfirmed', 'Your reservation request was saved, but the confirmation email could not be sent. You can still view it in My Reservations.', 'Tu solicitud de reserva fue guardada, pero no se pudo enviar el email de confirmacion. Aun puedes verla en Mis reservas.', 'A foglalasi kerelmedet mentettuk, de a visszaigazolo emailt nem sikerult elkuldeni. A kerelmet tovabbra is megtekintheted a Foglalasaim oldalon.', 'textarea', 'forms'),
  ('post_visit_email_subject', 'How was your experience at {{restaurant_name}}?', 'Como fue tu experiencia en {{restaurant_name}}?', 'Milyen volt az elmenyed itt: {{restaurant_name}}?', 'text', 'email'),
  ('post_visit_email_preheader', 'Share your SmartTable visit feedback after dining at {{restaurant_name}}.', 'Comparte tu experiencia de SmartTable despues de cenar en {{restaurant_name}}.', 'Oszd meg a SmartTable latogatasod tapasztalatait itt: {{restaurant_name}}.', 'text', 'email'),
  ('post_visit_email_body', 'Hi {{guest_name}}, thank you for dining at {{restaurant_name}} through SmartTable. We would love to hear about your experience from your visit on {{visit_date}}.', 'Hola {{guest_name}}, gracias por cenar en {{restaurant_name}} a traves de SmartTable. Nos encantaria conocer tu experiencia de tu visita del {{visit_date}}.', 'Szia {{guest_name}}, koszonjuk, hogy a SmartTable-en keresztul vacsoraztal itt: {{restaurant_name}}. Szeretnenk hallani a {{visit_date}} napi latogatasod tapasztalatait.', 'textarea', 'email'),
  ('post_visit_email_footer', 'You are receiving this because you completed a SmartTable reservation at {{restaurant_name}}.', 'Recibes esto porque completaste una reserva de SmartTable en {{restaurant_name}}.', 'Azert kapod ezt az uzenetet, mert teljesitett SmartTable foglalasod volt itt: {{restaurant_name}}.', 'textarea', 'email')
on conflict (key) do update
set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  value_hu = excluded.value_hu,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();

create or replace function pg_temp.create_policy_if_missing(
  p_table text,
  p_policy text,
  p_sql text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = p_table
      and policyname = p_policy
  ) then
    execute p_sql;
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_users enable row level security;
alter table public.offers enable row level security;
alter table public.reservations enable row level security;
alter table public.guests enable row level security;
alter table public.guest_profiles enable row level security;
alter table public.guest_consents enable row level security;
alter table public.restaurant_followers enable row level security;
alter table public.restaurant_reviews enable row level security;
alter table public.guest_feedback enable row level security;
alter table public.guest_notifications enable row level security;
alter table public.email_logs enable row level security;
alter table public.email_queue enable row level security;
alter table public.reservation_status_events enable row level security;
alter table public.app_settings enable row level security;
alter table public.site_content enable row level security;

select pg_temp.create_policy_if_missing(
  'profiles',
  'profiles_read_self_or_admin',
  'create policy profiles_read_self_or_admin on public.profiles for select using (auth.uid() = id or public.is_admin())'
);

select pg_temp.create_policy_if_missing(
  'profiles',
  'profiles_update_self_or_admin',
  'create policy profiles_update_self_or_admin on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin())'
);

select pg_temp.create_policy_if_missing(
  'restaurants',
  'restaurants_public_approved',
  'create policy restaurants_public_approved on public.restaurants for select using (status = ''approved'' or public.is_admin() or public.owns_restaurant(id))'
);

select pg_temp.create_policy_if_missing(
  'restaurants',
  'restaurants_admin_partner_write',
  'create policy restaurants_admin_partner_write on public.restaurants for all using (public.is_admin() or public.owns_restaurant(id)) with check (public.is_admin() or public.owns_restaurant(id))'
);

select pg_temp.create_policy_if_missing(
  'offers',
  'offers_public_active',
  'create policy offers_public_active on public.offers for select using (status = ''active'' or public.is_admin() or public.owns_restaurant(restaurant_id))'
);

select pg_temp.create_policy_if_missing(
  'offers',
  'offers_restaurant_manage',
  'create policy offers_restaurant_manage on public.offers for all using (public.is_admin() or public.owns_restaurant(restaurant_id)) with check (public.is_admin() or public.owns_restaurant(restaurant_id))'
);

select pg_temp.create_policy_if_missing(
  'reservations',
  'reservations_guest_read_own',
  'create policy reservations_guest_read_own on public.reservations for select using (auth.uid() = guest_id or public.is_admin() or public.owns_restaurant(restaurant_id))'
);

select pg_temp.create_policy_if_missing(
  'reservations',
  'reservations_guest_insert_own',
  'create policy reservations_guest_insert_own on public.reservations for insert with check (auth.uid() = guest_id or auth.role() = ''service_role'')'
);

select pg_temp.create_policy_if_missing(
  'reservations',
  'reservations_partner_admin_update',
  'create policy reservations_partner_admin_update on public.reservations for update using (public.is_admin() or public.owns_restaurant(restaurant_id) or auth.uid() = guest_id) with check (public.is_admin() or public.owns_restaurant(restaurant_id) or auth.uid() = guest_id)'
);

select pg_temp.create_policy_if_missing(
  'guests',
  'guests_admin_or_self',
  'create policy guests_admin_or_self on public.guests for all using (public.is_admin() or user_id = auth.uid() or auth.role() = ''service_role'') with check (public.is_admin() or user_id = auth.uid() or auth.role() = ''service_role'')'
);

select pg_temp.create_policy_if_missing(
  'guest_profiles',
  'guest_profiles_admin_or_self',
  'create policy guest_profiles_admin_or_self on public.guest_profiles for all using (public.is_admin() or auth.role() = ''service_role'' or exists (select 1 from public.guests g where g.id = guest_profiles.guest_id and g.user_id = auth.uid())) with check (public.is_admin() or auth.role() = ''service_role'' or exists (select 1 from public.guests g where g.id = guest_profiles.guest_id and g.user_id = auth.uid()))'
);

select pg_temp.create_policy_if_missing(
  'guest_consents',
  'guest_consents_admin_or_self',
  'create policy guest_consents_admin_or_self on public.guest_consents for all using (public.is_admin() or auth.role() = ''service_role'' or user_id = auth.uid() or exists (select 1 from public.guests g where g.id = guest_consents.guest_id and g.user_id = auth.uid())) with check (public.is_admin() or auth.role() = ''service_role'' or user_id = auth.uid() or exists (select 1 from public.guests g where g.id = guest_consents.guest_id and g.user_id = auth.uid()))'
);

select pg_temp.create_policy_if_missing(
  'restaurant_followers',
  'restaurant_followers_guest_or_admin',
  'create policy restaurant_followers_guest_or_admin on public.restaurant_followers for all using (public.is_admin() or auth.role() = ''service_role'' or lower(guest_email) = lower(coalesce(auth.jwt()->>''email'', ''''))) with check (public.is_admin() or auth.role() = ''service_role'' or lower(guest_email) = lower(coalesce(auth.jwt()->>''email'', '''')))'
);

select pg_temp.create_policy_if_missing(
  'guest_notifications',
  'guest_notifications_guest_read',
  'create policy guest_notifications_guest_read on public.guest_notifications for select using (public.is_admin() or auth.role() = ''service_role'' or lower(guest_email) = lower(coalesce(auth.jwt()->>''email'', '''')))'
);

select pg_temp.create_policy_if_missing(
  'guest_notifications',
  'guest_notifications_service_write',
  'create policy guest_notifications_service_write on public.guest_notifications for all using (public.is_admin() or auth.role() = ''service_role'') with check (public.is_admin() or auth.role() = ''service_role'')'
);

select pg_temp.create_policy_if_missing(
  'email_logs',
  'email_logs_admin_service',
  'create policy email_logs_admin_service on public.email_logs for all using (public.is_admin() or auth.role() = ''service_role'') with check (public.is_admin() or auth.role() = ''service_role'')'
);

select pg_temp.create_policy_if_missing(
  'email_queue',
  'email_queue_admin_service',
  'create policy email_queue_admin_service on public.email_queue for all using (public.is_admin() or auth.role() = ''service_role'') with check (public.is_admin() or auth.role() = ''service_role'')'
);

select pg_temp.create_policy_if_missing(
  'reservation_status_events',
  'reservation_status_events_admin_partner_read',
  'create policy reservation_status_events_admin_partner_read on public.reservation_status_events for select using (public.is_admin() or exists (select 1 from public.reservations rv where rv.id = reservation_status_events.reservation_id and public.owns_restaurant(rv.restaurant_id)))'
);

select pg_temp.create_policy_if_missing(
  'reservation_status_events',
  'reservation_status_events_service_insert',
  'create policy reservation_status_events_service_insert on public.reservation_status_events for insert with check (auth.role() = ''service_role'' or public.is_admin())'
);

select pg_temp.create_policy_if_missing(
  'site_content',
  'site_content_public_read',
  'create policy site_content_public_read on public.site_content for select using (true)'
);

select pg_temp.create_policy_if_missing(
  'site_content',
  'site_content_admin_write',
  'create policy site_content_admin_write on public.site_content for all using (public.is_admin()) with check (public.is_admin())'
);

select pg_temp.create_policy_if_missing(
  'app_settings',
  'app_settings_admin_read',
  'create policy app_settings_admin_read on public.app_settings for select using (public.is_admin() or auth.role() = ''service_role'')'
);

select pg_temp.create_policy_if_missing(
  'app_settings',
  'app_settings_super_admin_write',
  'create policy app_settings_super_admin_write on public.app_settings for all using (auth.role() = ''service_role'' or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''super_admin'')) with check (auth.role() = ''service_role'' or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''super_admin''))'
);

grant select on public.public_available_offers to anon, authenticated;
grant select on public.restaurant_review_summary to anon, authenticated;
grant select on public.restaurant_reviews_overview to authenticated;
grant select on public.reservation_overview to authenticated;
grant execute on function public.create_reservation(uuid, text, text, text, integer, date, time, text) to anon, authenticated;
grant execute on function public.update_reservation_status(uuid, text) to authenticated;

-- Verification queries to run after this file:
--
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in (
--     'profiles','restaurants','offers','reservations','guests',
--     'guest_profiles','guest_consents','ai_preference_profiles',
--     'guest_notifications','restaurant_followers','restaurant_reviews',
--     'email_logs','email_queue','app_settings','site_content',
--     'reservation_status_events'
--   )
-- order by table_name;
--
-- select tgname from pg_trigger where tgname = 'on_auth_user_created';
--
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
-- order by tablename;
