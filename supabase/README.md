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
set role = 'super_admin'
where email = 'admin@smarttable.com';
```

Restaurant partner:

```sql
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

Guest accounts can stay as the default `guest` role.

## SaaS content model

The admin dashboard edits public text through `public.site_content`.

Each row stores:

```text
key
value_en
value_es
content_type
group_name
```

Public pages request `/api/public/content?lang=en` or `/api/public/content?lang=es`.
If Spanish copy is empty, the API falls back to English.

Email templates are also stored in `site_content` under the `email` group. These keys include:

```text
email_guest_received_subject
email_restaurant_new_subject
email_guest_accepted_subject
email_guest_rejected_subject
```

## Restaurant ordering, followers, and maps

Migration `0007_restaurant_order_followers_maps.sql` adds:

```text
restaurants.sort_order
restaurants.latitude
restaurants.longitude
restaurants.google_place_id
restaurant_followers
```

`sort_order` controls the public restaurant card order. If it is empty, the app falls back to restaurant name and creation order.

Guests can follow a restaurant with only an email address. The `restaurant_followers` table stores opt-in records for future new-offer notifications.

Google Maps uses `VITE_GOOGLE_MAPS_API_KEY` from the deployment environment. The key is public browser configuration, so restrict it by domain in Google Cloud.

## Reviews and admin notifications

Migration `0008_reviews_notifications_newest.sql` adds:

```text
restaurant_reviews
admin_notifications
restaurant_review_summary
public_restaurant_cards
```

Guests can submit Food, Service, and Ambience ratings from 1 to 5. New reviews start as `pending`; admins approve or reject them from the dashboard. Only approved reviews are included in public restaurant averages.

Partner changes create admin notifications for profile edits, image uploads, offer changes, and accepted/rejected reservations. Admins can mark notifications as read from the dashboard header or the full notifications panel.

## AI platform foundation

Migration `0009_ai_platform_foundation.sql` adds:

```text
restaurants.ai_discount_enabled
restaurants.min_discount_percent
restaurants.max_discount_percent
restaurants.target_margin_percent
restaurants.average_service_minutes
ai_preference_profiles
ai_interaction_events
ai_demand_forecasts
restaurant_integrations
calendar_connections
```

The public guest experience uses:

```text
GET /api/ai/preferences
POST /api/ai/preferences
POST /api/ai/events
GET /api/ai/recommendations
```

The partner dashboard uses:

```text
GET /api/ai/demand-forecast
```

The current AI engine is rules-based and stores structured data for future ML, LLM, reservation-system, weather, event, and calendar integrations.

SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.

## Restaurant intelligence expansion

Migration `0010_restaurant_intelligence_expansion.sql` adds:

```text
restaurants.restaurant_type
ai_service_time_observations
ai_route_plans
dining_consumption_uploads
loyalty_accounts
ai_processing_jobs
analytics_events
audit_logs
```

New API endpoints:

```text
GET /api/ai/service-time-estimate
POST /api/ai/route-plan
POST /api/ai/consumption/sign-upload
POST /api/ai/consumption-uploads
GET /api/ai/restaurant-intelligence
GET /api/ai/trends
```

Important privacy rule: restaurants only receive aggregated, anonymized metrics from `restaurant_intelligence_summary`. Guest route details and individual behavior are not exposed to partner dashboards.

## Reservation statuses

New reservations use:

```text
pending
accepted
rejected
cancelled
completed
```

The schema keeps older MVP values for backward compatibility, but the app normalizes old `requested` to `pending` and old `confirmed` to `accepted`.

## Storage

Migration `0005_billing_storage_email_templates.sql` creates the public `smarttable-media` Supabase Storage bucket.

Partner uploads are scoped by object path:

```text
<restaurant_id>/cover/<file>
<restaurant_id>/gallery/<file>
<restaurant_id>/offer/<file>
```

The app generates signed upload URLs from the server, so the service role key stays server-side.

## Billing preparation

Billing is not charged yet, but the data model is ready:

```text
restaurants.billing_plan = free | monthly | per_booking
restaurants.monthly_fee
restaurants.fee_per_booking
restaurants.billing_status = trialing | active | past_due | cancelled
```
