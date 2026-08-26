-- SmartTable Enterprise 3.1.2: communication consent, preferences,
-- suppression, and auditable partner/admin message campaigns.
-- Additive and safe to rerun.

begin;

create extension if not exists pgcrypto;

create table if not exists public.communication_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  transactional_email_enabled boolean not null default true,
  marketing_email_enabled boolean not null default false,
  transactional_sms_enabled boolean not null default false,
  marketing_sms_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  preferred_language text not null default 'en',
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null,
  consent_type text not null,
  status text not null,
  source text not null default 'account_preferences',
  consent_text_version text not null,
  ip_address text,
  user_agent text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint communication_consents_channel_check
    check (channel in ('email', 'sms', 'in_app', 'push')),
  constraint communication_consents_type_check
    check (consent_type in ('transactional', 'marketing')),
  constraint communication_consents_status_check
    check (status in ('granted', 'revoked'))
);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  normalized_destination text not null,
  channel text not null,
  reason text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint suppression_list_channel_check
    check (channel in ('email', 'sms', 'push', 'in_app'))
);

create unique index if not exists idx_suppression_list_destination_channel
  on public.suppression_list(normalized_destination, channel);

create index if not exists idx_communication_consents_user_created
  on public.communication_consents(user_id, created_at desc);

create index if not exists idx_communication_consents_marketing_granted
  on public.communication_consents(user_id, channel, consent_type, created_at desc)
  where consent_type = 'marketing' and status = 'granted';

create table if not exists public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  campaign_type text not null default 'partner_marketing',
  channel text not null default 'email',
  name text not null,
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
  status text not null default 'draft',
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  opened_count integer not null default 0,
  clicked_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_campaigns_type_check
    check (campaign_type in ('partner_marketing', 'admin_broadcast', 'diagnostic_test')),
  constraint message_campaigns_channel_check
    check (channel in ('email')),
  constraint message_campaigns_status_check
    check (status in ('draft', 'scheduled', 'queued', 'sending', 'sent', 'cancelled', 'failed', 'archived'))
);

create table if not exists public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'email',
  destination_hash text not null,
  language text not null default 'en',
  status text not null default 'queued',
  provider_message_id text,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  opened_at timestamptz,
  clicked_at timestamptz,
  constraint message_recipients_channel_check
    check (channel in ('email')),
  constraint message_recipients_status_check
    check (status in ('queued', 'sent', 'delivered', 'delayed', 'bounced', 'failed', 'complained', 'unsubscribed', 'opened', 'clicked', 'cancelled'))
);

create unique index if not exists idx_message_recipients_campaign_user_channel
  on public.message_recipients(campaign_id, user_id, channel)
  where user_id is not null;

create unique index if not exists idx_message_recipients_campaign_destination
  on public.message_recipients(campaign_id, destination_hash, channel);

create index if not exists idx_message_campaigns_restaurant_status
  on public.message_campaigns(restaurant_id, status, scheduled_at, created_at desc);

create index if not exists idx_message_recipients_campaign_status
  on public.message_recipients(campaign_id, status, queued_at);

alter table public.email_logs
  add column if not exists message_campaign_id uuid references public.message_campaigns(id) on delete set null;

alter table public.email_queue
  add column if not exists message_campaign_id uuid references public.message_campaigns(id) on delete set null;

create index if not exists idx_email_logs_message_campaign
  on public.email_logs(message_campaign_id)
  where message_campaign_id is not null;

create index if not exists idx_email_queue_message_campaign
  on public.email_queue(message_campaign_id)
  where message_campaign_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'communication_preferences_set_updated_at'
  ) then
    create trigger communication_preferences_set_updated_at
    before update on public.communication_preferences
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'message_campaigns_set_updated_at'
  ) then
    create trigger message_campaigns_set_updated_at
    before update on public.message_campaigns
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.communication_preferences enable row level security;
alter table public.communication_consents enable row level security;
alter table public.suppression_list enable row level security;
alter table public.message_campaigns enable row level security;
alter table public.message_recipients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'communication_preferences'
      and policyname = 'communication_preferences_self_or_admin'
  ) then
    create policy communication_preferences_self_or_admin
    on public.communication_preferences
    for all
    using (auth.role() = 'service_role' or public.is_admin() or user_id = auth.uid())
    with check (auth.role() = 'service_role' or public.is_admin() or user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'communication_consents'
      and policyname = 'communication_consents_self_or_admin'
  ) then
    create policy communication_consents_self_or_admin
    on public.communication_consents
    for all
    using (auth.role() = 'service_role' or public.is_admin() or user_id = auth.uid())
    with check (auth.role() = 'service_role' or public.is_admin() or user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'suppression_list'
      and policyname = 'suppression_list_admin_service_only'
  ) then
    create policy suppression_list_admin_service_only
    on public.suppression_list
    for all
    using (auth.role() = 'service_role' or public.is_admin())
    with check (auth.role() = 'service_role' or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'message_campaigns'
      and policyname = 'message_campaigns_scoped'
  ) then
    create policy message_campaigns_scoped
    on public.message_campaigns
    for all
    using (
      auth.role() = 'service_role'
      or public.is_admin()
      or (restaurant_id is not null and public.owns_restaurant(restaurant_id))
    )
    with check (
      auth.role() = 'service_role'
      or public.is_admin()
      or (restaurant_id is not null and public.owns_restaurant(restaurant_id))
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'message_recipients'
      and policyname = 'message_recipients_campaign_scoped'
  ) then
    create policy message_recipients_campaign_scoped
    on public.message_recipients
    for all
    using (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.message_campaigns mc
        where mc.id = message_recipients.campaign_id
          and (
            public.is_admin()
            or (mc.restaurant_id is not null and public.owns_restaurant(mc.restaurant_id))
          )
      )
    )
    with check (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.message_campaigns mc
        where mc.id = message_recipients.campaign_id
          and (
            public.is_admin()
            or (mc.restaurant_id is not null and public.owns_restaurant(mc.restaurant_id))
          )
      )
    );
  end if;
end $$;

grant select, insert, update on public.communication_preferences to authenticated;
grant select, insert on public.communication_consents to authenticated;
grant select, insert, update on public.suppression_list to authenticated;
grant select, insert, update on public.message_campaigns to authenticated;
grant select, insert, update on public.message_recipients to authenticated;

commit;
