-- Create corporate demo requests table
CREATE TABLE public.corporate_demo_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  company TEXT NOT NULL,
  industry TEXT NOT NULL CHECK (industry IN ('healthcare', 'talent', 'sports', 'corporate')),
  preferred_time TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'scheduled', 'completed', 'cancelled'))
);

-- Enable RLS
ALTER TABLE public.corporate_demo_requests ENABLE ROW LEVEL SECURITY;

-- Allow system to insert demo requests
CREATE POLICY "System can insert demo requests" 
ON public.corporate_demo_requests 
FOR INSERT 
WITH CHECK (true);

-- Admins can view all demo requests
CREATE POLICY "Admins can view demo requests" 
ON public.corporate_demo_requests 
FOR SELECT 
USING (is_user_admin());

-- Admins can update demo request status
CREATE POLICY "Admins can update demo requests" 
ON public.corporate_demo_requests 
FOR UPDATE 
USING (is_user_admin());