-- Adds restaurant reviews, partner activity notifications,
-- newest restaurant cards, and favorite/review stats.

create table if not exists public.restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_name text,
  guest_email text,
  food_rating integer not null check (food_rating between 1 and 5),
  service_rating integer not null check (service_rating between 1 and 5),
  ambience_rating integer not null check (ambience_rating between 1 and 5),
  comment text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_reviews_restaurant on public.restaurant_reviews(restaurant_id, status, created_at desc);
create index if not exists idx_restaurant_reviews_status on public.restaurant_reviews(status, created_at desc);

drop trigger if exists restaurant_reviews_set_updated_at on public.restaurant_reviews;
create trigger restaurant_reviews_set_updated_at
before update on public.restaurant_reviews
for each row execute function public.set_updated_at();

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  partner_user_id uuid references public.profiles(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_admin_notifications_read on public.admin_notifications(read_at, created_at desc);
create index if not exists idx_admin_notifications_restaurant on public.admin_notifications(restaurant_id, created_at desc);

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('review_button', 'Write review', 'Escribir resena', 'text', 'reviews'),
  ('review_title', 'Review this restaurant', 'Valorar este restaurante', 'text', 'reviews'),
  ('review_food_label', 'Food', 'Comida', 'text', 'reviews'),
  ('review_service_label', 'Service', 'Servicio', 'text', 'reviews'),
  ('review_ambience_label', 'Ambience', 'Ambiente', 'text', 'reviews'),
  ('review_overall_label', 'Overall', 'General', 'text', 'reviews'),
  ('review_comment_label', 'Comment', 'Comentario', 'text', 'reviews'),
  ('review_submit_label', 'Submit review', 'Enviar resena', 'text', 'reviews'),
  ('review_success', 'Thanks. Your review is waiting for admin approval.', 'Gracias. Tu resena esta esperando aprobacion del admin.', 'text', 'reviews'),
  ('review_count_label', 'reviews', 'resenas', 'text', 'reviews'),
  ('newest_restaurants_kicker', 'New this week', 'Nuevo esta semana', 'text', 'home'),
  ('newest_restaurants_title', 'Newest Restaurants This Week', 'Restaurantes nuevos esta semana', 'text', 'home'),
  ('newest_restaurants_empty', 'No new restaurants were added this week. Check back soon.', 'No se agregaron restaurantes nuevos esta semana. Vuelve pronto.', 'textarea', 'home'),
  ('newest_restaurants_cta', 'View restaurant', 'Ver restaurante', 'text', 'home'),
  ('notifications_title', 'Notifications', 'Notificaciones', 'text', 'admin'),
  ('notifications_mark_read', 'Mark as read', 'Marcar como leida', 'text', 'admin'),
  ('notifications_view_all', 'View all notifications', 'Ver todas las notificaciones', 'text', 'admin')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name;

create or replace view public.restaurant_review_summary as
select
  restaurant_id,
  round(avg(food_rating)::numeric, 1) as food_rating_avg,
  round(avg(service_rating)::numeric, 1) as service_rating_avg,
  round(avg(ambience_rating)::numeric, 1) as ambience_rating_avg,
  round(((avg(food_rating) + avg(service_rating) + avg(ambience_rating)) / 3)::numeric, 1) as overall_rating_avg,
  count(*)::integer as review_count
from public.restaurant_reviews
where status = 'approved'
group by restaurant_id;

create or replace view public.restaurant_reviews_overview as
select
  rr.*,
  r.name as restaurant_name
from public.restaurant_reviews rr
join public.restaurants r on r.id = rr.restaurant_id;

create or replace view public.admin_notifications_overview as
select
  an.*,
  p.full_name as partner_name,
  p.email as partner_email,
  r.name as restaurant_name
from public.admin_notifications an
left join public.profiles p on p.id = an.partner_user_id
left join public.restaurants r on r.id = an.restaurant_id;

create or replace view public.public_restaurant_cards as
select
  r.id as restaurant_id,
  r.name as restaurant_name,
  coalesce(r.email, r.contact_email) as restaurant_email,
  r.district,
  r.address,
  coalesce(r.cuisine_type, r.cuisine) as cuisine,
  coalesce(r.cuisine_type, r.cuisine) as cuisine_type,
  r.rating,
  r.description,
  r.description_en as restaurant_description_en,
  r.description_es as restaurant_description_es,
  r.website,
  r.instagram,
  r.facebook,
  r.tiktok,
  r.google_maps_url,
  r.google_place_id,
  r.latitude,
  r.longitude,
  r.sort_order,
  r.created_at as restaurant_created_at,
  coalesce(r.card_image, r.cover_image, '/assets/restaurant-hero.png') as card_image,
  coalesce(r.icon_image, r.card_image, r.cover_image, '/assets/restaurant-hero.png') as icon_image,
  coalesce(rs.food_rating_avg, null) as food_rating_avg,
  coalesce(rs.service_rating_avg, null) as service_rating_avg,
  coalesce(rs.ambience_rating_avg, null) as ambience_rating_avg,
  coalesce(rs.overall_rating_avg, null) as overall_rating_avg,
  coalesce(rs.review_count, 0) as review_count,
  (
    select count(*)::integer
    from public.restaurant_followers rf
    where rf.restaurant_id = r.id
      and rf.notification_enabled = true
  ) as favorites_count,
  (
    select count(*)::integer
    from public.offers o
    where o.restaurant_id = r.id
      and o.status = 'active'
      and o.offer_date >= current_date
      and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
  ) as offer_count,
  (
    select o.id
    from public.offers o
    where o.restaurant_id = r.id
      and o.status = 'active'
      and o.offer_date >= current_date
      and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1)
    order by o.offer_date asc, coalesce(o.start_time, o.offer_time) asc
    limit 1
  ) as first_offer_id,
  (
    select coalesce(max(coalesce(o.discount_value, o.discount_percent)), 0)
    from public.offers o
    where o.restaurant_id = r.id
      and o.status = 'active'
      and o.offer_date >= current_date
  ) as highest_discount
