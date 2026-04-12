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

-- Insert corporate email templates into existing table
INSERT INTO public.email_templates (name, subject_template, body_template, description) VALUES
('corporate-welcome', 
 'Welcome to ConveLabs Corporate Wellness - {{company_name}}',
 '<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #dc2626; font-size: 28px; margin: 0;">Welcome to ConveLabs</h1>
      <p style="color: #666; font-size: 16px;">Corporate Wellness Platform</p>
    </div>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hello {{contact_name}},</h2>
      <p style="color: #555; line-height: 1.6;">
        Thank you for choosing ConveLabs for {{company_name}}''s corporate wellness program. 
        Your corporate account has been successfully created with ID: <strong>{{corporate_id}}</strong>
      </p>
    </div>

    <div style="margin-bottom: 30px;">
      <h3 style="color: #333;">Next Steps:</h3>
      <ol style="color: #555; line-height: 1.8;">
        <li><strong>Add Your Employees:</strong> You can add employees individually through your dashboard or upload them in bulk using our CSV template.</li>
        <li><strong>Employee Onboarding:</strong> Once added, each employee will receive a welcome email with their member ID and onboarding instructions.</li>
        <li><strong>Schedule Services:</strong> Employees can then book mobile phlebotomy services and health screenings through their accounts.</li>
      </ol>
    </div>

    <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
      <h3 style="margin: 0 0 10px 0;">Ready to Add Employees?</h3>
      <p style="margin: 0 0 15px 0;">Use our CSV template for bulk upload or add them individually</p>
      <a href="{{dashboard_url}}" style="display: inline-block; background: white; color: #dc2626; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Access Your Dashboard</a>
    </div>

    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; color: #666;">
      <p>Questions? Contact us at <a href="mailto:support@convelabs.com" style="color: #dc2626;">support@convelabs.com</a></p>
      <p style="font-size: 14px;">ConveLabs - Bringing Healthcare to Your Workplace</p>
    </div>
  </body></html>',
 'Welcome email sent to corporate account holders after signup'),

('corporate-employee-welcome',
 'Welcome to ConveLabs - Your Workplace Wellness Benefits',
 '<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #dc2626; font-size: 28px; margin: 0;">Welcome to ConveLabs</h1>
      <p style="color: #666; font-size: 16px;">Your Workplace Wellness Platform</p>
    </div>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hello {{first_name}} {{last_name}},</h2>
      <p style="color: #555; line-height: 1.6;">
        Great news! {{company_name}} has enrolled you in the ConveLabs Corporate Wellness Program. 
        You now have access to convenient, on-site healthcare services.
      </p>
    </div>

    <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
      <h3 style="margin: 0 0 10px 0;">Your Member Information:</h3>
      <p style="margin: 0; font-size: 18px;"><strong>Member ID: {{member_id}}</strong></p>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Keep this ID handy for booking appointments</p>
    </div>

    <div style="margin-bottom: 30px;">
      <h3 style="color: #333;">Complete Your Onboarding:</h3>
      <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
        To start using your wellness benefits, please complete your profile setup by clicking the link below:
      </p>
      <div style="text-align: center;">
        <a href="{{onboarding_url}}" style="display: inline-block; background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Complete Your Profile</a>
      </div>
    </div>

    <div style="margin-bottom: 30px;">
      <h3 style="color: #333;">Your Benefits Include:</h3>
      <ul style="color: #555; line-height: 1.8;">
        <li>On-site mobile phlebotomy services</li>
        <li>Executive health screenings</li>
        <li>Preventive care coordination</li>
        <li>HIPAA-compliant health platform</li>
        {{#if executive_upgrade}}<li><strong>Executive Benefits:</strong> Priority scheduling & comprehensive health assessments</li>{{/if}}
      </ul>
    </div>

    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; color: #666;">
      <p>Questions? Contact us at <a href="mailto:support@convelabs.com" style="color: #dc2626;">support@convelabs.com</a></p>
      <p style="font-size: 14px;">ConveLabs - Bringing Healthcare to Your Workplace</p>
    </div>
  </body></html>',
 'Welcome email sent to corporate employees when invited to the platform')
ON CONFLICT (name) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  description = EXCLUDED.description,
  updated_at = now();

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