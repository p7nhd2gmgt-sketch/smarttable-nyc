-- Integration Hub, data import fallback, billing foundation, privacy controls,
-- monitoring, feature flags, and readiness metadata for production rollout.

create table if not exists public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.integration_connections(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  provider text not null,
  sync_type text not null default 'reservations',
  status text not null default 'requires_integration'
    check (status in ('queued', 'running', 'completed', 'failed', 'requires_integration', 'cancelled')),
  imported_reservations integer not null default 0,
  imported_guests integer not null default 0,
  imported_availability integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_error_logs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.integration_connections(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  provider text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error', 'critical')),
  error_code text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.data_import_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'csv',
  import_type text not null default 'reservations'
    check (import_type in ('reservations', 'guests', 'weekly_performance', 'reservation_summary')),
  status text not null default 'completed'
    check (status in ('uploaded', 'mapped', 'completed', 'failed', 'cancelled')),
  rows_received integer not null default 0,
  rows_imported integer not null default 0,
  rows_failed integer not null default 0,
  mapping_summary jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.manual_performance_uploads (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  service_week date,
  reservations_count integer,
  covers_count integer,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.guest_consents (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guests(id) on delete cascade,
  guest_email text,
  consent_type text not null,
  status text not null default 'granted' check (status in ('granted', 'revoked')),
  source text not null default 'smarttable',
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  guest_email text not null,
  scope text not null default 'marketing',
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  token_hash text,
  unsubscribed_at timestamptz not null default now(),
  reason text
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  guest_email text not null,
  request_type text not null check (request_type in ('access', 'deletion', 'correction', 'export', 'unsubscribe')),
  status text not null default 'received' check (status in ('received', 'in_review', 'completed', 'rejected')),
  message text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('privacy_policy', 'terms_of_service', 'data_processing_addendum')),
  title text not null,
  version text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  content text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_type, version)
);

create table if not exists public.feature_flags (
  key text primary key,
  label text not null,
  status text not null default 'beta'
    check (status in ('live', 'beta', 'demo_only', 'coming_soon', 'requires_integration', 'requires_more_data')),
  enabled boolean not null default true,
  audience text not null default 'all',
  description text,
  owner text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  monthly_price numeric(12,2) not null default 0,
  per_booking_fee numeric(12,2) not null default 0,
  stripe_price_id text,
  features jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  billing_plan_id uuid references public.billing_plans(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'incomplete')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_invoice_id text,
  amount_due numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  currency text not null default 'usd',
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  hosted_invoice_url text,
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null default 'stripe',
  event_type text not null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  area text not null default 'app',
  severity text not null default 'error' check (severity in ('info', 'warning', 'error', 'critical')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error', 'critical')),
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.integrations (provider, category, display_name, status, required_scopes)
values
  ('tock', 'reservation', 'Tock', 'planned', array['reservations:read', 'guests:read']),
  ('google_reserve', 'reservation', 'Google Reserve', 'planned', array['reservations:read', 'availability:read']),
  ('weather_api', 'weather', 'Weather API', 'planned', array['weather:read']),
  ('local_events_api', 'events', 'Local events API', 'planned', array['events:read'])
on conflict (provider) do update
set category = excluded.category,
    display_name = excluded.display_name,
    status = excluded.status,
    required_scopes = excluded.required_scopes,
    updated_at = now();

insert into public.feature_status (key, label, status, description, data_source)
values
  ('integration_hub', 'Integration Hub', 'beta', 'Provider catalog, connection tracking, sync logs, import jobs, and error logs are available. Live provider sync requires approved API access.', 'integrations, integration_connections, integration_sync_runs'),
  ('csv_reservation_import', 'CSV reservation import', 'beta', 'Restaurants can upload reservation exports and map them into the SmartTable unified reservation format.', 'data_import_jobs, imported_reservations'),
  ('manual_data_import', 'Manual data import', 'beta', 'Restaurants can add weekly performance summaries before direct reservation integrations are available.', 'manual_performance_uploads, demand_snapshots'),
  ('privacy_compliance', 'Privacy and compliance controls', 'beta', 'Consent, unsubscribe, privacy requests, and legal document structures are scaffolded.', 'guest_consents, email_unsubscribes, privacy_requests, legal_documents'),
  ('billing_foundation', 'Billing foundation', 'beta', 'Stripe-ready tables for plan tiers, subscriptions, invoices, and payment events are prepared. Guest payment is not required for MVP.', 'billing_plans, subscriptions, invoices'),
  ('monitoring_error_logs', 'Monitoring and error logs', 'beta', 'App, integration, email, AI, and billing error logs are visible to admins.', 'app_error_logs, integration_error_logs, email_logs, ai_actions')
on conflict (key) do update
set label = excluded.label,
    status = excluded.status,
    description = excluded.description,
    data_source = excluded.data_source,
    updated_at = now();

insert into public.feature_flags (key, label, status, enabled, audience, description, owner)
values
  ('restaurant_onboarding', 'Restaurant onboarding', 'beta', true, 'partners', 'Real onboarding fields are active; team invitations need production email.', 'operations'),
  ('reservation_integrations', 'Reservation integrations', 'requires_integration', false, 'partners', 'Provider APIs require authorization and partnership approval.', 'integrations'),
  ('csv_reservation_import', 'CSV reservation import', 'beta', true, 'partners', 'CSV/manual import feeds demand intelligence before direct integrations.', 'integrations'),
  ('ai_demand_recommendations', 'AI demand recommendations', 'beta', true, 'partners', 'Rules-v1 reads stored platform data and stores recommendations/results.', 'ai'),
  ('stripe_billing', 'Stripe billing', 'coming_soon', false, 'admins', 'Database foundation is ready; Stripe webhooks and checkout are next.', 'billing'),
  ('marketplace_intelligence', 'Marketplace intelligence', 'requires_more_data', true, 'admins', 'Only show as aggregated/anonymized and label until data volume is sufficient.', 'analytics')
on conflict (key) do update
set label = excluded.label,
    status = excluded.status,
    enabled = excluded.enabled,
    audience = excluded.audience,
    description = excluded.description,
    owner = excluded.owner,
    updated_at = now();

insert into public.billing_plans (key, name, monthly_price, per_booking_fee, features, status)
values
  ('free', 'Free', 0, 0, '{"offers": 3, "ai_recommendations": "demo"}'::jsonb, 'active'),
  ('growth_monthly', 'Growth Monthly', 199, 0, '{"offers": "unlimited", "ai_recommendations": "approved_actions", "email_campaigns": true}'::jsonb, 'active'),
  ('per_booking', 'Per Booking', 0, 2.5, '{"offers": "unlimited", "ai_recommendations": "approved_actions"}'::jsonb, 'active')
on conflict (key) do update
set name = excluded.name,
    monthly_price = excluded.monthly_price,
    per_booking_fee = excluded.per_booking_fee,
    features = excluded.features,
    status = excluded.status,
    updated_at = now();

insert into public.legal_documents (document_type, title, version, status, content, published_at)
values
  ('privacy_policy', 'SmartTable Privacy Policy', 'v0.1', 'draft', 'SmartTable uses guest data only with permission. Restaurants receive aggregated and anonymized analytics unless explicit permission allows otherwise.', null),
  ('terms_of_service', 'SmartTable Terms of Service', 'v0.1', 'draft', 'Restaurants own their imported reservation data. SmartTable may process it to provide reservations, analytics, and AI recommendations under agreed terms.', null)
on conflict (document_type, version) do nothing;

create index if not exists idx_integration_sync_runs_restaurant on public.integration_sync_runs(restaurant_id, provider, started_at desc);
create index if not exists idx_integration_errors_restaurant on public.integration_error_logs(restaurant_id, provider, created_at desc);
create index if not exists idx_data_import_jobs_restaurant on public.data_import_jobs(restaurant_id, created_at desc);
create index if not exists idx_manual_uploads_restaurant on public.manual_performance_uploads(restaurant_id, service_week desc);
create index if not exists idx_guest_consents_email on public.guest_consents(guest_email, consent_type, status);
create index if not exists idx_email_unsubscribes_email on public.email_unsubscribes(guest_email, scope);
create index if not exists idx_privacy_requests_email on public.privacy_requests(guest_email, status, created_at desc);
create index if not exists idx_feature_flags_status on public.feature_flags(status, audience);
create index if not exists idx_subscriptions_restaurant on public.subscriptions(restaurant_id, status);
create index if not exists idx_invoices_restaurant on public.invoices(restaurant_id, created_at desc);
create index if not exists idx_app_error_logs_area on public.app_error_logs(area, severity, created_at desc);
create index if not exists idx_admin_alerts_unread on public.admin_alerts(read_at, created_at desc);

drop trigger if exists billing_plans_set_updated_at on public.billing_plans;
create trigger billing_plans_set_updated_at before update on public.billing_plans
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at before update on public.feature_flags
for each row execute function public.set_updated_at();

alter table public.integration_sync_runs enable row level security;
alter table public.integration_error_logs enable row level security;
alter table public.data_import_jobs enable row level security;
alter table public.manual_performance_uploads enable row level security;
alter table public.guest_consents enable row level security;
alter table public.email_unsubscribes enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.legal_documents enable row level security;
alter table public.feature_flags enable row level security;
alter table public.billing_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payment_events enable row level security;
alter table public.app_error_logs enable row level security;
alter table public.admin_alerts enable row level security;

drop policy if exists integration_sync_runs_scoped on public.integration_sync_runs;
create policy integration_sync_runs_scoped on public.integration_sync_runs
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists integration_error_logs_scoped on public.integration_error_logs;
create policy integration_error_logs_scoped on public.integration_error_logs
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists data_import_jobs_scoped on public.data_import_jobs;
create policy data_import_jobs_scoped on public.data_import_jobs
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists imported_reservations_write_scoped on public.imported_reservations;
create policy imported_reservations_write_scoped on public.imported_reservations
for insert with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists imported_guests_write_scoped on public.imported_guests;
create policy imported_guests_write_scoped on public.imported_guests
for insert with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists manual_uploads_scoped on public.manual_performance_uploads;
create policy manual_uploads_scoped on public.manual_performance_uploads
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists guest_consents_admin on public.guest_consents;
create policy guest_consents_admin on public.guest_consents
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists email_unsubscribes_admin on public.email_unsubscribes;
create policy email_unsubscribes_admin on public.email_unsubscribes
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists privacy_requests_admin on public.privacy_requests;
create policy privacy_requests_admin on public.privacy_requests
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists legal_documents_public_read on public.legal_documents;
create policy legal_documents_public_read on public.legal_documents
for select using (status = 'published' or public.is_admin());

drop policy if exists legal_documents_admin_write on public.legal_documents;
create policy legal_documents_admin_write on public.legal_documents
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists feature_flags_admin on public.feature_flags;
create policy feature_flags_admin on public.feature_flags
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists billing_plans_read on public.billing_plans;
create policy billing_plans_read on public.billing_plans
for select using (true);

drop policy if exists subscriptions_scoped on public.subscriptions;
create policy subscriptions_scoped on public.subscriptions
for all using (public.is_admin() or public.owns_restaurant(restaurant_id))
with check (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists invoices_scoped on public.invoices;
create policy invoices_scoped on public.invoices
for select using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists payment_events_admin on public.payment_events;
create policy payment_events_admin on public.payment_events
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists app_error_logs_admin on public.app_error_logs;
create policy app_error_logs_admin on public.app_error_logs
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_alerts_admin on public.admin_alerts;
create policy admin_alerts_admin on public.admin_alerts
for all using (public.is_admin())
with check (public.is_admin());

grant select, insert, update on public.integration_sync_runs to authenticated;
grant select, insert, update on public.integration_error_logs to authenticated;
grant select, insert, update on public.data_import_jobs to authenticated;
grant select, insert, update on public.imported_reservations to authenticated;
grant select, insert, update on public.imported_guests to authenticated;
grant select, insert, update on public.manual_performance_uploads to authenticated;
grant select, insert, update on public.guest_consents to authenticated;
grant select, insert on public.email_unsubscribes to anon, authenticated;
grant select, insert, update on public.privacy_requests to anon, authenticated;
grant select on public.legal_documents to anon, authenticated;
grant insert, update, delete on public.legal_documents to authenticated;
grant select, insert, update on public.feature_flags to authenticated;
grant select on public.billing_plans to anon, authenticated;
grant select, insert, update on public.subscriptions to authenticated;
grant select, insert, update on public.invoices to authenticated;
grant select, insert on public.payment_events to authenticated;
grant select, insert, update on public.app_error_logs to authenticated;
grant select, insert, update on public.admin_alerts to authenticated;