from public.restaurants r
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved';

create or replace view public.public_available_offers as
select
  o.id as offer_id,
  r.id as restaurant_id,
  r.name as restaurant_name,
  coalesce(r.email, r.contact_email) as restaurant_email,
  r.district,
  r.address,
  coalesce(r.cuisine_type, r.cuisine) as cuisine,
  coalesce(r.cuisine_type, r.cuisine) as cuisine_type,
  r.rating,
  r.description,
  r.description_en as restaurant_description_en,
  r.description_es as restaurant_description_es,
  r.website,
  r.instagram,
  r.facebook,
  r.tiktok,
  r.google_maps_url,
  r.google_place_id,
  r.latitude,
  r.longitude,
  r.sort_order,
  r.created_at as restaurant_created_at,
  coalesce(rs.food_rating_avg, null) as food_rating_avg,
  coalesce(rs.service_rating_avg, null) as service_rating_avg,
  coalesce(rs.ambience_rating_avg, null) as ambience_rating_avg,
  coalesce(rs.overall_rating_avg, null) as overall_rating_avg,
  coalesce(rs.review_count, 0) as review_count,
  (
    select count(*)::integer
    from public.restaurant_followers rf
    where rf.restaurant_id = r.id
      and rf.notification_enabled = true
  ) as favorites_count,
  coalesce(r.card_image, r.cover_image, '/assets/restaurant-hero.png') as card_image,
  coalesce(r.icon_image, r.card_image, r.cover_image, '/assets/restaurant-hero.png') as icon_image,
  o.title_en,
  o.title_es,
  o.description_en as offer_description_en,
  o.description_es as offer_description_es,
  coalesce(o.title_en, 'Discounted table') as offer_title,
  coalesce(o.description_en, '') as offer_description,
  coalesce(o.offer_image, r.card_image, r.cover_image, '/assets/restaurant-hero.png') as offer_image,
  o.offer_date,
  to_char(coalesce(o.start_time, o.offer_time), 'HH24:MI') as offer_time,
  to_char(coalesce(o.start_time, o.offer_time), 'HH24:MI') as start_time,
  to_char(o.end_time, 'HH24:MI') as end_time,
  o.valid_days,
  greatest(coalesce(o.available_tables, 1) - coalesce(o.reserved_tables, 0), 0) as available_tables,
  greatest(
    (coalesce(o.available_tables, 1) - coalesce(o.reserved_tables, 0)) * coalesce(o.max_party_size, 4),
    coalesce(o.seat_count, 0) - coalesce(o.reserved_seats, 0)
  ) as available_seats,
  coalesce(o.max_party_size, 4) as max_party_size,
  o.discount_type,
  o.discount_value,
  o.discount_percent,
  o.created_at
