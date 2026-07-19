-- Truth-first AI module status updates. These labels keep incomplete
-- modules out of production-ready surfaces until real data/integrations exist.

insert into public.feature_status (key, label, status, description, data_source)
values
  ('ai_marketing_generator', 'AI marketing generator', 'beta', 'Campaign copy can be generated and queued from approved AI actions. Live sending requires email configuration and guest consent.', 'marketing_campaigns, restaurant_followers, email_logs'),
  ('vip_detection', 'VIP detection', 'requires_more_data', 'Requires consented repeat-guest identity, booking frequency, favorites, ratings, and return-intent feedback.', 'guests, imported_guests, reservations, feedback'),
  ('guest_lifetime_value', 'Guest lifetime value intelligence', 'requires_more_data', 'Requires enough consented guest history, repeat reservations, favorites, ratings, and feedback data.', 'guests, imported_guests, reservations, feedback'),
  ('competitor_tracker', 'Competitor tracker', 'requires_integration', 'Requires approved reservation-platform availability signals, SmartTable market activity, weather, traffic, and local event feeds.', 'future reservation-platform availability, SmartTable search, weather, traffic, and local event integrations'),
  ('real_time_pricing_engine', 'Real-time pricing engine', 'coming_soon', 'Requires conversion history, capacity, demand, guardrails, and approval policies. Current AI remains recommendation-first.', 'ai_recommendations, offer conversions, future integrations'),
  ('staff_planning', 'Staff planning', 'coming_soon', 'Requires live reservations, service duration, labor rules, schedules, and role coverage.', 'future labor scheduling and reservation integrations')
on conflict (key) do update
set label = excluded.label,
    status = excluded.status,
    description = excluded.description,
    data_source = excluded.data_source,
    updated_at = now();

insert into public.feature_flags (key, label, status, enabled, audience, description, owner)
values
  ('ai_marketing_generator', 'AI marketing generator', 'beta', true, 'partners', 'Working copy generation/queueing. Live sending requires email and consent.', 'ai'),
  ('vip_detection', 'VIP detection', 'requires_more_data', false, 'partners', 'Requires consented repeat-guest history.', 'ai'),
  ('guest_lifetime_value', 'Guest lifetime value intelligence', 'requires_more_data', false, 'partners', 'Requires enough repeat-reservation and feedback history.', 'ai'),
  ('competitor_tracker', 'Competitor tracker', 'requires_integration', false, 'partners', 'Requires approved reservation-platform availability and external factor feeds.', 'ai'),
  ('real_time_pricing_engine', 'Real-time pricing engine', 'coming_soon', false, 'partners', 'No autonomous pricing until real guardrails and conversion data exist.', 'ai'),
  ('staff_planning', 'Staff planning', 'coming_soon', false, 'partners', 'Requires labor and schedule data.', 'ai')
on conflict (key) do update
set label = excluded.label,
    status = excluded.status,
    enabled = excluded.enabled,
    audience = excluded.audience,
    description = excluded.description,
    owner = excluded.owner,
    updated_at = now();
