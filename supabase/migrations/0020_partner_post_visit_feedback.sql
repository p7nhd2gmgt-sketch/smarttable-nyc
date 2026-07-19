-- Partner post-visit feedback visibility, editable copy, and no-show status support.

insert into public.site_content (key, value_en, value_es, content_type, group_name)
values
  ('partner_nav_post_visit_feedback', 'Post-visit feedback', 'Comentarios post-visita', 'text', 'partner'),
  ('partner_post_visit_feedback_title', 'Post-Visit Guest Feedback', 'Comentarios de clientes despues de la visita', 'text', 'partner'),
  ('partner_post_visit_ai_learning', 'Guest-submitted photos, reviews, ordered items, and ratings help SmartTable learn real dining preferences and improve future recommendations.', 'Las fotos, resenas, platos pedidos y calificaciones enviadas por clientes ayudan a SmartTable a aprender preferencias reales y mejorar recomendaciones futuras.', 'textarea', 'partner'),
  ('post_visit_ai_insights_title', 'AI Insights from guest feedback', 'Insights de IA de los comentarios', 'text', 'partner'),
  ('popular_dishes_label', 'Popular dishes', 'Platos populares', 'text', 'partner'),
  ('weak_service_signals_label', 'Weak service signals', 'Senales de servicio debil', 'text', 'partner'),
  ('ambience_sentiment_label', 'Ambience sentiment', 'Sentimiento del ambiente', 'text', 'partner'),
  ('photo_engagement_label', 'Photo engagement', 'Interaccion con fotos', 'text', 'partner'),
  ('most_photographed_items_label', 'Most photographed items', 'Items mas fotografiados', 'text', 'partner'),
  ('guest_satisfaction_trend_label', 'Guest satisfaction trend', 'Tendencia de satisfaccion', 'text', 'partner'),
  ('repeat_intent_signal_label', 'Repeat intent signal', 'Senal de intencion de regreso', 'text', 'partner'),
  ('post_visit_email_send_button', 'Send post-visit email', 'Enviar email post-visita', 'text', 'partner'),
  ('post_visit_email_sent_notice', 'Post-visit email and notification sent.', 'Email y notificacion post-visita enviados.', 'text', 'partner'),
  ('no_show_button', 'No-show', 'No asistio', 'text', 'partner'),
  ('photo_rewards_earn_cta', 'Earn points for your visit', 'Gana puntos por tu visita', 'text', 'ai'),
  ('photo_rewards_consent', 'By submitting, you allow SmartTable to use your review, uploaded photos, and dining information to improve restaurant recommendations and platform analytics. Public display requires approval.', 'Al enviar, permites que SmartTable use tu resena, fotos subidas e informacion de la comida para mejorar recomendaciones y analiticas de la plataforma. La visualizacion publica requiere aprobacion.', 'textarea', 'ai')
on conflict (key) do update set
  value_en = excluded.value_en,
  value_es = excluded.value_es,
  content_type = excluded.content_type,
  group_name = excluded.group_name,
  updated_at = now();

create or replace function public.update_reservation_status(
  p_reservation_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_previous_status text;
  v_result jsonb;
begin
  if p_status not in ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'no_show') then
    raise exception 'Invalid reservation status.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  if auth.role() <> 'service_role'
    and not public.is_admin()
    and not public.owns_restaurant(v_reservation.restaurant_id) then
    raise exception 'You do not have access to this reservation.';
  end if;

  v_previous_status := v_reservation.status::text;

  update public.reservations
  set status = p_status::public.reservation_status
  where id = p_reservation_id
  returning * into v_reservation;

  if v_previous_status not in ('rejected', 'cancelled', 'no_show')
    and p_status in ('rejected', 'cancelled', 'no_show') then
    update public.offers
    set
      reserved_tables = greatest(coalesce(reserved_tables, 0) - 1, 0),
      reserved_seats = greatest(coalesce(reserved_seats, 0) - coalesce(v_reservation.party_size, 0), 0)
    where id = v_reservation.offer_id;
  end if;

  select to_jsonb(ro.*) into v_result
  from public.reservation_overview ro
  where ro.reservation_id = p_reservation_id;

  return v_result;
end;
$$;

grant execute on function public.update_reservation_status(uuid, text) to authenticated;
