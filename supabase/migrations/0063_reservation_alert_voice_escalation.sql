-- Optional, restaurant-scoped voice escalation for unacknowledged reservation alerts.
-- Additive only. Existing alert settings remain unchanged and voice is disabled by default.

begin;

alter table public.restaurant_notification_preferences
  add column if not exists voice_call_enabled boolean not null default false,
  add column if not exists voice_call_number text,
  add column if not exists voice_call_delay_seconds integer not null default 480;

alter table public.reservation_alerts
  add column if not exists voice_call_due_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.restaurant_notification_preferences'::regclass
      and conname = 'restaurant_notification_preferences_voice_delay_check'
  ) then
    alter table public.restaurant_notification_preferences
      add constraint restaurant_notification_preferences_voice_delay_check
      check (voice_call_delay_seconds between 60 and 86400);
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservation_alert_deliveries'::regclass
      and conname = 'reservation_alert_deliveries_channel_check'
      and pg_get_constraintdef(oid) not like '%voice%'
  ) then
    alter table public.reservation_alert_deliveries
      drop constraint reservation_alert_deliveries_channel_check;
    alter table public.reservation_alert_deliveries
      add constraint reservation_alert_deliveries_channel_check
      check (channel in ('dashboard', 'push', 'email', 'sms', 'voice'));
  elsif not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservation_alert_deliveries'::regclass
      and conname = 'reservation_alert_deliveries_channel_check'
  ) then
    alter table public.reservation_alert_deliveries
      add constraint reservation_alert_deliveries_channel_check
      check (channel in ('dashboard', 'push', 'email', 'sms', 'voice'));
  end if;
end $$;

create index if not exists idx_reservation_alerts_due_voice
  on public.reservation_alerts(restaurant_id, voice_call_due_at)
  where status in ('queued', 'sent', 'delivered', 'escalated');

grant select, insert, update on public.restaurant_notification_preferences to authenticated;
grant select on public.reservation_alerts to authenticated;
grant select on public.reservation_alert_deliveries to authenticated;

commit;
