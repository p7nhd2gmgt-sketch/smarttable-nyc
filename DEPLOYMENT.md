# Smarttable.com Production Deployment

This MVP is designed for:

- Supabase Auth + PostgreSQL
- Vercel static frontend + serverless API
- Resend transactional email

## 1. Supabase project

Create a Supabase project, then apply migrations:

```powershell
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Migrations live in:

```text
supabase/migrations/
```

## 2. Supabase Auth users

Create users in Supabase Auth:

- `admin@smarttable.com`
- restaurant owner email, for example `owner@hudsonhearth.com`

Then set roles in SQL:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@smarttable.com';

update public.profiles
set
  role = 'restaurant',
  restaurant_id = '10000000-0000-4000-8000-000000000001'
where email = 'owner@hudsonhearth.com';
```

Guest users are optional. Anonymous guests can reserve with name, email, and phone.

## 3. Vercel project

Import this folder as a Vercel project.

Set these environment variables in Vercel:

```text
PUBLIC_BASE_URL=https://smarttable.com
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
EMAIL_FROM=Smarttable.com <reservations@smarttable.com>
RESEND_API_KEY=<your Resend key>
```

Important:

- `SUPABASE_SERVICE_ROLE_KEY` must only be stored server-side in Vercel environment variables.
- Do not expose the service role key in frontend code.

## 4. Domain and DNS

In Vercel:

1. Add `smarttable.com` as a domain.
2. Add the DNS records Vercel gives you at your domain registrar.
3. Wait for HTTPS to become active.

## 5. Email domain

In Resend:

1. Add and verify `smarttable.com`.
2. Configure SPF/DKIM DNS records.
3. Use `reservations@smarttable.com` or another verified sender in `EMAIL_FROM`.

## 6. Google Search Console

After the production URL loads:

1. Add `https://smarttable.com` in Google Search Console.
2. Verify ownership using the DNS TXT record Google provides.
3. Submit:

```text
https://smarttable.com/sitemap.xml
```

4. Use URL Inspection for:

```text
https://smarttable.com/
```

5. Request indexing.

## 7. Local development

Without Supabase env vars, the app runs in demo mode.

Demo users:

```text
admin@smarttable.com / admin123
owner@hudsonhearth.com / restaurant123
guest@smarttable.com / guest123
```

Start locally:

```powershell
.\start.ps1
```

Open:

```text
http://localhost:4173
```
