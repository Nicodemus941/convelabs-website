-- Create a table for temporary booking holds
CREATE TABLE public.booking_holds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id TEXT NOT NULL,
  service_type TEXT NOT NULL,
  patient_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  stripe_session_id TEXT,
  stripe_checkout_url TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts and reads (booking flow is unauthenticated)
CREATE POLICY "Anyone can create booking holds" ON public.booking_holds
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read booking holds" ON public.booking_holds
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update booking holds" ON public.booking_holds
  FOR UPDATE USING (true);

-- Index for lookups
CREATE INDEX idx_booking_holds_stripe_session ON public.booking_holds(stripe_session_id);
CREATE INDEX idx_booking_holds_status ON public.booking_holds(status, expires_at);