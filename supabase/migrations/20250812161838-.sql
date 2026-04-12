-- 1) Extend tenants for corporate subscription tracking
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_corporate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seats_purchased integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seats_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS executive_upgrades_purchased integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS corporate_overage_price integer NOT NULL DEFAULT 15000;

-- Constrain billing_interval to valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_billing_interval_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_billing_interval_check
      CHECK (billing_interval IN ('monthly','annual'));
  END IF;
END $$;

-- 2) Corporate employees table
CREATE TABLE IF NOT EXISTS public.corporate_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  employee_id text UNIQUE,
  status text NOT NULL DEFAULT 'invited', -- invited | active | inactive
  executive_upgrade boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_corporate_employees_tenant ON public.corporate_employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_corporate_employees_user ON public.corporate_employees(user_id);

-- 2a) Generate readable employee IDs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'corporate_employee_seq'
  ) THEN
    CREATE SEQUENCE corporate_employee_seq START 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_corporate_employee_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_val integer;
  year_suffix text;
BEGIN
  next_val := nextval('corporate_employee_seq');
  year_suffix := EXTRACT(YEAR FROM now())::text;
  RETURN 'EMP-' || year_suffix || '-' || LPAD(next_val::text, 5, '0');
END;$$;

CREATE OR REPLACE FUNCTION public.set_corporate_employee_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employee_id IS NULL THEN
    NEW.employee_id := public.generate_corporate_employee_id();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_set_corporate_employee_id ON public.corporate_employees;
CREATE TRIGGER trg_set_corporate_employee_id
BEFORE INSERT OR UPDATE ON public.corporate_employees
FOR EACH ROW
EXECUTE FUNCTION public.set_corporate_employee_id();

-- 3) Enable RLS and policies
ALTER TABLE public.corporate_employees ENABLE ROW LEVEL SECURITY;

-- Allow users to view employees of their tenant or their own record
DROP POLICY IF EXISTS corporate_employees_select ON public.corporate_employees;
CREATE POLICY corporate_employees_select ON public.corporate_employees
FOR SELECT USING (
  public.user_belongs_to_tenant(tenant_id) OR auth.uid() = user_id
);

-- Allow admins/office managers/owners to manage employees
DROP POLICY IF EXISTS corporate_employees_modify ON public.corporate_employees;
CREATE POLICY corporate_employees_modify ON public.corporate_employees
FOR INSERT TO authenticated
WITH CHECK (public.is_user_admin());

DROP POLICY IF EXISTS corporate_employees_update ON public.corporate_employees;
CREATE POLICY corporate_employees_update ON public.corporate_employees
FOR UPDATE TO authenticated
USING (public.is_user_admin())
WITH CHECK (public.is_user_admin());

DROP POLICY IF EXISTS corporate_employees_delete ON public.corporate_employees;
CREATE POLICY corporate_employees_delete ON public.corporate_employees
FOR DELETE TO authenticated
USING (public.is_user_admin());

-- 4) Keep tenants RLS as-is; indexes for seats and corporate flags (optional but helpful)
CREATE INDEX IF NOT EXISTS idx_tenants_is_corporate ON public.tenants(is_corporate);
CREATE INDEX IF NOT EXISTS idx_tenants_billing_interval ON public.tenants(billing_interval);
