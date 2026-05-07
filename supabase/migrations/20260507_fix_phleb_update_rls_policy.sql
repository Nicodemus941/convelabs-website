-- BUG FIX 2026-05-07 (Anita Byro case)
-- The phleb_update_assigned_appointments policy was comparing
--   appointments.phlebotomist_id = staff_profiles.id (the row PK)
-- but appointments.phlebotomist_id actually holds auth.users.id values
-- (i.e., the user's auth ID, same as staff_profiles.user_id, NOT the
-- staff_profiles row PK).
--
-- Result: every UPDATE from the phleb side silently affected 0 rows.
-- The phleb tapped "Specimen Delivered" but the row didn't advance,
-- so the dashboard bounced the card back to "On the Way."
--
-- Fix: rewrite the policy to compare phlebotomist_id directly against
-- auth.uid() — same shape used by the read-side policy
-- "Phlebotomists can view their assigned appointments".

DROP POLICY IF EXISTS phleb_update_assigned_appointments ON public.appointments;

CREATE POLICY phleb_update_assigned_appointments
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (phlebotomist_id = auth.uid())
  WITH CHECK (phlebotomist_id = auth.uid());
