alter table public.guest_consents
  add column if not exists user_id uuid,
  add column if not exists terms_version text,
  add column if not exists privacy_policy_version text,
  add column if not exists accepted_at timestamptz,
  add column if not exists language text,
  add column if not exists marketing_consent boolean,
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.ai_preference_profiles
  add column if not exists minimum_interesting_discount numeric;

create index if not exists idx_guest_consents_guest_type_created
  on public.guest_consents(guest_id, consent_type, created_at desc);
