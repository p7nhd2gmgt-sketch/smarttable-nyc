-- Lock down guest notification reads after the original post-visit migration.
-- The first guest_notifications policy allowed public reads; final production
-- state must scope notification access to the owning guest, admins, or service role.

do $$
begin
  if to_regclass('public.guest_notifications') is not null then
    execute 'alter table public.guest_notifications enable row level security';
    execute 'drop policy if exists guest_notifications_guest_read on public.guest_notifications';
    execute $policy$
      create policy guest_notifications_guest_read
      on public.guest_notifications
      for select
      to authenticated
      using (
        public.is_admin()
        or auth.role() = 'service_role'
        or lower(guest_email) = lower(coalesce(auth.jwt()->>'email', ''))
      )
    $policy$;
  end if;
end $$;
