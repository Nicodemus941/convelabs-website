-- appointments.member_status defaulted to 'member', so 523 of 527 rows —
-- non-members included — read "member". pricing-drift-smoke falls back to
-- this column, and the label misled anyone reading the row.
--
-- The server-verified tier only reaches the appointment inside
-- pricing_breakdown (server_member_tier, or the client's tier), so:
--   1. no default — NULL means "not known"
--   2. a trigger fills member_status from the breakdown when it is NULL
--      (never overwrites an explicit stamp such as the webhook's
--      post-membership-purchase upgrade)
--   3. backfill rows still carrying the old default
--
-- Only member_status changes; no notification or payout trigger listens to it.

ALTER TABLE public.appointments ALTER COLUMN member_status DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.appointments_member_status_from_breakdown()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tier text;
BEGIN
  IF NEW.member_status IS NULL AND NEW.pricing_breakdown IS NOT NULL THEN
    v_tier := lower(coalesce(NEW.pricing_breakdown->>'server_member_tier',
                             NEW.pricing_breakdown->>'tier'));
    IF v_tier IN ('none', 'member', 'vip', 'concierge') THEN
      NEW.member_status := v_tier;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointments_member_status ON public.appointments;
CREATE TRIGGER trg_appointments_member_status
  BEFORE INSERT OR UPDATE OF pricing_breakdown, member_status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_member_status_from_breakdown();

-- Backfill: rows still holding the old default take the breakdown tier, or
-- NULL (unknown) when no tier was ever captured.
UPDATE public.appointments a
   SET member_status = CASE
         WHEN lower(coalesce(a.pricing_breakdown->>'server_member_tier', a.pricing_breakdown->>'tier'))
              IN ('none', 'member', 'vip', 'concierge')
         THEN lower(coalesce(a.pricing_breakdown->>'server_member_tier', a.pricing_breakdown->>'tier'))
         ELSE NULL
       END
 WHERE a.member_status = 'member';
