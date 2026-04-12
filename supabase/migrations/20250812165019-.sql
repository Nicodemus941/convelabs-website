-- Add invitation columns to corporate_employees for invite flow
ALTER TABLE public.corporate_employees
  ADD COLUMN IF NOT EXISTS invitation_token text,
  ADD COLUMN IF NOT EXISTS invitation_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_corporate_employees_invitation_token
  ON public.corporate_employees (invitation_token);
