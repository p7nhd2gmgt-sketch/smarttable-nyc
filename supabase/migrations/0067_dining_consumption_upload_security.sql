begin;

alter table public.dining_consumption_uploads
  add column if not exists storage_path text;

do $$
begin
  if exists (
    select 1
    from public.dining_consumption_uploads
    where reservation_id is not null
    group by reservation_id
    having count(*) > 1
  ) then
    raise exception 'Cannot secure dining consumption uploads: duplicate reservation_id values exist.';
  end if;

  if exists (
    select 1
    from public.dining_consumption_uploads
    where storage_path is not null
    group by storage_path
    having count(*) > 1
  ) then
    raise exception 'Cannot secure dining consumption uploads: duplicate storage_path values exist.';
  end if;
end
$$;

create unique index if not exists dining_consumption_uploads_reservation_unique
  on public.dining_consumption_uploads (reservation_id)
  where reservation_id is not null;

create unique index if not exists dining_consumption_uploads_storage_path_unique
  on public.dining_consumption_uploads (storage_path)
  where storage_path is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dining_consumption_uploads'::regclass
      and conname = 'dining_consumption_uploads_storage_path_check'
  ) then
    alter table public.dining_consumption_uploads
      add constraint dining_consumption_uploads_storage_path_check
      check (storage_path is null or storage_path like 'guest-consumption/%') not valid;
  end if;
end
$$;

alter table public.dining_consumption_uploads enable row level security;

drop policy if exists consumption_insert_public on public.dining_consumption_uploads;
drop policy if exists dining_consumption_uploads_owner_scoped on public.dining_consumption_uploads;
drop policy if exists consumption_select_aggregators on public.dining_consumption_uploads;
drop policy if exists consumption_select_scoped on public.dining_consumption_uploads;

create policy consumption_select_scoped on public.dining_consumption_uploads
for select to authenticated
using (
  public.is_admin()
  or public.owns_restaurant(restaurant_id)
  or user_id = auth.uid()
);

revoke all privileges on table public.dining_consumption_uploads from public, anon, authenticated;
grant select on table public.dining_consumption_uploads to authenticated;
grant select, insert, update, delete on table public.dining_consumption_uploads to service_role;

do $$
begin
  if to_regprocedure('public.award_loyalty_points(text,integer,uuid)') is not null then
    execute 'revoke execute on function public.award_loyalty_points(text, integer, uuid) from public, anon, authenticated';
    execute 'grant execute on function public.award_loyalty_points(text, integer, uuid) to service_role';
  end if;
end
$$;

commit;
