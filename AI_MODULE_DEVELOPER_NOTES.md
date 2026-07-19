# SmartTable AI Module Developer Notes

These notes are internal product/engineering documentation. A module should not appear production-finished unless its data source, confidence, and execution path are real.

SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.

## Demand Score

- Data required: restaurant profile, active offers, SmartTable reservation leads, accepted reservations, declined reservations, cancellations, no-shows when supplied by a reservation platform, restaurant views, imported reservation history, manual reservation summaries.
- Current data source: `restaurants`, `offers`, `reservations`, `imported_reservations`, `manual_performance_uploads`, `restaurant_followers`.
- Fallback behavior: demo/local mode uses seeded reservations and any local CSV/manual reservation imports.
- Confidence calculation: rules-v1 increases confidence with SmartTable bookings, active offers, views, imported reservations, and manual reservation volume; caps at 92.
- Status: Beta in Supabase mode, Demo only in local mode.
- Future integration needs: OpenTable, Resy, SevenRooms, Tock, Google Reserve, approved restaurant reservation APIs, weather, and local events.

## AI Recommendation

- Data required: demand score, restaurant discount guardrails, available offers, reservation/lead history, imported reservation history, followers.
- Current data source: `ai_recommendations`, `demand_snapshots`, `restaurants`, `offers`, `reservations`, `imported_reservations`.
- Fallback behavior: rules-v1 creates a directional recommendation and lists missing reservation/weather/event data.
- Confidence calculation: inherited from Demand Score and explanation layer.
- Status: Beta. Recommendations require restaurant approval before execution.
- Future integration needs: stronger attribution from approved reservation-platform imports, weather, events, and campaign conversion.

## AI Action Approval

- Data required: stored recommendation, restaurant authorization, offer creation permissions, campaign audience.
- Current data source: `ai_actions`, `ai_action_results`, `offers`, `marketing_campaigns`.
- Fallback behavior: local mode creates demo offer/campaign records in memory.
- Confidence calculation: not a prediction module; it logs owner decisions and result measurement.
- Status: Beta. No autonomous execution.
- Future integration needs: background jobs for campaign sending, attribution updates, and rollback controls.

## AI Marketing Generator

- Data required: restaurant name, current recommendation, discount, time window, follower audience.
- Current data source: local message state, `marketing_campaigns`, approved recommendation output.
- Fallback behavior: generates deterministic copy without external AI API.
- Confidence calculation: none yet; copy is editable by the restaurant.
- Status: Beta/Demo only depending on environment. Live sending requires email provider and consent.
- Future integration needs: OpenAI service layer, consent-aware audience builder, unsubscribe enforcement, campaign analytics.

## AI Action History

- Data required: recommendation created/viewed/accepted/rejected, offer/campaign activation, generated bookings, measured reservation outcomes.
- Current data source: `ai_actions`, `ai_action_results`, local UI history cache.
- Fallback behavior: demo entries are shown only as operating log examples.
- Confidence calculation: not predictive; reliability depends on action/result logging.
- Status: Beta.
- Future integration needs: scheduled attribution job and campaign result measurement.

## ROI / Value Tracking

- Data required: subscription cost, AI action results, bookings generated, offer performance, and SmartTable reservation outcomes.
- Current data source: `ai_action_results`, `revenue_snapshots`, demo monthly values when no data exists.
- Fallback behavior: labeled demo values until enough measured results exist.
- Confidence calculation: should be measured from SmartTable and approved reservation-platform data, not inferred from payment or transaction systems.
- Status: Beta/Demo only when no measured results exist.
- Future integration needs: invoices/subscriptions, campaign attribution, reservation conversion.

## Review Analyzer

- Data required: moderated reviews, post-visit feedback, category ratings, review text.
- Current data source: `restaurant_reviews`, `guest_feedback`, `photo_reward_submissions`.
- Fallback behavior: seeded/demo sentiment summaries.
- Confidence calculation: should increase with approved review count and recency.
- Status: Beta when review data exists; Requires more data otherwise.
- Future integration needs: sentiment model and approved SmartTable or reservation-platform review/feedback imports.

## Demand Calendar / Heat Map

- Data required: reservations by day/window, offers by day/window, imported reservation history.
- Current data source: SmartTable reservations/offers and demo logic.
- Fallback behavior: directional heat map.
- Confidence calculation: should use sample size by day/window and recency.
- Status: Beta.
- Future integration needs: reservation imports, seasonality, holidays, weather, and local events.

## Restaurant Intelligence

- Data required: aggregated ratings, followers, reservations, offer conversions, post-visit feedback.
- Current data source: platform aggregate tables and local demo aggregations.
- Fallback behavior: anonymized aggregate placeholders only.
- Confidence calculation: depends on volume and anonymization thresholds.
- Status: Beta/Requires more data.
- Future integration needs: review imports and privacy thresholds.

## Menu Preference Signals

- Data required: guest-submitted photos, ordered item descriptions, tags, ratings, and review text.
- Current data source: photo rewards and post-visit feedback.
- Fallback behavior: directional demo content only.
- Confidence calculation: not production-ready until enough approved guest submissions exist.
- Status: Requires more data.
- Future integration needs: image recognition and menu labeling based on guest-submitted content only.

## VIP Detection

- Data required: consented guest identity, reservation frequency, favorites, return-intent feedback, ratings.
- Current data source: limited guest/follower/import structures.
- Fallback behavior: hidden under Coming Soon.
- Confidence calculation: not active until data volume and consent thresholds are met.
- Status: Requires more data.
- Future integration needs: approved reservation-platform guest imports and consent management.

## Guest Lifetime Value

- Data required: repeat reservations, favorites, frequency, recency, feedback, consent.
- Current data source: limited guest/import structures.
- Fallback behavior: hidden under Coming Soon.
- Confidence calculation: not active until enough historical reservation and feedback data exists.
- Status: Requires more data.
- Future integration needs: reservation imports and identity resolution.

## Competitor Tracker

- Data required: nearby restaurant list, publicly available reservation availability, SmartTable offer activity, search demand, and local events.
- Current data source: none live.
- Fallback behavior: hidden under Coming Soon.
- Confidence calculation: not active.
- Status: Requires integration.
- Future integration needs: approved reservation-platform availability signals, SmartTable market activity, weather, traffic, and local event feeds.

## Real-Time Pricing Engine

- Data required: conversion history, capacity, demand forecast, restaurant discount rules, approval policies.
- Current data source: AI recommendations and offer guardrails only.
- Fallback behavior: no autonomous pricing; approval-based recommendations only.
- Confidence calculation: rules-v1 directional only.
- Status: Coming soon.
- Future integration needs: reservation imports, campaign results, pricing guardrail engine.

## Staff Planning

- Data required: reservations, expected guests, service duration from reservation-platform start/end data or restaurant-provided average dining duration, labor model, employee schedules, role coverage.
- Current data source: none live.
- Fallback behavior: hidden under Coming Soon.
- Confidence calculation: not active.
- Status: Coming soon.
- Future integration needs: labor scheduling and reservation demand.
