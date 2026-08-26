begin;

alter table public.reservations
  add column if not exists reservation_type text not null default 'discount_offer';

alter table public.reservations
  alter column offer_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_reservation_type_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_reservation_type_check
      check (reservation_type in ('discount_offer', 'standard'));
  end if;
end $$;

create index if not exists idx_reservations_standard_restaurant_slot
  on public.reservations(restaurant_id, reservation_date, reservation_time, reservation_type, status)
  where reservation_type = 'standard';

do $$
declare
  v_has_post_visit_columns boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reservations'
      and column_name = 'arrival_status'
  ) into v_has_post_visit_columns;

  if v_has_post_visit_columns then
    execute $view$
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
        coalesce(o.title_en, 'Standard reservation') as offer_title,
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
        ) as verified_review_submitted,
        coalesce(rv.reservation_type, 'discount_offer') as reservation_type
      from public.reservations rv
      left join public.offers o on o.id = rv.offer_id
      join public.restaurants r on r.id = rv.restaurant_id
      left join public.profiles p on p.id = r.owner_user_id
    $view$;
  else
    execute $view$
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
        coalesce(o.title_en, 'Standard reservation') as offer_title,
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
        coalesce(rv.reservation_type, 'discount_offer') as reservation_type
      from public.reservations rv
      left join public.offers o on o.id = rv.offer_id
      join public.restaurants r on r.id = rv.restaurant_id
      left join public.profiles p on p.id = r.owner_user_id
    $view$;
  end if;
end $$;

grant select on public.reservation_overview to authenticated;

commit;
