# SmartTable Production Readiness Checklist

SmartTable must not present mock, directional, or integration-dependent output as live production performance. Every module should be labeled as one of:

- Live
- Beta
- Demo only
- Coming soon
- Requires integration
- Requires more data

## Ready For Real Restaurants

SmartTable is ready for real restaurants only when all of these are true:

- Real restaurant onboarding works end to end.
- Restaurant login works with protected partner routes.
- Offer creation, edit, pause, and delete work from stored database data.
- Guest discovery and filtering work from live restaurant/offer data.
- Reservation or reservation-lead capture works.
- Transactional emails are actually sent through a configured provider such as Resend, SendGrid, Postmark, or AWS SES.
- Partner dashboards use real database records, not mock production claims.
- AI demand scoring reads stored restaurant, offer, reservation, view, follower, feedback, and import data.
- AI recommendations create stored suggested actions.
- Restaurants approve AI actions before execution.
- Approved AI actions create real offers, campaigns, or availability updates.
- AI action results are tracked after execution.
- Demo-only features are clearly labeled.
- Admin can monitor app errors, integration errors, failed emails, failed AI actions, and alerts.
- Privacy request, consent, unsubscribe, and legal document structures exist.
- Production environment variables, rate limits, secrets, authorization, RLS, audit logs, and backup strategy are configured.

## Real AI Engine Criteria

The AI engine is real only when:

- It reads real database records.
- It uses real restaurant data and imported reservation history where available.
- It stores recommendations.
- It explains each recommendation.
- It tracks viewed, accepted, rejected, and executed recommendations.
- It measures outcomes such as bookings generated and recovered revenue.
- It improves future scoring from prior action results.
- It separates real AI from demo AI in the UI.
- It works without OpenTable or Resy by using SmartTable leads and CSV/manual imports.
- It improves confidence when approved reservation-platform integrations, weather, local events, or reservation imports are connected.

## Integration Rules

OpenTable, Resy, SevenRooms, Tock, and Google Reserve integrations are not live until:

- Provider API access is approved.
- The restaurant authorizes the connection.
- Any required partnership or marketplace approval is complete.
- OAuth/API secrets are stored as encrypted references, not plain text in the database or frontend.
- Sync jobs, webhook verification, retry handling, and error logging are configured.

Until then, SmartTable supports:

- CSV reservation import.
- Manual reservation rows.
- Weekly performance upload.
- Reservation summary upload.
- Unified imported reservation storage for AI demand history.

SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.

## Reservation Integration Readiness

Reservation integration is ready only when:

- Provider abstraction exists.
- CSV import exists.
- Manual import exists.
- Mock provider works.
- Provider credentials are securely stored.
- Sync logs exist.
- Errors are visible to admin.
- Imported reservations affect AI demand scoring.
- Imported reservations appear in the dashboard.
- OpenTable and Resy are labeled as pending official API access until approved.

## Billing Foundation

Stripe billing is foundation-ready only until live Stripe setup is completed:

- Stripe products and prices created.
- Checkout or customer portal configured.
- Webhooks verified and stored in `payment_events`.
- Failed payment handling connected.
- Invoice history visible to admins and restaurants.
- Subscription status drives plan access.

Guest online payment is not required for the MVP.

## Privacy And Compliance Rules

- SmartTable only uses behavior, calendar, route, photo, and AI learning data with user permission.
- Restaurants only see aggregated and anonymized guest intelligence.
- Personal guest behavior is never exposed to restaurants unless explicit permission and business rules allow it.
- Imported data remains owned by the restaurant.
- Unsubscribe and deletion/access requests must be handled before production launch.
