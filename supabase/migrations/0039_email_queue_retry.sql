-- Persistent SmartTable email queue and retry support for Resend-backed transactional email.
-- Queue payloads are redacted after provider acceptance and secure reset/verification tokens are never persisted.

alter table public.email_logs
  drop constraint if exists email_logs_status_check;

alter table public.email_logs
  add constraint email_logs_status_check
  check (coalesce(status, delivery_status) in ('pending', 'queued', 'sent', 'delivered', 'bounced', 'failed', 'complained', 'cancelled'));

create table if not exists public.email_queue (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid references public.email_logs(id) on delete set null,
  email_type text not null,
  event_type text,
  recipient_email text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  locale text not null default 'en',
  template_version text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_queue_status_check
    check (status in ('pending', 'queued', 'sent', 'delivered', 'bounced', 'failed', 'complained', 'cancelled')),
  constraint email_queue_attempts_check
    check (attempt_count >= 0 and max_attempts >= 1)
);

create unique index if not exists idx_email_queue_idempotency_key
  on public.email_queue(idempotency_key);

create index if not exists idx_email_queue_status_next_attempt
  on public.email_queue(status, next_attempt_at)
  where status in ('pending', 'queued');

create index if not exists idx_email_queue_provider_message
  on public.email_queue(provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_email_queue_reservation_type
  on public.email_queue(reservation_id, email_type, created_at desc)
  where reservation_id is not null;

alter table public.email_queue enable row level security;

drop policy if exists email_queue_service_only on public.email_queue;
create policy email_queue_service_only on public.email_queue
  for all
  using (
    auth.role() = 'service_role'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  )
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );

grant select, insert, update on public.email_queue to authenticated;
