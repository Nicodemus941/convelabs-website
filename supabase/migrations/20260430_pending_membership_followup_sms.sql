-- One-shot follow-up SMS that fires the moment a specific patient's
-- membership lands. Use case: pre-built checkout link sent to Lynn
-- Whipple — when she pays, auto-send the booking link without admin
-- needing to watch for the webhook event.
--
-- Reusable: insert a row for any user_id you want to ping, then the
-- trigger fires once on the next user_memberships INSERT for that
-- user and stamps fired_at so it never replays.

CREATE TABLE IF NOT EXISTS public.pending_membership_followup_sms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_phone      text NOT NULL,
  patient_name  text,
  message       text NOT NULL,
  fired_at      timestamptz,
  twilio_sid    text,
  created_by    text DEFAULT 'admin',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_fu_sms_unfired
  ON public.pending_membership_followup_sms(user_id) WHERE fired_at IS NULL;

ALTER TABLE public.pending_membership_followup_sms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pmfs_admin_all ON public.pending_membership_followup_sms;
CREATE POLICY pmfs_admin_all ON public.pending_membership_followup_sms
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.fire_membership_followup_sms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pending pending_membership_followup_sms;
  req_id bigint;
BEGIN
  SELECT * INTO pending
  FROM pending_membership_followup_sms
  WHERE user_id = NEW.user_id AND fired_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF pending.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Stamp fired_at FIRST (idempotency — if pg_net hangs we don't double-fire on retry)
  UPDATE pending_membership_followup_sms
     SET fired_at = now()
   WHERE id = pending.id;

  SELECT net.http_post(
    url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/send-sms-notification',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdXlvbmhyeHh0eXVpeXJkaXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1MDExODgsImV4cCI6MjA2MzA3NzE4OH0.ZKP-k5fizUtKZsekV9RFL1wYcVfIHEeQWArs-4l5Q-Y'
    ),
    body := jsonb_build_object(
      'to', pending.to_phone,
      'patientName', COALESCE(pending.patient_name, 'Patient'),
      'message', pending.message,
      'category', 'admin_alert'
    )
  ) INTO req_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_followup_sms ON public.user_memberships;
CREATE TRIGGER trg_membership_followup_sms
AFTER INSERT ON public.user_memberships
FOR EACH ROW EXECUTE FUNCTION public.fire_membership_followup_sms();
