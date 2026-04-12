
CREATE OR REPLACE FUNCTION public.get_user_email(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
BEGIN
  -- Only allow this to be called by users with admin role
  IF NOT (EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (
      raw_user_meta_data->>'role' = 'admin' OR
      raw_user_meta_data->>'role' = 'super_admin'
    )
  )) THEN
    RAISE EXCEPTION 'Permission denied. Only admin users can access this function.';
  END IF;

  -- Get the email from auth.users
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = user_id;
  
  RETURN v_email;
END;
$$;
