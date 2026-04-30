-- Owner-stamped override: tells the double-booking detector "I know about
-- this pair and I'm keeping both — stop nagging." Used when two manual or
-- intentional appointments are flagged as cross-zip conflicts but the owner
-- can serve both (close-by addresses, family wedge, etc.).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS conflict_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS conflict_override_note text;

CREATE INDEX IF NOT EXISTS idx_appointments_conflict_override
  ON public.appointments(conflict_override_at)
  WHERE conflict_override_at IS NOT NULL;
