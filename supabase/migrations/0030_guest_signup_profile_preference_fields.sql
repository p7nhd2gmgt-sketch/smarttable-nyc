alter table public.guests
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists preferred_dining_areas text[] not null default '{}'::text[],
  add column if not exists max_travel_distance_miles numeric,
  add column if not exists transportation_method text,
  add column if not exists selected_language text;

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

alter table public.guest_consents
  add column if not exists terms_accepted boolean,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted boolean,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists marketing_consent_timestamp timestamptz;

create index if not exists idx_guest_profiles_min_discount
  on public.guest_profiles(minimum_interesting_discount);

create index if not exists idx_guest_profiles_preferred_days
  on public.guest_profiles using gin(preferred_days);

create index if not exists idx_guest_profiles_preferred_times
  on public.guest_profiles using gin(preferred_times);

create index if not exists idx_guests_user_email
  on public.guests(user_id, email);
