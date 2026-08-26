-- SmartTable partner reservation alert system.
-- Additive only: creates restaurant-scoped alert, device, delivery, and
-- acknowledgement records for new reservation requests.

begin;

create extension if not exists pgcrypto;

create table if not exists public.restaurant_notification_preferences (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  dashboard_popup_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  sms_fallback_enabled boolean not null default false,
  primary_sms_number text,
  escalation_sms_number text,
  sms_fallback_delay_seconds integer not null default 60
    check (sms_fallback_delay_seconds between 15 and 3600),
  sms_escalation_delay_seconds integer not null default 300
    check (sms_escalation_delay_seconds between 60 and 86400),
  notification_language text not null default 'en'
    check (notification_language in ('en', 'es', 'hu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_notification_sms_recipients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recipient_type text not null
    check (recipient_type in ('primary', 'escalation')),
  phone_number text not null,
  phone_hash text not null,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'removed')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_device_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  endpoint_hash text not null unique,
  endpoint text not null,
  subscription_json jsonb not null,
  push_provider text not null default 'webpush'
    check (push_provider in ('webpush', 'firebase', 'apns')),
  device_name text,
  device_type text,
  user_agent_summary text,
  permission_status text not null default 'granted'
    check (permission_status in ('granted', 'denied', 'prompt', 'unknown')),
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked', 'failed')),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_active_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_alerts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  alert_type text not null default 'new_reservation_request'
    check (alert_type in ('new_reservation_request', 'test_reservation_alert')),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'acknowledged', 'failed', 'escalated')),
  priority text not null default 'high'
    check (priority in ('normal', 'high', 'critical')),
  safe_payload jsonb not null default '{}'::jsonb,
  sms_fallback_due_at timestamptz,
  sms_escalation_due_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, alert_type)
);

create table if not exists public.reservation_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.reservation_alerts(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  channel text not null
    check (channel in ('dashboard', 'push', 'email', 'sms')),
  recipient_user_id uuid references auth.users(id) on delete set null,
  device_id uuid references public.partner_device_subscriptions(id) on delete set null,
  recipient_hash text,
  provider text,
  provider_message_id text,
  idempotency_key text not null,
  attempt_number integer not null default 1 check (attempt_number >= 1),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'acknowledged', 'failed', 'escalated')),
  error_code text,
  error_message_safe text,
  sent_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table if not exists public.reservation_alert_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.reservation_alerts(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledgement_type text not null default 'dashboard'
    check (acknowledgement_type in ('dashboard', 'push_action', 'admin', 'test')),
  note text,
  created_at timestamptz not null default now(),
  unique (alert_id, acknowledged_by, acknowledgement_type)
);

create index if not exists idx_restaurant_notification_sms_recipients_restaurant
  on public.restaurant_notification_sms_recipients(restaurant_id, recipient_type, status);

create index if not exists idx_partner_device_subscriptions_restaurant_status
  on public.partner_device_subscriptions(restaurant_id, status, last_active_at desc);

create index if not exists idx_partner_device_subscriptions_user
  on public.partner_device_subscriptions(user_id, status, last_active_at desc)
  where user_id is not null;

create index if not exists idx_reservation_alerts_restaurant_status
  on public.reservation_alerts(restaurant_id, status, created_at desc);

create index if not exists idx_reservation_alerts_due_sms
  on public.reservation_alerts(restaurant_id, sms_fallback_due_at, sms_escalation_due_at)
  where status in ('queued', 'sent', 'delivered', 'escalated');

create index if not exists idx_reservation_alert_deliveries_alert
  on public.reservation_alert_deliveries(alert_id, channel, status, created_at desc);

create index if not exists idx_reservation_alert_deliveries_restaurant
  on public.reservation_alert_deliveries(restaurant_id, channel, status, created_at desc);

create index if not exists idx_reservation_alert_acknowledgements_restaurant
  on public.reservation_alert_acknowledgements(restaurant_id, created_at desc);

do $$
begin
  if to_regclass('public.restaurant_notification_preferences') is not null
     and not exists (select 1 from pg_trigger where tgname = 'restaurant_notification_preferences_set_updated_at') then
    create trigger restaurant_notification_preferences_set_updated_at
    before update on public.restaurant_notification_preferences
    for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.restaurant_notification_sms_recipients') is not null
     and not exists (select 1 from pg_trigger where tgname = 'restaurant_notification_sms_recipients_set_updated_at') then
    create trigger restaurant_notification_sms_recipients_set_updated_at
    before update on public.restaurant_notification_sms_recipients
    for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.partner_device_subscriptions') is not null
     and not exists (select 1 from pg_trigger where tgname = 'partner_device_subscriptions_set_updated_at') then
    create trigger partner_device_subscriptions_set_updated_at
    before update on public.partner_device_subscriptions
    for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.reservation_alerts') is not null
     and not exists (select 1 from pg_trigger where tgname = 'reservation_alerts_set_updated_at') then
    create trigger reservation_alerts_set_updated_at
    before update on public.reservation_alerts
    for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.reservation_alert_deliveries') is not null
     and not exists (select 1 from pg_trigger where tgname = 'reservation_alert_deliveries_set_updated_at') then
    create trigger reservation_alert_deliveries_set_updated_at
    before update on public.reservation_alert_deliveries
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.restaurant_notification_preferences enable row level security;
alter table public.restaurant_notification_sms_recipients enable row level security;
alter table public.partner_device_subscriptions enable row level security;
alter table public.reservation_alerts enable row level security;
alter table public.reservation_alert_deliveries enable row level security;
alter table public.reservation_alert_acknowledgements enable row level security;

