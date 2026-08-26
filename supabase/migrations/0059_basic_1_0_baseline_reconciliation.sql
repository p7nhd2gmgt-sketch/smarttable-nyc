-- SmartTable BASIC 1.0 baseline reconciliation.
-- Staging/baseline-only bridge from the verified BASIC 1.0 baseline to the
-- functional pre-verified-post-visit schema expected by the current app.
--
-- This intentionally does not replay historical migrations 0001-0058 and does
-- not register them as applied. It only adds missing additive objects needed
-- after the BASIC 1.0 baseline while preserving all existing rows.

begin;

do $$
begin
  if to_regclass('public.smarttable_schema_baselines') is null then
    raise exception 'SmartTable BASIC 1.0 baseline marker table is missing; refusing baseline reconciliation.';
  end if;

  if not exists (
    select 1
    from public.smarttable_schema_baselines
    where baseline_name = 'SmartTable BASIC 1.0'
      and baseline_version = '1.0'
      and applied_environment = 'staging'
      and verification_status = 'verified'
  ) then
    raise exception 'SmartTable BASIC 1.0 verified staging baseline marker not found; refusing baseline reconciliation.';
  end if;
end $$;

create extension if not exists pgcrypto;

-- Reservation alert and restaurant notification surfaces from 0057.
create table if not exists public.restaurant_notification_preferences (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  dashboard_popup_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  sms_fallback_enabled boolean not null default false,
  primary_sms_number text,
  escalation_sms_number text,
  sms_fallback_delay_seconds integer not null default 60
    check (sms_fallback_delay_seconds between 15 and 3600),
  sms_escalation_delay_seconds integer not null default 300
    check (sms_escalation_delay_seconds between 60 and 86400),
  notification_language text not null default 'en'
    check (notification_language in ('en', 'es', 'hu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_notification_sms_recipients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recipient_type text not null
    check (recipient_type in ('primary', 'escalation')),
  phone_number text not null,
  phone_hash text not null,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'removed')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_device_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  endpoint_hash text not null unique,
  endpoint text not null,
  subscription_json jsonb not null,
  push_provider text not null default 'webpush'
    check (push_provider in ('webpush', 'firebase', 'apns')),
  device_name text,
  device_type text,
  user_agent_summary text,
  permission_status text not null default 'granted'
    check (permission_status in ('granted', 'denied', 'prompt', 'unknown')),
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked', 'failed')),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_active_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_alerts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  alert_type text not null default 'new_reservation_request'
    check (alert_type in ('new_reservation_request', 'test_reservation_alert')),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'acknowledged', 'failed', 'escalated')),
  priority text not null default 'high'
    check (priority in ('normal', 'high', 'critical')),
  safe_payload jsonb not null default '{}'::jsonb,
  sms_fallback_due_at timestamptz,
  sms_escalation_due_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, alert_type)
);

create table if not exists public.reservation_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.reservation_alerts(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  channel text not null
    check (channel in ('dashboard', 'push', 'email', 'sms')),
  recipient_user_id uuid references auth.users(id) on delete set null,
  device_id uuid references public.partner_device_subscriptions(id) on delete set null,
  recipient_hash text,
  provider text,
  provider_message_id text,
  idempotency_key text not null,
  attempt_number integer not null default 1 check (attempt_number >= 1),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'acknowledged', 'failed', 'escalated')),
  error_code text,
  error_message_safe text,
  sent_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table if not exists public.reservation_alert_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.reservation_alerts(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledgement_type text not null default 'dashboard'
    check (acknowledgement_type in ('dashboard', 'push_action', 'admin', 'test')),
  note text,
  created_at timestamptz not null default now(),
  unique (alert_id, acknowledged_by, acknowledgement_type)
);

create index if not exists idx_restaurant_notification_sms_recipients_restaurant
  on public.restaurant_notification_sms_recipients(restaurant_id, recipient_type, status);

create index if not exists idx_partner_device_subscriptions_restaurant_status
  on public.partner_device_subscriptions(restaurant_id, status, last_active_at desc);

create index if not exists idx_partner_device_subscriptions_user
  on public.partner_device_subscriptions(user_id, status, last_active_at desc)
  where user_id is not null;

create index if not exists idx_reservation_alerts_restaurant_status
  on public.reservation_alerts(restaurant_id, status, created_at desc);

create index if not exists idx_reservation_alerts_due_sms
  on public.reservation_alerts(restaurant_id, sms_fallback_due_at, sms_escalation_due_at)
  where status in ('queued', 'sent', 'delivered', 'escalated');

