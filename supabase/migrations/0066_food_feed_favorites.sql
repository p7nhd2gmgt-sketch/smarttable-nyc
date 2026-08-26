begin;

create table if not exists public.food_feed_favorites (
  id uuid primary key default gen_random_uuid(),
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  food_feed_video_id uuid not null references public.food_feed_videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint food_feed_favorites_guest_video_key unique (guest_user_id, food_feed_video_id)
);

create index if not exists food_feed_favorites_guest_created_idx
  on public.food_feed_favorites (guest_user_id, created_at desc);
create index if not exists food_feed_favorites_video_idx
  on public.food_feed_favorites (food_feed_video_id);

alter table public.food_feed_favorites enable row level security;

drop policy if exists food_feed_favorites_guest_read on public.food_feed_favorites;
create policy food_feed_favorites_guest_read
on public.food_feed_favorites
for select
to authenticated
using (
  guest_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) = 'guest'
  )
);

drop policy if exists food_feed_favorites_guest_insert on public.food_feed_favorites;
create policy food_feed_favorites_guest_insert
on public.food_feed_favorites
for insert
to authenticated
with check (
  guest_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) = 'guest'
  )
  and exists (
    select 1 from public.food_feed_videos video
    where video.id = food_feed_video_id
      and video.status = 'published'
      and video.is_test_data is false
  )
);

drop policy if exists food_feed_favorites_guest_delete on public.food_feed_favorites;
create policy food_feed_favorites_guest_delete
on public.food_feed_favorites
for delete
to authenticated
using (
  guest_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) = 'guest'
  )
);

grant select, insert, delete on public.food_feed_favorites to authenticated;
revoke all on public.food_feed_favorites from anon;
revoke update, truncate, references, trigger on public.food_feed_favorites from authenticated;
grant all on public.food_feed_favorites to service_role;

commit;
