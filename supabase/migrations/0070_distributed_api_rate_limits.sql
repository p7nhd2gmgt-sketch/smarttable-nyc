-- SmartTable distributed API rate limiting.
--
-- Stores only a one-way SHA-256 bucket hash. Raw IP addresses, user agents,
-- credentials and request bodies are never persisted by this limiter.

create table if not exists public.api_rate_limits (
  bucket_key_hash text primary key,
  category text not null,
  request_count integer not null default 1,
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint api_rate_limits_hash_format check (bucket_key_hash ~ '^[a-f0-9]{64}$'),
  constraint api_rate_limits_category_length check (char_length(category) between 1 and 80),
  constraint api_rate_limits_request_count_positive check (request_count > 0),
  constraint api_rate_limits_window_order check (expires_at > window_started_at)
);

alter table public.api_rate_limits enable row level security;

revoke all privileges on table public.api_rate_limits from public, anon, authenticated;
grant all privileges on table public.api_rate_limits to service_role;

create index if not exists api_rate_limits_expires_at_idx
  on public.api_rate_limits (expires_at);

create or replace function public.consume_api_rate_limit(
  p_bucket_key_hash text,
  p_category text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_expires_at timestamptz;
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise insufficient_privilege using message = 'Access denied';
  end if;

  if p_bucket_key_hash is null or p_bucket_key_hash !~ '^[a-f0-9]{64}$' then
    raise invalid_parameter_value using message = 'Invalid rate-limit bucket';
  end if;
  if p_category is null or char_length(p_category) not between 1 and 80 then
    raise invalid_parameter_value using message = 'Invalid rate-limit category';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise invalid_parameter_value using message = 'Invalid rate-limit threshold';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 604800 then
    raise invalid_parameter_value using message = 'Invalid rate-limit window';
  end if;

  insert into public.api_rate_limits as current_bucket (
    bucket_key_hash,
    category,
    request_count,
    window_started_at,
    expires_at,
    updated_at
  ) values (
    p_bucket_key_hash,
    p_category,
    1,
    v_now,
    v_now + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (bucket_key_hash) do update
  set
    category = excluded.category,
    request_count = case
      when current_bucket.expires_at <= v_now then 1
      else current_bucket.request_count + 1
    end,
    window_started_at = case
      when current_bucket.expires_at <= v_now then v_now
      else current_bucket.window_started_at
    end,
    expires_at = case
      when current_bucket.expires_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else current_bucket.expires_at
    end,
    updated_at = v_now
  returning request_count, expires_at into v_count, v_expires_at;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    case
      when v_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (v_expires_at - v_now)))::integer)
    end;
end;
$$;

revoke all privileges on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

comment on table public.api_rate_limits is
  'Server-only fixed-window API abuse counters keyed by a one-way SHA-256 hash.';
comment on function public.consume_api_rate_limit(text, text, integer, integer) is
  'Atomically consumes one server-side rate-limit unit; callable only with service_role.';