from public.offers o
join public.restaurants r on r.id = o.restaurant_id
left join public.restaurant_review_summary rs on rs.restaurant_id = r.id
where r.status = 'approved'
  and o.status = 'active'
  and o.offer_date >= current_date
  and coalesce(o.reserved_tables, 0) < coalesce(o.available_tables, 1);

create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'restaurants_total', (select count(*) from public.restaurants),
    'restaurants_pending', (select count(*) from public.restaurants where status = 'pending'),
    'partners_total', (select count(*) from public.profiles where role in ('partner', 'restaurant')),
    'offers_active', (select count(*) from public.offers where status = 'active'),
    'reservations_total', (select count(*) from public.reservations),
    'reservations_pending', (select count(*) from public.reservations where status::text in ('pending', 'requested')),
    'reservations_accepted', (select count(*) from public.reservations where status::text in ('accepted', 'confirmed')),
    'reservations_rejected', (select count(*) from public.reservations where status::text = 'rejected'),
    'seats_reserved', coalesce((select sum(party_size) from public.reservations), 0),
    'views_total', coalesce((select sum(views_count) from public.restaurants), 0),
    'favorites_total', (select count(*) from public.restaurant_followers where notification_enabled = true),
    'favorites_this_week', (select count(*) from public.restaurant_followers where notification_enabled = true and created_at >= date_trunc('week', now())),
    'favorites_this_month', (select count(*) from public.restaurant_followers where notification_enabled = true and created_at >= date_trunc('month', now()))
  );
$$;

create or replace function public.partner_dashboard_stats(p_restaurant_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when auth.role() <> 'service_role'
      and not public.is_admin()
      and not public.owns_restaurant(p_restaurant_id)
    then jsonb_build_object('error', 'Access denied')
    else jsonb_build_object(
      'views', coalesce((select views_count from public.restaurants where id = p_restaurant_id), 0),
      'bookings', (select count(*) from public.reservations where restaurant_id = p_restaurant_id),
      'accepted', (select count(*) from public.reservations where restaurant_id = p_restaurant_id and status::text in ('accepted', 'confirmed')),
      'rejected', (select count(*) from public.reservations where restaurant_id = p_restaurant_id and status::text = 'rejected'),
      'favorites_total', (select count(*) from public.restaurant_followers where restaurant_id = p_restaurant_id and notification_enabled = true),
      'favorites_this_week', (select count(*) from public.restaurant_followers where restaurant_id = p_restaurant_id and notification_enabled = true and created_at >= date_trunc('week', now())),
      'favorites_this_month', (select count(*) from public.restaurant_followers where restaurant_id = p_restaurant_id and notification_enabled = true and created_at >= date_trunc('month', now()))
    )
  end;
$$;

alter table public.restaurant_reviews enable row level security;
alter table public.admin_notifications enable row level security;

drop policy if exists restaurant_reviews_insert_public on public.restaurant_reviews;
create policy restaurant_reviews_insert_public on public.restaurant_reviews
for insert with check (true);

drop policy if exists restaurant_reviews_admin_all on public.restaurant_reviews;
create policy restaurant_reviews_admin_all on public.restaurant_reviews
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_notifications_admin_all on public.admin_notifications;
create policy admin_notifications_admin_all on public.admin_notifications
for all using (public.is_admin())
with check (public.is_admin());

grant insert on public.restaurant_reviews to anon, authenticated;
grant select on public.restaurant_review_summary to anon, authenticated;
grant select on public.public_restaurant_cards to anon, authenticated;
grant select on public.restaurant_reviews_overview to authenticated;
grant select on public.admin_notifications_overview to authenticated;
grant select, update, insert on public.admin_notifications to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.partner_dashboard_stats(uuid) to authenticated;
