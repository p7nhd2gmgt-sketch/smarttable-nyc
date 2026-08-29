-- SmartTable BASIC security hardening.
--
-- IMPORTANT: this migration is intentionally code-reviewed and tested without
-- being applied automatically. Apply it to staging first, run the tenant/RBAC
-- probes, and only then schedule a separately approved production rollout.

-- The web and mobile clients use the SmartTable API boundary. Direct table
-- mutation grants allowed authenticated clients to bypass API validation,
-- rate limits, structured audit logging and tenant authorization. Keep only
-- explicitly public read models accessible to anon/authenticated roles.
do $$
declare
  relation_name text;
  server_only_relations constant text[] := array[
    'profiles',
    'restaurants',
    'restaurant_users',
    'restaurant_members',
    'partner_invitations',
    'reservations',
    'reservation_overview',
    'reservation_status_events',
    'offers',
    'restaurant_followers',
    'restaurant_view_events',
    'restaurant_reviews',
    'restaurant_reviews_overview',
    'review_photos',
    'post_visit_action_tokens',
    'post_visit_notification_events',
    'admin_notifications',
    'admin_notifications_overview',
    'audit_logs',
    'guest_auth_events',
    'ai_interaction_events',
    'ai_preference_profiles',
    'ai_demand_forecasts',
    'ai_recommendations',
    'ai_actions',
    'ai_action_results',
    'ai_processing_jobs',
    'ai_service_time_observations',
    'ai_route_plans',
    'analytics_events',
    'dining_consumption_uploads',
    'loyalty_accounts',
    'restaurant_integrations',
    'calendar_connections',
    'integration_connections',
    'integration_sync_runs',
    'integration_error_logs',
    'data_import_jobs',
    'imported_reservations',
    'imported_guests',
    'manual_performance_uploads',
    'guests',
    'guest_profiles',
    'guest_consents',
    'guest_feedback',
    'privacy_requests',
    'email_unsubscribes',
    'email_logs',
    'email_queue',
    'notification_logs',
    'notifications',
    'push_subscriptions',
    'push_delivery_logs',
    'partner_device_subscriptions',
    'mobile_push_devices',
    'mobile_push_deliveries',
    'communication_preferences',
    'communication_consents',
    'suppression_list',
    'message_campaigns',
    'message_recipients',
    'marketing_campaigns',
    'sms_campaigns',
    'sms_recipients',
    'system_message_campaigns',
    'system_message_recipients',
    'restaurant_notification_preferences',
    'restaurant_notification_sms_recipients',
    'reservation_alerts',
    'reservation_alert_deliveries',
    'reservation_alert_acknowledgements',
    'restaurant_subscriptions',
    'billing_events',
    'restaurant_billing_accounts',
    'billing_access_overrides',
    'billing_audit_events',
    'subscriptions',
    'invoices',
    'payment_events',
    'video_service_orders',
    'app_error_logs',
    'admin_alerts',
    'app_settings',
    'feature_flags',
    'food_feed_favorites'
  ];
begin
  foreach relation_name in array server_only_relations loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'revoke all privileges on table public.%I from public, anon, authenticated',
        relation_name
      );
      execute format(
        'grant all privileges on table public.%I to service_role',
        relation_name
      );
    end if;
  end loop;
end
$$;

-- Public catalog tables remain readable, but all writes must pass through the
-- authenticated API and its role checks.
revoke insert, update, delete on table public.legal_documents from public, anon, authenticated;
revoke insert, update, delete on table public.subscription_plans from public, anon, authenticated;
revoke insert, update, delete on table public.markets from public, anon, authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Revoke the
-- high-impact RPC surface (including every overload) and require the server API.
do $$
declare
  function_identity regprocedure;
begin
  for function_identity in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'admin_dashboard_stats',
        'partner_dashboard_stats',
        'restaurant_intelligence_summary',
        'create_reservation',
        'track_restaurant_view',
        'update_reservation_status',
        'award_loyalty_points',
        'ai_demand_forecast'
      ])
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated',
      function_identity
    );
    execute format(
      'grant execute on function %s to service_role',
      function_identity
    );
  end loop;
end
$$;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Defense in depth: the aggregate admin function must also authorize inside
-- its SECURITY DEFINER body, even if a future grant is added accidentally.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise insufficient_privilege using message = 'Access denied';
  end if;

  return jsonb_build_object(
    'restaurants_total', (select count(*) from public.restaurants),
    'restaurants_pending', (select count(*) from public.restaurants where status = 'pending'),
    'partners_total', (select count(*) from public.profiles where role::text in ('partner', 'restaurant', 'restaurant_partner')),
    'offers_active', (select count(*) from public.offers where status = 'active'),
    'reservations_total', (select count(*) from public.reservations),
    'reservations_pending', (select count(*) from public.reservations where status::text in ('pending', 'requested')),
    'reservations_accepted', (select count(*) from public.reservations where status::text in ('accepted', 'confirmed')),
    'reservations_rejected', (select count(*) from public.reservations where status::text in ('rejected', 'declined')),
    'seats_reserved', coalesce((select sum(party_size) from public.reservations), 0),
    'views_total', coalesce((select sum(views_count) from public.restaurants), 0),
    'favorites_total', (select count(*) from public.restaurant_followers where notification_enabled = true),
    'favorites_this_week', (select count(*) from public.restaurant_followers where notification_enabled = true and created_at >= date_trunc('week', now())),
    'favorites_this_month', (select count(*) from public.restaurant_followers where notification_enabled = true and created_at >= date_trunc('month', now()))
  );
end;
$$;

revoke all privileges on function public.admin_dashboard_stats() from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats() to service_role;

-- A user-controlled profile UPDATE must never change authorization or tenant
-- binding. Server-side admin/superadmin routes use service_role after their own
-- authorization and audit checks, so they remain functional.
create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.restaurant_id is distinct from old.restaurant_id
    or new.status is distinct from old.status
    or new.is_test_data is distinct from old.is_test_data
  then
    raise insufficient_privilege using message = 'Profile authorization fields cannot be changed';
  end if;

  return new;
end;
$$;

revoke all privileges on function public.protect_profile_security_fields() from public, anon, authenticated;
grant execute on function public.protect_profile_security_fields() to service_role;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields
before update on public.profiles
for each row execute function public.protect_profile_security_fields();

-- Explicitly preserve only the intended public, non-PII read models. Some
-- BASIC snapshots intentionally omit optional billing/catalog relations, so
-- grant only objects that are actually installed in the verified environment.
do $$
declare
  relation_name text;
  public_read_relations constant text[] := array[
    'site_content',
    'public_restaurant_cards',
    'public_available_offers',
    'restaurant_review_summary',
    'food_feed_videos',
    'public_markets',
    'billing_plans',
    'subscription_plans',
    'legal_documents'
  ];
begin
  foreach relation_name in array public_read_relations loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'grant select on table public.%I to anon, authenticated',
        relation_name
      );
    end if;
  end loop;
end
$$;
