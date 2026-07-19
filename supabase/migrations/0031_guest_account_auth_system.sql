alter table public.guests
  add column if not exists email_verified boolean not null default false,
  add column if not exists status text not null default 'active';

alter table public.guest_notifications
  add column if not exists read_at timestamptz;

create table if not exists public.guest_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.guest_auth_events enable row level security;

drop policy if exists "guest_auth_events_admin_read" on public.guest_auth_events;
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

drop policy if exists "guest_auth_events_service_write" on public.guest_auth_events;
create policy "guest_auth_events_service_write"
  on public.guest_auth_events
  for insert
  with check (true);

create index if not exists idx_guest_auth_events_user_created
  on public.guest_auth_events(user_id, created_at desc);

create index if not exists idx_guest_auth_events_email_created
  on public.guest_auth_events(guest_email, created_at desc);
