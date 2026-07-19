insert into public.site_content (key, value_en, value_es, value_hu, content_type, group_name)
values
  (
    'email_password_changed_subject',
    'Your SmartTable password was changed',
    'Tu contrasena de SmartTable fue cambiada',
    'A SmartTable jelszavad megvaltozott',
    'text',
    'email'
  ),
  (
    'email_password_changed_body',
    'Hi {{guest_name}}, your SmartTable password was changed successfully. If you did not make this change, contact SmartTable support immediately.',
    'Hola {{guest_name}}, tu contrasena de SmartTable se cambio correctamente. Si no hiciste este cambio, contacta al soporte de SmartTable de inmediato.',
    'Szia {{guest_name}}, a SmartTable jelszavad sikeresen megvaltozott. Ha nem te vegezted ezt a modositast, azonnal vedd fel a kapcsolatot a SmartTable ugyfelszolgalattal.',
    'textarea',
    'email'
  ),
  (
    'email_cta_my_account',
    'Open my account',
    'Abrir mi cuenta',
    'Fiokom megnyitasa',
    'text',
    'email'
  ),
  (
    'email_guest_pending_notice',
    'Status: pending. This is a reservation request, not a confirmed reservation yet. The restaurant must accept it before it is confirmed.',
    'Estado: pendiente. Esta es una solicitud de reserva, no una reserva confirmada todavia. El restaurante debe aceptarla antes de que quede confirmada.',
    'Allapot: fuggoben. Ez meg foglalasi kerelem, nem visszaigazolt foglalas. Az etteremnek el kell fogadnia, mielott visszaigazolta valik.',
    'textarea',
    'email'
  ),
  (
    'email_cta_my_reservations',
    'View My Reservations',
    'Ver mis reservas',
    'Foglalasaim megtekintese',
    'text',
    'email'
  ),
  (
    'email_guest_accepted_notice',
    'Status: accepted. Your reservation is confirmed by the restaurant.',
    'Estado: aceptada. Tu reserva esta confirmada por el restaurante.',
    'Allapot: elfogadva. A foglalasodat az etterem visszaigazolta.',
    'textarea',
    'email'
  ),
  (
    'email_guest_rejected_notice',
    'Status: declined. You can return to SmartTable to find another available table.',
    'Estado: rechazada. Puedes volver a SmartTable para encontrar otra mesa disponible.',
    'Allapot: elutasitva. Visszaterhetsz a SmartTable-re, hogy masik elerheto asztalt talalj.',
    'textarea',
    'email'
  ),
  (
    'email_cta_find_another_table',
    'Find another table',
    'Buscar otra mesa',
    'Masik asztal keresese',
    'text',
    'email'
  ),
  (
    'email_guest_cancelled_notice',
    'Status: cancelled. This reservation is no longer active.',
    'Estado: cancelada. Esta reserva ya no esta activa.',
    'Allapot: torolve. Ez a foglalas mar nem aktiv.',
    'textarea',
    'email'
  ),
  (
    'reservation_success_body',
    'Your reservation request was saved. A confirmation email has been queued. This is not a confirmed reservation yet; the restaurant still needs to accept it.',
    'Tu solicitud de reserva fue guardada. El email de confirmacion se puso en cola. Todavia no es una reserva confirmada; el restaurante debe aceptarla.',
    'A foglalasi kerelmedet mentettuk. A visszaigazolo email sorba lett allitva. Ez meg nem visszaigazolt foglalas; az etteremnek el kell fogadnia.',
    'textarea',
    'forms'
  ),
  (
    'reservation_success_body_email_unconfirmed',
    'Your reservation request was saved, but the confirmation email could not be sent. You can still view it in My Reservations.',
    'Tu solicitud de reserva fue guardada, pero no se pudo enviar el email de confirmacion. Aun puedes verla en Mis reservas.',
    'A foglalasi kerelmedet mentettuk, de a visszaigazolo emailt nem sikerult elkuldeni. A kerelmet tovabbra is megtekintheted a Foglalasaim oldalon.',
    'textarea',
    'forms'
  ),
  (
    'email_restaurant_new_body',
    'New pending reservation request for {{restaurant_name}}. Reference: {{reference}}. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notes: {{notes}}.',
    'Nueva solicitud de reserva pendiente para {{restaurant_name}}. Referencia: {{reference}}. Oferta: {{offer_title}}. Fecha/hora: {{reservation_date}} {{reservation_time}}. Personas: {{party_size}}. Cliente: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notas: {{notes}}.',
    'Uj fuggoben levo foglalasi kerelem itt: {{restaurant_name}}. Hivatkozas: {{reference}}. Ajanlat: {{offer_title}}. Datum/ido: {{reservation_date}} {{reservation_time}}. Letszam: {{party_size}}. Vendeg: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Megjegyzes: {{notes}}.',
    'textarea',
    'email'
  ),
  (
    'email_guest_accepted_body',
    'Good news, {{guest_name}}. {{restaurant_name}} confirmed your reservation. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Discount: {{discount}}%. Address: {{restaurant_address}}. Reference: {{reference}}.',
    'Buenas noticias, {{guest_name}}. {{restaurant_name}} confirmo tu reserva. Oferta: {{offer_title}}. Fecha/hora: {{reservation_date}} {{reservation_time}}. Personas: {{party_size}}. Descuento: {{discount}}%. Direccion: {{restaurant_address}}. Referencia: {{reference}}.',
    '{{restaurant_name}} visszaigazolta a foglalasodat. Ajanlat: {{offer_title}}. Datum/ido: {{reservation_date}} {{reservation_time}}. Letszam: {{party_size}}. Kedvezmeny: {{discount}}%. Cim: {{restaurant_address}}. Hivatkozas: {{reference}}.',
    'textarea',
    'email'
  ),
  (
    'email_guest_rejected_body',
    'Hi {{guest_name}}, {{restaurant_name}} could not confirm your reservation request for {{reservation_date}} at {{reservation_time}}. Reference: {{reference}}.',
    'Hola {{guest_name}}, {{restaurant_name}} no pudo confirmar tu solicitud para {{reservation_date}} a las {{reservation_time}}. Referencia: {{reference}}.',
    '{{restaurant_name}} nem tudta visszaigazolni a {{reservation_date}} {{reservation_time}} idopontra kert foglalasi kerelmedet. Hivatkozas: {{reference}}.',
    'textarea',
    'email'
  ),
  (
    'email_guest_cancelled_body',
    'Hi {{guest_name}}, your SmartTable reservation at {{restaurant_name}} for {{reservation_date}} at {{reservation_time}} was cancelled. Reference: {{reference}}. Cancelled at: {{cancelled_at}}. Cancelled by: {{cancelled_by_label}}.',
    'Hola {{guest_name}}, tu reserva de SmartTable en {{restaurant_name}} para {{reservation_date}} a las {{reservation_time}} fue cancelada. Referencia: {{reference}}. Cancelada a las: {{cancelled_at}}. Cancelada por: {{cancelled_by_label}}.',
    'A SmartTable foglalasod itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}} idopontra torolve lett. Hivatkozas: {{reference}}. Torles ideje: {{cancelled_at}}. Torlest vegezte: {{cancelled_by_label}}.',
    'textarea',
    'email'
  ),
  (
    'email_restaurant_cancelled_body',
    'Reservation {{reference}} for {{restaurant_name}} on {{reservation_date}} at {{reservation_time}} was cancelled. Guest: {{guest_name}}. Cancelled at: {{cancelled_at}}. Cancelled by: {{cancelled_by_label}}.',
    'La reserva {{reference}} para {{restaurant_name}} el {{reservation_date}} a las {{reservation_time}} fue cancelada. Cliente: {{guest_name}}. Cancelada a las: {{cancelled_at}}. Cancelada por: {{cancelled_by_label}}.',
    'A(z) {{reference}} hivatkozasu foglalas itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}} idopontra torolve lett. Vendeg: {{guest_name}}. Torles ideje: {{cancelled_at}}. Torlest vegezte: {{cancelled_by_label}}.',
    'textarea',
    'email'
  )
on conflict (key) do update
set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  value_hu = excluded.value_hu,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
