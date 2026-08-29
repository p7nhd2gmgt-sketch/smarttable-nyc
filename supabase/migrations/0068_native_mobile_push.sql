begin;

create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  device_id text not null,
  app_kind text not null check (app_kind in ('guest', 'partner')),
  platform text not null check (platform in ('ios', 'android')),
  provider text not null default 'expo' check (provider in ('expo')),
  push_token_ciphertext text not null,
  token_hash text not null check (length(token_hash) = 64),
  enabled boolean not null default true,
  permission_status text not null default 'granted' check (permission_status in ('granted', 'denied', 'undetermined')),
  app_version text,
  locale text,
  timezone text,
  last_registered_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, app_kind, device_id)
);

create index if not exists mobile_push_devices_token_lookup_idx
  on public.mobile_push_devices (provider, app_kind, token_hash);

create index if not exists mobile_push_devices_user_active_idx
  on public.mobile_push_devices (user_id, app_kind, enabled);

create index if not exists mobile_push_devices_restaurant_active_idx
  on public.mobile_push_devices (restaurant_id, app_kind, enabled)
  where restaurant_id is not null;

create table if not exists public.mobile_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.mobile_push_devices(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  app_kind text not null check (app_kind in ('guest', 'partner')),
  notification_type text not null,
  entity_type text not null check (entity_type in ('restaurant', 'offer', 'reservation', 'review')),
  entity_id text not null,
  provider text not null default 'expo' check (provider in ('expo')),
  provider_message_id text,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'expired')),
  error_code text,
  attempt_number integer not null default 1 check (attempt_number > 0),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mobile_push_deliveries_ticket_idx
  on public.mobile_push_deliveries (provider_message_id)
  where provider_message_id is not null;

alter table public.mobile_push_devices enable row level security;
alter table public.mobile_push_deliveries enable row level security;

revoke all privileges on table public.mobile_push_devices from public, anon, authenticated;
revoke all privileges on table public.mobile_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.mobile_push_devices to service_role;
grant select, insert, update, delete on table public.mobile_push_deliveries to service_role;

comment on column public.mobile_push_devices.push_token_ciphertext is
  'AES-256-GCM encrypted push token. Plaintext tokens must never be stored or returned.';
comment on column public.mobile_push_devices.token_hash is
  'SHA-256 lookup hash used for token rotation and uniqueness. Not returned to clients.';

commit;
