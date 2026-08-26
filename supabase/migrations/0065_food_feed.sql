begin;

create table if not exists public.food_feed_videos (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  video_service_order_id uuid references public.video_service_orders(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  caption text,
  storage_path text not null unique,
  media_type text not null default 'video',
  mime_type text not null,
  file_size_bytes integer not null,
  duration_ms integer,
  width integer not null,
  height integer not null,
  status text not null default 'pending_moderation',
  moderation_reason text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  display_order integer not null default 0,
  is_test_data boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_feed_videos_media_type_check check (media_type in ('video', 'image')),
  constraint food_feed_videos_mime_type_check check (mime_type in ('video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp')),
  constraint food_feed_videos_file_size_check check (
    file_size_bytes > 0
    and file_size_bytes <= case when media_type = 'image' then 10485760 else 20971520 end
  ),
  constraint food_feed_videos_duration_check check (
    (media_type = 'video' and duration_ms between 2500 and 3500)
    or (media_type = 'image' and duration_ms is null)
  ),
  constraint food_feed_videos_dimensions_check check (width > 0 and height > width),
  constraint food_feed_videos_status_check check (status in ('draft', 'pending_moderation', 'published', 'rejected', 'archived'))
);

alter table public.food_feed_videos
  add column if not exists media_type text not null default 'video';

alter table public.food_feed_videos
  alter column duration_ms drop not null;

alter table public.food_feed_videos drop constraint if exists food_feed_videos_media_type_check;
alter table public.food_feed_videos drop constraint if exists food_feed_videos_mime_type_check;
alter table public.food_feed_videos drop constraint if exists food_feed_videos_file_size_check;
alter table public.food_feed_videos drop constraint if exists food_feed_videos_duration_check;

alter table public.food_feed_videos
  add constraint food_feed_videos_media_type_check check (media_type in ('video', 'image'));
alter table public.food_feed_videos
  add constraint food_feed_videos_mime_type_check check (mime_type in ('video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'));
alter table public.food_feed_videos
  add constraint food_feed_videos_file_size_check check (
    file_size_bytes > 0
    and file_size_bytes <= case when media_type = 'image' then 10485760 else 20971520 end
  );
alter table public.food_feed_videos
  add constraint food_feed_videos_duration_check check (
    (media_type = 'video' and duration_ms between 2500 and 3500)
    or (media_type = 'image' and duration_ms is null)
  );

create index if not exists food_feed_videos_public_idx
  on public.food_feed_videos (status, display_order, published_at desc)
  where status = 'published';
create index if not exists food_feed_videos_restaurant_idx
  on public.food_feed_videos (restaurant_id, status, created_at desc);
create index if not exists food_feed_videos_offer_idx
  on public.food_feed_videos (offer_id)
  where offer_id is not null;

create or replace function public.set_food_feed_video_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists food_feed_videos_set_updated_at on public.food_feed_videos;
create trigger food_feed_videos_set_updated_at
before update on public.food_feed_videos
for each row execute function public.set_food_feed_video_updated_at();

alter table public.food_feed_videos enable row level security;

drop policy if exists food_feed_videos_public_read on public.food_feed_videos;
create policy food_feed_videos_public_read
on public.food_feed_videos
for select
to anon, authenticated
using (
  status = 'published'
  and is_test_data is false
  and exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and coalesce((to_jsonb(r) ->> 'visible_on_guest_site')::boolean, true) is true
      and lower(coalesce(to_jsonb(r) ->> 'status', '')) in ('active', 'approved')
      and lower(coalesce(to_jsonb(r) ->> 'lifecycle_status', 'active')) = 'active'
      and coalesce((to_jsonb(r) ->> 'is_test_data')::boolean, false) is false
      and coalesce((to_jsonb(r) ->> 'is_test_restaurant')::boolean, false) is false
  )
);

drop policy if exists food_feed_videos_partner_read on public.food_feed_videos;
create policy food_feed_videos_partner_read
on public.food_feed_videos
for select
to authenticated
using (public.is_admin() or public.owns_restaurant(restaurant_id));

drop policy if exists food_feed_videos_admin_manage on public.food_feed_videos;
create policy food_feed_videos_admin_manage
on public.food_feed_videos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'food-feed-videos',
  'food-feed-videos',
  false,
  20971520,
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists food_feed_videos_storage_admin_read on storage.objects;
create policy food_feed_videos_storage_admin_read
on storage.objects
for select
to authenticated
using (bucket_id = 'food-feed-videos' and public.is_admin());

grant select on public.food_feed_videos to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.food_feed_videos from anon, authenticated;
grant insert, update, delete on public.food_feed_videos to service_role;
grant usage on schema public to anon, authenticated;

commit;