create index if not exists idx_reservation_alert_deliveries_alert
  on public.reservation_alert_deliveries(alert_id, channel, status, created_at desc);

create index if not exists idx_reservation_alert_deliveries_restaurant
  on public.reservation_alert_deliveries(restaurant_id, channel, status, created_at desc);

create index if not exists idx_reservation_alert_acknowledgements_restaurant
  on public.reservation_alert_acknowledgements(restaurant_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'restaurant_notification_preferences_set_updated_at') then
    create trigger restaurant_notification_preferences_set_updated_at
    before update on public.restaurant_notification_preferences
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'restaurant_notification_sms_recipients_set_updated_at') then
    create trigger restaurant_notification_sms_recipients_set_updated_at
    before update on public.restaurant_notification_sms_recipients
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'partner_device_subscriptions_set_updated_at') then
    create trigger partner_device_subscriptions_set_updated_at
    before update on public.partner_device_subscriptions
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'reservation_alerts_set_updated_at') then
    create trigger reservation_alerts_set_updated_at
    before update on public.reservation_alerts
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'reservation_alert_deliveries_set_updated_at') then
    create trigger reservation_alert_deliveries_set_updated_at
    before update on public.reservation_alert_deliveries
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.restaurant_notification_preferences enable row level security;
alter table public.restaurant_notification_sms_recipients enable row level security;
alter table public.partner_device_subscriptions enable row level security;
alter table public.reservation_alerts enable row level security;
alter table public.reservation_alert_deliveries enable row level security;
alter table public.reservation_alert_acknowledgements enable row level security;

create or replace function public.can_manage_restaurant_notifications(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.restaurants r on r.id = target_restaurant_id
    where p.id = auth.uid()
      and (
        p.role::text in ('admin', 'super_admin', 'superadmin')
        or r.owner_user_id = p.id
        or exists (
          select 1
          from public.restaurant_users ru
          where ru.restaurant_id = target_restaurant_id
            and ru.status = 'active'
            and ru.role in ('owner', 'manager')
            and (
              ru.user_id = p.id
              or lower(ru.email) = lower(p.email)
            )
        )
      )
  );
$$;

drop policy if exists restaurant_notification_preferences_scoped_read on public.restaurant_notification_preferences;
create policy restaurant_notification_preferences_scoped_read
  on public.restaurant_notification_preferences
  for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists restaurant_notification_preferences_scoped_write on public.restaurant_notification_preferences;
create policy restaurant_notification_preferences_scoped_write
  on public.restaurant_notification_preferences
  for all using (public.can_manage_restaurant_notifications(restaurant_id))
  with check (public.can_manage_restaurant_notifications(restaurant_id));

drop policy if exists restaurant_notification_sms_recipients_scoped on public.restaurant_notification_sms_recipients;
create policy restaurant_notification_sms_recipients_scoped
  on public.restaurant_notification_sms_recipients
  for all using (public.can_manage_restaurant_notifications(restaurant_id))
  with check (public.can_manage_restaurant_notifications(restaurant_id));

drop policy if exists partner_device_subscriptions_scoped on public.partner_device_subscriptions;
create policy partner_device_subscriptions_scoped
  on public.partner_device_subscriptions
  for all using (public.is_admin() or public.owns_restaurant(restaurant_id) or user_id = auth.uid())
  with check (public.is_admin() or public.owns_restaurant(restaurant_id) or user_id = auth.uid());

drop policy if exists reservation_alerts_scoped_read on public.reservation_alerts;
create policy reservation_alerts_scoped_read
  on public.reservation_alerts
  for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists reservation_alerts_service_admin_write on public.reservation_alerts;
create policy reservation_alerts_service_admin_write
  on public.reservation_alerts
  for all using (auth.role() = 'service_role' or public.is_admin())
  with check (auth.role() = 'service_role' or public.is_admin());

drop policy if exists reservation_alert_deliveries_scoped_read on public.reservation_alert_deliveries;
create policy reservation_alert_deliveries_scoped_read
  on public.reservation_alert_deliveries
  for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists reservation_alert_deliveries_service_admin_write on public.reservation_alert_deliveries;
create policy reservation_alert_deliveries_service_admin_write
  on public.reservation_alert_deliveries
  for all using (auth.role() = 'service_role' or public.is_admin())
  with check (auth.role() = 'service_role' or public.is_admin());

drop policy if exists reservation_alert_acknowledgements_scoped_read on public.reservation_alert_acknowledgements;
create policy reservation_alert_acknowledgements_scoped_read
  on public.reservation_alert_acknowledgements
  for select using (public.is_admin() or public.owns_restaurant(restaurant_id) or acknowledged_by = auth.uid());

