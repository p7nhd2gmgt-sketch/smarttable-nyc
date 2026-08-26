-- SmartTable BASIC verified post-visit workflow.
-- Adds reservation-bound arrival/completion state, verified review support,
-- secure action-token storage, review-photo metadata, and delivery event logs.

begin;

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

alter table public.reservations
  drop constraint if exists reservations_arrival_status_check,
  add constraint reservations_arrival_status_check
    check (arrival_status in ('not_requested', 'pending', 'arrived', 'on_the_way', 'cannot_attend', 'no_show')),
  drop constraint if exists reservations_arrival_source_check,
  add constraint reservations_arrival_source_check
    check (arrival_source is null or arrival_source in ('guest', 'partner', 'system')),
  drop constraint if exists reservations_visit_status_check,
  add constraint reservations_visit_status_check
    check (visit_status in ('scheduled', 'checked_in', 'in_progress', 'completed', 'still_dining', 'no_show', 'cancelled')),
  drop constraint if exists reservations_completion_source_check,
  add constraint reservations_completion_source_check
    check (completion_source is null or completion_source in ('guest', 'partner', 'system')),
  drop constraint if exists reservations_expected_visit_duration_check,
  add constraint reservations_expected_visit_duration_check
    check (expected_visit_duration_minutes is null or expected_visit_duration_minutes between 15 and 720);

create index if not exists idx_reservations_post_visit_guest
  on public.reservations(guest_id, visit_status, review_eligible_at);

create index if not exists idx_reservations_post_visit_restaurant
  on public.reservations(restaurant_id, visit_status, arrival_status, visit_completed_at desc);

create index if not exists idx_reservations_review_eligible
  on public.reservations(review_eligible_at)
  where verified_visit is true and review_submitted_at is null;

alter table public.restaurant_reviews
  add column if not exists guest_user_id uuid references auth.users(id) on delete set null,
  add column if not exists atmosphere_rating integer,
  add column if not exists overall_rating numeric(3,2),
  add column if not exists written_review text,
  add column if not exists visit_duration_minutes integer,
  add column if not exists visit_duration_confirmed boolean not null default false,
  add column if not exists moderation_status text not null default 'pending_moderation',
  add column if not exists verified_visit boolean not null default false,
  add column if not exists submitted_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists moderation_reason text,
  add column if not exists legacy_unverified boolean not null default false;

alter table public.restaurant_reviews
  drop constraint if exists restaurant_reviews_status_check,
  add constraint restaurant_reviews_status_check
    check (status in ('pending', 'approved', 'rejected', 'removed')),
  drop constraint if exists restaurant_reviews_food_rating_check,
  add constraint restaurant_reviews_food_rating_check
    check (food_rating between 1 and 5),
  drop constraint if exists restaurant_reviews_service_rating_check,
  add constraint restaurant_reviews_service_rating_check
    check (service_rating between 1 and 5),
  drop constraint if exists restaurant_reviews_atmosphere_rating_check,
  add constraint restaurant_reviews_atmosphere_rating_check
    check (atmosphere_rating is null or atmosphere_rating between 1 and 5),
  drop constraint if exists restaurant_reviews_ambience_rating_check,
  add constraint restaurant_reviews_ambience_rating_check
    check (ambience_rating between 1 and 5),
  drop constraint if exists restaurant_reviews_overall_rating_check,
  add constraint restaurant_reviews_overall_rating_check
    check (overall_rating is null or (overall_rating >= 1 and overall_rating <= 5)),
  drop constraint if exists restaurant_reviews_duration_check,
  add constraint restaurant_reviews_duration_check
    check (visit_duration_minutes is null or visit_duration_minutes between 1 and 720),
  drop constraint if exists restaurant_reviews_moderation_status_check,
  add constraint restaurant_reviews_moderation_status_check
    check (moderation_status in ('draft', 'submitted', 'pending_moderation', 'published', 'rejected', 'removed'));

alter table public.restaurant_reviews
  validate constraint restaurant_reviews_status_check;

drop policy if exists restaurant_reviews_insert_public on public.restaurant_reviews;
drop policy if exists restaurant_reviews_insert_legacy_public on public.restaurant_reviews;

