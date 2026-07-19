# Smarttable.com Production Deployment

This MVP is designed for:

- Supabase Auth + PostgreSQL
- Vercel static frontend + serverless API
- Resend transactional email
- Admin-editable `site_content`
- Partner restaurant dashboards
- English/Spanish public localization
- Supabase Storage image uploads
- Admin reservation notifications
- Super Admin/Restaurant Partner/Guest role separation
- Restaurant ordering, follower subscriptions, and Google Maps-ready location fields
- AI Dining Concierge preferences, recommendations, learning events, and demand intelligence
- Restaurant intelligence: service-time estimates, route planning, dining photo rewards, trend analytics, and anonymized BI

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

The SaaS expansion is included in:

```text
0003_saas_enum_values.sql
0004_saas_platform_content_partner.sql
0005_billing_storage_email_templates.sql
0006_super_admin_socials_offer_management.sql
0007_restaurant_order_followers_maps.sql
0008_reviews_notifications_newest.sql
0009_ai_platform_foundation.sql
0010_restaurant_intelligence_expansion.sql
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

-- Link a partner to an existing restaurant.
update public.profiles
set
  role = 'partner',
  restaurant_id = '10000000-0000-4000-8000-000000000001'
where email = 'owner@hudsonhearth.com';

update public.restaurants
set owner_user_id = (
  select id from public.profiles where email = 'owner@hudsonhearth.com'
)
where id = '10000000-0000-4000-8000-000000000001';
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
EMAIL_FROM=SmartTable <reservations@mail.smarttablenyc.com>
EMAIL_REPLY_TO=support@smarttablenyc.com
RESEND_API_KEY=<your Resend key>
RESEND_WEBHOOK_SECRET=<your Resend webhook signing secret>
EMAIL_TEMPLATE_VERSION=2026-07-19
EMAIL_RETRY_LIMIT=3
EMAIL_WEBHOOK_TOLERANCE_SECONDS=300
ADMIN_NOTIFICATION_EMAIL=admin@smarttable.com
SUPABASE_STORAGE_BUCKET=smarttable-media
VITE_GOOGLE_MAPS_API_KEY=<your public Google Maps browser key>
IMPERSONATION_SECRET=<long random server-side secret>
```

Important:

- `SUPABASE_SERVICE_ROLE_KEY` must only be stored server-side in Vercel environment variables.
- Do not expose the service role key in frontend code.
- Configure `PUBLIC_BASE_URL=https://smarttable.com` before testing email links.
- `EMAIL_RETRY_LIMIT` controls repeated attempts for temporary provider failures. Permanent failures are logged and not retried indefinitely.
- `RESEND_WEBHOOK_SECRET` is required before SmartTable can mark provider events as delivered, bounced, deferred, complained, or failed. Without it, logs only prove provider acceptance.
- Resend webhook endpoint for production is `https://smarttablenyc.com/api/webhooks/resend`.
- Restrict the Google Maps key in Google Cloud to the production domain.
- `IMPERSONATION_SECRET` signs short-lived Super Admin "View as partner" sessions.

## 4. Domain and DNS

In Vercel:

1. Add `smarttable.com` as a domain.
2. Add the DNS records Vercel gives you at your domain registrar.
3. Wait for HTTPS to become active.

## 5. Email domain

In Resend:

1. Add and verify `smarttablenyc.com`.
2. Configure SPF/DKIM DNS records.
3. Use `reservations@mail.smarttablenyc.com` or another verified sender in `EMAIL_FROM`.
4. Set `EMAIL_REPLY_TO` to a monitored support or reservation inbox.
5. Configure a Resend webhook pointing to `https://smarttablenyc.com/api/webhooks/resend`, copy its signing secret to `RESEND_WEBHOOK_SECRET`, and keep the secret server-side only.
6. Set `ADMIN_NOTIFICATION_EMAIL` to the admin inbox that should receive every new reservation request.
7. Apply all `supabase/migrations` so `email_logs` has idempotency, attempt-count, provider-message, locale, and timestamp fields.

Required Resend webhook events:

```text
email.sent
email.delivered
email.bounced
email.failed
email.complained
```

Localhost cannot receive production Resend webhooks directly. For local testing,
use a secure tunnel or webhook-forwarding tool that forwards Resend events to:

```text
http://localhost:4173/api/webhooks/resend
```

To test signature verification, send one request with an invalid signature and
confirm SmartTable returns `401`, then send a valid signed event using the same
`RESEND_WEBHOOK_SECRET` value and confirm the matching `email_logs` and
`email_queue` rows update by `provider_message_id`. Delivered status should be
claimed only after a verified `email.delivered` webhook updates the log. Bounced,
failed, and complained events should appear in Super Admin email diagnostics.

## 5.1 Supabase Storage

Migration `0005_billing_storage_email_templates.sql` creates the `smarttable-media` bucket and storage policies.

Production uploads use signed upload URLs generated by:

```text
POST /api/partner/storage/sign-upload
```

Allowed image types:

```text
image/jpeg
image/png
image/webp
```

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

## 8. Production checks

After deployment, verify:

- `/api/health` returns `mode: "supabase"`
- Admin can edit `site_content`
- Admin can edit email template content keys
- Super Admin can create partner logins
- Super Admin can use View as partner and return to Super Admin
- Super Admin can edit/disable restaurants
- Super Admin can set restaurant custom sort order and map coordinates
- Super Admin can edit discounts and offer status
- English/Español switcher changes public copy
- Partner can update restaurant profile
- Public offers show one restaurant card with nested active offers
- Guest can filter/sort offers and switch between list/map views
- Guest can follow a restaurant with email-based subscription
- Guest can submit restaurant reviews for Food, Service, and Ambience
- Admin can moderate reviews
- Admin receives partner activity notifications and can mark them as read
- Public homepage shows Newest Restaurants This Week
- Public homepage shows AI Dining Concierge recommendations
- Guest can open the AI preference wizard and save preferences
- AI recommendations return match score and smart discount suggestion
- Partner dashboard shows AI demand outlook
- Partner/Admin can edit AI discount guardrails on restaurant profiles
- Guest can create a route plan and receive service-time/travel-time estimates
- Guest can submit dining photo intelligence and receive loyalty points
- Partner dashboard shows aggregated Restaurant Intelligence without personal data
- Admin dashboard shows live food trend analytics
- Partner can upload/assign cover, gallery, and offer images
- Partner can create, edit, and soft-delete an offer
- Guest reservation creates `pending` reservation
- Guest reservation form appears only after clicking Reserve
- Partner `accepted` or `rejected` status sends guest email
- Partner can save reservation notes
- Admin notification email is logged in `email_events`
