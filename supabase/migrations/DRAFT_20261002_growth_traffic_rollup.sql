-- ============================================================================
-- DRAFT — NOT APPLIED
-- Growth screen: server-side traffic rollup + attribution plumbing.
--
-- The redesigned Growth tab (src/components/dashboards/admin/growth/*) works
-- WITHOUT this file: it pages visitor_sessions client-side (1,000 rows per
-- request, ~4,000 rows per 30-day window today) and classifies the referrer
-- in the browser. This draft moves that work into Postgres and fills the two
-- attribution gaps the screen flags under "Needs action". Review, rename with
-- a real timestamp, then apply via the normal migration path.
--
-- Nothing here is required for the UI to render; the UI never calls these
-- functions yet. When applied, swap growthData.fetchSessions() for
-- get_growth_traffic_daily() and drop the client-side paging.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Channel classification, done once in SQL so every consumer agrees.
--    Mirrors classify() in growthData.ts: utm_* wins, then referrer host.
-- ----------------------------------------------------------------------------
create or replace function public.growth_channel(
  p_referrer   text,
  p_utm_source text default null,
  p_utm_medium text default null
) returns text
language plpgsql immutable as $$
declare
  src  text := lower(coalesce(p_utm_source, ''));
  med  text := lower(coalesce(p_utm_medium, ''));
  host text;
begin
  if src <> '' then
    if src ~ '(instagram|meta|facebook|^fb$|^ig$|tiktok|linkedin)' or med ~ 'social' then return 'social'; end if;
    if src ~ '(google|bing|yahoo|duckduckgo)' or med ~ '(cpc|ppc|paid_search|search)' then return 'search'; end if;
    if src ~ '(sms|email|newsletter|direct)' or med ~ '(sms|email)' then return 'direct'; end if;
    return 'referral';
  end if;

  host := lower(regexp_replace(split_part(regexp_replace(coalesce(p_referrer, ''), '^https?://', ''), '/', 1), '^www\.', ''));
  if host = '' then return 'direct'; end if;
  if host like '%convelabs.com' or host like 'localhost%' then return 'direct'; end if;
  if host ~ '(instagram\.com|facebook\.com|fb\.com|fb\.me|threads\.net|tiktok\.com|t\.co$|twitter\.com|^x\.com|linkedin\.com|youtube\.com|pinterest\.com|nextdoor\.com|reddit\.com)$' then return 'social'; end if;
  if host ~ '(google\.|bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|brave\.com|startpage\.com)' then return 'search'; end if;
  return 'referral';
end $$;

-- ----------------------------------------------------------------------------
-- 2. Daily rollup the Growth chart + tiles can read in ONE round-trip.
--    SECURITY DEFINER so office managers (who see Growth) don't need a direct
--    SELECT on visitor_sessions; gated to admin roles via the existing
--    user_roles pattern. Adjust the role check to match the project helper.
-- ----------------------------------------------------------------------------
create or replace function public.get_growth_traffic_daily(p_days integer default 30)
returns table (
  day            date,
  channel        text,
  sessions       bigint,
  mobile         bigint,
  desktop        bigint,
  tablet         bigint,
  converted      bigint,
  with_utm       bigint
)
language sql stable security definer set search_path = public as $$
  select
    (vs.created_at at time zone 'America/New_York')::date as day,
    public.growth_channel(vs.referrer, vs.utm_source, vs.utm_medium) as channel,
    count(*)                                            as sessions,
    count(*) filter (where vs.device_type = 'mobile')   as mobile,
    count(*) filter (where vs.device_type = 'desktop')  as desktop,
    count(*) filter (where vs.device_type = 'tablet')   as tablet,
    count(*) filter (where vs.converted)                as converted,
    count(*) filter (where vs.utm_source is not null)   as with_utm
  from public.visitor_sessions vs
  where vs.created_at >= (now() at time zone 'America/New_York')::date - (p_days - 1)
  group by 1, 2
  order by 1, 2;
$$;

create or replace function public.get_growth_sources(p_days integer default 30)
returns table (
  source      text,
  host        text,
  channel     text,
  sessions    bigint,
  mobile      bigint,
  desktop     bigint,
  converted   bigint,
  with_utm    bigint,
  first_seen  timestamptz,
  last_seen   timestamptz
)
language sql stable security definer set search_path = public as $$
  with s as (
    select
      vs.*,
      lower(regexp_replace(split_part(regexp_replace(coalesce(vs.referrer, ''), '^https?://', ''), '/', 1), '^www\.', '')) as host
    from public.visitor_sessions vs
    where vs.created_at >= (now() at time zone 'America/New_York')::date - (p_days - 1)
  )
  select
    coalesce('utm_source=' || nullif(utm_source, ''),
      case
        when host = '' then 'Direct / none'
        when host like '%instagram.com' then 'Instagram'
        when host like '%facebook.com' or host like '%fb.com' then 'Facebook'
        when host like '%google.%' then 'Google'
        else host
      end) as source,
    min(host) as host,
    public.growth_channel(min(referrer), min(utm_source), min(utm_medium)) as channel,
    count(*) as sessions,
    count(*) filter (where device_type = 'mobile')  as mobile,
    count(*) filter (where device_type = 'desktop') as desktop,
    count(*) filter (where converted)               as converted,
    count(*) filter (where utm_source is not null)  as with_utm,
    min(created_at) as first_seen,
    max(created_at) as last_seen
  from s
  group by 1
  order by sessions desc;
$$;

revoke all on function public.get_growth_traffic_daily(integer) from public;
revoke all on function public.get_growth_sources(integer)       from public;
grant execute on function public.get_growth_traffic_daily(integer) to authenticated;
grant execute on function public.get_growth_sources(integer)       to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Conversion stamping. Today nothing sets visitor_sessions.converted, so
--    every channel shows 0 conversions. When an appointment is created with a
--    visitor session id (the booking flow would need to pass it — see the
--    note below), flag the session and record the value.
--
--    REQUIRES: appointments.visitor_session_id (new column) populated by the
--    booking flow from sessionStorage['analytics_session_id'].
-- ----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists visitor_session_id text;

create index if not exists appointments_visitor_session_id_idx
  on public.appointments (visitor_session_id)
  where visitor_session_id is not null;

create or replace function public.stamp_session_converted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visitor_session_id is not null then
    update public.visitor_sessions
       set converted = true,
           conversion_value = coalesce(round(coalesce(new.total_amount, 0) * 100)::integer, 0),
           updated_at = now()
     where session_id = new.visitor_session_id
       and coalesce(converted, false) = false;
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_session_converted on public.appointments;
create trigger trg_stamp_session_converted
  after insert on public.appointments
  for each row execute function public.stamp_session_converted();

-- ----------------------------------------------------------------------------
-- 4. Indexes the rollups lean on.
-- ----------------------------------------------------------------------------
create index if not exists visitor_sessions_created_at_idx on public.visitor_sessions (created_at desc);

-- ----------------------------------------------------------------------------
-- NOT SQL — companion edge/client changes this draft assumes (outside the
-- Growth/Owner sections, listed here so the gap is in one place):
--   a) src/utils/analytics.ts  → also send `page_url` (window.location.href)
--      and `landing_page` on the first event of a session.
--   b) supabase/functions/track-analytics/index.ts → parse utm_source/medium/
--      campaign/content/term from page_url and write them on INSERT of
--      visitor_sessions; the columns already exist and are never populated.
--   c) The geo lookup in track-analytics returns no city/state today; verify
--      the provider key / quota so `city`, `state`, `zip_code` fill in.
--   d) Booking flow → write sessionStorage['analytics_session_id'] into
--      appointments.visitor_session_id so the trigger above can fire.
-- ============================================================================
