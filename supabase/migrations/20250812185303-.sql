-- Create corporate accounts table with auto-generated corporate ID
CREATE TABLE public.corporate_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corporate_id TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  billing_address JSONB,
  subscription_plan TEXT NOT NULL DEFAULT 'corporate_seat',
  employee_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Generate corporate ID function
CREATE OR REPLACE FUNCTION generate_corporate_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_val INTEGER;
  year_suffix TEXT;
BEGIN
  -- Create sequence if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'corporate_id_seq') THEN
    CREATE SEQUENCE corporate_id_seq START 1;
  END IF;
  
  next_val := nextval('corporate_id_seq');
  year_suffix := EXTRACT(YEAR FROM now())::text;
  RETURN 'CORP-' || year_suffix || '-' || LPAD(next_val::text, 4, '0');
END;
$$;

-- Trigger to auto-assign corporate ID
CREATE OR REPLACE FUNCTION set_corporate_id()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.corporate_id IS NULL THEN
    NEW.corporate_id := generate_corporate_id();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_corporate_id
  BEFORE INSERT ON public.corporate_accounts
  FOR EACH ROW EXECUTE FUNCTION set_corporate_id();

-- Update corporate_employees table to link to corporate accounts
ALTER TABLE public.corporate_employees 
ADD COLUMN IF NOT EXISTS corporate_account_id UUID REFERENCES public.corporate_accounts(id),
ADD COLUMN IF NOT EXISTS member_id TEXT;

-- Generate member ID for corporate employees
CREATE OR REPLACE FUNCTION generate_corporate_member_id(corporate_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  employee_count INTEGER;
BEGIN
  -- Get current employee count for this corporate account
  SELECT COUNT(*) INTO employee_count 
  FROM corporate_employees ce
  JOIN corporate_accounts ca ON ce.corporate_account_id = ca.id
  WHERE ca.corporate_id = corporate_id;
  
  RETURN corporate_id || '-EMP-' || LPAD((employee_count + 1)::text, 3, '0');
END;
$$;

-- Enable RLS
ALTER TABLE public.corporate_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for corporate accounts
CREATE POLICY "Users can view their own corporate account" 
ON public.corporate_accounts 
FOR SELECT 
USING (contact_email = auth.email());

CREATE POLICY "Admins can manage all corporate accounts" 
ON public.corporate_accounts 
FOR ALL 
USING (is_user_admin());

CREATE POLICY "System can insert corporate accounts" 
ON public.corporate_accounts 
FOR INSERT 
WITH CHECK (true);

-- Update RLS for corporate employees to include corporate account access
CREATE POLICY "Corporate account holders can view their employees" 
ON public.corporate_employees 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM corporate_accounts ca 
  WHERE ca.id = corporate_employees.corporate_account_id 
  AND ca.contact_email = auth.email()
));