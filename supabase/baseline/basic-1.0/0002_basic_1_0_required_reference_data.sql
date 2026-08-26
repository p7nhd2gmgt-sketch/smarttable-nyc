-- SmartTable BASIC 1.0 required reference data baseline.
-- This file contains no demo restaurants, demo offers, fake users, sample reservations, or historical backfills.

begin;

do $$
begin
  if to_regclass('public.smarttable_schema_baselines') is null then
    raise exception 'Run 0001_basic_1_0_schema.sql before required reference data.';
  end if;
end $$;

insert into public.markets (
  id,
  code,
  name,
  country_code,
  city_name,
  currency_code,
  timezone,
  default_locale,
  supported_locales,
  status,
  configuration
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'nyc',
    'New York City',
    'US',
    'New York',
    'USD',
    'America/New_York',
    'en-US',
    array['en-US'],
    'active',
    '{"launch_stage":"public","default_neighborhood_label":"Neighborhood"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'budapest',
    'Budapest',
    'HU',
    'Budapest',
    'HUF',
    'Europe/Budapest',
    'hu-HU',
    array['hu-HU','en-US'],
    'draft',
    '{"launch_stage":"internal","default_neighborhood_label":"District"}'::jsonb
  )
on conflict (code) do update
set name = excluded.name,
    country_code = excluded.country_code,
    city_name = excluded.city_name,
    currency_code = excluded.currency_code,
    timezone = excluded.timezone,
    default_locale = excluded.default_locale,
    supported_locales = excluded.supported_locales,
    status = excluded.status,
    configuration = excluded.configuration,
    updated_at = now();

