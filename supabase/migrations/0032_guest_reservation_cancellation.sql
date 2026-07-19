alter table public.reservations
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_reservations_guest_status_date
  on public.reservations(guest_email, status, reservation_date);
