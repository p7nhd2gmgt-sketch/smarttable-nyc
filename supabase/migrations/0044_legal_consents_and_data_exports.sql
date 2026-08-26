create extension if not exists pgcrypto;

alter table public.legal_documents
  add column if not exists language text not null default 'en',
  add column if not exists content_url text,
  add column if not exists effective_at timestamptz,
  add column if not exists is_current boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.legal_documents'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%document_type%'
    and pg_get_constraintdef(oid) like '%data_processing_addendum%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.legal_documents drop constraint %I', constraint_name);
  end if;

  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.legal_documents'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (document_type, version)'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.legal_documents drop constraint %I', constraint_name);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.legal_documents'::regclass
      and conname = 'legal_documents_document_type_supported'
  ) then
    alter table public.legal_documents
      add constraint legal_documents_document_type_supported
      check (document_type in (
        'terms_of_service',
        'privacy_policy',
        'cookie_policy',
        'guest_platform_rules',
        'marketing_consent',
        'location_personalization_consent',
        'data_processing_addendum'
      )) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.legal_documents'::regclass
      and conname = 'legal_documents_type_version_language_unique'
  ) then
    alter table public.legal_documents
      add constraint legal_documents_type_version_language_unique unique (document_type, version, language);
  end if;
end $$;

create table if not exists public.user_legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_email text,
  document_type text not null,
  document_version text not null,
  language text not null default 'en',
  status text not null default 'accepted' check (status in ('accepted', 'withdrawn', 'superseded')),
  accepted_at timestamptz,
  withdrawn_at timestamptz,
  ip_hash text,
  user_agent text,
  source text not null default 'guest_account',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_legal_consents
  add column if not exists guest_email text,
  add column if not exists language text not null default 'en',
  add column if not exists ip_hash text,
  add column if not exists user_agent text,
  add column if not exists source text not null default 'guest_account',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'failed', 'expired')),
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  download_count integer not null default 0,
  download_token_hash text,
  export_payload jsonb,
  error_code text,
  email_notification_status text not null default 'not_attempted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.data_export_requests
  add column if not exists guest_email text,
  add column if not exists download_token_hash text,
  add column if not exists export_payload jsonb,
  add column if not exists email_notification_status text not null default 'not_attempted',
  add column if not exists updated_at timestamptz not null default now();

alter table public.legal_documents enable row level security;
alter table public.user_legal_consents enable row level security;
alter table public.data_export_requests enable row level security;

create unique index if not exists idx_legal_documents_one_current
  on public.legal_documents(document_type, language)
  where is_current = true;

create index if not exists idx_user_legal_consents_user_type_created
  on public.user_legal_consents(user_id, document_type, created_at desc);

create index if not exists idx_user_legal_consents_email_type_created
  on public.user_legal_consents(guest_email, document_type, created_at desc);

create index if not exists idx_data_export_requests_user_status_created
  on public.data_export_requests(user_id, status, created_at desc);

create index if not exists idx_data_export_requests_token_hash
  on public.data_export_requests(download_token_hash);

create or replace function public.prevent_published_legal_document_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' and (
    new.document_type is distinct from old.document_type
    or new.version is distinct from old.version
    or new.language is distinct from old.language
    or new.title is distinct from old.title
    or new.content is distinct from old.content
    or new.content_url is distinct from old.content_url
    or new.published_at is distinct from old.published_at
    or new.effective_at is distinct from old.effective_at
  ) then
    raise exception 'Published legal document versions are immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'legal_documents_prevent_published_mutation'
      and tgrelid = 'public.legal_documents'::regclass
  ) then
    create trigger legal_documents_prevent_published_mutation
      before update on public.legal_documents
      for each row
      execute function public.prevent_published_legal_document_mutation();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'legal_documents' and policyname = 'legal_documents_public_current_read'
  ) then
    create policy legal_documents_public_current_read on public.legal_documents
      for select
      using (status = 'published' or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'legal_documents' and policyname = 'legal_documents_admin_write_versions'
  ) then
    create policy legal_documents_admin_write_versions on public.legal_documents
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_legal_consents' and policyname = 'user_legal_consents_owner_read'
  ) then
    create policy user_legal_consents_owner_read on public.user_legal_consents
      for select
      using (auth.uid() = user_id or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_legal_consents' and policyname = 'user_legal_consents_service_write'
  ) then
    create policy user_legal_consents_service_write on public.user_legal_consents
      for all
      using (public.is_admin())
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'data_export_requests' and policyname = 'data_export_requests_owner_read'
  ) then
    create policy data_export_requests_owner_read on public.data_export_requests
      for select
      using (auth.uid() = user_id or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'data_export_requests' and policyname = 'data_export_requests_service_write'
  ) then
    create policy data_export_requests_service_write on public.data_export_requests
      for all
      using (public.is_admin())
      with check (true);
  end if;
end $$;