insert into public.app_settings (
  setting_key,
  setting_value,
  description
)
values
  ('platform_mode', '"basic"'::jsonb, 'Public release mode for SmartTable BASIC.'),
  ('ai_demo_visibility', 'false'::jsonb, 'Future AI/demo surfaces remain hidden in BASIC.'),
  ('show_ai_mode_badge', 'false'::jsonb, 'Do not show future mode badges in BASIC.'),
  ('public_test_data_visible', 'false'::jsonb, 'Test data is excluded from ordinary public surfaces.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description,
    updated_at = now();

insert into public.feature_flags (
  key,
  label,
  status,
  enabled,
  audience,
  description,
  owner
)
values
  ('basic_public_restaurants', 'Public restaurant listings', 'active', true, 'public', 'Public restaurant listing and restaurant detail surfaces.', 'basic'),
  ('basic_discount_offers', 'Discounted table offers', 'active', true, 'public', 'Public offer discovery and reservation request entry point.', 'basic'),
  ('basic_reservations', 'Reservation requests', 'active', true, 'public', 'Guest reservation request lifecycle and partner accept/decline workflow.', 'basic'),
  ('basic_guest_accounts', 'Guest accounts', 'active', true, 'guests', 'Guest profile, favorites, reservations, security, and preferences.', 'basic'),
  ('basic_partner_dashboard', 'Partner dashboard', 'active', true, 'partners', 'Assigned restaurant management, offers, reservations, analytics, and account access.', 'basic'),
  ('basic_admin_restaurants', 'Restaurant administration', 'active', true, 'admins', 'Admin restaurant creation, lifecycle management, partner access, and audit history.', 'basic'),
  ('stripe_partner_subscriptions', 'Stripe fixed monthly partner subscriptions', 'blocked_by_configuration', false, 'partners_admins', 'Fixed monthly billing schema is present but external Stripe test configuration is required before self-service actions are enabled.', 'billing'),
  ('resend_delivery_webhooks', 'Resend delivery webhook tracking', 'blocked_by_configuration', false, 'admins', 'Delivery tracking requires a configured Resend webhook secret and provider event subscription.', 'email'),
  ('sms_notifications', 'SMS notifications', 'future', false, 'none', 'SMS is not enabled in SmartTable BASIC 1.0.', 'future'),
  ('ai_concierge', 'AI Concierge', 'future', false, 'none', 'AI features are outside SmartTable BASIC 1.0.', 'future')
on conflict (key) do update
set label = excluded.label,
    status = excluded.status,
    enabled = excluded.enabled,
    audience = excluded.audience,
    description = excluded.description,
    owner = excluded.owner,
    updated_at = now();

insert into public.subscription_plans (
  internal_name,
  display_name_en,
  display_name_es,
  display_name_hu,
  description_en,
  description_es,
  description_hu,
  monthly_price_cents,
  annual_price_cents,
  included_features,
  email_monthly_limit,
  sms_monthly_limit,
  is_active,
  sort_order
)
values
  (
    'trial',
    'Trial',
    'Prueba',
    'Probaidoszak',
    'Configurable free trial for restaurant onboarding.',
    'Prueba gratuita configurable para la incorporacion de restaurantes.',
    'Konfiguralhato ingyenes probaidoszak ettermi bevezeteshez.',
    0,
    0,
    '{"fixed_subscription":true,"checkout_available":false,"onboarding":true}'::jsonb,
    null,
    null,
    true,
    10
  ),
  (
    'basic',
    'Basic',
    'Basico',
    'Alap',
    'Fixed monthly SmartTable Basic subscription. Stripe remains authoritative for chargeable prices.',
    'Suscripcion mensual fija SmartTable Basic. Stripe conserva la autoridad sobre los precios cobrables.',
    'Fix havi SmartTable Basic elofizetes. A felszamithato arak hiteles forrasa a Stripe.',
    0,
    0,
    '{"fixed_subscription":true,"checkout_available":true,"offers":true,"reservations":true}'::jsonb,
    null,
    null,
    true,
    20
  ),
  (
    'professional',
    'Professional',
    'Profesional',
    'Professional',
    'Fixed monthly SmartTable Professional subscription. Stripe remains authoritative for chargeable prices.',
    'Suscripcion mensual fija SmartTable Professional. Stripe conserva la autoridad sobre los precios cobrables.',
    'Fix havi SmartTable Professional elofizetes. A felszamithato arak hiteles forrasa a Stripe.',
    0,
    0,
    '{"fixed_subscription":true,"checkout_available":true,"offers":true,"reservations":true,"advanced_admin":true}'::jsonb,
    null,
    null,
    true,
    30
  ),
  (
    'enterprise',
    'Enterprise',
    'Enterprise',
    'Enterprise',
    'Fixed monthly or manually contracted enterprise subscription managed by SmartTable and Stripe.',
    'Suscripcion enterprise mensual fija o contratada manualmente gestionada por SmartTable y Stripe.',
    'Fix havi vagy kezzel szerzodott enterprise elofizetes SmartTable es Stripe kezelessel.',
    0,
    0,
    '{"fixed_subscription":true,"checkout_available":false,"manual_contract_allowed":true}'::jsonb,
    null,
    null,
    true,
    40
  ),
  (
    'complimentary_test',
    'Complimentary test',
    'Prueba gratuita interna',
    'Dijmentes teszt',
    'Complimentary access for explicitly approved SmartTable test restaurants only.',
    'Acceso gratuito solo para restaurantes de prueba aprobados explicitamente por SmartTable.',
    'Dijmentes hozzaferes kizarolag kifejezetten jovahagyott SmartTable tesztettermeknek.',
    0,
    0,
    '{"fixed_subscription":true,"checkout_available":false,"test_restaurants_only":true}'::jsonb,
    null,
    null,
    false,
    90
  )
on conflict (internal_name) do update
set display_name_en = excluded.display_name_en,
    display_name_es = excluded.display_name_es,
    display_name_hu = excluded.display_name_hu,
    description_en = excluded.description_en,
    description_es = excluded.description_es,
    description_hu = excluded.description_hu,
    included_features = excluded.included_features,
    email_monthly_limit = excluded.email_monthly_limit,
    sms_monthly_limit = excluded.sms_monthly_limit,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.legal_documents (
  document_type,
  version,
  language,
  title,
  content,
  content_url,
  status,
  published_at,
  effective_at,
  is_current
)
values
  ('terms_of_service', '2026-07-17', 'en', 'Terms of Service', 'SmartTable Terms of Service for guest accounts and reservation requests.', '/terms?version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('terms_of_service', '2026-07-17', 'es', 'Terminos de servicio', 'Terminos de servicio de SmartTable para cuentas de invitados y solicitudes de reserva.', '/terms?version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('terms_of_service', '2026-07-17', 'hu', 'Altalanos Szerzodesi Feltetelek', 'A SmartTable altalanos szerzodesi feltetelei vendegfiokokhoz es foglalasi keresekhez.', '/terms?version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('privacy_policy', '2026-07-17', 'en', 'Privacy Policy', 'SmartTable Privacy Policy for profile, preference, reservation, consent, and notification data.', '/privacy?version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('privacy_policy', '2026-07-17', 'es', 'Politica de privacidad', 'Politica de privacidad de SmartTable para datos de perfil, preferencias, reservas, consentimientos y notificaciones.', '/privacy?version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('privacy_policy', '2026-07-17', 'hu', 'Adatvedelmi szabalyzat', 'A SmartTable adatvedelmi szabalyzata profil-, preferencia-, foglalasi-, hozzajarulasi es ertesitesi adatokhoz.', '/privacy?version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('cookie_policy', '2026-07-17', 'en', 'Cookie Policy', 'SmartTable Cookie Policy for essential session and preference storage.', '/privacy?section=cookies&version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('cookie_policy', '2026-07-17', 'es', 'Politica de cookies', 'Politica de cookies de SmartTable para almacenamiento esencial de sesion y preferencias.', '/privacy?section=cookies&version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('cookie_policy', '2026-07-17', 'hu', 'Cookie-szabalyzat', 'A SmartTable cookie-szabalyzata az alapveto munkamenet- es preferenciatarolashoz.', '/privacy?section=cookies&version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('guest_platform_rules', '2026-07-17', 'en', 'Guest Platform Rules', 'SmartTable rules for reservation requests, cancellations, respectful use, and account conduct.', '/terms?section=guest-rules&version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('guest_platform_rules', '2026-07-17', 'es', 'Reglas de la plataforma para invitados', 'Reglas de SmartTable para reservas, cancelaciones, uso respetuoso y conducta de cuenta.', '/terms?section=guest-rules&version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('guest_platform_rules', '2026-07-17', 'hu', 'Vendegplatform szabalyai', 'A SmartTable vendegplatform szabalyai foglalasokhoz, lemondasokhoz, tiszteletteljes hasznalathoz es fiokhasznalathoz.', '/terms?section=guest-rules&version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('marketing_consent', '2026-07-17', 'en', 'Marketing Consent', 'Optional consent for SmartTable offers and product updates.', '/privacy?section=marketing&version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('marketing_consent', '2026-07-17', 'es', 'Consentimiento de marketing', 'Consentimiento opcional para ofertas y actualizaciones de SmartTable.', '/privacy?section=marketing&version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('marketing_consent', '2026-07-17', 'hu', 'Marketing-hozzajarulas', 'Opcionalis hozzajarulas SmartTable ajanlatokhoz es termekfrissitesekhez.', '/privacy?section=marketing&version=2026-07-17&lang=hu', 'published', now(), now(), true),
  ('location_personalization_consent', '2026-07-17', 'en', 'Location and Personalization Consent', 'Optional consent for location-aware and preference-based SmartTable personalization.', '/privacy?section=personalization&version=2026-07-17&lang=en', 'published', now(), now(), true),
  ('location_personalization_consent', '2026-07-17', 'es', 'Consentimiento de ubicacion y personalizacion', 'Consentimiento opcional para personalizacion basada en ubicacion y preferencias.', '/privacy?section=personalization&version=2026-07-17&lang=es', 'published', now(), now(), true),
  ('location_personalization_consent', '2026-07-17', 'hu', 'Helyadat- es szemelyre szabasi hozzajarulas', 'Opcionalis hozzajarulas helyadatokra es preferenciaalapu SmartTable szemelyre szabasra.', '/privacy?section=personalization&version=2026-07-17&lang=hu', 'published', now(), now(), true)
on conflict (document_type, version, language) do update
set title = excluded.title,
    content = excluded.content,
    content_url = excluded.content_url,
    status = excluded.status,
    is_current = excluded.is_current,
    updated_at = now();

insert into public.site_content (
  key,
  value_en,
  value_es,
  value_hu,
  content_type,
  group_name
)
values
  ('email_guest_registration_subject', 'Welcome to SmartTable', 'Bienvenido a SmartTable', 'Udvozolunk a SmartTable-ben', 'text', 'email'),
  ('email_guest_registration_body', 'Hi {{guest_name}}, your SmartTable account is ready. You can now explore restaurants, save favorites, and request discounted tables.', 'Hola {{guest_name}}, tu cuenta de SmartTable esta lista. Ahora puedes explorar restaurantes, guardar favoritos y solicitar mesas con descuento.', 'Szia {{guest_name}}, elkeszult a SmartTable fiokod. Mostantol bongeszhetsz ettermeket, menthetsz kedvenceket es kedvezmenyes asztalokat kerhetsz.', 'textarea', 'email'),
  ('email_password_reset_subject', 'Reset your SmartTable password', 'Restablece tu contrasena de SmartTable', 'SmartTable jelszo visszaallitasa', 'text', 'email'),
  ('email_password_reset_body', 'If you requested a SmartTable password reset, use this link: {{reset_url}}. If you did not request it, you can ignore this message.', 'Si solicitaste restablecer tu contrasena de SmartTable, usa este enlace: {{reset_url}}. Si no lo solicitaste, puedes ignorar este mensaje.', 'Ha SmartTable jelszo-visszaallitast kertel, hasznald ezt a linket: {{reset_url}}. Ha nem te kerted, hagyd figyelmen kivul ezt az uzenetet.', 'textarea', 'email'),
  ('email_password_changed_subject', 'Your SmartTable password was changed', 'Tu contrasena de SmartTable fue cambiada', 'A SmartTable jelszavad megvaltozott', 'text', 'email'),
  ('email_password_changed_body', 'Hi {{firstName}}, your SmartTable account password was changed successfully. If you did not start this change, change your password again immediately and contact SmartTable support.', 'Hola {{firstName}}, la contrasena de tu cuenta SmartTable se cambio correctamente. Si no iniciaste este cambio, cambia tu contrasena inmediatamente y contacta al soporte de SmartTable.', 'Szia {{firstName}}, a SmartTable-fiokod jelszava sikeresen megvaltozott. Ha nem te kezdemenyezted ezt, azonnal valtoztasd meg ujra a jelszavadat, es vedd fel a kapcsolatot a SmartTable ugyfelszolgalataval.', 'textarea', 'email'),
  ('email_restaurant_new_body', 'New pending reservation request for {{restaurant_name}}. Reference: {{reference}}. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notes: {{notes}}.', 'Nueva solicitud de reserva pendiente para {{restaurant_name}}. Referencia: {{reference}}. Oferta: {{offer_title}}. Fecha/hora: {{reservation_date}} {{reservation_time}}. Personas: {{party_size}}. Cliente: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notas: {{notes}}.', 'Uj fuggoben levo foglalasi kerelem itt: {{restaurant_name}}. Hivatkozas: {{reference}}. Ajanlat: {{offer_title}}. Datum/ido: {{reservation_date}} {{reservation_time}}. Letszam: {{party_size}}. Vendeg: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Megjegyzes: {{notes}}.', 'textarea', 'email'),
  ('email_guest_pending_notice', 'Status: pending. This is a reservation request, not a confirmed reservation yet. The restaurant must accept it before it is confirmed.', 'Estado: pendiente. Esta es una solicitud de reserva, no una reserva confirmada todavia. El restaurante debe aceptarla antes de que quede confirmada.', 'Allapot: fuggoben. Ez meg foglalasi kerelem, nem visszaigazolt foglalas. Az etteremnek el kell fogadnia, mielott visszaigazolta valik.', 'textarea', 'email'),
  ('email_guest_accepted_body', 'Good news, {{guest_name}}. {{restaurant_name}} confirmed your reservation. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Discount: {{discount}}%. Address: {{restaurant_address}}. Reference: {{reference}}.', 'Buenas noticias, {{guest_name}}. {{restaurant_name}} confirmo tu reserva. Oferta: {{offer_title}}. Fecha/hora: {{reservation_date}} {{reservation_time}}. Personas: {{party_size}}. Descuento: {{discount}}%. Direccion: {{restaurant_address}}. Referencia: {{reference}}.', '{{restaurant_name}} visszaigazolta a foglalasodat. Ajanlat: {{offer_title}}. Datum/ido: {{reservation_date}} {{reservation_time}}. Letszam: {{party_size}}. Kedvezmeny: {{discount}}%. Cim: {{restaurant_address}}. Hivatkozas: {{reference}}.', 'textarea', 'email'),
  ('email_guest_rejected_body', 'Hi {{guest_name}}, {{restaurant_name}} could not confirm your reservation request for {{reservation_date}} at {{reservation_time}}. Reference: {{reference}}.', 'Hola {{guest_name}}, {{restaurant_name}} no pudo confirmar tu solicitud para {{reservation_date}} a las {{reservation_time}}. Referencia: {{reference}}.', '{{restaurant_name}} nem tudta visszaigazolni a {{reservation_date}} {{reservation_time}} idopontra kert foglalasi kerelmedet. Hivatkozas: {{reference}}.', 'textarea', 'email'),
  ('email_guest_cancelled_body', 'Hi {{guest_name}}, your SmartTable reservation at {{restaurant_name}} for {{reservation_date}} at {{reservation_time}} was cancelled. Reference: {{reference}}. Cancelled at: {{cancelled_at}}. Cancelled by: {{cancelled_by_label}}.', 'Hola {{guest_name}}, tu reserva de SmartTable en {{restaurant_name}} para {{reservation_date}} a las {{reservation_time}} fue cancelada. Referencia: {{reference}}. Cancelada a las: {{cancelled_at}}. Cancelada por: {{cancelled_by_label}}.', 'A SmartTable foglalasod itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}} idopontra torolve lett. Hivatkozas: {{reference}}. Torles ideje: {{cancelled_at}}. Torlest vegezte: {{cancelled_by_label}}.', 'textarea', 'email'),
  ('email_restaurant_cancelled_body', 'Reservation {{reference}} for {{restaurant_name}} on {{reservation_date}} at {{reservation_time}} was cancelled. Guest: {{guest_name}}. Cancelled at: {{cancelled_at}}. Cancelled by: {{cancelled_by_label}}.', 'La reserva {{reference}} para {{restaurant_name}} el {{reservation_date}} a las {{reservation_time}} fue cancelada. Cliente: {{guest_name}}. Cancelada a las: {{cancelled_at}}. Cancelada por: {{cancelled_by_label}}.', 'A(z) {{reference}} hivatkozasu foglalas itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}} idopontra torolve lett. Vendeg: {{guest_name}}. Torles ideje: {{cancelled_at}}. Torlest vegezte: {{cancelled_by_label}}.', 'textarea', 'email'),
  ('email_data_export_ready_subject', 'Your SmartTable data export is ready', 'Tu exportacion de datos de SmartTable esta lista', 'Elkeszult a SmartTable adatexportod', 'text', 'email'),
  ('email_data_export_ready_body', 'Hi {{firstName}}, your SmartTable personal data export is ready. This secure link expires on {{expiresAt}}. Download it here: {{downloadUrl}}', 'Hola {{firstName}}, tu exportacion de datos personales de SmartTable esta lista. Este enlace seguro vence el {{expiresAt}}. Descargala aqui: {{downloadUrl}}', 'Szia {{firstName}}, elkeszult a SmartTable szemelyes adatexportod. A biztonsagos link ekkor jar le: {{expiresAt}}. Itt toltheted le: {{downloadUrl}}', 'textarea', 'email'),
  ('email_cta_my_reservations', 'View My Reservations', 'Ver mis reservas', 'Foglalasaim megtekintese', 'text', 'email'),
  ('email_cta_open_dashboard', 'Open dashboard', 'Abrir dashboard', 'Dashboard megnyitasa', 'text', 'email'),
  ('email_cta_find_another_table', 'Find another table', 'Buscar otra mesa', 'Masik asztal keresese', 'text', 'email')
on conflict (key) do update
set value_en = excluded.value_en,
    value_es = excluded.value_es,
    value_hu = excluded.value_hu,
    content_type = excluded.content_type,
    group_name = excluded.group_name,
    updated_at = now();

commit;
