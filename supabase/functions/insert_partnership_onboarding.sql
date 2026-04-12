
-- Create a function to insert partnership onboarding data
CREATE OR REPLACE FUNCTION public.insert_partnership_onboarding(
  p_session_id TEXT,
  p_practice_name TEXT,
  p_practice_description TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_primary_color TEXT,
  p_secondary_color TEXT,
  p_logo_path TEXT,
  p_services TEXT,
  p_preferred_domain TEXT,
  p_number_of_staff_accounts INTEGER,
  p_additional_notes TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.partnership_onboarding (
    session_id,
    practice_name,
    practice_description,
    contact_email,
    contact_phone,
    primary_color,
    secondary_color,
    logo_path,
    services,
    preferred_domain,
    number_of_staff_accounts,
    additional_notes
  ) VALUES (
    p_session_id,
    p_practice_name,
    p_practice_description,
    p_contact_email,
    p_contact_phone,
    p_primary_color,
    p_secondary_color,
    p_logo_path,
    p_services,
    p_preferred_domain,
    p_number_of_staff_accounts,
    p_additional_notes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to the function
GRANT EXECUTE ON FUNCTION public.insert_partnership_onboarding TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_partnership_onboarding TO anon;
