-- Remove tenant references from corporate employees since this is ConveLabs only
ALTER TABLE public.corporate_employees 
  DROP COLUMN IF EXISTS tenant_id;

-- Add RLS policies for corporate employees
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Admins can manage corporate employees" ON public.corporate_employees;
  DROP POLICY IF EXISTS "Employees can view their own record" ON public.corporate_employees;
  
  -- Create new policies
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
END $$;