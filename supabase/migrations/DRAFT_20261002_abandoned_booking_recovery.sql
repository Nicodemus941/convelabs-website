-- ============================================================================
-- DRAFT — NOT APPLIED. Filename is deliberately outside the CLI's
-- <timestamp>_name.sql pattern so `supabase db push` ignores it. Apply by
-- hand (owner) after review, then rename to
-- 20261002xxxxxx_abandoned_booking_recovery.sql.
-- ============================================================================
--
-- Abandoned-booking recovery.
--
-- `abandoned_bookings` has existed since 20260413_hormozi_stack.sql and has
-- never received a row: the only writer (SmartExitIntentModal) was mounted on
-- the home page, not /book-now, and only fired on a desktop mouse-leave after
-- a 500px scroll, once per browser. This migration turns the table into the
-- single draft store the booking flow writes to from the Patient Info step
-- onward, adds the recovery-sequence bookkeeping, and ships the kill switch
-- OFF.
--
-- Everything is additive and idempotent.
--
-- Pieces:
--   1. Columns on abandoned_bookings (identity, resume state, consent record,
--      token hash, touch bookkeeping, outcome).
--   2. Indexes the cron + admin list lean on.
--   3. RLS: anon can no longer write the table directly (writes go through the
--      booking-draft-upsert edge function, service role); admins can read.
--   4. Kill switch system_settings.abandoned_recovery_enabled = false.
--   5. pg_cron job calling process-abandoned-bookings every 15 minutes. The
--      function no-ops while the kill switch is off, so scheduling it is safe.

-- 1 ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.abandoned_bookings
  -- identity / contact (email, phone, service_type, selected_date,
  -- selected_time, step_reached already exist)
  ADD COLUMN IF NOT EXISTS session_id          text,
  ADD COLUMN IF NOT EXISTS first_name          text,
  ADD COLUMN IF NOT EXISTS last_name           text,
  ADD COLUMN IF NOT EXISTS visit_type          text,
  ADD COLUMN IF NOT EXISTS fasting             boolean,
  -- "What brings you here?" picker on the landing page (sessionStorage
  -- cl_visit_reason via src/lib/visitReason.ts): waiting_room | fasting |
  -- loved_one | needles | kids | busy. Drives touch-2 copy.
  ADD COLUMN IF NOT EXISTS visit_reason        text,
  -- 'uploaded' | 'skipped' | 'pending' | 'unknown'
  ADD COLUMN IF NOT EXISTS lab_order_status    text,
  ADD COLUMN IF NOT EXISTS step_key            text,
  -- enough of the react-hook-form values to restore the flow (see
  -- src/lib/bookingDraft.ts → BookingResumeState)
  ADD COLUMN IF NOT EXISTS resume_state        jsonb,
  -- attribution
  ADD COLUMN IF NOT EXISTS source              text,
  ADD COLUMN IF NOT EXISTS landing_page        text,
  ADD COLUMN IF NOT EXISTS utm                 jsonb,
  -- SMS consent record (TCPA): the exact line the patient ticked, when, from
  -- where. Email recovery is transactional and needs no opt-in.
  ADD COLUMN IF NOT EXISTS sms_consent         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_text    text,
  ADD COLUMN IF NOT EXISTS consent_ip          text,
  ADD COLUMN IF NOT EXISTS consent_user_agent  text,
  -- resume link: only sha256(token) is stored. The token itself is
  -- HMAC(BOOKING_RESUME_SECRET, id) so the sender can mint it without
  -- storing it (see _shared/booking-draft.ts).
  ADD COLUMN IF NOT EXISTS resume_token_hash   text,
  ADD COLUMN IF NOT EXISTS expires_at          timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS resume_opened_at    timestamptz,
  ADD COLUMN IF NOT EXISTS resume_open_count   integer NOT NULL DEFAULT 0,
  -- recovery sequence
  ADD COLUMN IF NOT EXISTS touches_sent        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_touch_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_touch_at       timestamptz,
  ADD COLUMN IF NOT EXISTS touch_log           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- outcome
  ADD COLUMN IF NOT EXISTS recovered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS recovered_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  -- 'booked' | 'sms_opt_out' | 'expired' | 'existing_appointment' | 'manual'
  ADD COLUMN IF NOT EXISTS stopped_at          timestamptz,
  ADD COLUMN IF NOT EXISTS stop_reason         text,
  ADD COLUMN IF NOT EXISTS last_activity_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.abandoned_bookings
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN recovered SET DEFAULT false,
  ALTER COLUMN recovery_sent SET DEFAULT false;

