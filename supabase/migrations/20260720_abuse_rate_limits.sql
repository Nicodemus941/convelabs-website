-- Shared per-key abuse rate limiter for public edge functions.
--
-- Motivation: the Supabase anon key is embedded in the website JS, so every
-- public edge function (chatbot, checkout, lead capture, OTP senders…) is
-- reachable by a bot. We had NO IP-based or global throttle anywhere. This
-- table + RPC is the reusable primitive: call hit_rate_limit(bucket, window,
-- max) from any function to enforce a sliding fixed-window cap.
--
-- Buckets are arbitrary strings, e.g.:
--   'chatbot:ip:1.2.3.4'   -> per-IP chatbot cap
--   'chatbot:global'       -> global daily LLM ceiling
--   'chatbot:esc:ip:...'   -> escalation-SMS throttle
-- Old rows self-heal: when a bucket's window has expired the counter resets
-- to 1 on the next hit, so no separate cleanup job is required (a periodic
-- delete of stale rows is optional housekeeping).

create table if not exists public.abuse_rate_limits (
  bucket        text primary key,
  window_start  timestamptz not null default now(),
  count         integer     not null default 0,
  updated_at    timestamptz not null default now()
);

-- Service-role only. RLS on with no policy = anon/authenticated get nothing;
-- the edge functions call it with the service-role key (which bypasses RLS).
alter table public.abuse_rate_limits enable row level security;

-- Atomic increment-or-reset. Single upsert so concurrent invocations can't
-- race past the cap. Returns whether this hit is within the limit.
create or replace function public.hit_rate_limit(
  p_bucket text,
  p_window_seconds integer,
  p_max integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_row   public.abuse_rate_limits;
begin
  insert into public.abuse_rate_limits (bucket, window_start, count, updated_at)
  values (p_bucket, v_now, 1, v_now)
  on conflict (bucket) do update
    set count = case
                  when public.abuse_rate_limits.window_start
                       < v_now - make_interval(secs => p_window_seconds)
                  then 1
                  else public.abuse_rate_limits.count + 1
                end,
        window_start = case
                  when public.abuse_rate_limits.window_start
                       < v_now - make_interval(secs => p_window_seconds)
                  then v_now
                  else public.abuse_rate_limits.window_start
                end,
        updated_at = v_now
  returning * into v_row;

  return jsonb_build_object(
    'allowed', v_row.count <= p_max,
    'count',   v_row.count,
    'limit',   p_max,
    'reset_at', v_row.window_start + make_interval(secs => p_window_seconds)
  );
end;
$$;

-- Lock down execute: only the service role (edge functions) may call it.
revoke all on function public.hit_rate_limit(text, integer, integer) from public;
revoke all on function public.hit_rate_limit(text, integer, integer) from anon;
revoke all on function public.hit_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
