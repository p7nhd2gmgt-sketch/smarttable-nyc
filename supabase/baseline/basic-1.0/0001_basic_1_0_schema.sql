-- SmartTable BASIC 1.0 fresh-environment schema baseline.
-- Intended only for a brand-new empty Supabase project.
-- Historical migrations 0001-0056 remain unchanged and are not replayed by this file.

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'profiles',
        'restaurants',
        'offers',
        'reservations',
        'restaurant_users',
        'partner_invitations',
        'restaurant_billing_accounts'
      )
  ) then
    raise exception 'SmartTable BASIC 1.0 baseline is fresh-environment only. Refusing to run because a core SmartTable table already exists.';
  end if;
end $$;

create extension if not exists pgcrypto;

do $$
begin
  create type public.profile_role as enum ('admin', 'restaurant', 'guest', 'partner', 'super_admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.restaurant_status as enum ('pending', 'approved', 'suspended');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.offer_status as enum ('active', 'paused', 'sold_out', 'expired');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.reservation_status as enum ('requested', 'confirmed', 'completed', 'cancelled', 'no_show', 'pending', 'accepted', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  country_code text not null,
  city_name text not null,
  currency_code text not null,
  timezone text not null,
  default_locale text not null,
  supported_locales text[] not null default array[]::text[],
  status text not null default 'draft',
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint markets_code_required check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint markets_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint markets_currency_code_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint markets_default_locale_format check (default_locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  constraint markets_supported_locales_required check (array_length(supported_locales, 1) >= 1),
  constraint markets_default_locale_supported check (default_locale = any(supported_locales)),
  constraint markets_status_allowed check (status in ('active', 'inactive', 'draft'))
);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.markets(id) on delete restrict,
  name text not null,
  legal_name text,
  slug text,
  email text,
  contact_email text,
  primary_email text,
  reservation_email text,
  phone text,
  website text,
  instagram text,
  facebook text,
  tiktok text,
  google_maps_url text,
  google_place_id text,
  address text,
  street_address text,
  district text,
  neighborhood text,
  city text,
  state_region text,
  postal_code text,
  country text,
  latitude numeric,
  longitude numeric,
  cuisine text,
  cuisine_type text,
  cuisine_categories jsonb not null default '[]'::jsonb,
  restaurant_type text,
  price_range text,
  price_level text,
  rating numeric not null default 4.5,
  description text,
  description_en text,
  description_es text,
  description_hu text,
  short_description text,
  full_description text,
  logo_url text,
  hero_image_url text,
  cover_image text,
  card_image text,
  icon_image text,
  menu_pdf_url text,
  gallery_images jsonb not null default '[]'::jsonb,
  gallery_image_order jsonb not null default '[]'::jsonb,
  dining_style text,
  dress_code text,
  accessibility_info text,
  parking_info text,
  public_contact_info text,
  social_links jsonb not null default '{}'::jsonb,
  outdoor_seating boolean not null default false,
  parking_available boolean not null default false,
  kids_friendly boolean not null default false,
  pet_friendly boolean not null default false,
  wheelchair_accessible boolean not null default false,
  payment_methods text[] not null default '{}'::text[],
  chef_name text,
  year_opened integer,
  capacity integer,
  table_capacity integer,
  private_room_available boolean not null default false,
  opening_hours text,
  opening_hours_json jsonb not null default '{}'::jsonb,
  service_periods jsonb not null default '[]'::jsonb,
  holiday_exceptions jsonb not null default '[]'::jsonb,
  temporary_closures jsonb not null default '[]'::jsonb,
  primary_timezone text not null default 'America/New_York',
  currency_code text not null default 'USD',
  default_language text,
  supported_languages jsonb not null default '["en"]'::jsonb,
  owner_user_id uuid references auth.users(id) on delete set null,
  status public.restaurant_status not null default 'pending',
  onboarding_status text not null default 'draft',
  visible_on_guest_site boolean not null default false,
  is_test_data boolean not null default false,
  is_test_restaurant boolean not null default false,
  is_featured boolean not null default false,
  is_new_restaurant boolean not null default false,
  accepts_reservation_requests boolean not null default true,
  reservation_provider text not null default 'internal',
  reservation_integration_status text not null default 'not_connected',
  reservation_acceptance_mode text not null default 'manual',
  partner_approval_required boolean not null default true,
  auto_confirmation boolean not null default false,
  reservation_interval_minutes integer not null default 30,
  booking_interval_minutes integer not null default 30,
  minimum_advance_minutes integer not null default 0,
  maximum_booking_window_days integer not null default 30,
  booking_horizon_days integer not null default 30,
  minimum_booking_notice_minutes integer not null default 30,
  default_table_duration_minutes integer not null default 90,
  grace_period_minutes integer not null default 15,
  last_seating_time time,
  min_party_size integer not null default 1,
  max_party_size integer not null default 8,
  available_party_sizes jsonb not null default '[1,2,3,4,5,6,7,8]'::jsonb,
  same_day_reservations_enabled boolean not null default true,
  waitlist_enabled boolean not null default false,
  special_requests_enabled boolean not null default true,
  accessibility_requests_enabled boolean not null default true,
  high_chair_requests_enabled boolean not null default true,
  occasion_field_enabled boolean not null default true,
  guest_notes_enabled boolean not null default true,
  internal_notes_enabled boolean not null default true,
  cancellation_policy text,
  no_show_policy text,
  confirmation_message text,
  arrival_instructions text,
  restaurant_total_capacity integer,
  table_configuration_status text not null default 'not_configured',
  capacity_configuration jsonb not null default '{}'::jsonb,
  activation_confirmed_at timestamptz,
  activation_confirmed_by uuid references auth.users(id) on delete set null,
  status_reason text,
  billing_plan text not null default 'free',
  billing_status text not null default 'trialing',
  monthly_fee numeric not null default 0,
  fee_per_booking numeric not null default 0,
  min_discount_percent numeric not null default 10,
  max_discount_percent numeric not null default 30,
  target_margin_percent numeric,
  average_service_minutes integer,
  weak_hours text[] not null default '{}'::text[],
  discount_rules jsonb not null default '{}'::jsonb,
  ai_discount_enabled boolean not null default false,
  calendar_planning_enabled boolean not null default false,
  views_count integer not null default 0,
  seo_title text,
  seo_description text,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  duplicate_override_reason text,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  onboarding_completed_at timestamptz,
  constraint restaurants_party_size_check check (min_party_size >= 1 and max_party_size >= min_party_size),
  constraint restaurants_total_capacity_nonnegative check (restaurant_total_capacity is null or restaurant_total_capacity >= 0),
  constraint restaurants_table_configuration_status_check check (table_configuration_status in ('not_configured', 'partial', 'configured')),
  constraint restaurants_reservation_acceptance_mode_check check (reservation_acceptance_mode in ('automatic', 'manual'))
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  email text not null,
  full_name text,
  phone text,
  role public.profile_role not null default 'guest',
  preferred_language text not null default 'en',
  status text not null default 'active',
  is_test_data boolean not null default false,
  invited_at timestamptz,
  invitation_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text,
  first_name text,
  last_name text,
  phone text,
  city text,
  region text,
  postal_code text,
  preferred_dining_areas text[] not null default '{}'::text[],
  max_travel_distance_miles numeric,
  transportation_method text,
  selected_language text,
  email_verified boolean not null default false,
  status text not null default 'active' check (status in ('active', 'blocked', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (email)
);

create table public.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guests(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  profile_key text not null,
  cuisine_preferences text[] not null default '{}'::text[],
  food_preferences text[] not null default '{}'::text[],
  drink_preferences text[] not null default '{}'::text[],
  dietary_needs text[] not null default '{}'::text[],
  allergy_notes text,
  atmosphere_preferences text[] not null default '{}'::text[],
  dining_occasions text[] not null default '{}'::text[],
  dining_companions text[] not null default '{}'::text[],
  typical_party_size text,
  preferred_days text[] not null default '{}'::text[],
  preferred_times text[] not null default '{}'::text[],
  booking_lead_time text,
  preferred_dining_duration text,
  spending_range text,
  selected_discount_levels text[] not null default '{}'::text[],
  minimum_interesting_discount numeric,
  willingness_without_discount text,
  discovery_preference text,
  selection_priorities text[] not null default '{}'::text[],
  favorite_restaurants text[] not null default '{}'::text[],
  excluded_categories text[] not null default '{}'::text[],
  new_restaurant_interest text,
  new_menu_item_interest text,
  notification_preferences text[] not null default '{}'::text[],
  notification_frequency text,
  event_recommendation_interest text,
  future_calendar_interest text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (profile_key)
);

create table public.guest_consents (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guests(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  consent_type text not null,
  terms_version text,
  privacy_policy_version text,
  terms_accepted boolean,
  terms_accepted_at timestamptz,
  privacy_accepted boolean,
  privacy_accepted_at timestamptz,
  marketing_consent boolean,
  marketing_consent_timestamp timestamptz,
  accepted_at timestamptz,
  language text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title_en text not null default 'Discounted table',
  title_es text,
  title_hu text,
  description_en text,
  description_es text,
  description_hu text,
  offer_image text,
  offer_date date not null,
  offer_time time,
  start_time time,
  end_time time,
  valid_days text[] not null default '{}'::text[],
  discount_type text not null default 'percent',
  discount_value numeric not null default 20,
  discount_percent numeric not null default 20,
  available_tables integer not null default 1 check (available_tables >= 0),
  reserved_tables integer not null default 0 check (reserved_tables >= 0),
  seat_count integer not null default 4 check (seat_count >= 0),
  reserved_seats integer not null default 0 check (reserved_seats >= 0),
  min_party_size integer not null default 1 check (min_party_size >= 1),
  max_party_size integer not null default 4 check (max_party_size >= 1),
  status public.offer_status not null default 'active',
  minimum_spend numeric,
  applies_to_drinks boolean not null default true,
  time_limit_minutes integer,
  blackout_periods jsonb not null default '[]'::jsonb,
  combinable boolean not null default false,
  custom_terms jsonb not null default '{}'::jsonb,
  structured_conditions jsonb not null default '{}'::jsonb,
  redemption_rules jsonb not null default '{}'::jsonb,
  performance jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  ai_recommendation_id uuid,
  is_test_data boolean not null default false,
  is_test_offer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_party_size_check check (max_party_size >= min_party_size),
  constraint offers_reserved_capacity_check check (reserved_tables <= available_tables and reserved_seats <= seat_count)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  offer_id uuid not null references public.offers(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  party_size integer not null check (party_size >= 1),
  reservation_date date,
  reservation_time time,
  notes text,
  partner_notes text,
  status public.reservation_status not null default 'pending',
  source text not null default 'smarttable',
  booking_source text not null default 'SMARTTABLE',
  booking_status text not null default 'pending',
  guest_language text not null default 'en',
  cancelled_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  completed_at timestamptz,
  no_show_at timestamptz,
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users(id) on delete set null,
  cancelled_by_label text,
  is_test_data boolean not null default false,
  is_test_reservation boolean not null default false,
  test_record boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  recipient text,
  provider text,
  provider_id text,
  delivery_status text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.site_content (
  key text primary key,
  value_en text,
  value_es text,
  value_hu text,
  content_type text not null default 'text',
  group_name text not null default 'general',
  updated_at timestamptz not null default now()
);

create table public.restaurant_view_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.restaurant_followers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_email text not null,
  guest_name text,
  guest_id uuid references auth.users(id) on delete set null,
  notification_enabled boolean not null default true,
  preferred_language text not null default 'en',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, guest_email)
);

create table public.restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  guest_email text,
  guest_name text,
  food_rating numeric,
  service_rating numeric,
  ambience_rating numeric,
  overall_rating numeric,
  comment text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  partner_user_id uuid references auth.users(id) on delete set null,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  category text not null default 'system',
  title text not null,
  body text,
  action_url text,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  read_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.guest_notifications (
  id uuid primary key default gen_random_uuid(),
  guest_email text not null,
  guest_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  type text not null,
  title text not null,
  message text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  channel text not null default 'in_app',
  event_type text not null,
  status text not null default 'created',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text,
  role text not null default 'owner' check (role in ('owner', 'manager', 'reservation_staff', 'marketing_staff', 'read_only', 'staff', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled', 'revoked', 'expired')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  is_test_data boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, email)
);

create table public.partner_invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null,
  full_name text,
  restaurant_role text not null default 'owner' check (restaurant_role in ('owner', 'manager', 'reservation_staff', 'marketing_staff', 'read_only')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  is_test_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, email, status)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  target_user_id uuid references auth.users(id) on delete set null,
  target_role text,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  entity_type text,
  entity_id uuid,
  action text not null,
  result text not null default 'success',
  previous_value jsonb,
  new_value jsonb,
  reason text,
  override_reason text,
  denial_reason text,
  request_id text,
  ip_address text,
  ip_hash text,
  impersonation_session_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  success boolean,
  created_at timestamptz not null default now()
);

create table public.restaurant_dining_areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  capacity integer not null default 0 check (capacity >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order integer not null default 0,
  is_test_data boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, code)
);

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  dining_area_id uuid references public.restaurant_dining_areas(id) on delete set null,
  table_identifier text not null,
  display_name text,
  min_capacity integer not null default 1 check (min_capacity >= 0),
  max_capacity integer not null default 2 check (max_capacity >= 0),
  is_combinable boolean not null default false,
  combinable_with jsonb not null default '[]'::jsonb,
  is_accessible boolean not null default false,
  seating_type text not null default 'indoor' check (seating_type in ('indoor', 'outdoor', 'mixed', 'private')),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  has_reservations boolean not null default false,
  is_test_data boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, table_identifier),
  check (min_capacity <= max_capacity)
);

create table public.restaurant_service_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  dining_area_id uuid references public.restaurant_dining_areas(id) on delete cascade,
  service_period_key text not null,
  day_of_week text,
  effective_date date,
  start_time time,
  end_time time,
  capacity integer not null default 0 check (capacity >= 0),
  table_capacity integer not null default 0 check (table_capacity >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_status_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  previous_status text,
  new_status text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  result text not null default 'success' check (result in ('success', 'failure')),
  changed_fields jsonb not null default '[]'::jsonb,
  request_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  is_test_data boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.reservation_status_events (
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

create table public.dining_consumption_uploads (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  profile_key text,
  guest_email text,
  photo_urls jsonb not null default '[]'::jsonb,
  review_note text,
  food_rating numeric,
  service_rating numeric,
  ambience_rating numeric,
  overall_rating numeric,
  status text not null default 'submitted',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  email_type text,
  recipient text,
  recipient_email text,
  recipient_user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  provider text not null default 'resend',
  provider_id text,
  provider_message_id text,
  delivery_status text,
  status text,
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  locale text,
  template_version text,
  idempotency_key text,
  message_campaign_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_logs_status_check check (coalesce(status, delivery_status) in ('pending', 'queued', 'sending', 'sent', 'delayed', 'delivered', 'bounced', 'failed', 'complained', 'cancelled'))
);

create table public.email_queue (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid references public.email_logs(id) on delete set null,
  email_type text not null,
  event_type text,
  recipient_email text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  message_campaign_id uuid,
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
  updated_at timestamptz not null default now(),
  constraint email_queue_status_check check (status in ('pending', 'queued', 'sending', 'sent', 'delayed', 'delivered', 'bounced', 'failed', 'complained', 'cancelled')),
  constraint email_queue_attempts_check check (attempt_count >= 0 and max_attempts >= 1)
);

create table public.guest_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  event_type text not null,
  ip_hash text,
  ip_masked text,
  user_agent_summary text,
  email_notification_status text not null default 'not_applicable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  version text not null,
  language text not null default 'en',
  title text not null,
  content text,
  content_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  effective_at timestamptz,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_documents_document_type_supported check (document_type in ('terms_of_service', 'privacy_policy', 'cookie_policy', 'guest_platform_rules', 'marketing_consent', 'location_personalization_consent', 'data_processing_addendum')),
  constraint legal_documents_type_version_language_unique unique (document_type, version, language)
);

create table public.user_legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_email text,
  document_type text not null,
  document_version text not null,
  language text not null default 'en',
  status text not null default 'accepted' check (status in ('accepted', 'withdrawn', 'superseded')),
  accepted_at timestamptz,
  withdrawn_at timestamptz,
  ip_hash text,
  user_agent text,
  source text not null default 'guest_account',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'failed', 'expired')),
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  download_count integer not null default 0,
  download_token_hash text,
  export_payload jsonb,
  error_code text,
  email_notification_status text not null default 'not_attempted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  guest_email text not null,
  request_type text not null,
  status text not null default 'new',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key,
  label text not null,
  status text not null default 'hidden',
  enabled boolean not null default false,
  audience text,
  description text,
  owner text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'error',
  message text not null,
  route text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'info',
  title text not null,
  message text,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_name text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.communication_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  transactional_email_enabled boolean not null default true,
  marketing_email_enabled boolean not null default false,
  transactional_sms_enabled boolean not null default false,
  marketing_sms_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  preferred_language text not null default 'en',
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);

