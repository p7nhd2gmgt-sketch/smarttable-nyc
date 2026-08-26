begin;

-- The production alert scheduler is configured operationally after deployment.
-- Secrets remain in Supabase Vault and are never committed in migration SQL.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

commit;
