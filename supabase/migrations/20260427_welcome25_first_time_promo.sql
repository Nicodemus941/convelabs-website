-- WELCOME25 — first-time-patient promo code, $25 off the first blood draw.
--
-- Adds:
--   • promo_codes.first_time_only flag
--   • Seeds the WELCOME25 code (active, $25 off, 1 use per email)
--   • Updates validate_promo_code() to reject the code if the email has
--     any prior paid appointment, so it stays a true new-patient incentive.
--
-- Apply via: supabase db push  (or run in the SQL editor)

-- 1. first_time_only flag (idempotent)
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS first_time_only boolean NOT NULL DEFAULT false;

-- 2. Seed / upsert the code
INSERT INTO public.promo_codes (
  code, discount_type, discount_value, active, first_time_only,
  max_uses_per_email, description, created_at
)
VALUES (
  'WELCOME25', 'fixed_cents', 2500, true, true,
  1, '$25 off your first ConveLabs visit (first-time patients only)', now()
)
ON CONFLICT (code) DO UPDATE SET
  discount_type      = EXCLUDED.discount_type,
  discount_value     = EXCLUDED.discount_value,
  active             = EXCLUDED.active,
  first_time_only    = EXCLUDED.first_time_only,
  max_uses_per_email = EXCLUDED.max_uses_per_email,
  description        = EXCLUDED.description;

-- 3. Update validate_promo_code to enforce first_time_only
CREATE OR REPLACE FUNCTION public.validate_promo_code(
  p_code text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.promo_codes%ROWTYPE;
  v_uses_by_email int;
  v_total_uses int;
  v_prior_count int;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_row FROM public.promo_codes
  WHERE upper(code) = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_row.active = false THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  IF v_row.allowed_emails IS NOT NULL AND array_length(v_row.allowed_emails, 1) > 0 THEN
    IF NOT (lower(p_email) = ANY (SELECT lower(unnest(v_row.allowed_emails)))) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'email_not_authorized');
    END IF;
  END IF;

  IF v_row.max_uses_per_email IS NOT NULL AND v_row.max_uses_per_email > 0 THEN
    SELECT COUNT(*) INTO v_uses_by_email
    FROM public.promo_code_redemptions
    WHERE promo_code_id = v_row.id AND lower(email) = lower(p_email);
    IF v_uses_by_email >= v_row.max_uses_per_email THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'max_uses_per_email_reached');
    END IF;
  END IF;

  IF v_row.max_uses IS NOT NULL AND v_row.max_uses > 0 THEN
    SELECT COUNT(*) INTO v_total_uses
    FROM public.promo_code_redemptions
    WHERE promo_code_id = v_row.id;
    IF v_total_uses >= v_row.max_uses THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'max_uses_reached');
    END IF;
  END IF;

  -- First-time-only enforcement: any prior real appointment on this
  -- email blocks the code. Treats anything that's already in the
  -- system + paid as a prior visit (covers in-flight appointments
  -- before they reach 'completed' status).
  IF v_row.first_time_only = true THEN
    SELECT COUNT(*) INTO v_prior_count
    FROM public.appointments a
    WHERE lower(a.email) = lower(p_email)
      AND a.status IN ('completed', 'specimen_delivered', 'in_progress', 'arrived', 'en_route', 'confirmed', 'scheduled')
      AND a.payment_status IN ('paid', 'succeeded');
    IF v_prior_count > 0 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'not_first_time');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'code_id', v_row.id,
    'code', v_row.code,
    'discount_type', v_row.discount_type,
    'discount_value', v_row.discount_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, text) TO anon, authenticated, service_role;