create table public.communication_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'in_app', 'push')),
  consent_type text not null check (consent_type in ('transactional', 'marketing')),
  status text not null check (status in ('granted', 'revoked')),
  source text not null default 'account_preferences',
  consent_text_version text not null,
  ip_address text,
  user_agent text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  normalized_destination text not null,
  channel text not null check (channel in ('email', 'sms', 'push', 'in_app')),
  reason text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  campaign_type text not null default 'partner_marketing' check (campaign_type in ('partner_marketing', 'admin_broadcast', 'diagnostic_test')),
  channel text not null default 'email' check (channel in ('email')),
  name text not null,
  subject_en text,
  subject_es text,
  subject_hu text,
  preheader_en text,
  preheader_es text,
  preheader_hu text,
  body_en text,
  body_es text,
  body_hu text,
  audience_definition jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'queued', 'sending', 'sent', 'cancelled', 'failed', 'archived')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  opened_count integer not null default 0,
  clicked_count integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'email' check (channel in ('email')),
  destination_hash text not null,
  language text not null default 'en',
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'delayed', 'bounced', 'failed', 'complained', 'unsubscribed', 'opened', 'clicked', 'cancelled')),
  provider_message_id text,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  opened_at timestamptz,
  clicked_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  dead_letter_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.email_logs
  add constraint email_logs_message_campaign_fkey
  foreign key (message_campaign_id) references public.message_campaigns(id) on delete set null;

