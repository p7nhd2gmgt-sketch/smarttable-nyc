-- Tighten post-visit email copy so demo loyalty points are not promised as live rewards.
-- The delivery webhook itself is implemented in the backend and updates email_logs by provider_message_id.

insert into public.site_content (key, value_en, value_es, value_hu, content_type, group_name)
values
  (
    'post_visit_email_preheader',
    'Share your SmartTable visit feedback after dining at {{restaurant_name}}.',
    'Comparte tu experiencia de SmartTable despues de cenar en {{restaurant_name}}.',
    'Oszd meg a SmartTable latogatasod tapasztalatait itt: {{restaurant_name}}.',
    'text',
    'email'
  ),
  (
    'post_visit_email_body',
    'Hi {{guest_name}},

Thank you for dining at {{restaurant_name}} through SmartTable.

We''d love to hear about your experience from your visit on {{visit_date}}.

Please rate your visit:
- Food
- Service
- Ambience
- Overall experience

You can also share food or drink photos and a short note about what you ordered.

Your feedback helps other guests discover great restaurants and helps SmartTable improve personalized dining recommendations.',
    'Hola {{guest_name}},

Gracias por cenar en {{restaurant_name}} a traves de SmartTable.

Nos encantaria conocer tu experiencia de tu visita del {{visit_date}}.

Califica tu visita:
- Comida
- Servicio
- Ambiente
- Experiencia general

Tambien puedes compartir fotos de comida o bebida y una nota breve sobre lo que pediste.

Tus comentarios ayudan a otros clientes a descubrir excelentes restaurantes y ayudan a SmartTable a mejorar recomendaciones personalizadas.',
    'Szia {{guest_name}},

Koszonjuk, hogy a SmartTable-en keresztul vacsoraztal itt: {{restaurant_name}}.

Szeretnenk hallani a {{visit_date}} napi latogatasod tapasztalatairol.

Ertekeld a latogatast:
- Etel
- Szerviz
- Hangulat
- Teljes elmeny

Megoszthatsz etel- vagy italfotokat es rovid leirast is arrol, mit rendeltel.

A visszajelzesed segit mas vendegeknek es javitja a SmartTable szemelyre szabott ajanlasait.',
    'textarea',
    'email'
  ),
  (
    'post_visit_email_loyalty_note',
    'Eligible feedback may earn SmartTable loyalty points when the loyalty system is enabled for your account.',
    'Los comentarios elegibles pueden ganar puntos SmartTable cuando el sistema de lealtad este habilitado para tu cuenta.',
    'A jogosult visszajelzesek SmartTable pontokat erhetnek, ha a loyalty rendszer engedelyezve van a fiokodnal.',
    'textarea',
    'email'
  ),
  (
    'post_visit_upload_button',
    'Upload photos',
    'Subir fotos',
    'Fotok feltoltese',
    'text',
    'email'
  ),
  (
    'post_visit_upload_rewards_button',
    'Upload photos & earn points',
    'Sube fotos y gana puntos',
    'Fotok feltoltese pontokert',
    'text',
    'email'
  ),
  (
    'post_visit_notification_message',
    'Rate your visit and upload dining photos after your SmartTable reservation.',
    'Califica tu visita y sube fotos despues de tu reserva SmartTable.',
    'Ertekeld a latogatast es tolts fel fotokat a SmartTable foglalasod utan.',
    'textarea',
    'notifications'
  ),
  (
    'post_visit_notification_cta',
    'Rate your visit',
    'Calificar visita',
    'Latogatas ertekelese',
    'text',
    'notifications'
  )
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  value_hu = excluded.value_hu,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
