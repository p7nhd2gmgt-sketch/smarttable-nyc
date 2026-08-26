begin;

create table if not exists public.sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  body_en text,
  body_es text,
  body_hu text,
  audience_definition jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','scheduled','queued','sending','sent','cancelled','failed','archived')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  segment_count_estimate integer not null default 0,
  cost_estimate_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sms_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'sms' check (channel = 'sms'),
  destination_hash text not null,
  phone_last4 text,
  language text not null default 'en' check (language in ('en','es','hu')),
  timezone text not null default 'America/New_York',
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','delayed','failed','undelivered','opted_out','cancelled')),
  provider_message_id text,
  segment_count integer not null default 0,
  cost_estimate_cents integer not null default 0,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sms_recipients_campaign_destination_idx
  on public.sms_recipients(campaign_id, destination_hash);

create table if not exists public.sms_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  sms_type text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  sms_campaign_id uuid references public.sms_campaigns(id) on delete set null,
  provider text not null default 'twilio',
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','delayed','bounced','failed','complained','undelivered','cancelled')),
  attempt_count integer not null default 0,
  segment_count integer not null default 0,
  cost_estimate_cents integer not null default 0,
  locale text not null default 'en',
  template_version text,
  idempotency_key text not null,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists sms_delivery_logs_idempotency_key_idx
  on public.sms_delivery_logs(idempotency_key);

create index if not exists sms_delivery_logs_provider_message_idx
  on public.sms_delivery_logs(provider_message_id);

create table if not exists public.sms_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'twilio',
  provider_event_id text,
  provider_message_id text,
  event_type text not null,
  event_timestamp timestamptz not null default now(),
  normalized_from_hash text,
  normalized_to_hash text,
  status text,
  related_sms_log_id uuid references public.sms_delivery_logs(id) on delete set null,
  related_campaign_id uuid references public.sms_campaigns(id) on delete set null,
  sanitized_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists sms_provider_events_provider_event_idx
  on public.sms_provider_events(provider, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists sms_provider_events_message_status_idx
  on public.sms_provider_events(provider, provider_message_id, event_type, event_timestamp)
  where provider_message_id is not null;

create table if not exists public.system_message_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  category text not null default 'service_announcement'
    check (category in ('service_announcement','planned_maintenance','outage','security_alert','legal_update','product_update','marketing_announcement','partner_announcement','emergency_notice')),
  channels text[] not null default array['in_app']::text[],
  name text not null,
  title_en text,
  title_es text,
  title_hu text,
  subject_en text,
  subject_es text,
  subject_hu text,
  preheader_en text,
  preheader_es text,
  preheader_hu text,
  body_en text,
  body_es text,
  body_hu text,
  audience_definition jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','scheduled','queued','sending','sent','cancelled','failed','archived')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  read_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'system',
  title text not null,
  body text not null,
  action_url text,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  non_dismissible boolean not null default false,
  source_campaign_id uuid references public.system_message_campaigns(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create table if not exists public.system_message_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.system_message_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('in_app','email','sms')),
  destination_hash text,
  language text not null default 'en' check (language in ('en','es','hu')),
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','read','failed','cancelled')),
  provider_message_id text,
  notification_id uuid references public.notifications(id) on delete set null,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists system_message_recipients_campaign_user_channel_idx
  on public.system_message_recipients(campaign_id, user_id, channel)
  where user_id is not null;

create index if not exists system_message_recipients_campaign_idx
  on public.system_message_recipients(campaign_id);

alter table public.sms_campaigns enable row level security;
alter table public.sms_recipients enable row level security;
alter table public.sms_delivery_logs enable row level security;
alter table public.sms_provider_events enable row level security;
alter table public.system_message_campaigns enable row level security;
alter table public.system_message_recipients enable row level security;
alter table public.notifications enable row level security;

drop policy if exists sms_campaigns_admin_all on public.sms_campaigns;
create policy sms_campaigns_admin_all on public.sms_campaigns
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists sms_campaigns_partner_restaurant on public.sms_campaigns;
create policy sms_campaigns_partner_restaurant on public.sms_campaigns
  for all
  using (
    restaurant_id in (
      select id from public.restaurants
      where owner_user_id = auth.uid()
         or id = (select restaurant_id from public.profiles where id = auth.uid())
    )
  )
  with check (
    restaurant_id in (
      select id from public.restaurants
      where owner_user_id = auth.uid()
         or id = (select restaurant_id from public.profiles where id = auth.uid())
    )
  );

drop policy if exists sms_recipients_admin_all on public.sms_recipients;
create policy sms_recipients_admin_all on public.sms_recipients
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists sms_recipients_partner_restaurant on public.sms_recipients;
create policy sms_recipients_partner_restaurant on public.sms_recipients
  for select
  using (
    campaign_id in (
      select id from public.sms_campaigns
      where restaurant_id in (
        select id from public.restaurants
        where owner_user_id = auth.uid()
           or id = (select restaurant_id from public.profiles where id = auth.uid())
      )
    )
  );

drop policy if exists sms_logs_admin_all on public.sms_delivery_logs;
create policy sms_logs_admin_all on public.sms_delivery_logs
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists sms_events_admin_all on public.sms_provider_events;
create policy sms_events_admin_all on public.sms_provider_events
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists system_message_campaigns_admin_all on public.system_message_campaigns;
create policy system_message_campaigns_admin_all on public.system_message_campaigns
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists system_message_recipients_admin_all on public.system_message_recipients;
create policy system_message_recipients_admin_all on public.system_message_recipients
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists notifications_owner_select_update on public.notifications;
create policy notifications_owner_select_update on public.notifications
  for select
  using (user_id = auth.uid());

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all on public.notifications
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update on public.sms_campaigns to authenticated;
grant select on public.sms_recipients to authenticated;
grant select on public.system_message_campaigns to authenticated;
grant select on public.system_message_recipients to authenticated;
grant select, update on public.notifications to authenticated;

commit;
