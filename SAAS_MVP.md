# Smart Table SaaS MVP

This build turns Smarttable.com into a scalable SaaS MVP for discounted New York restaurant reservations with separate Super Admin, Restaurant Partner, and Guest interfaces.

## Core features

- Super Admin login and dashboard
- Partner restaurant login and dashboard
- Optional guest accounts and anonymous reservations
- Supabase PostgreSQL backend
- Vercel-ready frontend and API
- Resend-ready transactional email notifications
- Admin notification email for every new reservation
- English/Spanish public language switcher
- Admin-editable public content through `site_content`
- Admin-editable email template keys through `site_content`
- Supabase Storage-ready restaurant and offer image uploads
- Billing model prepared for future Stripe integration
- Guest reservation form stays hidden until a restaurant/offer is selected and Reserve is clicked
- One restaurant card groups all active offers for that restaurant
- Guest filters, sorting, list/map view toggle, and email-based restaurant following
- Super Admin "View as partner" master access
- Restaurant review system with Food, Service, and Ambience ratings
- Admin review moderation
- Partner activity notifications for admins
- Newest Restaurants This Week public section
- AI Dining Concierge preference wizard
- Personalized restaurant recommendations with match score and smart discount suggestions
- AI interaction event tracking for clicks, follows, reservations, and reviews
- Partner demand intelligence panel
- Future-ready reservation-system and calendar integration tables
- Restaurant service-time intelligence and route planning foundation
- Dining photo rewards with loyalty points
- AI image-recognition-ready consumption database
- Aggregated food trend analytics and restaurant BI

SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.

## Roles

```text
admin / super_admin
partner
guest
```

The legacy `restaurant` role is still accepted by the API as an alias for `partner`.

## Admin dashboard

Admin can manage:

- site content and SEO text
- restaurant accounts and partner logins
- restaurants
- partner accounts
- offers
- reservations
- global statistics
- social links and restaurant images
- offer discount percentages and status
- restaurant sort order and map coordinates
- Super Admin-only partner impersonation
- review moderation
- partner activity notifications
- AI preference profiles, learning events, discount guardrails, and demand outlook
- platform food trends, loyalty signals, route planning, and service-time analytics

Editable site content includes hero copy, company text, About, How it works, restaurant-facing copy, guest-facing copy, button labels, footer text, SEO title, SEO meta description, and banner image URL.

## Partner dashboard

Partners can manage only their own restaurant:

- profile
- English/Spanish descriptions
- address, phone, email, website, Instagram
- Facebook, TikTok, Google Maps
- latitude, longitude, Google Place ID
- cuisine type
- opening hours
- restaurant icon/card image
- cover image and gallery image URLs
- cover image and gallery image uploads through Supabase Storage
- discounted table offers
- offer image upload
- create, edit, and soft-delete offers
- reservations
- accept, reject, complete, or cancel reservations
- internal reservation notes
- basic stats: views, bookings, accepted, rejected
- AI discount engine guardrails: enabled state, minimum discount, maximum discount, target margin, average service minutes
- AI demand outlook with suggested action and discount
- Aggregated restaurant intelligence: trends, dining duration, loyalty points, satisfaction, uploads

## Database additions

New migrations:

```text
supabase/migrations/0003_saas_enum_values.sql
supabase/migrations/0004_saas_platform_content_partner.sql
supabase/migrations/0005_billing_storage_email_templates.sql
supabase/migrations/0006_super_admin_socials_offer_management.sql
supabase/migrations/0007_restaurant_order_followers_maps.sql
supabase/migrations/0008_reviews_notifications_newest.sql
supabase/migrations/0009_ai_platform_foundation.sql
supabase/migrations/0010_restaurant_intelligence_expansion.sql
```

Key structures:

```text
site_content
restaurants.owner_user_id
restaurants.description_en / description_es
restaurants.cover_image / gallery_images
offers.title_en / title_es
offers.valid_days
offers.available_tables
offers.max_party_size
offers.offer_image
reservations.reservation_date / reservation_time
restaurant_view_events
restaurants.billing_plan
restaurants.monthly_fee
restaurants.fee_per_booking
restaurants.billing_status
restaurants.facebook
restaurants.tiktok
restaurants.google_maps_url
restaurants.card_image
restaurants.icon_image
restaurants.sort_order
restaurants.latitude / restaurants.longitude
restaurants.google_place_id
reservations.partner_notes
restaurant_followers
restaurant_reviews
admin_notifications
public_restaurant_cards
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
ai_service_time_observations
ai_route_plans
dining_consumption_uploads
loyalty_accounts
ai_processing_jobs
analytics_events
audit_logs
```

## AI platform foundation

The MVP now includes modular AI-ready endpoints:

```text
GET /api/ai/preferences
POST /api/ai/preferences
POST /api/ai/events
GET /api/ai/recommendations
GET /api/ai/demand-forecast
GET /api/ai/service-time-estimate
POST /api/ai/route-plan
POST /api/ai/consumption/sign-upload
POST /api/ai/consumption-uploads
GET /api/ai/restaurant-intelligence
GET /api/ai/trends
```

The current recommendation engine is deterministic and rules-based so it can run in demo mode and production without an external model. It stores structured preference and interaction data so a later ML or LLM service can be added behind the same API without changing the guest, admin, or partner UI.

Restaurant intelligence is privacy-scoped. Guest uploads and route plans use `profile_key` instead of exposing personal identity, and partner dashboards only receive aggregated, anonymized metrics.

## Storage

Production image uploads use the `smarttable-media` Supabase Storage bucket.

Objects are stored by restaurant id:

```text
<restaurant_id>/cover/<file>
<restaurant_id>/gallery/<file>
<restaurant_id>/offer/<file>
```

Partner uploads are scoped to the partner's own restaurant.

## Deployment

Use `DEPLOYMENT.md` for Supabase, Vercel, Resend, DNS, and Google Search Console steps.
