-- Adds SaaS platform role and reservation statuses.
-- Kept separate so new enum values are committed before later migrations use them.

alter type public.profile_role add value if not exists 'partner';

alter type public.reservation_status add value if not exists 'pending';
alter type public.reservation_status add value if not exists 'accepted';
alter type public.reservation_status add value if not exists 'rejected';
