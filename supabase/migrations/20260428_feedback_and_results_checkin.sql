-- 2026-04-28 Patient feedback survey + lab-results check-in tables
-- Layer A audit found that the post-visit "survey" email had NO actual
-- survey form (just a Google Review button) and "results_checkin" had
-- NO yes/no link. Zero surveys captured, zero results-status data,
-- zero owner notifications.
--
-- This migration adds:
--   feedback_responses — 1-5 star rating + optional comment per visit
--   lab_results_checkin — yes/no on "got your results yet?"
--   get_feedback_summary(p_days) — RPC for dashboard widget
--   get_results_checkin_summary(p_days) — RPC for dashboard widget
--
-- Edge functions submit-feedback + submit-results-checkin handle GET
-- from email links and serve a styled HTML thank-you page inline.
-- Real-time SMS to owner on rating <=2 OR results=no.

CREATE TABLE IF NOT EXISTS public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  patient_email text,
  patient_name text,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  source text DEFAULT 'post_visit_email',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_appointment ON feedback_responses(appointment_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback_responses(rating, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_responses(created_at DESC);
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_admin_read" ON public.feedback_responses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','admin','office_manager'))
  );

CREATE TABLE IF NOT EXISTS public.lab_results_checkin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  patient_email text,
  got_results boolean NOT NULL,
  comment text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_results_checkin_appt ON lab_results_checkin(appointment_id);
CREATE INDEX IF NOT EXISTS idx_results_checkin_got ON lab_results_checkin(got_results, created_at DESC);
ALTER TABLE public.lab_results_checkin ENABLE ROW LEVEL SECURITY;
CREATE POLICY "results_checkin_admin_read" ON public.lab_results_checkin
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','admin','office_manager'))
  );

CREATE OR REPLACE FUNCTION public.get_feedback_summary(p_days int DEFAULT 30)
RETURNS TABLE (
  total_responses bigint, avg_rating numeric,
  promoters bigint, detractors bigint, passives bigint,
  five_stars bigint, one_two_stars bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::bigint, round(avg(rating)::numeric, 2),
    count(*) FILTER (WHERE rating = 5)::bigint,
    count(*) FILTER (WHERE rating <= 2)::bigint,
    count(*) FILTER (WHERE rating IN (3,4))::bigint,
    count(*) FILTER (WHERE rating = 5)::bigint,
    count(*) FILTER (WHERE rating <= 2)::bigint
  FROM feedback_responses
  WHERE created_at > now() - (p_days || ' days')::interval;
$$;
GRANT EXECUTE ON FUNCTION public.get_feedback_summary(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_results_checkin_summary(p_days int DEFAULT 30)
RETURNS TABLE (total_responses bigint, got_yes bigint, got_no bigint, response_rate_pct numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH eligible AS (
    SELECT count(*) as n FROM appointments
    WHERE status = 'completed' AND created_at > now() - (p_days || ' days')::interval
  ), responses AS (
    SELECT count(*) as n,
      count(*) FILTER (WHERE got_results) as yes,
      count(*) FILTER (WHERE NOT got_results) as no
    FROM lab_results_checkin
    WHERE created_at > now() - (p_days || ' days')::interval
  )
  SELECT r.n::bigint, r.yes::bigint, r.no::bigint,
    CASE WHEN e.n > 0 THEN round((r.n::numeric / e.n) * 100, 1) ELSE 0 END
  FROM responses r CROSS JOIN eligible e;
$$;
GRANT EXECUTE ON FUNCTION public.get_results_checkin_summary(int) TO authenticated;
