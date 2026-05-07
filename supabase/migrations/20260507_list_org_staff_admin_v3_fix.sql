-- list_org_staff_admin v3
-- BUGS FIXED:
--   1. Referenced esl.created_at which doesn't exist on email_send_log.
--      RPC errored out → frontend silently rendered "0 people with portal
--      access" because the error result becomes an empty array client-side.
--   2. auth.users.email is varchar(255), function was returning text type.
--      Function-result type mismatch caused 42804 errors. Added ::text casts.
--   3. Some legacy auth users have user_metadata.org_id instead of
--      organization_id. WHERE clause now matches both.
--   4. Belt-and-suspenders admin check: accept either user_roles match
--      (has_any_role) OR JWT user_metadata.role.

CREATE OR REPLACE FUNCTION public.list_org_staff_admin(p_organization_id uuid)
RETURNS TABLE (
  user_id uuid, email text, full_name text, role_label text,
  invited_at timestamptz, last_sign_in_at timestamptz, confirmed_at timestamptz,
  last_invite_status text, last_invite_sent_at timestamptz, last_invite_error text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_org text;
  v_is_admin boolean;
BEGIN
  v_is_admin := public.has_any_role(ARRAY['super_admin','admin','owner'])
    OR lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner');

  v_caller_role := lower(COALESCE(auth.jwt()->'user_metadata'->>'role',''));
  v_caller_org  := COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'organization_id',
    auth.jwt() -> 'user_metadata' ->> 'org_id',
    auth.jwt() -> 'app_metadata' ->> 'organization_id'
  );

  IF NOT v_is_admin THEN
    IF v_caller_role NOT IN ('office_manager','provider')
       OR v_caller_org IS NULL
       OR v_caller_org <> p_organization_id::text THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    u.id::uuid,
    u.email::text,
    COALESCE(u.raw_user_meta_data->>'full_name',
             trim(COALESCE(u.raw_user_meta_data->>'firstName','') || ' ' ||
                  COALESCE(u.raw_user_meta_data->>'lastName','')))::text,
    (u.raw_user_meta_data->>'role_label')::text,
    u.invited_at,
    u.last_sign_in_at,
    u.confirmed_at,
    last_send.status::text,
    last_send.sent_at,
    last_send.last_error::text
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT esl.status, esl.sent_at, esl.last_error
    FROM public.email_send_log esl
    WHERE lower(esl.to_email) = lower(u.email::text)
      AND esl.email_type = 'org_manager_invite'
    ORDER BY COALESCE(esl.sent_at, esl.last_attempt_at) DESC NULLS LAST
    LIMIT 1
  ) last_send ON TRUE
  WHERE (
    u.raw_user_meta_data->>'organization_id' = p_organization_id::text
    OR u.raw_user_meta_data->>'org_id' = p_organization_id::text
  )
  AND COALESCE(u.raw_user_meta_data->>'role','') IN ('office_manager','provider')
  ORDER BY u.invited_at DESC NULLS LAST, u.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_org_staff_admin(uuid) TO authenticated;
