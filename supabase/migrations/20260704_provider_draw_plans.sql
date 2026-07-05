-- ═══════════════════════════════════════════════════════════════════════
-- PROVIDER DRAW-PLAN PIPELINE (Phase 1)
-- Self-serve recurring "draw plan" for practices: a provider picks a patient
-- volume + cadence (daily/weekly/monthly) + start date, gets a volume-tiered
-- quote, pays the first cycle upfront, and ConveLabs auto-generates the
-- recurring draw slots (hybrid scheduling — provider can adjust).
--
-- Billing model: recurring Stripe subscription, quantity = committed draws
-- per cycle, first charge upfront (billing_cycle_anchor = start date).
-- Pricing: per-draw rate that steps down with monthly draw volume. The rate
-- card below is the SINGLE SOURCE OF TRUTH (dedupes the $85 hardcoded in the
-- edge fn + the SubscribeYourPractice card).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Volume rate card ──────────────────────────────────────────────────
create table if not exists public.provider_rate_card (
  id            uuid primary key default gen_random_uuid(),
  tier_key      text not null unique,          -- starter | growth | scale | enterprise
  label         text not null,
  min_draws_mo  integer not null,              -- inclusive lower bound (draws/month)
  max_draws_mo  integer,                        -- inclusive upper bound; null = unbounded
  per_draw_cents integer not null,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

insert into public.provider_rate_card (tier_key, label, min_draws_mo, max_draws_mo, per_draw_cents, sort_order)
values
  ('starter',    'Starter',     5,   24,  8500, 1),   -- $85/draw
  ('growth',     'Growth',      25,  74,  7500, 2),   -- $75/draw
  ('scale',      'Scale',       75,  199, 6500, 3),   -- $65/draw
  ('enterprise', 'Enterprise',  200, null, 5500, 4)   -- $55/draw (or custom)
on conflict (tier_key) do nothing;

-- ── Provider draw plans ───────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'draw_frequency') then
    create type public.draw_frequency as enum ('one_time','monthly','biweekly','weekly','custom');
  end if;
  if not exists (select 1 from pg_type where typname = 'provider_plan_status') then
    create type public.provider_plan_status as enum ('draft','pending_payment','active','past_due','paused','canceled');
  end if;
end $$;

create table if not exists public.provider_plans (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  status                public.provider_plan_status not null default 'draft',
  patient_count         integer not null check (patient_count >= 1),
  frequency             public.draw_frequency not null,
  -- draws per patient per month implied by frequency; stored explicitly so the
  -- quote is reproducible even if we change the multiplier table later.
  draws_per_cycle       integer not null check (draws_per_cycle >= 1),
  cadence_days          integer[],             -- e.g. {2} = Tuesdays; null = any
  draw_window           text,                  -- e.g. 'fasting_am' | 'anytime'
  start_date            date not null,
  per_draw_cents        integer not null,      -- resolved from rate card at purchase
  tier_key              text references public.provider_rate_card(tier_key),
  setup_fee_cents       integer not null default 0,
  monthly_total_cents   integer not null,      -- draws_per_cycle * per_draw_cents
  stripe_customer_id    text,
  stripe_subscription_id text,
  notes                 text,
  created_by            uuid,                  -- auth.users id of the provider
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_provider_plans_org on public.provider_plans(organization_id);
create index if not exists idx_provider_plans_sub on public.provider_plans(stripe_subscription_id);

-- ── Draw schedule (materialized per cycle by the cadence cron) ─────────
create table if not exists public.draw_schedule (
  id               uuid primary key default gen_random_uuid(),
  provider_plan_id uuid not null references public.provider_plans(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  cycle_start      date not null,
  cycle_end        date not null,
  target_draws     integer not null,
  completed_draws  integer not null default 0,
  status           text not null default 'open',   -- open | fulfilled | partial | skipped
  created_at       timestamptz not null default now(),
  unique (provider_plan_id, cycle_start)
);

create index if not exists idx_draw_schedule_plan on public.draw_schedule(provider_plan_id);
create index if not exists idx_draw_schedule_org on public.draw_schedule(organization_id);

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.provider_rate_card enable row level security;
alter table public.provider_plans     enable row level security;
alter table public.draw_schedule      enable row level security;

-- Rate card is public-readable (needed for the quote UI); writes are admin-only.
drop policy if exists provider_rate_card_read on public.provider_rate_card;
create policy provider_rate_card_read on public.provider_rate_card
  for select to anon, authenticated using (active);

-- Plans + schedule: admin full access; providers read their own org's rows.
-- (Writes for providers go through service-role edge functions, not direct.)
drop policy if exists provider_plans_admin on public.provider_plans;
create policy provider_plans_admin on public.provider_plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists provider_plans_org_read on public.provider_plans;
create policy provider_plans_org_read on public.provider_plans
  for select to authenticated
  using (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);

drop policy if exists draw_schedule_admin on public.draw_schedule;
create policy draw_schedule_admin on public.draw_schedule
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists draw_schedule_org_read on public.draw_schedule;
create policy draw_schedule_org_read on public.draw_schedule
  for select to authenticated
  using (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);
