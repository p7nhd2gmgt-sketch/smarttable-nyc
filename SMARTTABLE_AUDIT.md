# SmartTable Production Audit

Current audit date: 2026-07-06

This file separates live functionality from beta, demo, and integration-dependent modules. It should be updated whenever a feature moves from mock/demo to measured production data.

SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.

## Feature Status

| Area | Status | Notes |
| --- | --- | --- |
| Public restaurant browsing | Live | Uses `/api/public/offers` and restaurant/offer records. Demo mode uses seeded in-memory data. |
| Guest reservation leads | Live | Guests can submit reservation requests. Restaurants can accept, reject, cancel, complete, and no-show. Direct Resy/OpenTable booking is not connected yet. |
| Transactional emails | Requires integration | Real sending works through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are configured. Otherwise emails go to demo outbox/logs. |
| Restaurant partner login | Live/Beta | Supabase Auth supported. Demo credentials only appear when Supabase is not configured. |
| Restaurant profile editing | Beta | Profile editing, social links, hours, photos, location, discount guardrails, weak hours, service duration, and capacity fields are supported/scaffolded. |
| Restaurant team members | Beta | `restaurant_users` table now exists. Full UI invite flow still needs completion. |
| Offer management | Live | Create/edit/pause/delete offer flows exist. Redemption rules and performance tracking are now structured in DB. |
| Favorites/follow | Live | Email-based follow exists for guests without login. |
| Reviews and post-visit feedback | Beta | Guest feedback/photos/points exist. Moderation exists. Image recognition remains placeholder. |
| AI demand recommendation engine v1 | Beta | Rules-v1 uses stored restaurant, offer, reservation, view, follower, and feedback data. It labels missing data and confidence. |
| AI action approval flow | Beta | AI recommends first; restaurant approval creates offer/campaign/action logs. Results table is prepared for measurement. |
| AI learning feedback loop | Beta | Recommendation, action, result, campaign, feedback, and snapshots are structured. Model improvement is still rules-based. |
| Partner Today dashboard | Live/Beta | Now focused on working modules: offers, reservation leads, demand score, AI recommendation, marketing generator, action history, and ROI/value tracking. |
| VIP/LTV/competitor/real-time pricing/staff planning | Coming soon / Requires integration / Requires more data | Moved out of the daily workflow and labeled as unfinished until real reservation, feedback, and approved external factor data exists. |
| AI Advisor chat | Demo only | Uses local deterministic responses. No OpenAI API call is made yet. |
| Marketplace/consumer trend analytics | Requires more data | UI and aggregate schemas exist, but should not be presented as live market intelligence until enough real data exists. |
| Live market signals | Requires integration | Google Maps key support exists. Weather, events, competitors, traffic, and parking feeds are not connected. |
| Integration Hub | Beta | Admin and partner views show provider catalog, connection status, sync runs, import jobs, error logs, and provider-access labels. Live sync still requires provider approval. |
| Resy/OpenTable/SevenRooms/Tock/Google Reserve | Requires integration | Universal provider interface and mock adapters exist. Actual provider sync requires API access, restaurant authorization, and approved partnerships. |
| CSV/manual reservation import | Beta | Restaurants can import CSV/manual reservation data into SmartTable's unified imported reservation format for AI demand history. |
| Calendar/routing | Requires integration | Planner scaffolding exists. Google Calendar/Maps are not connected. |
| Privacy and compliance controls | Beta | Consent, unsubscribe, privacy request, legal document, anonymized analytics, and audit structures are scaffolded. |
| Billing foundation | Beta | Stripe-ready plan, subscription, invoice, and payment-event tables exist. Checkout, customer portal, and webhooks still require live Stripe configuration. |
| Monitoring and error logs | Beta | Admin can inspect app errors, integration errors, failed emails, failed AI actions, and admin alerts. |

## Production Readiness Rules

- Do not show mock AI numbers without a visible `Demo only`, `Requires integration`, or `Requires more data` label.
- AI actions must remain approval-based until the restaurant explicitly enables automation.
- Restaurants must never see personal guest behavior; restaurant intelligence must stay aggregated and anonymized.
- Reservation-platform imports must preserve source provider IDs in `imported_reservations` and never overwrite SmartTable leads without audit history.
- Every AI recommendation should store inputs, missing data, explanation, confidence, restaurant decision, and measured result.
- The partner Today page should only show modules the restaurant can act on with current platform data.
- Integration-dependent AI modules must stay under Coming Soon until their data requirements are met.

## Next Integration Work

1. Add provider-specific sync workers for Resy/OpenTable/SevenRooms/Tock/Google Reserve after approved API access.
2. Add restaurant team invite UI backed by `restaurant_users`.
3. Add measured attribution job that updates `ai_action_results`, offer performance, and revenue snapshots after reservations convert.
4. Add webhook or scheduled job for post-visit email timing.
5. Replace demo AI Advisor logic with a secure OpenAI service layer after audit logging and consent checks are in place.
6. Connect Stripe checkout/customer portal/webhooks to the billing foundation.

See `PRODUCTION_READINESS_CHECKLIST.md` for the formal MVP and AI-engine completion criteria.
See `AI_MODULE_DEVELOPER_NOTES.md` for module-by-module data requirements and fallback behavior.
