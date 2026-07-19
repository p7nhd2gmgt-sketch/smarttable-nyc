-- SmartTable integrates with reservation systems only.
-- This migration removes POS provider placeholders, non-reservation marketplace
-- provider placeholders, and POS-derived import fields.

delete from public.integration_error_logs
where provider in ('toast', 'toast_pos', 'pos_generic', 'square_pos', 'clover', 'lightspeed', 'oracle_micros', 'touchbistro');

delete from public.integration_error_logs
where provider in ('yelp', 'google_business_profile');

delete from public.integration_connections
where integration_id in (
  select id from public.integrations
  where provider in ('toast', 'toast_pos', 'pos_generic', 'square_pos', 'clover', 'lightspeed', 'oracle_micros', 'touchbistro')
);

delete from public.integration_connections
where integration_id in (
  select id from public.integrations
  where provider in ('yelp', 'google_business_profile')
);

delete from public.integrations
where provider in ('toast', 'toast_pos', 'pos_generic', 'square_pos', 'clover', 'lightspeed', 'oracle_micros', 'touchbistro')
   or category = 'pos';

delete from public.integrations
where provider in ('yelp', 'google_business_profile')
   or category in ('maps', 'marketplace');

drop table if exists public.mobility_provider_integrations;

delete from public.reservation_sources
where provider in ('toast', 'toast_pos', 'pos_generic', 'square_pos', 'clover', 'lightspeed', 'oracle_micros', 'touchbistro');

delete from public.feature_status
where key in ('inventory_forecast', 'food_waste_prediction', 'pos_profit_forecast');

delete from public.feature_flags
where key in ('inventory_forecast', 'food_waste_prediction', 'pos_profit_forecast');

delete from public.site_content
where key in (
  'partner_nav_inventory_forecast',
  'partner_nav_waste',
  'partner_nav_profit',
  'event_transport_uber',
  'inventory_kicker',
  'inventory_title',
  'inventory_high_demand',
  'inventory_waste_risk',
  'inventory_prep_level',
  'inventory_medium_high',
  'waste_kicker',
  'waste_title',
  'waste_estimated_risk',
  'waste_exposed_item',
  'waste_fresh_seafood',
  'waste_suggested_action',
  'profit_kicker',
  'profit_title',
  'profit_gross_revenue',
  'profit_discount_cost',
  'profit_recovered_revenue',
  'profit_net_lift',
  'ai_subscore_inventory'
);

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('ai_subscore_availability', 'Availability Score', 'Puntaje de disponibilidad', 'text', 'partner_dashboard'),
  ('reservation_only_integrations_notice', 'SmartTable integrates with reservation systems only. It does not connect to restaurant POS systems or access restaurant payment and transaction data.', 'SmartTable solo se integra con sistemas de reservas. No se conecta con sistemas POS de restaurantes ni accede a datos de pagos o transacciones.', 'textarea', 'integrations')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();

alter table if exists public.imported_guests
  drop column if exists spend_total;

alter table if exists public.manual_performance_uploads
  drop column if exists revenue,
  drop column if exists average_check;

alter table if exists public.restaurants
  drop column if exists average_check_size;

update public.imported_reservations
set raw_payload = raw_payload - array[
  'spend',
  'total_spend',
  'check_total',
  'bill_total',
  'bill_close_time',
  'payment',
  'payment_data',
  'card',
  'card_data',
  'sales_transaction',
  'order',
  'orders',
  'item_sales',
  'inventory',
  'tip',
  'tips',
  'refund',
  'settlement',
  'pos',
  'revenue',
  'restaurant_revenue',
  'average_check',
  'avg_check'
]
where raw_payload is not null;

update public.imported_guests
set raw_payload = raw_payload - array[
  'spend',
  'total_spend',
  'check_total',
  'bill_total',
  'bill_close_time',
  'payment',
  'payment_data',
  'card',
  'card_data',
  'sales_transaction',
  'order',
  'orders',
  'item_sales',
  'inventory',
  'tip',
  'tips',
  'refund',
  'settlement',
  'pos',
  'revenue',
  'restaurant_revenue',
  'average_check',
  'avg_check'
]
where raw_payload is not null;

update public.manual_performance_uploads
set raw_payload = raw_payload - array[
  'spend',
  'total_spend',
  'check_total',
  'bill_total',
  'bill_close_time',
  'payment',
  'payment_data',
  'card',
  'card_data',
  'sales_transaction',
  'order',
  'orders',
  'item_sales',
  'inventory',
  'tip',
  'tips',
  'refund',
  'settlement',
  'pos',
  'revenue',
  'restaurant_revenue',
  'average_check',
  'avg_check'
]
where raw_payload is not null;

alter table if exists public.integrations
  drop constraint if exists integrations_category_check;

alter table if exists public.integrations
  add constraint integrations_category_check
  check (category in ('reservation', 'calendar', 'maps', 'weather', 'events', 'email', 'sms'));
