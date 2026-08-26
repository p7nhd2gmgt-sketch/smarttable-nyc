begin;

alter table public.guests
  add column if not exists country text,
  add column if not exists country_code text,
  add column if not exists state_region text,
  add column if not exists city_normalized text,
  add column if not exists max_travel_distance_value numeric,
  add column if not exists travel_distance_unit text,
  add column if not exists sms_country_code text,
  add column if not exists sms_phone_number text,
  add column if not exists sms_notifications_opted_in boolean not null default false,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists onboarding_preferences_completed_at timestamptz;

alter table public.guest_profiles
  add column if not exists custom_cuisine text,
  add column if not exists notification_channels text[] not null default '{}'::text[],
  add column if not exists notification_channel_details jsonb not null default '{}'::jsonb,
  add column if not exists location_preferences jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_progress jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'guests_travel_distance_unit_check'
      and conrelid = 'public.guests'::regclass
  ) then
    alter table public.guests
      add constraint guests_travel_distance_unit_check
      check (travel_distance_unit is null or travel_distance_unit in ('miles', 'kilometers'));
  end if;
end
$$;

create index if not exists idx_guests_country_state_city
  on public.guests(country_code, state_region, city_normalized);

create index if not exists idx_guest_profiles_notification_channels
  on public.guest_profiles using gin(notification_channels);

create index if not exists idx_guest_profiles_location_preferences
  on public.guest_profiles using gin(location_preferences);

commit;
