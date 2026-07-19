-- Partner AI Score, revenue forecast, recommendation feed, heat map,
-- and Super Admin marketplace insights content keys.

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('partner_ai_score_kicker', 'Restaurant intelligence', 'Inteligencia del restaurante', 'text', 'partner_dashboard'),
  ('partner_ai_score_title', 'SmartTable AI Score', 'Puntaje IA de SmartTable', 'text', 'partner_dashboard'),
  ('partner_revenue_opportunity_week', 'Revenue opportunity', 'Oportunidad de ingresos', 'text', 'partner_dashboard'),
  ('this_week_label', 'this week', 'esta semana', 'text', 'partner_dashboard'),
  ('partner_risk_level', 'Risk level', 'Nivel de riesgo', 'text', 'partner_dashboard'),
  ('revenue_forecast_kicker', 'Revenue forecast', 'Pronostico de ingresos', 'text', 'partner_dashboard'),
  ('revenue_forecast_title', 'SmartTable revenue forecast', 'Pronostico de ingresos SmartTable', 'text', 'partner_dashboard'),
  ('revenue_without_ai', 'Revenue without AI', 'Ingresos sin IA', 'text', 'partner_dashboard'),
  ('revenue_with_ai', 'Revenue with AI', 'Ingresos con IA', 'text', 'partner_dashboard'),
  ('potential_lift', 'Potential lift', 'Incremento potencial', 'text', 'partner_dashboard'),
  ('estimated_recovered_revenue', 'Estimated recovered revenue', 'Ingresos recuperados estimados', 'text', 'partner_dashboard'),
  ('revenue_forecast_note', 'This shows how SmartTable can recover otherwise quiet-table revenue while keeping discounts controlled.', 'Esto muestra como SmartTable puede recuperar ingresos de mesas tranquilas manteniendo descuentos controlados.', 'textarea', 'partner_dashboard'),
  ('ai_recommendation_feed_kicker', 'AI recommendation feed', 'Feed de recomendaciones IA', 'text', 'partner_dashboard'),
  ('ai_recommendation_feed_title', 'Recommended next moves', 'Proximos pasos recomendados', 'text', 'partner_dashboard'),
  ('expected_impact_label', 'Expected impact', 'Impacto esperado', 'text', 'partner_dashboard'),
  ('booking_heatmap_kicker', 'Demand heat map', 'Mapa de calor de demanda', 'text', 'partner_dashboard'),
  ('booking_heatmap_title', 'Booking demand by day and time', 'Demanda por dia y hora', 'text', 'partner_dashboard'),
  ('partner_notify_favorite_guests', 'Notify favorite guests', 'Notificar clientes favoritos', 'text', 'partner_dashboard'),
  ('partner_increase_availability', 'Increase availability', 'Aumentar disponibilidad', 'text', 'partner_dashboard'),
  ('partner_lower_discount', 'Lower discount to protect margin', 'Bajar descuento para proteger margen', 'text', 'partner_dashboard'),
  ('partner_raise_discount', 'Raise discount for weak demand', 'Subir descuento para demanda debil', 'text', 'partner_dashboard'),
  ('partner_nav_ai_score', 'AI Score', 'Puntaje IA', 'text', 'partner_dashboard'),
  ('partner_nav_revenue', 'Revenue', 'Ingresos', 'text', 'partner_dashboard'),
  ('partner_nav_recommendations', 'AI feed', 'Feed IA', 'text', 'partner_dashboard'),
  ('partner_nav_heatmap', 'Heat map', 'Mapa de calor', 'text', 'partner_dashboard'),
  ('marketplace_insights_kicker', 'Marketplace intelligence', 'Inteligencia del marketplace', 'text', 'admin'),
  ('marketplace_insights_title', 'AI marketplace insights', 'Insights IA del marketplace', 'text', 'admin'),
  ('marketplace_insights_note', 'Placeholder market insights are structured for future live analytics, search, upload, reservation, and satisfaction pipelines.', 'Insights placeholder preparados para futuras analiticas en vivo de busqueda, subidas, reservas y satisfaccion.', 'textarea', 'admin')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
