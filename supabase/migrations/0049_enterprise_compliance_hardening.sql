-- SmartTable Enterprise 3.1.2 compliance hardening.
-- Additive, idempotent, and safe to rerun.

begin;

create extension if not exists pgcrypto;

alter table public.audit_logs
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete set null,
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists campaign_id uuid,
  add column if not exists billing_event_id uuid,
  add column if not exists ip_hash text,
  add column if not exists retention_expires_at timestamptz;

alter table public.email_queue
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.message_campaigns
  add column if not exists cancelled_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists recipient_snapshot_at timestamptz,
  add column if not exists recipient_snapshot_hash text,
  add column if not exists template_variable_allowlist jsonb not null default '[]'::jsonb,
  add column if not exists xss_sanitized_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.message_recipients
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.sms_campaigns
  add column if not exists cancelled_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists recipient_snapshot_at timestamptz,
  add column if not exists recipient_snapshot_hash text,
  add column if not exists template_variable_allowlist jsonb not null default '[]'::jsonb,
  add column if not exists xss_sanitized_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.sms_recipients
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.sms_delivery_logs
  add column if not exists retention_expires_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

alter table public.sms_provider_events
  add column if not exists retention_expires_at timestamptz;

alter table public.system_message_campaigns
  add column if not exists cancelled_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists recipient_snapshot_at timestamptz,
  add column if not exists recipient_snapshot_hash text,
  add column if not exists template_variable_allowlist jsonb not null default '[]'::jsonb,
  add column if not exists xss_sanitized_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.system_message_recipients
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.notifications
  add column if not exists retention_expires_at timestamptz,
  add column if not exists anonymized_at timestamptz;

alter table public.billing_events
  add column if not exists idempotency_key text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'message_recipients_attempts_check'
      and conrelid = 'public.message_recipients'::regclass
  ) then
    alter table public.message_recipients
      add constraint message_recipients_attempts_check
      check (attempt_count >= 0 and max_attempts >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_recipients_attempts_check'
      and conrelid = 'public.sms_recipients'::regclass
  ) then
    alter table public.sms_recipients
      add constraint sms_recipients_attempts_check
      check (attempt_count >= 0 and max_attempts >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'system_message_recipients_attempts_check'
      and conrelid = 'public.system_message_recipients'::regclass
  ) then
    alter table public.system_message_recipients
      add constraint system_message_recipients_attempts_check
      check (attempt_count >= 0 and max_attempts >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_events_attempts_check'
      and conrelid = 'public.billing_events'::regclass
  ) then
    alter table public.billing_events
      add constraint billing_events_attempts_check
      check (attempt_count >= 0 and max_attempts >= 1);
  end if;
end $$;

create index if not exists idx_audit_logs_restaurant_created
  on public.audit_logs(restaurant_id, created_at desc)
  where restaurant_id is not null;

create index if not exists idx_audit_logs_campaign_created
  on public.audit_logs(campaign_id, created_at desc)
  where campaign_id is not null;

create index if not exists idx_email_queue_lock_retry
  on public.email_queue(status, locked_at, next_attempt_at)
  where status in ('pending', 'queued');

create index if not exists idx_email_queue_dead_letter
  on public.email_queue(dead_lettered_at desc)
  where dead_lettered_at is not null;

create index if not exists idx_message_recipients_retry
  on public.message_recipients(status, next_retry_at, locked_at)
  where status in ('queued', 'failed', 'delayed');

create index if not exists idx_message_recipients_dead_letter
  on public.message_recipients(dead_lettered_at desc)
  where dead_lettered_at is not null;

create index if not exists idx_sms_recipients_retry
  on public.sms_recipients(status, next_retry_at, locked_at)
  where status in ('queued', 'failed', 'delayed');

create index if not exists idx_sms_recipients_dead_letter
  on public.sms_recipients(dead_lettered_at desc)
  where dead_lettered_at is not null;

create index if not exists idx_system_message_recipients_retry
  on public.system_message_recipients(status, next_retry_at, locked_at)
  where status in ('queued', 'failed');

create index if not exists idx_system_message_recipients_dead_letter
  on public.system_message_recipients(dead_lettered_at desc)
  where dead_lettered_at is not null;

create index if not exists idx_billing_events_lock_retry
  on public.billing_events(processing_status, next_retry_at, locked_at)
  where processing_status in ('received', 'failed');

create unique index if not exists idx_billing_events_idempotency_key
  on public.billing_events(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_notifications_retention
  on public.notifications(retention_expires_at)
  where retention_expires_at is not null;

commit;
