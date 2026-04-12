-- Add fields for phlebotomist tracking and specimen delivery
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS bio TEXT;

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS specimens_delivered_at TIMESTAMPTZ;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS specimen_lab_name TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS specimen_tracking_id TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS job_started_at TIMESTAMPTZ;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS phlebotomist_eta_minutes INTEGER;

-- Enable Supabase Realtime for tracking tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.phlebotomist_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
