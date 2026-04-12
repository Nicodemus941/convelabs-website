-- Fix infinite recursion in user_tenants RLS policies
-- First, let's check current policies and recreate them properly

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view their own tenant memberships" ON public.user_tenants;
DROP POLICY IF EXISTS "Users can update their own tenant membership" ON public.user_tenants;
DROP POLICY IF EXISTS "Users can join tenants" ON public.user_tenants;

-- Create corrected RLS policies that won't cause infinite recursion
CREATE POLICY "Users can view their own tenant memberships" 
ON public.user_tenants 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own tenant membership" 
ON public.user_tenants 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage tenant memberships" 
ON public.user_tenants 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE users.id = auth.uid() 
    AND users.raw_user_meta_data->>'role' IN ('super_admin', 'admin', 'owner')
  )
);

-- Ensure RLS is enabled
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;