create or replace function public.can_manage_restaurant_notifications(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.restaurants r on r.id = target_restaurant_id
    where p.id = auth.uid()
      and (
        p.role::text in ('admin', 'super_admin', 'superadmin')
        or r.owner_user_id = p.id
        or exists (
          select 1
          from public.restaurant_users ru
          where ru.restaurant_id = target_restaurant_id
            and ru.status = 'active'
            and ru.role in ('owner', 'manager')
            and (
              ru.user_id = p.id
              or lower(ru.email) = lower(p.email)
            )
        )
      )
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_notification_preferences'
      and policyname = 'restaurant_notification_preferences_scoped_read'
  ) then
    create policy restaurant_notification_preferences_scoped_read
      on public.restaurant_notification_preferences
      for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_notification_preferences'
      and policyname = 'restaurant_notification_preferences_scoped_write'
  ) then
    create policy restaurant_notification_preferences_scoped_write
      on public.restaurant_notification_preferences
      for all using (public.can_manage_restaurant_notifications(restaurant_id))
      with check (public.can_manage_restaurant_notifications(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_notification_sms_recipients'
      and policyname = 'restaurant_notification_sms_recipients_scoped'
  ) then
    create policy restaurant_notification_sms_recipients_scoped
      on public.restaurant_notification_sms_recipients
      for all using (public.can_manage_restaurant_notifications(restaurant_id))
      with check (public.can_manage_restaurant_notifications(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_device_subscriptions'
      and policyname = 'partner_device_subscriptions_scoped'
  ) then
    create policy partner_device_subscriptions_scoped
      on public.partner_device_subscriptions
      for all using (public.is_admin() or public.owns_restaurant(restaurant_id) or user_id = auth.uid())
      with check (public.is_admin() or public.owns_restaurant(restaurant_id) or user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reservation_alerts'
      and policyname = 'reservation_alerts_scoped_read'
  ) then
    create policy reservation_alerts_scoped_read
      on public.reservation_alerts
      for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reservation_alerts'
      and policyname = 'reservation_alerts_service_admin_write'
  ) then
    create policy reservation_alerts_service_admin_write
      on public.reservation_alerts
      for all using (auth.role() = 'service_role' or public.is_admin())
      with check (auth.role() = 'service_role' or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reservation_alert_deliveries'
      and policyname = 'reservation_alert_deliveries_scoped_read'
  ) then
    create policy reservation_alert_deliveries_scoped_read
      on public.reservation_alert_deliveries
      for select using (public.is_admin() or public.owns_restaurant(restaurant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reservation_alert_deliveries'
      and policyname = 'reservation_alert_deliveries_service_admin_write'
  ) then
    create policy reservation_alert_deliveries_service_admin_write
      on public.reservation_alert_deliveries
      for all using (auth.role() = 'service_role' or public.is_admin())
      with check (auth.role() = 'service_role' or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reservation_alert_acknowledgements'
      and policyname = 'reservation_alert_acknowledgements_scoped_read'
  ) then
    create policy reservation_alert_acknowledgements_scoped_read
      on public.reservation_alert_acknowledgements
      for select using (public.is_admin() or public.owns_restaurant(restaurant_id) or acknowledged_by = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reservation_alert_acknowledgements'
      and policyname = 'reservation_alert_acknowledgements_service_admin_write'
  ) then
    create policy reservation_alert_acknowledgements_service_admin_write
      on public.reservation_alert_acknowledgements
      for all using (auth.role() = 'service_role' or public.is_admin())
      with check (auth.role() = 'service_role' or public.is_admin());
  end if;
end $$;

grant select, insert, update on public.restaurant_notification_preferences to authenticated;
grant select, insert, update on public.restaurant_notification_sms_recipients to authenticated;
grant select, insert, update on public.partner_device_subscriptions to authenticated;
grant select on public.reservation_alerts to authenticated;
grant select on public.reservation_alert_deliveries to authenticated;
grant select on public.reservation_alert_acknowledgements to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'reservation_alerts'
    ) then
      alter publication supabase_realtime add table public.reservation_alerts;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'reservation_alert_acknowledgements'
    ) then
      alter publication supabase_realtime add table public.reservation_alert_acknowledgements;
    end if;
  end if;
end $$;

commit;
