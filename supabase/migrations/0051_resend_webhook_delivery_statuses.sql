-- Resend webhook delivery status support.
-- Safe additive constraint widening only; no data deletion or reservation changes.

begin;

alter table if exists public.email_logs
  drop constraint if exists email_logs_status_check;

alter table if exists public.email_logs
  add constraint email_logs_status_check
  check (coalesce(status, delivery_status) in ('pending', 'queued', 'sending', 'sent', 'delayed', 'delivered', 'bounced', 'failed', 'complained', 'cancelled'));

alter table if exists public.email_queue
  drop constraint if exists email_queue_status_check;

alter table if exists public.email_queue
  add constraint email_queue_status_check
  check (status in ('pending', 'queued', 'sending', 'sent', 'delayed', 'delivered', 'bounced', 'failed', 'complained', 'cancelled'));

commit;
