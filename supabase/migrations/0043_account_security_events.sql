create extension if not exists pgcrypto;

create table if not exists public.guest_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.guest_auth_events
  add column if not exists ip_hash text,
  add column if not exists ip_masked text,
  add column if not exists user_agent_summary text,
  add column if not exists email_notification_status text not null default 'not_applicable';

alter table public.guest_auth_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'guest_auth_events'
      and policyname = 'guest_auth_events_admin_read'
  ) then
    create policy "guest_auth_events_admin_read"
      on public.guest_auth_events
      for select
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
          and profiles.role in ('admin', 'super_admin')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'guest_auth_events'
      and policyname = 'guest_auth_events_service_write'
  ) then
    create policy "guest_auth_events_service_write"
      on public.guest_auth_events
      for insert
      with check (true);
  end if;
end $$;

create index if not exists idx_guest_auth_events_user_event_created
  on public.guest_auth_events(user_id, event_type, created_at desc);

create index if not exists idx_guest_auth_events_ip_hash_created
  on public.guest_auth_events(ip_hash, created_at desc);

insert into public.site_content (key, value_en, value_es, value_hu, content_type, group_name)
values
  (
    'email_password_changed_subject',
    'Your SmartTable password was changed',
    'Tu contraseña de SmartTable fue cambiada',
    'Megváltozott a SmartTable-jelszavad',
    'text',
    'email'
  ),
  (
    'email_password_changed_body',
    $$Hi {{firstName}},

Your SmartTable account password was changed successfully.

Time: {{localizedDateTime}}
Device/browser: {{userAgentSummary}}
Approximate IP address: {{maskedIp}}

If you changed your password, no further action is needed.

If you did not start this change:
1. change your password again immediately,
2. sign out of all active sessions,
3. contact SmartTable support.

SmartTable will never ask for your password by email.$$,
    $$Hola {{firstName}},

La contraseña de tu cuenta SmartTable se cambió correctamente.

Hora: {{localizedDateTime}}
Dispositivo/navegador: {{userAgentSummary}}
Dirección IP aproximada: {{maskedIp}}

Si cambiaste tu contraseña, no tienes que hacer nada más.

Si no iniciaste este cambio:
1. cambia tu contraseña otra vez de inmediato,
2. cierra todas las sesiones activas,
3. contacta al soporte de SmartTable.

SmartTable nunca te pedirá tu contraseña por email.$$,
    $$Szia {{firstName}},

A SmartTable-fiókod jelszavát sikeresen megváltoztatták.

Időpont: {{localizedDateTime}}
Eszköz/böngésző: {{userAgentSummary}}
Hozzávetőleges IP-cím: {{maskedIp}}

Ha te változtattad meg a jelszavadat, nincs további teendőd.

Ha nem te kezdeményezted ezt a módosítást:
1. azonnal változtasd meg ismét a jelszavadat,
2. zárd le az összes aktív munkamenetet,
3. vedd fel a kapcsolatot a SmartTable ügyfélszolgálatával.

A SmartTable soha nem kéri el e-mailben a jelszavadat.$$,
    'textarea',
    'email'
  )
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  value_hu = excluded.value_hu,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