drop policy if exists reservation_alert_acknowledgements_service_admin_write on public.reservation_alert_acknowledgements;
create policy reservation_alert_acknowledgements_service_admin_write
  on public.reservation_alert_acknowledgements
  for all using (auth.role() = 'service_role' or public.is_admin())
  with check (auth.role() = 'service_role' or public.is_admin());

grant select, insert, update on public.restaurant_notification_preferences to authenticated;
grant select, insert, update on public.restaurant_notification_sms_recipients to authenticated;
grant select, insert, update on public.partner_device_subscriptions to authenticated;
grant select on public.reservation_alerts to authenticated;
grant select on public.reservation_alert_deliveries to authenticated;
grant select on public.reservation_alert_acknowledgements to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'reservation_alerts'
    ) then
      alter publication supabase_realtime add table public.reservation_alerts;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'reservation_alert_acknowledgements'
    ) then
      alter publication supabase_realtime add table public.reservation_alert_acknowledgements;
    end if;
  end if;
end $$;

-- Optional guest onboarding and SMS preference columns from 0058.
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
end $$;

create index if not exists idx_guests_country_state_city
  on public.guests(country_code, state_region, city_normalized);

create index if not exists idx_guest_profiles_notification_channels
  on public.guest_profiles using gin(notification_channels);

create index if not exists idx_guest_profiles_location_preferences
  on public.guest_profiles using gin(location_preferences);

