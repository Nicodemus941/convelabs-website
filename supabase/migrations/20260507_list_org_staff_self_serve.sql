-- list_org_staff_admin v2 — allow org self-serve
--
-- Original gate: super_admin / admin / owner only.
-- Now: also allow when the calling user has user_metadata.role IN
-- ('office_manager','provider') AND user_metadata.organization_id matches
-- the requested org. That lets practices manage their own portal staff
-- without involving the platform admin.
--
-- Cross-org snooping is still blocked: a provider at Org A asking for
-- Org B's staff list gets 403.

CREATE OR REPLACE FUNCTION public.list_org_staff_admin(p_organization_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  role_label text,
  invited_at timestamptz,
  last_sign_in_at timestamptz,
  confirmed_at timestamptz,
  last_invite_status text,
  last_invite_sent_at timestamptz,
  last_invite_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_org text;
  v_is_admin boolean;
BEGIN
  v_is_admin := public.has_any_role(ARRAY['super_admin','admin','owner']);

  v_caller_role := auth.jwt() -> 'user_metadata' ->> 'role';
  v_caller_org  := auth.jwt() -> 'user_metadata' ->> 'organization_id';

  IF NOT v_is_admin THEN
    IF v_caller_role NOT IN ('office_manager','provider')
       OR v_caller_org IS NULL
       OR v_caller_org <> p_organization_id::text THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name',
             trim(COALESCE(u.raw_user_meta_data->>'firstName','') || ' ' ||
                  COALESCE(u.raw_user_meta_data->>'lastName','')))::text AS full_name,
    (u.raw_user_meta_data->>'role_label')::text AS role_label,
    u.invited_at,
    u.last_sign_in_at,
    u.confirmed_at,
    last_send.status AS last_invite_status,
    last_send.sent_at AS last_invite_sent_at,
    last_send.last_error AS last_invite_error
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT esl.status, esl.sent_at, esl.last_error
    FROM public.email_send_log esl
    WHERE lower(esl.to_email) = lower(u.email)
      AND esl.email_type = 'org_manager_invite'
    ORDER BY COALESCE(esl.sent_at, esl.last_attempt_at, esl.created_at) DESC NULLS LAST
    LIMIT 1
  ) last_send ON TRUE
  WHERE u.raw_user_meta_data->>'organization_id' = p_organization_id::text
    AND COALESCE(u.raw_user_meta_data->>'role','') IN ('office_manager','provider')
  ORDER BY u.invited_at DESC NULLS LAST, u.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_org_staff_admin(uuid) TO authenticated;
