insert into public.site_content (key, value_en, value_es, value_hu, content_type, group_name)
values
  (
    'email_guest_registration_subject',
    'Welcome to SmartTable',
    'Bienvenido a SmartTable',
    'Udvozolunk a SmartTable-ben',
    'text',
    'email'
  ),
  (
    'email_guest_registration_body',
    'Hi {{guest_name}}, your SmartTable account is ready. You can now explore restaurants, save favorites, and request discounted tables.',
    'Hola {{guest_name}}, tu cuenta de SmartTable esta lista. Ahora puedes explorar restaurantes, guardar favoritos y solicitar mesas con descuento.',
    'Szia {{guest_name}}, elkeszult a SmartTable fiokod. Mostantol bongeszhetsz ettermeket, menthetsz kedvenceket es kedvezmenyes asztalokat kerhetsz.',
    'textarea',
    'email'
  ),
  (
    'email_cta_explore_restaurants',
    'Explore Restaurants',
    'Explorar restaurantes',
    'Ettermek bongeszese',
    'text',
    'email'
  ),
  (
    'email_verification_subject',
    'Verify your SmartTable email',
    'Verifica tu email de SmartTable',
    'Erositsd meg a SmartTable email cimedet',
    'text',
    'email'
  ),
  (
    'email_verification_body',
    'Hi {{guest_name}}, verify your SmartTable email address here: {{verification_url}}',
    'Hola {{guest_name}}, verifica tu direccion de email de SmartTable aqui: {{verification_url}}',
    'Szia {{guest_name}}, itt tudod megerositeni a SmartTable email cimedet: {{verification_url}}',
    'textarea',
    'email'
  ),
  (
    'email_cta_verify_email',
    'Verify email',
    'Verificar email',
    'Email megerositese',
    'text',
    'email'
  ),
  (
    'email_password_reset_subject',
    'Reset your SmartTable password',
    'Restablece tu contrasena de SmartTable',
    'SmartTable jelszo visszaallitasa',
    'text',
    'email'
  ),
  (
    'email_password_reset_body',
    'If you requested a SmartTable password reset, use this link: {{reset_url}}. If you did not request it, you can ignore this message.',
    'Si solicitaste restablecer tu contrasena de SmartTable, usa este enlace: {{reset_url}}. Si no lo solicitaste, puedes ignorar este mensaje.',
    'Ha SmartTable jelszo-visszaallitast kertel, hasznald ezt a linket: {{reset_url}}. Ha nem te kerted, hagyd figyelmen kivul ezt az uzenetet.',
    'textarea',
    'email'
  ),
  (
    'email_cta_reset_password',
    'Reset password',
    'Restablecer contrasena',
    'Jelszo visszaallitasa',
    'text',
    'email'
  ),
  (
    'email_restaurant_cancelled_subject',
    'SmartTable reservation cancelled: {{reference}}',
    'Reserva de SmartTable cancelada: {{reference}}',
    'SmartTable foglalas torolve: {{reference}}',
    'text',
    'email'
  ),
  (
    'email_cta_open_dashboard',
    'Open dashboard',
    'Abrir dashboard',
    'Dashboard megnyitasa',
    'text',
    'email'
  ),
  (
    'email_restaurant_cancelled_body',
    '{{guest_name}} cancelled or had a reservation cancelled for {{restaurant_name}} on {{reservation_date}} at {{reservation_time}}. Reference: {{reference}}.',
    '{{guest_name}} cancelo o tuvo una reserva cancelada para {{restaurant_name}} el {{reservation_date}} a las {{reservation_time}}. Referencia: {{reference}}.',
    '{{guest_name}} foglalasa torlodott itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}}. Hivatkozas: {{reference}}.',
    'textarea',
    'email'
  ),
  (
    'reservation_success_body_email_unconfirmed',
    'Your reservation request has been successfully sent to the restaurant. We could not confirm email delivery for this request, so please save your reservation reference. If your reservation time is very soon, we recommend contacting the restaurant directly at least 30 minutes before your reservation.',
    'Tu solicitud de reserva se envio correctamente al restaurante. No pudimos confirmar la entrega del email para esta solicitud, asi que guarda tu referencia de reserva. Si la hora de tu reserva es muy pronto, recomendamos contactar directamente al restaurante al menos 30 minutos antes de la reserva.',
    'A foglalasi kerelmed sikeresen el lett kuldve az etteremnek. Az email kezbesiteset nem tudtuk megerositeni, ezert mentsd el a foglalasi hivatkozast. Ha a foglalasi idopont nagyon kozel van, javasoljuk, hogy legalabb 30 perccel a foglalas elott kozvetlenul is vedd fel a kapcsolatot az etteremmel.',
    'textarea',
    'forms'
  ),
  (
    'forgot_password_sent_title',
    'Request received',
    'Solicitud recibida',
    'Kerelem rogzitve',
    'text',
    'account'
  ),
  (
    'forgot_password_sent_body',
    'If a SmartTable account exists for this email, a password reset message will be sent when email delivery is configured.',
    'Si existe una cuenta de SmartTable para este email, se enviara un mensaje de restablecimiento cuando la entrega de email este configurada.',
    'Ha ehhez az email cimhez tartozik SmartTable fiok, a jelszo-visszaallito uzenet akkor lesz elkuldve, amikor az email kezbesites konfiguralva van.',
    'textarea',
    'account'
  ),
  (
    'post_visit_email_unconfirmed_notice',
    'Post-visit notification was recorded, but email delivery could not be confirmed.',
    'La notificacion post-visita fue registrada, pero no se pudo confirmar la entrega del email.',
    'A post-visit ertesites rogzitve lett, de az email kezbesiteset nem tudtuk megerositeni.',
    'text',
    'partner'
  )
on conflict (key) do update
set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  value_hu = excluded.value_hu,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