-- Baseline-compatible verified review schema additions.
alter table public.reservations
  add column if not exists arrival_status text not null default 'not_requested',
  add column if not exists arrived_at timestamptz,
  add column if not exists arrival_source text,
  add column if not exists visit_status text not null default 'scheduled',
  add column if not exists visit_started_at timestamptz,
  add column if not exists visit_completed_at timestamptz,
  add column if not exists completion_source text,
  add column if not exists expected_visit_duration_minutes integer,
  add column if not exists review_eligible_at timestamptz,
  add column if not exists review_invitation_sent_at timestamptz,
  add column if not exists review_submitted_at timestamptz,
  add column if not exists verified_visit boolean not null default false,
  add column if not exists post_visit_workflow_version text not null default 'verified_post_visit_v1';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_arrival_status_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_arrival_status_check
      check (arrival_status in ('not_requested', 'pending', 'arrived', 'on_the_way', 'cannot_attend', 'no_show'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_arrival_source_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_arrival_source_check
      check (arrival_source is null or arrival_source in ('guest', 'partner', 'system'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_visit_status_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_visit_status_check
      check (visit_status in ('scheduled', 'checked_in', 'in_progress', 'completed', 'still_dining', 'no_show', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_completion_source_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_completion_source_check
      check (completion_source is null or completion_source in ('guest', 'partner', 'system'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_expected_visit_duration_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_expected_visit_duration_check
      check (expected_visit_duration_minutes is null or expected_visit_duration_minutes between 15 and 720);
  end if;
end $$;

create index if not exists idx_reservations_post_visit_guest
  on public.reservations(guest_id, visit_status, review_eligible_at);

create index if not exists idx_reservations_post_visit_restaurant
  on public.reservations(restaurant_id, visit_status, arrival_status, visit_completed_at desc);

create index if not exists idx_reservations_review_eligible
  on public.reservations(review_eligible_at)
  where verified_visit is true and review_submitted_at is null;

alter table public.restaurant_reviews
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists guest_user_id uuid references auth.users(id) on delete set null,
  add column if not exists atmosphere_rating numeric,
  add column if not exists overall_rating numeric,
  add column if not exists written_review text,
  add column if not exists visit_duration_minutes integer,
  add column if not exists visit_duration_confirmed boolean not null default false,
  add column if not exists moderation_status text not null default 'pending_moderation',
  add column if not exists verified_visit boolean not null default false,
  add column if not exists submitted_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists moderation_reason text,
  add column if not exists legacy_unverified boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.restaurant_reviews'::regclass
      and c.confrelid = 'public.reservations'::regclass
      and c.contype = 'f'
      and a.attname = 'reservation_id'
  ) then
    alter table public.restaurant_reviews
      add constraint restaurant_reviews_reservation_id_fkey
      foreign key (reservation_id)
      references public.reservations(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_reviews_atmosphere_rating_check'
      and conrelid = 'public.restaurant_reviews'::regclass
  ) then
    alter table public.restaurant_reviews
      add constraint restaurant_reviews_atmosphere_rating_check
      check (atmosphere_rating is null or atmosphere_rating between 1 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_reviews_overall_rating_check'
      and conrelid = 'public.restaurant_reviews'::regclass
  ) then
    alter table public.restaurant_reviews
      add constraint restaurant_reviews_overall_rating_check
      check (overall_rating is null or (overall_rating >= 1 and overall_rating <= 5));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_reviews_duration_check'
      and conrelid = 'public.restaurant_reviews'::regclass
  ) then
    alter table public.restaurant_reviews
      add constraint restaurant_reviews_duration_check
      check (visit_duration_minutes is null or visit_duration_minutes between 1 and 720);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_reviews_moderation_status_check'
      and conrelid = 'public.restaurant_reviews'::regclass
  ) then
    alter table public.restaurant_reviews
      add constraint restaurant_reviews_moderation_status_check
      check (moderation_status in ('draft', 'submitted', 'pending_moderation', 'published', 'rejected', 'removed'));
  end if;
end $$;

create unique index if not exists idx_restaurant_reviews_one_per_reservation
  on public.restaurant_reviews(reservation_id)
  where reservation_id is not null;

create unique index if not exists idx_restaurant_reviews_one_verified_per_reservation
  on public.restaurant_reviews(reservation_id)
  where reservation_id is not null and verified_visit is true;

create index if not exists idx_restaurant_reviews_verified_public
  on public.restaurant_reviews(restaurant_id, moderation_status, verified_visit, submitted_at desc);

create or replace view public.restaurant_reviews_overview as
select
  rr.id,
  rr.restaurant_id,
  rr.reservation_id,
  rr.guest_email,
  rr.guest_name,
  rr.food_rating,
  rr.service_rating,
  rr.ambience_rating,
  rr.overall_rating,
  rr.comment,
  rr.status,
  rr.metadata,
  rr.created_at,
  rr.updated_at,
  r.name as restaurant_name,
  rr.moderated_by,
  rr.moderated_at,
  rr.guest_user_id,
  rr.atmosphere_rating,
  rr.written_review,
  rr.visit_duration_minutes,
  rr.visit_duration_confirmed,
  rr.moderation_status,
  rr.verified_visit,
  rr.submitted_at,
  rr.published_at,
  rr.moderation_reason,
  rr.legacy_unverified
from public.restaurant_reviews rr
join public.restaurants r on r.id = rr.restaurant_id;

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
  ) or exists (
    select 1
    from public.restaurant_reviews rr
    where rr.reservation_id = rv.id
  ) as feedback_submitted,
  coalesce(p.preferred_language, 'en') as restaurant_language,
  coalesce(rv.is_test_reservation, rv.test_record, r.is_test_restaurant, o.is_test_offer, false) as is_test_reservation,
  coalesce(rv.test_record, rv.is_test_reservation, r.is_test_restaurant, o.is_test_offer, false) as test_record,
  rv.arrival_status,
  rv.arrived_at,
  rv.arrival_source,
  rv.visit_status,
  rv.visit_started_at,
  rv.visit_completed_at,
  rv.completion_source,
  rv.expected_visit_duration_minutes,
  rv.review_eligible_at,
  rv.review_invitation_sent_at,
  rv.review_submitted_at,
  rv.verified_visit,
  rv.post_visit_workflow_version,
  exists (
    select 1
    from public.restaurant_reviews rr
    where rr.reservation_id = rv.id
      and rr.verified_visit is true
  ) as verified_review_submitted
from public.reservations rv
join public.offers o on o.id = rv.offer_id
join public.restaurants r on r.id = rv.restaurant_id
left join public.profiles p on p.id = r.owner_user_id;

grant select on public.reservation_overview to authenticated;
grant select on public.restaurant_reviews_overview to authenticated;

do $$
begin
  if not exists (
    select 1
    from public.smarttable_schema_baselines
    where baseline_name = 'SmartTable BASIC 1.0'
      and metadata ->> 'baseline_reconciliation_version' = '0057-0058-compatible'
  ) then
    insert into public.smarttable_schema_baselines (
      baseline_name,
      baseline_version,
      checksum,
      applied_environment,
      source_commit,
      applied_by,
      verification_status,
      metadata
    ) values (
      'SmartTable BASIC 1.0',
      '1.0',
      'baseline-reconciliation-0057-0058-compatible',
      'staging',
      null,
      'codex',
      'pending',
      jsonb_build_object(
        'baseline_reconciliation_version', '0057-0058-compatible',
        'historical_migrations_falsely_registered', false,
        'preserves_existing_rows', true
      )
    );
  end if;
end $$;

commit;
