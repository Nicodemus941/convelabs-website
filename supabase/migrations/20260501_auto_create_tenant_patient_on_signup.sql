-- Auto-create a tenant_patients stub the moment a patient registers, so
-- their auth.users row never exists in isolation. Fields are populated
-- from raw_user_meta_data; everything else stays NULL until the patient
-- fills it via the booking form / Complete-Profile card / OCR pipeline
-- back-fills it later. Idempotent, race-safe, NOT-NULL-safe, org-email-aware.
--
-- Hormozi: don't ask MORE at signup — auto-create the empty chart and
-- let data trickle in exactly when each piece unlocks something.

CREATE OR REPLACE FUNCTION public.auto_create_tenant_patient_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text;
  v_first text;
  v_last text;
  v_phone text;
  v_dob date;
  v_master_tenant uuid;
  v_email_lower text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'patient');
  IF v_role NOT IN ('patient', '') AND v_role IS NOT NULL THEN RETURN NEW; END IF;

  v_email_lower := LOWER(NEW.email);

  -- Skip if email belongs to an organization (block_org_email_on_patient
  -- trigger correctly rejects them; they're providers/managers, not patients)
  IF EXISTS (
    SELECT 1 FROM public.organizations
    WHERE LOWER(contact_email) = v_email_lower
       OR LOWER(manager_email) = v_email_lower
       OR LOWER(front_desk_email) = v_email_lower
  ) THEN RETURN NEW; END IF;

  v_first := NULLIF(TRIM(NEW.raw_user_meta_data->>'firstName'), '');
  v_last  := NULLIF(TRIM(NEW.raw_user_meta_data->>'lastName'), '');
  v_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  BEGIN v_dob := (NEW.raw_user_meta_data->>'date_of_birth')::date;
  EXCEPTION WHEN OTHERS THEN v_dob := NULL; END;

  IF v_first IS NULL THEN
    DECLARE v_full text := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
    BEGIN
      IF v_full IS NOT NULL THEN
        v_first := split_part(v_full, ' ', 1);
        v_last := COALESCE(v_last, NULLIF(TRIM(SUBSTRING(v_full FROM POSITION(' ' IN v_full || ' ') + 1)), ''));
      END IF;
    END;
  END IF;
  IF v_first IS NULL THEN v_first := COALESCE(split_part(NEW.email, '@', 1), 'Patient'); END IF;
  IF v_last IS NULL THEN v_last := ''; END IF;

  SELECT id INTO v_master_tenant FROM public.tenants ORDER BY created_at LIMIT 1;

  INSERT INTO public.tenant_patients
    (user_id, tenant_id, first_name, last_name, email, phone, date_of_birth, is_active)
  VALUES
    (NEW.id, v_master_tenant, v_first, v_last, v_email_lower, v_phone, v_dob, true)
  ON CONFLICT DO NOTHING;

  -- Link existing-by-email tenant_patients rows that aren't yet linked
  -- (covers the migrated-patient case where the auth user is created
  -- via invite-patient AFTER the tenant_patients row already exists).
  UPDATE public.tenant_patients
     SET user_id = NEW.id, updated_at = now()
   WHERE LOWER(email) = v_email_lower AND user_id IS NULL;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the auth signup if patient-chart insert glitches.
  -- Surface to logs for the auto-heal cron to pick up.
  INSERT INTO public.error_logs (error_type, component, action, error_message, user_email)
  VALUES ('auth_signup_chart','auto_create_tenant_patient_on_signup','insert', SQLERRM, NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_tenant_patient ON auth.users;
CREATE TRIGGER trg_auto_create_tenant_patient
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_tenant_patient_on_signup();

-- Backfill: heal existing ghost auth.users (role='patient', no chart)
WITH master_tenant AS (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1),
ghosts AS (
  SELECT u.id, u.email, u.raw_user_meta_data FROM auth.users u
  WHERE u.email IS NOT NULL
    AND u.email NOT ILIKE '%convelabs.com'
    AND u.email NOT ILIKE '%glowsuite%'
    AND u.email NOT ILIKE '%example.com'
    AND COALESCE(u.raw_user_meta_data->>'role','patient') = 'patient'
    AND NOT EXISTS (SELECT 1 FROM public.tenant_patients tp WHERE tp.user_id = u.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE LOWER(o.contact_email) = LOWER(u.email)
         OR LOWER(o.manager_email) = LOWER(u.email)
         OR LOWER(o.front_desk_email) = LOWER(u.email)
    )
),
linked AS (
  UPDATE public.tenant_patients tp
     SET user_id = g.id, updated_at = now()
    FROM ghosts g
   WHERE LOWER(tp.email) = LOWER(g.email) AND tp.user_id IS NULL
  RETURNING tp.id, g.id as user_id
)
INSERT INTO public.tenant_patients
  (user_id, tenant_id, first_name, last_name, email, phone, date_of_birth, is_active)
SELECT
  g.id,
  (SELECT id FROM master_tenant),
  COALESCE(
    NULLIF(TRIM(g.raw_user_meta_data->>'firstName'), ''),
    NULLIF(split_part(NULLIF(TRIM(g.raw_user_meta_data->>'full_name'), ''), ' ', 1), ''),
    split_part(g.email, '@', 1)
  ),
  COALESCE(NULLIF(TRIM(g.raw_user_meta_data->>'lastName'), ''), ''),
  LOWER(g.email),
  NULLIF(TRIM(g.raw_user_meta_data->>'phone'), ''),
  CASE WHEN g.raw_user_meta_data->>'date_of_birth' ~ '^\d{4}-\d{2}-\d{2}$'
       THEN (g.raw_user_meta_data->>'date_of_birth')::date ELSE NULL END,
  true
FROM ghosts g
WHERE NOT EXISTS (SELECT 1 FROM linked l WHERE l.user_id = g.id)
  AND NOT EXISTS (SELECT 1 FROM public.tenant_patients tp WHERE LOWER(tp.email) = LOWER(g.email));
