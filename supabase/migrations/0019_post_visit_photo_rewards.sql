-- Post-visit feedback, Dining Photo Rewards booking context, and moderation.

alter table public.dining_consumption_uploads
  alter column image_url drop not null,
  add column if not exists guest_id uuid references auth.users(id) on delete set null,
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists uploaded_file_name text,
  add column if not exists overall_rating numeric(3,1),
  add column if not exists food_rating numeric(3,1),
  add column if not exists service_rating numeric(3,1),
  add column if not exists ambience_rating numeric(3,1),
  add column if not exists ordered_items text,
  add column if not exists would_recommend text,
  add column if not exists would_return text,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists moderation_status text not null default 'pending',
  add column if not exists updated_at timestamptz;

create index if not exists idx_consumption_moderation_status on public.dining_consumption_uploads(moderation_status, created_at desc);
create index if not exists idx_consumption_reservation on public.dining_consumption_uploads(reservation_id, created_at desc);
create index if not exists idx_consumption_guest_email on public.dining_consumption_uploads(guest_email);

alter table public.loyalty_accounts
  add column if not exists completed_reviews integer not null default 0,
  add column if not exists uploaded_photos integer not null default 0,
  add column if not exists last_reward_date timestamptz;

create table if not exists public.guest_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  guest_email text,
  profile_key text,
  title text not null,
  message text not null,
  cta text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_notifications_guest_email on public.guest_notifications(guest_email, created_at desc);
create index if not exists idx_guest_notifications_profile_key on public.guest_notifications(profile_key, created_at desc);

alter table public.guest_notifications enable row level security;

drop policy if exists guest_notifications_insert_service on public.guest_notifications;
create policy guest_notifications_insert_service on public.guest_notifications
for insert
to service_role
with check (true);

drop policy if exists guest_notifications_guest_read on public.guest_notifications;
create policy guest_notifications_guest_read on public.guest_notifications
for select
to anon, authenticated
using (true);

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('post_visit_email_subject', 'How was your experience at {{restaurant_name}}?', 'Como fue tu experiencia en {{restaurant_name}}?', 'text', 'email'),
  ('post_visit_email_body', E'Hi {{guest_name}},\n\nThank you for dining at {{restaurant_name}} through SmartTable.\n\nWe''d love to hear about your experience.\n\nPlease rate your visit:\n- Food\n- Service\n- Ambience\n- Overall experience\n\nYou can also earn extra SmartTable loyalty points by sharing food or drink photos and a short note about what you ordered.\n\nYour feedback helps other guests discover great restaurants and helps SmartTable improve personalized dining recommendations.', E'Hola {{guest_name}},\n\nGracias por cenar en {{restaurant_name}} a traves de SmartTable.\n\nNos encantaria conocer tu experiencia.\n\nCalifica tu visita:\n- Comida\n- Servicio\n- Ambiente\n- Experiencia general\n\nTambien puedes ganar puntos extra de SmartTable compartiendo fotos de comida o bebida y una nota breve sobre lo que pediste.\n\nTus comentarios ayudan a otros clientes a descubrir excelentes restaurantes y ayudan a SmartTable a mejorar recomendaciones personalizadas.', 'textarea', 'email'),
  ('post_visit_email_footer', 'You are receiving this because you completed a SmartTable reservation at {{restaurant_name}}.', 'Recibes esto porque completaste una reserva de SmartTable en {{restaurant_name}}.', 'textarea', 'email'),
  ('post_visit_rate_button', 'Rate your experience', 'Califica tu experiencia', 'text', 'email'),
  ('post_visit_upload_button', 'Upload photos & earn points', 'Sube fotos y gana puntos', 'text', 'email'),
  ('post_visit_ordered_button', 'Share what you ordered', 'Comparte lo que pediste', 'text', 'email'),
  ('post_visit_notification_title', 'How was {{restaurant_name}}?', 'Como estuvo {{restaurant_name}}?', 'text', 'notifications'),
  ('post_visit_notification_message', 'Rate your visit and upload dining photos to earn extra SmartTable points.', 'Califica tu visita y sube fotos para ganar puntos extra de SmartTable.', 'textarea', 'notifications'),
  ('post_visit_notification_cta', 'Earn points', 'Ganar puntos', 'text', 'notifications'),
  ('photo_rewards_points_cap', 'You can earn up to 160 points for this visit.', 'Puedes ganar hasta 160 puntos por esta visita.', 'text', 'ai'),
  ('photo_rewards_confirmation_title', 'Thank you for your feedback!', 'Gracias por tus comentarios!', 'text', 'ai'),
  ('photo_rewards_confirmation_body', 'You earned {{pointsEarned}} SmartTable points.', 'Ganaste {{pointsEarned}} puntos SmartTable.', 'text', 'ai'),
  ('photo_rewards_confirmation_note', 'Your photos and review help other guests and improve SmartTable AI recommendations.', 'Tus fotos y resena ayudan a otros clientes y mejoran las recomendaciones de SmartTable AI.', 'textarea', 'ai'),
  ('photo_rewards_view_rewards', 'View my rewards', 'Ver mis recompensas', 'text', 'ai'),
  ('photo_rewards_find_table', 'Find another table', 'Buscar otra mesa', 'text', 'ai'),
  ('admin_photo_submissions_title', 'Guest Photo & Review Submissions', 'Envios de fotos y resenas de clientes', 'text', 'admin'),
  ('booking_completed_event', 'Booking completed', 'Reserva completada', 'text', 'ai'),
  ('booking_id_label', 'Booking ID', 'ID de reserva', 'text', 'ai'),
  ('reservation_reference_label', 'Reference', 'Referencia', 'text', 'ai'),
  ('ordered_items_label', 'What did you order?', 'Que pediste?', 'text', 'ai'),
  ('ordered_items_placeholder', 'Pasta, steak, wine, dessert...', 'Pasta, carne, vino, postre...', 'text', 'ai'),
  ('would_recommend_label', 'Would you recommend this restaurant?', 'Recomendarias este restaurante?', 'text', 'ai'),
  ('would_return_label', 'Would you return?', 'Volverias?', 'text', 'ai'),
  ('select_one_label', 'Select one', 'Selecciona una opcion', 'text', 'ai'),
  ('yes_label', 'Yes', 'Si', 'text', 'ai'),
  ('no_label', 'No', 'No', 'text', 'ai'),
  ('maybe_label', 'Maybe', 'Quizas', 'text', 'ai'),
  ('not_sure_label', 'Not sure', 'No estoy seguro', 'text', 'ai'),
  ('photo_tags_label', 'Tags', 'Etiquetas', 'text', 'ai')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();
