-- Appointment ratings and reviews
CREATE TABLE IF NOT EXISTS public.appointment_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID,
  phlebotomist_id UUID,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(appointment_id)
);

ALTER TABLE public.appointment_ratings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert a rating (for guest users too)
CREATE POLICY "Anyone can create a rating"
  ON public.appointment_ratings
  FOR INSERT
  WITH CHECK (true);

-- Allow users to read their own ratings
CREATE POLICY "Users can view ratings"
  ON public.appointment_ratings
  FOR SELECT
  USING (true);
