-- SmartTable restaurant administration lifecycle fields.
-- Additive only: preserves existing restaurant, offer, reservation, and RBAC data.

begin;

alter table if exists public.restaurants
  add column if not exists slug text,
  add column if not exists short_description text,
  add column if not exists full_description text,
  add column if not exists primary_email text,
  add column if not exists reservation_email text,
  add column if not exists state_region text,
  add column if not exists postal_code text,
  add column if not exists street_address text,
  add column if not exists default_language text,
  add column if not exists supported_languages jsonb not null default '["en"]'::jsonb,
  add column if not exists gallery_image_order jsonb not null default '[]'::jsonb,
  add column if not exists cuisine_categories jsonb not null default '[]'::jsonb,
  add column if not exists dining_style text,
  add column if not exists accessibility_info text,
  add column if not exists parking_info text,
  add column if not exists public_contact_info text,
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_new_restaurant boolean not null default false,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists service_periods jsonb not null default '[]'::jsonb,
  add column if not exists holiday_exceptions jsonb not null default '[]'::jsonb,
  add column if not exists temporary_closures jsonb not null default '[]'::jsonb,
  add column if not exists reservation_acceptance_mode text not null default 'manual',
  add column if not exists available_party_sizes jsonb not null default '[]'::jsonb,
  add column if not exists booking_horizon_days integer,
  add column if not exists minimum_booking_notice_minutes integer,
  add column if not exists default_table_duration_minutes integer,
  add column if not exists grace_period_minutes integer,
  add column if not exists last_seating_time time,
  add column if not exists same_day_reservations_enabled boolean not null default true,
  add column if not exists waitlist_enabled boolean not null default false,
  add column if not exists special_requests_enabled boolean not null default true,
  add column if not exists accessibility_requests_enabled boolean not null default true,
  add column if not exists high_chair_requests_enabled boolean not null default true,
  add column if not exists occasion_field_enabled boolean not null default true,
  add column if not exists guest_notes_enabled boolean not null default true,
  add column if not exists internal_notes_enabled boolean not null default true,
  add column if not exists cancellation_policy text,
  add column if not exists no_show_policy text,
  add column if not exists confirmation_message text,
  add column if not exists arrival_instructions text;

create unique index if not exists idx_restaurants_slug_unique
  on public.restaurants(lower(slug))
  where slug is not null and slug <> '';

create index if not exists idx_restaurants_admin_lifecycle
  on public.restaurants(status, onboarding_status, city, country, district, is_test_data, updated_at desc);

do $$
begin
  if to_regclass('public.restaurants') is not null then
    alter table public.restaurants drop constraint if exists restaurants_reservation_acceptance_mode_check;
    alter table public.restaurants
      add constraint restaurants_reservation_acceptance_mode_check
      check (reservation_acceptance_mode in ('automatic', 'manual'));
  end if;
end $$;

commit;
