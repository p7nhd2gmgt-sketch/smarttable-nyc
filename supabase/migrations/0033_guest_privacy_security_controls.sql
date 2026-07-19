alter table public.guests
  add column if not exists deleted_at timestamptz;

alter table public.guest_profiles
  add column if not exists deleted_at timestamptz;

create index if not exists idx_privacy_requests_guest_created
  on public.privacy_requests(guest_email, request_type, created_at desc);

create index if not exists idx_guest_consents_guest_email_created
  on public.guest_consents(guest_email, consent_type, created_at desc);
