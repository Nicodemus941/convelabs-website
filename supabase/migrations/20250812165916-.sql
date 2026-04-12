-- First drop existing policies that depend on tenant_id
DROP POLICY IF EXISTS "corporate_employees_select" ON public.corporate_employees;
DROP POLICY IF EXISTS "corporate_employees_modify" ON public.corporate_employees;
DROP POLICY IF EXISTS "corporate_employees_update" ON public.corporate_employees;
DROP POLICY IF EXISTS "corporate_employees_delete" ON public.corporate_employees;

-- Now remove tenant_id column
ALTER TABLE public.corporate_employees 
  DROP COLUMN IF EXISTS tenant_id;

-- Add new RLS policies without tenant references
CREATE POLICY "Admins can manage corporate employees" 
ON public.corporate_employees 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE users.id = auth.uid() 
    AND users.raw_user_meta_data->>'role' IN ('super_admin', 'admin', 'office_manager', 'billing')
  )
);

CREATE POLICY "Employees can view their own record" 
ON public.corporate_employees 
FOR SELECT 
USING (user_id = auth.uid() OR email = auth.email());