alter table public.email_queue
  add constraint email_queue_message_campaign_fkey
  foreign key (message_campaign_id) references public.message_campaigns(id) on delete set null;

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  stripe_product_id text,
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  internal_name text not null unique,
  display_name_en text not null,
  display_name_es text not null,
  display_name_hu text not null,
  description_en text not null default '',
  description_es text not null default '',
  description_hu text not null default '',
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  annual_price_cents integer not null default 0 check (annual_price_cents >= 0),
  included_features jsonb not null default '{}'::jsonb,
  email_monthly_limit integer check (email_monthly_limit is null or email_monthly_limit >= 0),
  sms_monthly_limit integer check (sms_monthly_limit is null or sms_monthly_limit >= 0),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  internal_plan text not null default 'no_subscription' check (internal_plan in ('no_subscription', 'trial', 'basic', 'professional', 'enterprise', 'complimentary_test')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annual')),
  status text not null default 'incomplete' check (status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused')),
  subscription_status text not null default 'incomplete' check (subscription_status in ('no_subscription', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused')),
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  last_payment_status text,
  payment_grace_period_end timestamptz,
  grace_period_ends_at timestamptz,
  complimentary_access_until timestamptz,
  complimentary_reason text,
  trial_extension_count integer not null default 0 check (trial_extension_count >= 0),
  last_invoice_id text,
  last_invoice_number text,
  last_invoice_status text,
  last_invoice_url text,
  last_payment_error_code text,
  last_payment_error_message_safe text,
  default_payment_method_summary jsonb not null default '{}'::jsonb,
  billing_access_override boolean not null default false,
  billing_access_override_reason text,
  billing_access_override_expires_at timestamptz,
  stripe_livemode boolean not null default false,
  billing_environment text not null default 'test' check (billing_environment in ('test', 'live')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  billing_email text,
  billing_contact_name text,
  billing_country text,
  billing_state_region text,
  tax_identifier text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id)
);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'failed', 'ignored', 'duplicate')),
  error_message text,
  processed_at timestamptz,
  stripe_livemode boolean not null default false,
  billing_environment text not null default 'test' check (billing_environment in ('test', 'live')),
  stripe_request_id text,
  sanitized_error jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  idempotency_key text,
  locked_at timestamptz,
  next_attempt_at timestamptz,
  dead_letter_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  restaurant_subscription_id uuid references public.restaurant_subscriptions(id) on delete set null,
  stripe_invoice_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  invoice_number text,
  status text not null default 'draft',
  payment_status text,
  amount_due_cents integer,
  amount_paid_cents integer,
  currency text,
  invoice_pdf text,
  hosted_invoice_url text,
  period_start timestamptz,
  period_end timestamptz,
  billing_environment text not null default 'test',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_access_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  override_status text not null default 'active' check (override_status in ('active', 'expired', 'revoked')),
  reason text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_audit_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  result text not null default 'success' check (result in ('success', 'failure')),
  stripe_event_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  internal_plan text,
  subscription_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table public.smarttable_schema_baselines (
  id uuid primary key default gen_random_uuid(),
  baseline_name text not null,
  baseline_version text not null,
  checksum text not null,
  applied_at timestamptz not null default now(),
  applied_environment text not null,
  source_commit text,
  applied_by text,
  verification_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  constraint smarttable_schema_baselines_verification_status_check check (verification_status in ('pending', 'verified', 'failed', 'superseded'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_market_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code := lower(trim(new.code));
  new.name := trim(new.name);
  new.country_code := upper(trim(new.country_code));
  new.city_name := trim(new.city_name);
  new.currency_code := upper(trim(new.currency_code));
  new.timezone := trim(new.timezone);
  new.default_locale := trim(new.default_locale);
  new.status := lower(trim(new.status));
  new.configuration := coalesce(new.configuration, '{}'::jsonb);
  perform now() at time zone new.timezone;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'Invalid market timezone: %', new.timezone using errcode = '22023';
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := lower(coalesce(new.raw_user_meta_data->>'role', 'guest'));
  if v_role = 'superadmin' then
    v_role := 'super_admin';
  elsif v_role not in ('guest', 'partner', 'restaurant', 'admin', 'super_admin') then
    v_role := 'guest';
  end if;

  insert into public.profiles (id, email, full_name, role, preferred_language)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    v_role::public.profile_role,
    coalesce(new.raw_user_meta_data->>'preferred_language', 'en')
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role::text in ('admin', 'super_admin', 'superadmin')
    );
$$;

create or replace function public.owns_restaurant(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles p
      left join public.restaurants r on r.id = target_restaurant_id
      where p.id = auth.uid()
        and (
          p.role::text in ('admin', 'super_admin', 'superadmin')
          or (
            p.role::text in ('partner', 'restaurant')
            and (
              p.restaurant_id = target_restaurant_id
              or r.owner_user_id = p.id
              or exists (
                select 1
                from public.restaurant_users ru
                where ru.restaurant_id = target_restaurant_id
                  and ru.status = 'active'
                  and (ru.user_id = p.id or lower(ru.email) = lower(p.email))
              )
            )
          )
        )
    );
$$;

create or replace function public.prevent_published_legal_document_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' and (
    new.document_type is distinct from old.document_type
    or new.version is distinct from old.version
    or new.language is distinct from old.language
    or new.title is distinct from old.title
    or new.content is distinct from old.content
    or new.content_url is distinct from old.content_url
    or new.published_at is distinct from old.published_at
    or new.effective_at is distinct from old.effective_at
  ) then
    raise exception 'Published legal document versions are immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.mark_test_reservation_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_is_test boolean := false;
  v_offer_is_test boolean := false;
begin
  select coalesce(r.is_test_restaurant, false), coalesce(o.is_test_offer, false)
  into v_restaurant_is_test, v_offer_is_test
  from public.restaurants r
  left join public.offers o on o.id = new.offer_id
  where r.id = new.restaurant_id
  limit 1;

  if v_restaurant_is_test or v_offer_is_test then
    new.is_test_reservation := true;
    new.test_record := true;
    new.is_test_data := true;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'is_test_reservation', true,
      'reservation_provider', 'internal_test'
    );
  end if;
  return new;
end;
$$;

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

  select o.* into v_offer
  from public.offers o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_offer_id
    and o.status = 'active'
    and r.status = 'approved'
    and coalesce(r.visible_on_guest_site, true) = true
    and coalesce(r.accepts_reservation_requests, true) = true
    and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
  for update of o;

  if not found then
    raise exception 'OFFER_UNAVAILABLE';
  end if;

  select r.* into v_restaurant
  from public.restaurants r
  where r.id = v_offer.restaurant_id;

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

  if p_party_size < coalesce(v_offer.min_party_size, 1) or p_party_size > coalesce(v_offer.max_party_size, 4) then
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
  set reserved_tables = coalesce(reserved_tables, 0) + 1,
      reserved_seats = coalesce(reserved_seats, 0) + p_party_size
  where id = v_offer.id
    and coalesce(reserved_tables, 0) < coalesce(available_tables, 1)
    and coalesce(reserved_seats, 0) + p_party_size <= coalesce(seat_count, coalesce(available_tables, 1) * coalesce(max_party_size, 4))
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
    booking_status,
    is_test_reservation,
    test_record,
    is_test_data
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
    'pending',
    coalesce(v_restaurant.is_test_restaurant, false) or coalesce(v_offer.is_test_offer, false),
    coalesce(v_restaurant.is_test_restaurant, false) or coalesce(v_offer.is_test_offer, false),
    coalesce(v_restaurant.is_test_data, false) or coalesce(v_offer.is_test_data, false)
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
  v_target_status := replace(replace(v_target_status, '-', '_'), ' ', '_');

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

  if auth.role() <> 'service_role' and not public.is_admin() and not public.owns_restaurant(v_reservation.restaurant_id) then
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
  set status = v_target_status::public.reservation_status,
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

  if v_previous_status not in ('rejected', 'cancelled', 'no_show') and v_target_status in ('rejected', 'cancelled', 'no_show') then
    update public.offers
    set reserved_tables = greatest(coalesce(reserved_tables, 0) - 1, 0),
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

create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'restaurants_total', (select count(*) from public.restaurants),
    'restaurants_pending', (select count(*) from public.restaurants where status = 'pending'),
    'partners_total', (select count(*) from public.profiles where role::text in ('partner', 'restaurant')),
    'offers_active', (select count(*) from public.offers where status = 'active'),
    'reservations_total', (select count(*) from public.reservations),
    'reservations_pending', (select count(*) from public.reservations where status::text in ('pending', 'requested')),
    'reservations_accepted', (select count(*) from public.reservations where status::text in ('accepted', 'confirmed')),
    'reservations_rejected', (select count(*) from public.reservations where status::text = 'rejected'),
    'seats_reserved', coalesce((select sum(party_size) from public.reservations), 0),
    'views_total', coalesce((select sum(views_count) from public.restaurants), 0),
    'favorites_total', (select count(*) from public.restaurant_followers where notification_enabled = true)
  );
