-- SmartTable Test Bistro cleanup command.
-- Review before running. This intentionally removes only deterministic test records
-- created by supabase/migrations/0045_smarttable_test_bistro_seed.sql.
-- It does not remove real restaurants, real offers, real users, or auth users.

begin;

delete from public.reservation_status_events rse
using public.reservations rv
where rse.reservation_id = rv.id
  and rv.restaurant_id = '10000000-0000-4000-8000-000000000123'
  and coalesce(rv.is_test_reservation, rv.test_record, false) = true;

delete from public.email_logs
where reservation_id in (
  select id
  from public.reservations
  where restaurant_id = '10000000-0000-4000-8000-000000000123'
    and coalesce(is_test_reservation, test_record, false) = true
)
or restaurant_id = '10000000-0000-4000-8000-000000000123';

delete from public.email_queue
where reservation_id in (
  select id
  from public.reservations
  where restaurant_id = '10000000-0000-4000-8000-000000000123'
    and coalesce(is_test_reservation, test_record, false) = true
)
or restaurant_id = '10000000-0000-4000-8000-000000000123';

delete from public.reservations
where restaurant_id = '10000000-0000-4000-8000-000000000123'
  and coalesce(is_test_reservation, test_record, false) = true;

delete from public.offers
where restaurant_id = '10000000-0000-4000-8000-000000000123'
  and (
    id in (
      '20000000-0000-4000-8000-000000000123',
      '20000000-0000-4000-8000-000000000124',
      '20000000-0000-4000-8000-000000000125'
    )
    or coalesce(is_test_offer, false) = true
    or source = 'internal_test_seed'
  );

update public.profiles
set restaurant_id = null,
    updated_at = now()
where restaurant_id = '10000000-0000-4000-8000-000000000123'
  and role in ('partner', 'restaurant');

delete from public.restaurants
where id = '10000000-0000-4000-8000-000000000123'
  and slug = 'smarttable-test-bistro'
  and coalesce(is_test_restaurant, false) = true;

commit;
