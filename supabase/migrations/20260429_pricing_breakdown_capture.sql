-- 2026-04-29 Itemized cart capture pipeline
-- Every booking stamps its cart breakdown onto the appointment row
-- so future pricing-drift alerts can be triaged in one query (vs
-- reverse-engineering after the fact like the Mary Rienzi 3-person
-- case).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS pricing_breakdown jsonb;
COMMENT ON COLUMN public.appointments.pricing_breakdown IS
  'Itemized cart at checkout — service + surcharges + companions + discounts + final total. Source of truth for pricing-drift smoke and admin UI.';
CREATE INDEX IF NOT EXISTS idx_appointments_pricing_breakdown_source
  ON public.appointments ((pricing_breakdown->>'captured_by'));

-- Stash table keyed by Stripe session id. create-appointment-checkout
-- writes here; stripe-webhook reads + deletes when the session
-- completes and creates the appointment. Used because typical
-- breakdowns exceed Stripe's 500-char per-key metadata limit.
CREATE TABLE IF NOT EXISTS public.pending_pricing_breakdowns (
  stripe_session_id text PRIMARY KEY,
  breakdown jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_pricing_breakdowns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pending_pricing_breakdowns_created_at
  ON public.pending_pricing_breakdowns(created_at);
