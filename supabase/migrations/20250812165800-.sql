-- Remove tenant references from corporate employees since this is ConveLabs only
ALTER TABLE public.corporate_employees 
  DROP COLUMN IF EXISTS tenant_id;

-- Add any missing RLS policies for corporate employees
CREATE POLICY IF NOT EXISTS "Admins can manage corporate employees" 
ON public.corporate_employees 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE users.id = auth.uid() 
    AND users.raw_user_meta_data->>'role' IN ('super_admin', 'admin', 'office_manager', 'billing')
  )
);

CREATE POLICY IF NOT EXISTS "Employees can view their own record" 
ON public.corporate_employees 
FOR SELECT 
USING (user_id = auth.uid() OR email = auth.email());