create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (setting_key, setting_value)
values ('platform_mode', '{"mode":"basic","platform_mode":"basic","ai_demo_visibility":false,"show_ai_mode_badge":true}'::jsonb)
on conflict (setting_key) do nothing;

insert into public.site_content (key, value_en, value_es, value_hu, content_type, group_name)
values
  ('basic_brand_title', 'SmartTable', 'SmartTable', 'SmartTable', 'text', 'site'),
  ('basic_brand_subtitle', 'Discounted restaurant reservations', 'Reservas de restaurantes con descuento', 'Kedvezmenyes ettermi foglalasok', 'text', 'site'),
  ('basic_seo_title', 'SmartTable | Discounted New York restaurant reservations', 'SmartTable | Reservas con descuento en restaurantes de New York', 'SmartTable | Kedvezmenyes ettermi foglalasok New Yorkban', 'text', 'seo'),
  ('basic_seo_meta_description', 'Book discounted restaurant tables across New York and send reservation requests directly to restaurants.', 'Reserva mesas con descuento en New York y envia solicitudes directamente a los restaurantes.', 'Foglalj kedvezmenyes ettermi asztalokat New Yorkban, kozvetlen foglalasi kerelemmel az etterem fele.', 'textarea', 'seo'),
  ('basic_hero_kicker', 'SmartTable', 'SmartTable', 'SmartTable', 'text', 'home'),
  ('basic_hero_title', 'Discounted restaurant reservations in New York', 'Reservas de restaurantes con descuento en New York', 'Kedvezmenyes ettermi foglalasok New Yorkban', 'text', 'home'),
  ('basic_hero_subtitle', 'Browse restaurants, choose a discounted table offer, and send a reservation request directly to the restaurant.', 'Explora restaurantes, elige una oferta de mesa con descuento y envia una solicitud de reserva directamente al restaurante.', 'Bongessz ettermeket, valassz kedvezmenyes asztalajanlatot, es kuldj foglalasi kerelmet kozvetlenul az etteremnek.', 'textarea', 'home')
on conflict (key) do nothing;

create index if not exists idx_app_settings_updated_at on public.app_settings(updated_at desc);

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists app_settings_admin_all on public.app_settings;
drop policy if exists app_settings_admin_select on public.app_settings;
drop policy if exists app_settings_super_admin_write on public.app_settings;

create policy app_settings_admin_select on public.app_settings
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
);

create policy app_settings_super_admin_write on public.app_settings
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
  )
) with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
  )
);

grant select, insert, update on public.app_settings to authenticated;