COMMENT ON TABLE public.abandoned_bookings IS
  'Booking-flow drafts captured from the Patient Info step onward. One row per browser session (session_id). Written only by the booking-draft-upsert edge function; read by process-abandoned-bookings (cron) and the admin Growth › Abandoned bookings list.';
COMMENT ON COLUMN public.abandoned_bookings.resume_token_hash IS
  'sha256 of the /book/resume/:token value. The token is never stored; it is HMAC-SHA256(BOOKING_RESUME_SECRET, id) so process-abandoned-bookings can mint it at send time.';
COMMENT ON COLUMN public.abandoned_bookings.sms_consent_text IS
  'Verbatim consent line shown next to the checkbox the patient ticked (TCPA record).';

-- 2 ───────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_abandoned_bookings_session
  ON public.abandoned_bookings (session_id)
  WHERE session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_abandoned_bookings_token_hash
  ON public.abandoned_bookings (resume_token_hash)
  WHERE resume_token_hash IS NOT NULL;

-- Cron: "what is due right now?"
CREATE INDEX IF NOT EXISTS idx_abandoned_bookings_due
  ON public.abandoned_bookings (next_touch_at)
  WHERE recovered IS NOT TRUE AND stopped_at IS NULL;

-- Recovery match from stripe-webhook / verify-appointment-checkout.
CREATE INDEX IF NOT EXISTS idx_abandoned_bookings_email
  ON public.abandoned_bookings (lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abandoned_bookings_phone
  ON public.abandoned_bookings (phone)
  WHERE phone IS NOT NULL;

-- Admin list.
CREATE INDEX IF NOT EXISTS idx_abandoned_bookings_created
  ON public.abandoned_bookings (created_at DESC);

-- 3 ───────────────────────────────────────────────────────────────────────
-- Writes now go through the edge function (service role). Close the open
-- anon INSERT and the blanket table grants the Hormozi migration left.
DROP POLICY IF EXISTS "Anyone can insert abandoned" ON public.abandoned_bookings;
REVOKE ALL ON public.abandoned_bookings FROM anon;
REVOKE ALL ON public.abandoned_bookings FROM authenticated;
GRANT SELECT, UPDATE ON public.abandoned_bookings TO authenticated;

-- Admins (super_admin / admin / office_manager via is_admin()) can read the
-- list and flip stopped_at from the UI. Everything else is service role.
DROP POLICY IF EXISTS "Admins read abandoned bookings" ON public.abandoned_bookings;
CREATE POLICY "Admins read abandoned bookings"
  ON public.abandoned_bookings FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update abandoned bookings" ON public.abandoned_bookings;
CREATE POLICY "Admins update abandoned bookings"
  ON public.abandoned_bookings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.abandoned_bookings_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_abandoned_bookings_updated_at ON public.abandoned_bookings;
CREATE TRIGGER trg_abandoned_bookings_updated_at
  BEFORE UPDATE ON public.abandoned_bookings
  FOR EACH ROW EXECUTE FUNCTION public.abandoned_bookings_touch_updated_at();

-- 4 ───────────────────────────────────────────────────────────────────────
-- Kill switch. Ships OFF. Flip with:
--   update system_settings set value = 'true'::jsonb where key = 'abandoned_recovery_enabled';
INSERT INTO public.system_settings (key, value)
VALUES ('abandoned_recovery_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5 ───────────────────────────────────────────────────────────────────────
-- Every 15 minutes, like send-fasting-reminders (jobid 82). The function
-- self-gates on the kill switch, NOTIFICATIONS_SUSPENDED and quiet hours, so
-- the schedule itself is inert until the switch is flipped.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-abandoned-bookings') THEN
    PERFORM cron.unschedule('process-abandoned-bookings');
  END IF;
  PERFORM cron.schedule(
    'process-abandoned-bookings',
    '*/15 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/process-abandoned-bookings',
        headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdXlvbmhyeHh0eXVpeXJkaXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1MDExODgsImV4cCI6MjA2MzA3NzE4OH0.ZKP-k5fizUtKZsekV9RFL1wYcVfIHEeQWArs-4l5Q-Y"}'::jsonb,
        body := '{}'::jsonb
      );
    $job$
  );
END $$;
