-- Table for tracking multiple patients per appointment (family/group booking)
CREATE TABLE IF NOT EXISTS public.appointment_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.appointment_patients ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own appointment patients
CREATE POLICY "Users can view their appointment patients"
  ON public.appointment_patients
  FOR SELECT
  USING (
    appointment_id IN (
      SELECT id FROM public.appointments WHERE patient_id = auth.uid()
    )
  );
