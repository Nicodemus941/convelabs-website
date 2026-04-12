-- Recurring booking preferences for auto-scheduling
CREATE TABLE IF NOT EXISTS public.recurring_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  frequency_weeks INTEGER NOT NULL DEFAULT 4,
  preferred_day_of_week INTEGER, -- 0=Sun, 6=Sat
  preferred_time TEXT,
  preferred_address TEXT,
  preferred_city TEXT,
  preferred_state TEXT DEFAULT 'FL',
  preferred_zip TEXT,
  next_booking_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.recurring_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their recurring bookings"
  ON public.recurring_bookings
  FOR ALL
  USING (patient_id = auth.uid());
