-- WELCOME25 — first-time-patient promo code, $25 off the first blood draw.
--
-- Stricter first-time enforcement: a patient is considered "returning"
-- (and therefore ineligible) if ANY of email / phone / (first+last name)
-- matches an existing record in either appointments or tenant_patients.
-- Phone matching ignores formatting (compares last 10 digits).
--
-- Apply via: supabase db push  (or paste in the SQL editor)

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

-- Helper: normalize a phone string to its last 10 digits.
CREATE OR REPLACE FUNCTION public._phone_last10(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    ELSE right(regexp_replace(p, '\D', '', 'g'), 10)
  END;
$$;

-- 3. Drop the old single-arg signature (if present) so the new one is unambiguous.
DROP FUNCTION IF EXISTS public.validate_promo_code(text, text);
DROP FUNCTION IF EXISTS public.validate_promo_code(text, text, text, text, text);

-- 4. New validate_promo_code with name + phone + email matching
CREATE OR REPLACE FUNCTION public.validate_promo_code(
  p_code text,
  p_email text,
  p_phone text DEFAULT '',
  p_first_name text DEFAULT '',
  p_last_name text DEFAULT ''
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
  v_phone_last10 text;
  v_first_norm text;
  v_last_norm text;
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

  -- ─── First-time-only: reject on ANY identity match ──────────────
  -- Email, phone (last 10 digits), or full-name match against either
  -- the appointments ledger OR the tenant_patients roster makes the
  -- buyer "returning" and ineligible. This kills the trivial dodge of
  -- swapping email/casing/format to re-claim the new-patient discount.
  IF v_row.first_time_only = true THEN
    v_phone_last10 := public._phone_last10(p_phone);
    v_first_norm   := lower(trim(coalesce(p_first_name, '')));
    v_last_norm    := lower(trim(coalesce(p_last_name, '')));

    -- Match in appointments
    SELECT COUNT(*) INTO v_prior_count
    FROM public.appointments a
    WHERE (
        (lower(a.email) = lower(p_email) AND length(p_email) > 0)
     OR (v_phone_last10 IS NOT NULL AND length(v_phone_last10) = 10
          AND public._phone_last10(a.phone) = v_phone_last10)
     OR (length(v_first_norm) > 0 AND length(v_last_norm) > 0
          AND lower(trim(a.first_name)) = v_first_norm
          AND lower(trim(a.last_name))  = v_last_norm)
    )
    AND a.status IN ('completed', 'specimen_delivered', 'in_progress', 'arrived', 'en_route', 'confirmed', 'scheduled')
    AND a.payment_status IN ('paid', 'succeeded');

    IF v_prior_count > 0 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'not_first_time');
    END IF;

    -- Match in tenant_patients roster (covers patients who exist in our
    -- system but haven't yet paid for an appointment, e.g. they were
    -- imported, family-membered, or had a previous voided visit).
    SELECT COUNT(*) INTO v_prior_count
    FROM public.tenant_patients tp
    WHERE (
        (lower(tp.email) = lower(p_email) AND length(p_email) > 0)
     OR (v_phone_last10 IS NOT NULL AND length(v_phone_last10) = 10
          AND public._phone_last10(tp.phone) = v_phone_last10)
     OR (length(v_first_norm) > 0 AND length(v_last_norm) > 0
          AND lower(trim(tp.first_name)) = v_first_norm
          AND lower(trim(tp.last_name))  = v_last_norm)
    );

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

GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, text, text, text, text) TO anon, authenticated, service_role;