$$;

create or replace function public.partner_dashboard_stats(p_restaurant_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when auth.role() <> 'service_role' and not public.is_admin() and not public.owns_restaurant(p_restaurant_id)
    then jsonb_build_object('error', 'Access denied')
    else jsonb_build_object(
      'views', coalesce((select views_count from public.restaurants where id = p_restaurant_id), 0),
      'bookings', (select count(*) from public.reservations where restaurant_id = p_restaurant_id),
      'accepted', (select count(*) from public.reservations where restaurant_id = p_restaurant_id and status::text in ('accepted', 'confirmed')),
      'rejected', (select count(*) from public.reservations where restaurant_id = p_restaurant_id and status::text = 'rejected'),
      'favorites_total', (select count(*) from public.restaurant_followers where restaurant_id = p_restaurant_id and notification_enabled = true)
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
  insert into public.restaurant_view_events(restaurant_id, source)
  values (p_restaurant_id, 'public');

  update public.restaurants
  set views_count = coalesce(views_count, 0) + 1
  where id = p_restaurant_id;
end;
$$;

create or replace view public.restaurant_review_summary as
select
  restaurant_id,
  avg(food_rating) filter (where status = 'approved') as food_rating_avg,
  avg(service_rating) filter (where status = 'approved') as service_rating_avg,
  avg(ambience_rating) filter (where status = 'approved') as ambience_rating_avg,
  avg(overall_rating) filter (where status = 'approved') as overall_rating_avg,
  count(*) filter (where status = 'approved')::integer as review_count
from public.restaurant_reviews
group by restaurant_id;

create or replace view public.restaurant_reviews_overview as
select
  rr.*,
  r.name as restaurant_name
from public.restaurant_reviews rr
join public.restaurants r on r.id = rr.restaurant_id;

create or replace view public.admin_notifications_overview as
select
  an.*,
  p.email as partner_email,
  p.full_name as partner_name,
  r.name as restaurant_name
from public.admin_notifications an
left join public.profiles p on p.id = an.partner_user_id
left join public.restaurants r on r.id = an.restaurant_id;

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
    where rf.restaurant_id = r.id and rf.notification_enabled = true
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
    where o.restaurant_id = r.id and o.status = 'active' and o.offer_date >= current_date
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
  r.slug,
  coalesce(r.visible_on_guest_site, true) as visible_on_guest_site,
  coalesce(r.is_test_restaurant, false) as is_test_restaurant,
  case when coalesce(r.is_test_restaurant, false) then 'Test restaurant - no real reservation' else '' end as test_badge,
  coalesce(r.accepts_reservation_requests, true) as accepts_reservation_requests,
  coalesce(r.reservation_provider, 'smarttable') as reservation_provider,
  coalesce(r.booking_interval_minutes, 30) as booking_interval_minutes,
  coalesce(r.minimum_advance_minutes, 0) as minimum_advance_minutes,
  coalesce(r.maximum_booking_window_days, 30) as maximum_booking_window_days,
  coalesce(r.min_party_size, 1) as restaurant_min_party_size,
  coalesce(r.max_party_size, 8) as restaurant_max_party_size,
  coalesce(r.auto_confirmation, false) as auto_confirmation,
  coalesce(r.partner_approval_required, true) as partner_approval_required,
  coalesce(r.opening_hours_json, '{}'::jsonb) as opening_hours_json
from public.restaurants r
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved'
  and coalesce(r.visible_on_guest_site, true) = true
  and coalesce(r.is_test_restaurant, false) = false;

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
    where rf.restaurant_id = r.id and rf.notification_enabled = true
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
  r.gallery_images,
  r.slug,
  r.status as restaurant_status,
  coalesce(r.visible_on_guest_site, true) as visible_on_guest_site,
  coalesce(r.is_test_restaurant, false) as is_test_restaurant,
  case when coalesce(r.is_test_restaurant, false) then 'Test restaurant - no real reservation' else '' end as test_badge,
  coalesce(r.accepts_reservation_requests, true) as accepts_reservation_requests,
  coalesce(r.reservation_provider, 'smarttable') as reservation_provider,
  coalesce(r.booking_interval_minutes, 30) as booking_interval_minutes,
  coalesce(r.minimum_advance_minutes, 0) as minimum_advance_minutes,
  coalesce(r.maximum_booking_window_days, 30) as maximum_booking_window_days,
  coalesce(r.min_party_size, 1) as restaurant_min_party_size,
  coalesce(r.max_party_size, 8) as restaurant_max_party_size,
  coalesce(r.auto_confirmation, false) as auto_confirmation,
  coalesce(r.partner_approval_required, true) as partner_approval_required,
  coalesce(r.opening_hours_json, '{}'::jsonb) as opening_hours_json,
  coalesce(o.min_party_size, 1) as min_party_size,
  coalesce(o.is_test_offer, false) as is_test_offer
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved'
  and coalesce(r.visible_on_guest_site, true) = true
  and coalesce(r.accepts_reservation_requests, true) = true
  and coalesce(r.is_test_restaurant, false) = false
  and coalesce(o.is_test_offer, false) = false
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
  r.cuisine_type as restaurant_cuisine,
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
  coalesce(p.preferred_language, 'en') as restaurant_language,
  coalesce(rv.is_test_reservation, rv.test_record, r.is_test_restaurant, o.is_test_offer, false) as is_test_reservation,
  coalesce(rv.test_record, rv.is_test_reservation, r.is_test_restaurant, o.is_test_offer, false) as test_record
from public.reservations rv
join public.offers o on o.id = rv.offer_id
join public.restaurants r on r.id = rv.restaurant_id
left join public.profiles p on p.id = r.owner_user_id;

create or replace view public.public_markets as
select
  id,
  code,
  name,
  country_code,
  city_name,
  currency_code,
  timezone,
  default_locale,
  supported_locales,
  status,
  configuration
from public.markets
where status = 'active';

create unique index idx_markets_code_unique on public.markets(code);
create index idx_markets_status_code on public.markets(status, code);
create index idx_markets_country_city on public.markets(country_code, city_name);
create unique index idx_restaurants_slug_unique on public.restaurants(lower(slug)) where slug is not null and slug <> '';
create index idx_restaurants_market_status_visible on public.restaurants(market_id, status, visible_on_guest_site, sort_order);
create index idx_restaurants_admin_lifecycle on public.restaurants(status, onboarding_status, city, country, district, is_test_data, updated_at desc);
create index idx_profiles_role on public.profiles(role);
create index idx_profiles_restaurant_id on public.profiles(restaurant_id);
create index idx_guests_user_email on public.guests(user_id, email);
create index idx_guest_profiles_min_discount on public.guest_profiles(minimum_interesting_discount);
create index idx_guest_profiles_preferred_days on public.guest_profiles using gin(preferred_days);
create index idx_guest_profiles_preferred_times on public.guest_profiles using gin(preferred_times);
create index idx_offers_restaurant_date on public.offers(restaurant_id, offer_date, offer_time);
create index idx_offers_status_date on public.offers(status, offer_date);
create index idx_offers_restaurant_start on public.offers(restaurant_id, offer_date, start_time);
create index idx_reservations_restaurant on public.reservations(restaurant_id, created_at desc);
create index idx_reservations_guest_email on public.reservations(guest_email);
create index idx_reservations_status on public.reservations(status);
create index idx_restaurant_followers_restaurant on public.restaurant_followers(restaurant_id, created_at desc);
create index idx_restaurant_followers_email on public.restaurant_followers(guest_email);
create index idx_restaurant_reviews_restaurant on public.restaurant_reviews(restaurant_id, status, created_at desc);
create index idx_admin_notifications_read on public.admin_notifications(read_at, created_at desc);
create index idx_restaurant_view_events_restaurant on public.restaurant_view_events(restaurant_id, created_at desc);
create index idx_analytics_restaurant on public.analytics_events(restaurant_id, event_type, created_at desc);
create index idx_audit_logs_entity on public.audit_logs(entity_type, entity_id, created_at desc);
create index idx_audit_logs_restaurant_created on public.audit_logs(restaurant_id, created_at desc);
create index idx_audit_logs_impersonation_session on public.audit_logs(impersonation_session_id, created_at desc) where impersonation_session_id is not null;
create index idx_partner_invitations_restaurant_status on public.partner_invitations(restaurant_id, status, expires_at);
create index idx_partner_invitations_email_status on public.partner_invitations(lower(email), status);
create index idx_restaurant_dining_areas_restaurant_status on public.restaurant_dining_areas(restaurant_id, status, sort_order);
create index idx_restaurant_tables_restaurant_status on public.restaurant_tables(restaurant_id, status, table_identifier);
create index idx_restaurant_tables_dining_area on public.restaurant_tables(dining_area_id, status);
create index idx_restaurant_capacity_overrides_restaurant_status on public.restaurant_service_capacity_overrides(restaurant_id, status, effective_date, day_of_week);
create unique index idx_restaurant_capacity_overrides_identity on public.restaurant_service_capacity_overrides(
  restaurant_id,
  coalesce(dining_area_id, '00000000-0000-0000-0000-000000000000'::uuid),
  service_period_key,
  coalesce(day_of_week, ''),
  coalesce(effective_date, date '1900-01-01'),
  coalesce(start_time, time '00:00'),
  coalesce(end_time, time '00:00')
);
create index idx_restaurant_status_history_restaurant_created on public.restaurant_status_history(restaurant_id, created_at desc);
create index idx_reservation_status_events_reservation on public.reservation_status_events(reservation_id, created_at desc);
create unique index idx_email_logs_idempotency_key on public.email_logs(idempotency_key) where idempotency_key is not null;
create index idx_email_logs_status_created on public.email_logs((coalesce(status, delivery_status)), created_at desc);
create index idx_email_logs_provider_message on public.email_logs(provider_message_id) where provider_message_id is not null;
create index idx_email_logs_reservation_type on public.email_logs(reservation_id, email_type, created_at desc);
create unique index idx_email_queue_idempotency_key on public.email_queue(idempotency_key);
create index idx_email_queue_status_next_attempt on public.email_queue(status, next_attempt_at) where status in ('pending', 'queued', 'sending', 'delayed');
create index idx_email_queue_provider_message on public.email_queue(provider_message_id) where provider_message_id is not null;
create index idx_email_queue_reservation_type on public.email_queue(reservation_id, email_type, created_at desc) where reservation_id is not null;
create index idx_guest_auth_events_user_event_created on public.guest_auth_events(user_id, event_type, created_at desc);
create index idx_guest_auth_events_ip_hash_created on public.guest_auth_events(ip_hash, created_at desc);
create unique index idx_legal_documents_one_current on public.legal_documents(document_type, language) where is_current = true;
create index idx_user_legal_consents_user_type_created on public.user_legal_consents(user_id, document_type, created_at desc);
create index idx_data_export_requests_user_status_created on public.data_export_requests(user_id, status, created_at desc);
create index idx_data_export_requests_token_hash on public.data_export_requests(download_token_hash);
create unique index idx_suppression_list_destination_channel on public.suppression_list(normalized_destination, channel);
create index idx_communication_consents_user_created on public.communication_consents(user_id, created_at desc);
create index idx_message_campaigns_restaurant_status on public.message_campaigns(restaurant_id, status, scheduled_at, created_at desc);
create index idx_message_recipients_campaign_status on public.message_recipients(campaign_id, status, queued_at);
create unique index idx_message_recipients_campaign_user_channel on public.message_recipients(campaign_id, user_id, channel) where user_id is not null;
create unique index idx_message_recipients_campaign_destination on public.message_recipients(campaign_id, destination_hash, channel);
create unique index idx_subscription_plans_internal_name on public.subscription_plans(internal_name);
create index idx_subscription_plans_active_sort on public.subscription_plans(is_active, sort_order, monthly_price_cents);
create unique index idx_restaurant_subscriptions_stripe_subscription on public.restaurant_subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;
create unique index idx_restaurant_subscriptions_one_active_fixed on public.restaurant_subscriptions(restaurant_id) where subscription_status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');
create index idx_restaurant_subscriptions_restaurant on public.restaurant_subscriptions(restaurant_id, status, current_period_end desc);
create index idx_restaurant_subscriptions_fixed_access on public.restaurant_subscriptions(restaurant_id, internal_plan, subscription_status, current_period_end desc);
create unique index idx_restaurant_billing_accounts_customer on public.restaurant_billing_accounts(stripe_customer_id) where stripe_customer_id is not null;
create unique index idx_billing_events_stripe_event on public.billing_events(stripe_event_id);
create index idx_billing_events_restaurant_created on public.billing_events(restaurant_id, created_at desc);
create unique index idx_billing_events_idempotency_key on public.billing_events(idempotency_key) where idempotency_key is not null;
create index idx_invoices_restaurant_subscription on public.invoices(restaurant_subscription_id, created_at desc);
create unique index idx_invoices_stripe_invoice on public.invoices(stripe_invoice_id) where stripe_invoice_id is not null;
create index idx_billing_access_overrides_restaurant_active on public.billing_access_overrides(restaurant_id, override_status, expires_at desc);
create index idx_billing_audit_events_restaurant_created on public.billing_audit_events(restaurant_id, created_at desc);
create unique index idx_billing_audit_events_stripe_event on public.billing_audit_events(stripe_event_id, action) where stripe_event_id is not null;

create trigger markets_validate_record before insert or update on public.markets for each row execute function public.validate_market_record();
create trigger markets_set_updated_at before update on public.markets for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger restaurants_set_updated_at before update on public.restaurants for each row execute function public.set_updated_at();
create trigger offers_set_updated_at before update on public.offers for each row execute function public.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations for each row execute function public.set_updated_at();
create trigger guests_set_updated_at before update on public.guests for each row execute function public.set_updated_at();
create trigger guest_profiles_set_updated_at before update on public.guest_profiles for each row execute function public.set_updated_at();
create trigger restaurant_followers_set_updated_at before update on public.restaurant_followers for each row execute function public.set_updated_at();
create trigger restaurant_reviews_set_updated_at before update on public.restaurant_reviews for each row execute function public.set_updated_at();
create trigger restaurant_users_set_updated_at before update on public.restaurant_users for each row execute function public.set_updated_at();
create trigger partner_invitations_set_updated_at before update on public.partner_invitations for each row execute function public.set_updated_at();
create trigger restaurant_dining_areas_set_updated_at before update on public.restaurant_dining_areas for each row execute function public.set_updated_at();
create trigger restaurant_tables_set_updated_at before update on public.restaurant_tables for each row execute function public.set_updated_at();
create trigger restaurant_capacity_overrides_set_updated_at before update on public.restaurant_service_capacity_overrides for each row execute function public.set_updated_at();
create trigger reservations_mark_test_flags before insert on public.reservations for each row execute function public.mark_test_reservation_flags();
create trigger email_logs_set_updated_at before update on public.email_logs for each row execute function public.set_updated_at();
create trigger email_queue_set_updated_at before update on public.email_queue for each row execute function public.set_updated_at();
create trigger legal_documents_prevent_published_mutation before update on public.legal_documents for each row execute function public.prevent_published_legal_document_mutation();
create trigger user_legal_consents_set_updated_at before update on public.user_legal_consents for each row execute function public.set_updated_at();
create trigger data_export_requests_set_updated_at before update on public.data_export_requests for each row execute function public.set_updated_at();
create trigger app_settings_set_updated_at before update on public.app_settings for each row execute function public.set_updated_at();
create trigger feature_flags_set_updated_at before update on public.feature_flags for each row execute function public.set_updated_at();
create trigger communication_preferences_set_updated_at before update on public.communication_preferences for each row execute function public.set_updated_at();
create trigger message_campaigns_set_updated_at before update on public.message_campaigns for each row execute function public.set_updated_at();
create trigger subscription_plans_set_updated_at before update on public.subscription_plans for each row execute function public.set_updated_at();
create trigger restaurant_subscriptions_set_updated_at before update on public.restaurant_subscriptions for each row execute function public.set_updated_at();
create trigger restaurant_billing_accounts_set_updated_at before update on public.restaurant_billing_accounts for each row execute function public.set_updated_at();
create trigger billing_access_overrides_set_updated_at before update on public.billing_access_overrides for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices for each row execute function public.set_updated_at();

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.markets enable row level security;
alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.guests enable row level security;
alter table public.guest_profiles enable row level security;
alter table public.guest_consents enable row level security;
alter table public.offers enable row level security;
alter table public.reservations enable row level security;
alter table public.email_events enable row level security;
alter table public.site_content enable row level security;
alter table public.restaurant_view_events enable row level security;
alter table public.restaurant_followers enable row level security;
alter table public.restaurant_reviews enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.notifications enable row level security;
alter table public.guest_notifications enable row level security;
alter table public.notification_logs enable row level security;
alter table public.restaurant_users enable row level security;
alter table public.partner_invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.restaurant_dining_areas enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.restaurant_service_capacity_overrides enable row level security;
alter table public.restaurant_status_history enable row level security;
alter table public.reservation_status_events enable row level security;
alter table public.dining_consumption_uploads enable row level security;
alter table public.email_logs enable row level security;
alter table public.email_queue enable row level security;
alter table public.guest_auth_events enable row level security;
alter table public.legal_documents enable row level security;
alter table public.user_legal_consents enable row level security;
alter table public.data_export_requests enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.feature_flags enable row level security;
alter table public.app_settings enable row level security;
alter table public.app_error_logs enable row level security;
alter table public.admin_alerts enable row level security;
alter table public.analytics_events enable row level security;
alter table public.communication_preferences enable row level security;
alter table public.communication_consents enable row level security;
alter table public.suppression_list enable row level security;
alter table public.message_campaigns enable row level security;
alter table public.message_recipients enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.restaurant_subscriptions enable row level security;
alter table public.restaurant_billing_accounts enable row level security;
alter table public.billing_events enable row level security;
alter table public.invoices enable row level security;
alter table public.billing_access_overrides enable row level security;
alter table public.billing_audit_events enable row level security;
alter table public.smarttable_schema_baselines enable row level security;

create policy markets_read_active_or_admin on public.markets for select using (status = 'active' or public.is_admin());
create policy markets_admin_write on public.markets for all using (public.is_admin()) with check (public.is_admin());
create policy profiles_read_self_or_admin on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_self_or_admin on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy restaurants_public_approved on public.restaurants for select using (status = 'approved' and visible_on_guest_site = true and is_test_restaurant = false);
create policy restaurants_admin_all on public.restaurants for all using (public.is_admin()) with check (public.is_admin());
create policy restaurants_partner_read on public.restaurants for select using (public.owns_restaurant(id));
create policy restaurants_partner_update on public.restaurants for update using (public.owns_restaurant(id)) with check (public.owns_restaurant(id));
create policy offers_public_active on public.offers for select using (
  status = 'active'
  and is_test_offer = false
  and exists (
    select 1 from public.restaurants r
    where r.id = offers.restaurant_id
      and r.status = 'approved'
      and r.visible_on_guest_site = true
      and r.is_test_restaurant = false
  )
);
create policy offers_admin_all on public.offers for all using (public.is_admin()) with check (public.is_admin());
create policy offers_restaurant_manage on public.offers for all using (public.owns_restaurant(restaurant_id)) with check (public.owns_restaurant(restaurant_id));
create policy reservations_guest_read on public.reservations for select using (guest_id = auth.uid() or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', '')));
create policy reservations_restaurant_read on public.reservations for select using (public.owns_restaurant(restaurant_id));
create policy reservations_restaurant_update on public.reservations for update using (public.owns_restaurant(restaurant_id) or public.is_admin()) with check (public.owns_restaurant(restaurant_id) or public.is_admin());
create policy reservations_admin_all on public.reservations for all using (public.is_admin()) with check (public.is_admin());
create policy site_content_public_read on public.site_content for select using (true);
create policy site_content_admin_all on public.site_content for all using (public.is_admin()) with check (public.is_admin());
create policy restaurant_view_events_select_owner on public.restaurant_view_events for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
create policy restaurant_followers_owner_admin on public.restaurant_followers for select using (public.is_admin() or public.owns_restaurant(restaurant_id) or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', '')));
create policy restaurant_reviews_select_scoped on public.restaurant_reviews for select using (status = 'approved' or public.is_admin() or public.owns_restaurant(restaurant_id));
create policy restaurant_reviews_admin_all on public.restaurant_reviews for all using (public.is_admin()) with check (public.is_admin());
create policy admin_notifications_admin_all on public.admin_notifications for all using (public.is_admin()) with check (public.is_admin());
create policy notifications_owner_or_admin on public.notifications for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy guest_notifications_owner_or_admin on public.guest_notifications for all using (public.is_admin() or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', ''))) with check (public.is_admin() or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', '')));
create policy notification_logs_admin on public.notification_logs for all using (public.is_admin()) with check (public.is_admin());
create policy restaurant_users_scoped_read on public.restaurant_users for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
create policy restaurant_users_admin_write on public.restaurant_users for all using (public.is_admin()) with check (public.is_admin());
create policy partner_invitations_admin_all on public.partner_invitations for all using (public.is_admin()) with check (public.is_admin());
create policy partner_invitations_restaurant_owner_read on public.partner_invitations for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
create policy audit_admin_read on public.audit_logs for select using (public.is_admin());
create policy audit_admin_insert on public.audit_logs for insert with check (public.is_admin());
create policy restaurant_dining_areas_admin_all on public.restaurant_dining_areas for all using (public.is_admin()) with check (public.is_admin());
create policy restaurant_dining_areas_partner_read on public.restaurant_dining_areas for select using (public.owns_restaurant(restaurant_id));
create policy restaurant_tables_admin_all on public.restaurant_tables for all using (public.is_admin()) with check (public.is_admin());
create policy restaurant_tables_partner_read on public.restaurant_tables for select using (public.owns_restaurant(restaurant_id));
create policy restaurant_capacity_overrides_admin_all on public.restaurant_service_capacity_overrides for all using (public.is_admin()) with check (public.is_admin());
create policy restaurant_capacity_overrides_partner_read on public.restaurant_service_capacity_overrides for select using (public.owns_restaurant(restaurant_id));
create policy restaurant_status_history_admin_read on public.restaurant_status_history for select using (public.is_admin());
create policy restaurant_status_history_admin_insert on public.restaurant_status_history for insert with check (public.is_admin());
create policy restaurant_status_history_partner_read on public.restaurant_status_history for select using (public.owns_restaurant(restaurant_id));
create policy reservation_status_events_admin_partner_read on public.reservation_status_events for select using (
  public.is_admin() or exists (
    select 1 from public.reservations rv
    where rv.id = reservation_status_events.reservation_id
      and public.owns_restaurant(rv.restaurant_id)
  )
);
create policy reservation_status_events_service_insert on public.reservation_status_events for insert with check (auth.role() = 'service_role' or public.is_admin());
create policy dining_consumption_uploads_owner_scoped on public.dining_consumption_uploads for all using (public.is_admin() or public.owns_restaurant(restaurant_id) or user_id = auth.uid()) with check (public.is_admin() or public.owns_restaurant(restaurant_id) or user_id = auth.uid());
create policy email_events_admin_only on public.email_events for all using (public.is_admin()) with check (public.is_admin());
create policy email_logs_service_admin on public.email_logs for all using (auth.role() = 'service_role' or public.is_admin()) with check (auth.role() = 'service_role' or public.is_admin());
create policy email_queue_service_admin on public.email_queue for all using (auth.role() = 'service_role' or public.is_admin()) with check (auth.role() = 'service_role' or public.is_admin());
create policy guest_auth_events_admin_read on public.guest_auth_events for select using (public.is_admin());
create policy guest_auth_events_service_write on public.guest_auth_events for insert with check (auth.role() = 'service_role' or public.is_admin());
create policy guests_owner_or_admin on public.guests for all using (public.is_admin() or user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))) with check (public.is_admin() or user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt()->>'email', '')));
create policy guest_profiles_owner_or_admin on public.guest_profiles for all using (public.is_admin() or user_id = auth.uid()) with check (public.is_admin() or user_id = auth.uid());
create policy guest_consents_owner_or_admin on public.guest_consents for all using (public.is_admin() or user_id = auth.uid() or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', ''))) with check (public.is_admin() or user_id = auth.uid() or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', '')));
create policy legal_documents_public_current_read on public.legal_documents for select using (status = 'published' or public.is_admin());
create policy legal_documents_admin_write_versions on public.legal_documents for all using (public.is_admin()) with check (public.is_admin());
create policy user_legal_consents_owner_read on public.user_legal_consents for select using (auth.uid() = user_id or public.is_admin());
create policy user_legal_consents_service_write on public.user_legal_consents for all using (public.is_admin() or auth.role() = 'service_role') with check (public.is_admin() or auth.role() = 'service_role');
create policy data_export_requests_owner_read on public.data_export_requests for select using (auth.uid() = user_id or public.is_admin());
create policy data_export_requests_service_write on public.data_export_requests for all using (public.is_admin() or auth.role() = 'service_role') with check (public.is_admin() or auth.role() = 'service_role');
create policy privacy_requests_owner_admin on public.privacy_requests for all using (public.is_admin() or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', ''))) with check (public.is_admin() or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', '')));
create policy feature_flags_admin_read_write on public.feature_flags for all using (public.is_admin()) with check (public.is_admin());
create policy app_settings_admin_read_write on public.app_settings for all using (public.is_admin()) with check (public.is_admin());
create policy app_error_logs_admin on public.app_error_logs for all using (public.is_admin()) with check (public.is_admin());
create policy admin_alerts_admin on public.admin_alerts for all using (public.is_admin()) with check (public.is_admin());
create policy analytics_events_scoped on public.analytics_events for all using (public.is_admin() or public.owns_restaurant(restaurant_id) or user_id = auth.uid()) with check (public.is_admin() or public.owns_restaurant(restaurant_id) or user_id = auth.uid());
create policy communication_preferences_self_or_admin on public.communication_preferences for all using (public.is_admin() or user_id = auth.uid()) with check (public.is_admin() or user_id = auth.uid());
create policy communication_consents_self_or_admin on public.communication_consents for all using (public.is_admin() or user_id = auth.uid()) with check (public.is_admin() or user_id = auth.uid());
create policy suppression_list_admin_service_only on public.suppression_list for all using (auth.role() = 'service_role' or public.is_admin()) with check (auth.role() = 'service_role' or public.is_admin());
create policy message_campaigns_scoped on public.message_campaigns for all using (public.is_admin() or (restaurant_id is not null and public.owns_restaurant(restaurant_id))) with check (public.is_admin() or (restaurant_id is not null and public.owns_restaurant(restaurant_id)));
create policy message_recipients_campaign_scoped on public.message_recipients for all using (
  public.is_admin()
  or exists (
    select 1
    from public.message_campaigns mc
    where mc.id = message_recipients.campaign_id
      and mc.restaurant_id is not null
      and public.owns_restaurant(mc.restaurant_id)
  )
) with check (
  public.is_admin()
  or exists (
    select 1
    from public.message_campaigns mc
    where mc.id = message_recipients.campaign_id
      and mc.restaurant_id is not null
      and public.owns_restaurant(mc.restaurant_id)
  )
);
create policy subscription_plans_read_active_or_admin on public.subscription_plans for select using (is_active = true or public.is_admin());
create policy subscription_plans_admin_write on public.subscription_plans for all using (public.is_admin()) with check (public.is_admin());
create policy restaurant_subscriptions_scoped_read on public.restaurant_subscriptions for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
create policy restaurant_subscriptions_admin_write on public.restaurant_subscriptions for all using (public.is_admin()) with check (public.is_admin());
create policy restaurant_billing_accounts_scoped_read on public.restaurant_billing_accounts for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
create policy restaurant_billing_accounts_admin_write on public.restaurant_billing_accounts for all using (public.is_admin()) with check (public.is_admin());
create policy billing_events_admin_read on public.billing_events for select using (public.is_admin());
create policy billing_events_admin_write on public.billing_events for all using (public.is_admin()) with check (public.is_admin());
create policy invoices_scoped_read on public.invoices for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
create policy invoices_admin_write on public.invoices for all using (public.is_admin()) with check (public.is_admin());
create policy billing_access_overrides_admin_read on public.billing_access_overrides for select using (public.is_admin());
create policy billing_access_overrides_admin_write on public.billing_access_overrides for all using (public.is_admin()) with check (public.is_admin());
create policy billing_audit_events_admin_read on public.billing_audit_events for select using (public.is_admin());
create policy billing_audit_events_admin_insert on public.billing_audit_events for insert with check (public.is_admin());
create policy smarttable_schema_baselines_admin_read on public.smarttable_schema_baselines for select using (public.is_admin());
create policy smarttable_schema_baselines_service_insert on public.smarttable_schema_baselines for insert with check (auth.role() = 'service_role' or public.is_admin());

grant select on public.public_restaurant_cards to anon, authenticated;
grant select on public.public_available_offers to anon, authenticated;
grant select on public.public_markets to anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant execute on function public.create_reservation(uuid, text, text, text, integer, date, time, text) to anon, authenticated;
grant execute on function public.track_restaurant_view(uuid) to anon, authenticated;
grant execute on function public.update_reservation_status(uuid, text) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.partner_dashboard_stats(uuid) to authenticated;

revoke update, delete on public.audit_logs from anon, authenticated;
revoke update, delete on public.restaurant_status_history from anon, authenticated;
revoke update, delete on public.reservation_status_events from anon, authenticated;
revoke update, delete on public.billing_audit_events from anon, authenticated;
revoke update, delete on public.smarttable_schema_baselines from anon, authenticated;

comment on table public.smarttable_schema_baselines is 'Append-safe fresh-environment baseline history for SmartTable BASIC. Not part of historical production migration chain.';
comment on table public.markets is 'First-class SmartTable market configuration. Required reference rows are seeded separately.';

commit;
