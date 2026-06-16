# Supabase setup

## Apply migrations

```powershell
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## Create users

Create users in Supabase Auth, then set their role in `public.profiles`.

Admin:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@smarttable.com';
```

Restaurant operator:

```sql
update public.profiles
set
  role = 'restaurant',
  restaurant_id = '10000000-0000-4000-8000-000000000001'
where email = 'owner@hudsonhearth.com';
```

Guest accounts can stay as the default `guest` role.
