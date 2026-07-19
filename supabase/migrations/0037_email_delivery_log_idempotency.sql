-- Persistent email delivery log fields and idempotency support.
-- This migration extends the existing email_logs table without storing email body content.

alter table public.email_logs
  add column if not exists email_type text,
  add column if not exists recipient_email text,
  add column if not exists recipient_user_id uuid references auth.users(id) on delete set null,
  add column if not exists provider_message_id text,
  add column if not exists status text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists locale text,
  add column if not exists template_version text,
  add column if not exists idempotency_key text,
  add column if not exists updated_at timestamptz not null default now();

update public.email_logs
set
  email_type = coalesce(email_type, event_type),
  recipient_email = coalesce(recipient_email, recipient),
  provider_message_id = coalesce(provider_message_id, provider_id),
  status = coalesce(status, delivery_status),
  last_error_message = coalesce(last_error_message, error_message),
  locale = coalesce(locale, metadata->>'locale', 'en'),
  template_version = coalesce(template_version, metadata->>'template_version')
where email_type is null
   or recipient_email is null
   or provider_message_id is null
   or status is null
   or last_error_message is null
   or locale is null
   or template_version is null;

alter table public.email_logs
  drop constraint if exists email_logs_status_check;

alter table public.email_logs
  add constraint email_logs_status_check
  check (coalesce(status, delivery_status) in ('pending', 'queued', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'));

create unique index if not exists idx_email_logs_idempotency_key
  on public.email_logs(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_email_logs_status_created
  on public.email_logs((coalesce(status, delivery_status)), created_at desc);

create index if not exists idx_email_logs_recipient_user
  on public.email_logs(recipient_user_id, created_at desc)
  where recipient_user_id is not null;

create index if not exists idx_email_logs_reservation_type
  on public.email_logs(reservation_id, email_type, created_at desc);
