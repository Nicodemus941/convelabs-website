-- 2026-05-07 PROACTIVE AUDIT FIX
-- After fixing phlebs being locked out of `organizations`, a broader audit
-- across every table the HIPAA lockdown touched found 5 more
-- (table × phlebotomist) RLS gaps. Each would surface as a user-visible
-- bug the next time a phleb tripped it (tube label printing, appointment
-- card details, address picker, insurance display, etc.).
--
-- All grants below are scoped via "the patient is on an appointment this
-- phleb is assigned to" — same shape as phleb_update_assigned_appointments.
-- Phleb cannot enumerate patients outside their own assignments.

-- 1. tenant_patients
DROP POLICY IF EXISTS phleb_reads_assigned_patients ON public.tenant_patients;
CREATE POLICY phleb_reads_assigned_patients
  ON public.tenant_patients FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.patient_id = tenant_patients.id
        AND a.phlebotomist_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE lower(a.patient_email) = lower(tenant_patients.email)
        AND a.phlebotomist_id = auth.uid()
    )
  );

-- 2. patient_addresses
DROP POLICY IF EXISTS phleb_reads_assigned_patient_addresses ON public.patient_addresses;
CREATE POLICY phleb_reads_assigned_patient_addresses
  ON public.patient_addresses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.patient_id = patient_addresses.patient_id
        AND a.phlebotomist_id = auth.uid()
    )
  );

-- 3. patient_insurances
DROP POLICY IF EXISTS phleb_reads_assigned_patient_insurances ON public.patient_insurances;
CREATE POLICY phleb_reads_assigned_patient_insurances
  ON public.patient_insurances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.patient_id = patient_insurances.patient_id
        AND a.phlebotomist_id = auth.uid()
    )
  );

-- 4. appointment_organizations (junction for cc'd orgs)
CREATE POLICY phleb_reads_assigned_appointment_organizations
  ON public.appointment_organizations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_organizations.appointment_id
        AND a.phlebotomist_id = auth.uid()
    )
  );

-- 5. org_providers (referring physicians directory — not PHI)
CREATE POLICY phleb_reads_org_providers_for_assigned
  ON public.org_providers FOR SELECT TO authenticated
  USING (
    lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '')) = 'phlebotomist'
  );
