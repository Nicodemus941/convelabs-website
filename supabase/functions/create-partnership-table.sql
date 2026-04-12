
-- Create partnership_onboarding table to store all practice setup information
CREATE TABLE IF NOT EXISTS public.partnership_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE,
  practice_name TEXT NOT NULL,
  practice_description TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  logo_path TEXT,
  services TEXT NOT NULL,
  preferred_domain TEXT NOT NULL,
  number_of_staff_accounts INTEGER NOT NULL DEFAULT 2,
  additional_notes TEXT,
  submission_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create storage bucket for practice assets if it doesn't exist
INSERT INTO storage.buckets (id, name)
VALUES ('practice-assets', 'practice-assets')
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for the partnership_onboarding table
ALTER TABLE public.partnership_onboarding ENABLE ROW LEVEL SECURITY;

-- Allow insert from anyone (since this can be after guest checkout)
CREATE POLICY "Anyone can insert their onboarding data" 
ON public.partnership_onboarding FOR INSERT 
WITH CHECK (true);

-- Only allow select for admin users
CREATE POLICY "Only admins can view onboarding data" 
ON public.partnership_onboarding FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND (user_roles.role = 'admin'::text OR user_roles.role = 'super_admin'::text)
  )
);