create policy restaurant_reviews_insert_legacy_public on public.restaurant_reviews
for insert to authenticated
with check (
  verified_visit is false
  and legacy_unverified is true
  and reservation_id is null
);

revoke insert on public.restaurant_reviews from anon;

create unique index if not exists idx_restaurant_reviews_one_verified_per_reservation
  on public.restaurant_reviews(reservation_id)
  where reservation_id is not null and verified_visit is true;

create index if not exists idx_restaurant_reviews_verified_public
  on public.restaurant_reviews(restaurant_id, moderation_status, verified_visit, submitted_at desc);

create table if not exists public.review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.restaurant_reviews(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  file_size integer not null,
  width integer,
  height integer,
  display_order integer not null default 0,
  moderation_status text not null default 'pending_moderation'
    check (moderation_status in ('pending_moderation', 'published', 'rejected', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_photos_mime_type_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint review_photos_file_size_check
    check (file_size > 0 and file_size <= 5242880)
);

create index if not exists idx_review_photos_review
  on public.review_photos(review_id, display_order, created_at);

create index if not exists idx_review_photos_reservation_guest
  on public.review_photos(reservation_id, guest_id);

create table if not exists public.post_visit_action_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_user_id uuid references auth.users(id) on delete cascade,
  guest_email text,
  action text not null
    check (action in ('arrived', 'on_the_way', 'cannot_attend', 'finished', 'still_at_restaurant', 'did_not_attend', 'open_review')),
  purpose text not null default 'post_visit',
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_post_visit_action_tokens_reservation
  on public.post_visit_action_tokens(reservation_id, action, expires_at desc);

create index if not exists idx_post_visit_action_tokens_guest
  on public.post_visit_action_tokens(guest_user_id, expires_at desc);

create table if not exists public.post_visit_notification_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  notification_type text not null
    check (notification_type in (
      'reservation_confirmation',
      'arrival_check_in',
      'visit_in_progress',
      'completion_question',
      'review_invitation',
      'review_confirmation',
      'review_reminder'
    )),
  channel text not null default 'dashboard'
    check (channel in ('dashboard', 'email', 'sms', 'push')),
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'accepted', 'delivered', 'failed', 'skipped', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists idx_post_visit_notification_events_reservation
  on public.post_visit_notification_events(reservation_id, notification_type, channel);

create index if not exists idx_post_visit_notification_events_status
  on public.post_visit_notification_events(status, created_at desc);

drop trigger if exists review_photos_set_updated_at on public.review_photos;
create trigger review_photos_set_updated_at
before update on public.review_photos
for each row execute function public.set_updated_at();

drop trigger if exists post_visit_notification_events_set_updated_at on public.post_visit_notification_events;
create trigger post_visit_notification_events_set_updated_at
before update on public.post_visit_notification_events
for each row execute function public.set_updated_at();

create or replace function public.restaurant_reviews_set_verified_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.atmosphere_rating is null then
    new.atmosphere_rating := new.ambience_rating;
  end if;
  if new.ambience_rating is null then
    new.ambience_rating := new.atmosphere_rating;
  end if;
  if new.overall_rating is null then
    new.overall_rating := round(((new.food_rating + new.service_rating + coalesce(new.atmosphere_rating, new.ambience_rating))::numeric / 3), 2);
  end if;
  if new.written_review is null then
    new.written_review := new.comment;
  end if;
  if new.comment is null then
    new.comment := new.written_review;
  end if;
  if new.submitted_at is null and new.moderation_status in ('submitted', 'pending_moderation', 'published') then
    new.submitted_at := now();
  end if;
  if new.published_at is null and (new.status = 'approved' or new.moderation_status = 'published') then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists restaurant_reviews_verified_defaults on public.restaurant_reviews;
create trigger restaurant_reviews_verified_defaults
before insert or update on public.restaurant_reviews
for each row execute function public.restaurant_reviews_set_verified_defaults();

create or replace function public.review_photos_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.review_photos
  where review_id = new.review_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and moderation_status <> 'removed';
  if v_count >= 5 then
    raise exception 'REVIEW_PHOTO_LIMIT_EXCEEDED';
  end if;
  return new;
end $$;

drop trigger if exists review_photos_limit_before_insert on public.review_photos;
create trigger review_photos_limit_before_insert
before insert on public.review_photos
for each row execute function public.review_photos_limit();

alter table public.review_photos enable row level security;
alter table public.post_visit_action_tokens enable row level security;
alter table public.post_visit_notification_events enable row level security;

drop policy if exists review_photos_guest_read_own on public.review_photos;
create policy review_photos_guest_read_own
on public.review_photos
for select
to authenticated
using (
  public.is_admin()
  or public.owns_restaurant(restaurant_id)
  or guest_id = auth.uid()
);

drop policy if exists review_photos_guest_insert_own on public.review_photos;
create policy review_photos_guest_insert_own
on public.review_photos
for insert
to authenticated
with check (
  guest_id = auth.uid()
  and exists (
    select 1
    from public.restaurant_reviews rr
    where rr.id = review_id
      and rr.guest_user_id = auth.uid()
      and rr.reservation_id = review_photos.reservation_id
  )
);

drop policy if exists review_photos_admin_moderate on public.review_photos;
create policy review_photos_admin_moderate
on public.review_photos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists post_visit_tokens_service_admin on public.post_visit_action_tokens;
create policy post_visit_tokens_service_admin
on public.post_visit_action_tokens
for all
using (auth.role() = 'service_role' or public.is_admin())
with check (auth.role() = 'service_role' or public.is_admin());

drop policy if exists post_visit_notifications_admin_service on public.post_visit_notification_events;
create policy post_visit_notifications_admin_service
on public.post_visit_notification_events
for all
using (auth.role() = 'service_role' or public.is_admin())
with check (auth.role() = 'service_role' or public.is_admin());

drop policy if exists post_visit_notifications_partner_read on public.post_visit_notification_events;
create policy post_visit_notifications_partner_read
on public.post_visit_notification_events
for select
to authenticated
using (public.is_admin() or public.owns_restaurant(restaurant_id) or guest_id = auth.uid());

drop policy if exists restaurant_reviews_verified_select_scoped on public.restaurant_reviews;
create policy restaurant_reviews_verified_select_scoped
on public.restaurant_reviews
for select
to authenticated
using (
  status = 'approved'
  or moderation_status = 'published'
  or public.is_admin()
  or public.owns_restaurant(restaurant_id)
  or guest_user_id = auth.uid()
);

drop policy if exists restaurant_reviews_guest_verified_insert on public.restaurant_reviews;
create policy restaurant_reviews_guest_verified_insert
on public.restaurant_reviews
for insert
to authenticated
with check (
  verified_visit is true
  and guest_user_id = auth.uid()
  and reservation_id is not null
  and exists (
    select 1
    from public.reservations rv
    where rv.id = reservation_id
      and rv.guest_id = auth.uid()
      and rv.restaurant_id = restaurant_reviews.restaurant_id
      and rv.verified_visit is true
      and rv.visit_status = 'completed'
      and rv.review_submitted_at is null
  )
);

drop policy if exists restaurant_reviews_admin_verified_all on public.restaurant_reviews;
create policy restaurant_reviews_admin_verified_all
on public.restaurant_reviews
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace view public.restaurant_review_summary as
select
  restaurant_id,
  round(avg(food_rating)::numeric, 2) as food_rating_avg,
  round(avg(service_rating)::numeric, 2) as service_rating_avg,
  round(avg(coalesce(atmosphere_rating, ambience_rating))::numeric, 2) as ambience_rating_avg,
  round(avg(coalesce(overall_rating, ((food_rating + service_rating + coalesce(atmosphere_rating, ambience_rating))::numeric / 3)))::numeric, 2) as overall_rating_avg,
  count(*)::integer as review_count,
  count(*) filter (where verified_visit is true)::integer as verified_review_count
from public.restaurant_reviews
where status = 'approved'
   or moderation_status = 'published'
group by restaurant_id;

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
left join public.restaurants r on r.id = rr.restaurant_id;

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
grant select on public.restaurant_review_summary to anon, authenticated;
grant select on public.restaurant_reviews_overview to authenticated;
grant select, insert on public.review_photos to authenticated;
grant select on public.post_visit_action_tokens to authenticated;
grant select on public.post_visit_notification_events to authenticated;

commit;