insert into public.legal_documents (document_type, version, language, title, content, content_url, status, published_at, effective_at, is_current)
values
  ('terms_of_service', '2026-07-17', 'en', 'Terms of Service', 'SmartTable Terms of Service for guest accounts and reservation requests.', '/terms?version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('terms_of_service', '2026-07-17', 'es', 'Términos de servicio', 'Términos de servicio de SmartTable para cuentas de invitados y solicitudes de reserva.', '/terms?version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('terms_of_service', '2026-07-17', 'hu', 'Általános Szerződési Feltételek', 'A SmartTable általános szerződési feltételei vendégfiókokhoz és foglalási kérésekhez.', '/terms?version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('privacy_policy', '2026-07-17', 'en', 'Privacy Policy', 'SmartTable Privacy Policy for guest profile, preference, reservation, consent, and notification data.', '/privacy?version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('privacy_policy', '2026-07-17', 'es', 'Política de privacidad', 'Política de privacidad de SmartTable para datos de perfil, preferencias, reservas, consentimientos y notificaciones.', '/privacy?version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('privacy_policy', '2026-07-17', 'hu', 'Adatvédelmi szabályzat', 'A SmartTable adatvédelmi szabályzata profil-, preferencia-, foglalási-, hozzájárulási és értesítési adatokhoz.', '/privacy?version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('cookie_policy', '2026-07-17', 'en', 'Cookie Policy', 'SmartTable Cookie Policy for essential session and preference storage.', '/privacy?section=cookies&version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('cookie_policy', '2026-07-17', 'es', 'Política de cookies', 'Política de cookies de SmartTable para almacenamiento esencial de sesión y preferencias.', '/privacy?section=cookies&version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('cookie_policy', '2026-07-17', 'hu', 'Cookie-szabályzat', 'A SmartTable cookie-szabályzata az alapvető munkamenet- és preferenciatároláshoz.', '/privacy?section=cookies&version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('guest_platform_rules', '2026-07-17', 'en', 'Guest Platform Rules', 'SmartTable rules for guest reservations, cancellations, respectful use, and account conduct.', '/terms?section=guest-rules&version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('guest_platform_rules', '2026-07-17', 'es', 'Reglas de la plataforma para invitados', 'Reglas de SmartTable para reservas, cancelaciones, uso respetuoso y conducta de cuenta.', '/terms?section=guest-rules&version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('guest_platform_rules', '2026-07-17', 'hu', 'Vendégplatform szabályai', 'A SmartTable vendégplatform szabályai foglalásokhoz, lemondásokhoz, tiszteletteljes használathoz és fiókhasználathoz.', '/terms?section=guest-rules&version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('marketing_consent', '2026-07-17', 'en', 'Marketing Consent', 'Optional consent for SmartTable offers and product updates.', '/privacy?section=marketing&version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('marketing_consent', '2026-07-17', 'es', 'Consentimiento de marketing', 'Consentimiento opcional para ofertas y actualizaciones de SmartTable.', '/privacy?section=marketing&version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('marketing_consent', '2026-07-17', 'hu', 'Marketing-hozzájárulás', 'Opcionális hozzájárulás SmartTable ajánlatokhoz és termékfrissítésekhez.', '/privacy?section=marketing&version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('location_personalization_consent', '2026-07-17', 'en', 'Location and Personalization Consent', 'Optional consent for location-aware and preference-based SmartTable personalization.', '/privacy?section=personalization&version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('location_personalization_consent', '2026-07-17', 'es', 'Consentimiento de ubicación y personalización', 'Consentimiento opcional para personalización basada en ubicación y preferencias.', '/privacy?section=personalization&version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('location_personalization_consent', '2026-07-17', 'hu', 'Helyadat- és személyre szabási hozzájárulás', 'Opcionális hozzájárulás helyadatokra és preferenciaalapú SmartTable személyre szabásra.', '/privacy?section=personalization&version=2026-07-17&lang=hu', 'published', now(), now(), true)
on conflict (document_type, version, language) do nothing;

insert into public.site_content (key, value_en, value_es, value_hu, content_type, group_name)
values
  ('email_data_export_ready_subject', 'Your SmartTable data export is ready', 'Tu exportación de datos de SmartTable está lista', 'Elkészült a SmartTable adatexportod', 'text', 'email'),
  ('email_data_export_ready_body', 'Hi {{firstName}}, your SmartTable personal data export is ready. This secure link expires on {{expiresAt}}. Download it here: {{downloadUrl}}', 'Hola {{firstName}}, tu exportación de datos personales de SmartTable está lista. Este enlace seguro vence el {{expiresAt}}. Descárgala aquí: {{downloadUrl}}', 'Szia {{firstName}}, elkészült a SmartTable személyes adatexportod. A biztonságos link ekkor jár le: {{expiresAt}}. Itt töltheted le: {{downloadUrl}}', 'textarea', 'email'),
  ('email_cta_download_export', 'Download export', 'Descargar exportación', 'Export letöltése', 'text', 'email')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  value_hu = excluded.value_hu,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
