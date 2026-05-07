-- discover_or_link_provider_org v2 — multi-signal dedupe
--
-- Bug: Restoration Place got auto-registered THREE times. Different lab
-- orders from the same practice listed the ordering provider's name as
-- the "practice" (Christelle Renta NP-C, then Shearey Nancy on a
-- different order), so name-based dedupe missed every time even though
-- address + phone were identical.
--
-- Fix: try multiple signals before creating a new org. Priority order:
--   1. NPI match (strongest — NPI uniquely identifies a provider/practice).
--   2. Phone match (after stripping non-digits).
--   3. Street + zip (or street + city) match — same physical practice.
--   4. Original normalized-name + zip (kept for back-compat).
--   5. Original normalized-name (kept for back-compat).
--
-- All signals prefer real partners (is_active=true, NOT discovered_from_lab_order)
-- over previously-discovered duplicates.

CREATE OR REPLACE FUNCTION public.discover_or_link_provider_org(
  p_appointment_id uuid,
  p_practice_name text,
  p_address_street text DEFAULT NULL,
  p_address_city text DEFAULT NULL,
  p_address_state text DEFAULT NULL,
  p_address_zip text DEFAULT NULL,
  p_office_phone text DEFAULT NULL,
  p_ordering_physician text DEFAULT NULL,
  p_npi text DEFAULT NULL,
  p_ocr_sample text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_org_id uuid;
  v_existing_match uuid;
  v_match_reason text;
  v_normalized_name text;
  v_normalized_phone text;
  v_normalized_street text;
BEGIN
  IF p_practice_name IS NULL OR length(trim(p_practice_name)) < 3 THEN
    RETURN jsonb_build_object('action','skipped','reason','no_practice_name');
  END IF;

  v_normalized_name := lower(regexp_replace(p_practice_name, '[^a-zA-Z0-9 ]', '', 'g'));
  v_normalized_phone := CASE WHEN p_office_phone IS NULL THEN NULL
                             ELSE regexp_replace(p_office_phone, '[^0-9]', '', 'g')
                        END;
  v_normalized_street := CASE WHEN p_address_street IS NULL THEN NULL
                              ELSE trim(regexp_replace(
                                regexp_replace(lower(p_address_street),
                                  '\s+(suite|ste|unit|apt|#)\s*\S+\s*$', '', 'i'),
                                '[^a-z0-9 ]', '', 'g'))
                         END;

  -- 1. NPI match (strongest)
  IF p_npi IS NOT NULL AND length(trim(p_npi)) = 10 THEN
    SELECT id INTO v_existing_match FROM organizations
    WHERE npi = p_npi
    ORDER BY is_active DESC NULLS LAST, discovered_from_lab_order ASC, created_at ASC
    LIMIT 1;
    IF v_existing_match IS NOT NULL THEN v_match_reason := 'npi'; END IF;
  END IF;

  -- 2. Phone match
  IF v_existing_match IS NULL AND v_normalized_phone IS NOT NULL AND length(v_normalized_phone) >= 10 THEN
    SELECT id INTO v_existing_match FROM organizations
    WHERE regexp_replace(COALESCE(office_phone, contact_phone, ''), '[^0-9]', '', 'g') = v_normalized_phone
    ORDER BY is_active DESC NULLS LAST, discovered_from_lab_order ASC, created_at ASC
    LIMIT 1;
    IF v_existing_match IS NOT NULL THEN v_match_reason := 'phone'; END IF;
  END IF;

  -- 3. Street + (zip OR city) match
  IF v_existing_match IS NULL AND v_normalized_street IS NOT NULL AND length(v_normalized_street) >= 5 THEN
    SELECT id INTO v_existing_match FROM organizations
    WHERE
      trim(regexp_replace(
        regexp_replace(lower(COALESCE(address_street, '')),
          '\s+(suite|ste|unit|apt|#)\s*\S+\s*$', '', 'i'),
        '[^a-z0-9 ]', '', 'g')) = v_normalized_street
      AND (
        (p_address_zip IS NOT NULL AND address_zip = p_address_zip)
        OR (p_address_city IS NOT NULL AND lower(address_city) = lower(p_address_city))
      )
    ORDER BY is_active DESC NULLS LAST, discovered_from_lab_order ASC, created_at ASC
    LIMIT 1;
    IF v_existing_match IS NOT NULL THEN v_match_reason := 'address'; END IF;
  END IF;

  -- 4. Normalized name + zip
  IF v_existing_match IS NULL THEN
    SELECT id INTO v_existing_match FROM organizations
    WHERE lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g')) = v_normalized_name
      AND (p_address_zip IS NULL OR address_zip = p_address_zip OR address_zip IS NULL)
    ORDER BY is_active DESC NULLS LAST, discovered_from_lab_order ASC, created_at ASC
    LIMIT 1;
    IF v_existing_match IS NOT NULL THEN v_match_reason := 'name_zip'; END IF;
  END IF;

  -- 5. Normalized name only
  IF v_existing_match IS NULL THEN
    SELECT id INTO v_existing_match FROM organizations
    WHERE lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g')) = v_normalized_name
    ORDER BY is_active DESC NULLS LAST, discovered_from_lab_order ASC, created_at ASC
    LIMIT 1;
    IF v_existing_match IS NOT NULL THEN v_match_reason := 'name'; END IF;
  END IF;

  IF v_existing_match IS NOT NULL THEN
    INSERT INTO appointment_organizations (appointment_id, organization_id, role, added_by)
    VALUES (p_appointment_id, v_existing_match, 'cc', NULL)
    ON CONFLICT (appointment_id, organization_id) DO NOTHING;

    UPDATE organizations
    SET referral_count = COALESCE(referral_count, 0) + 1,
        last_referral_at = now(),
        ordering_physician = COALESCE(ordering_physician, p_ordering_physician),
        office_phone = COALESCE(office_phone, p_office_phone),
        npi = COALESCE(npi, p_npi),
        address_street = COALESCE(address_street, p_address_street),
        address_city = COALESCE(address_city, p_address_city),
        address_state = COALESCE(address_state, p_address_state),
        address_zip = COALESCE(address_zip, p_address_zip)
    WHERE id = v_existing_match;

    RETURN jsonb_build_object('action','linked','org_id',v_existing_match,'match_reason',v_match_reason);
  END IF;

  -- Create a new discovered org
  INSERT INTO organizations (
    name, source, discovered_from_lab_order, outreach_status,
    first_discovered_at, last_referral_at, referral_count,
    ordering_physician, office_phone, npi,
    address_street, address_city, address_state, address_zip,
    discovered_ocr_sample, is_active
  ) VALUES (
    p_practice_name, 'discovered_from_ocr', true, 'untouched',
    now(), now(), 1,
    p_ordering_physician, p_office_phone, p_npi,
    p_address_street, p_address_city, p_address_state, p_address_zip,
    left(COALESCE(p_ocr_sample, ''), 500), false
  )
  RETURNING id INTO v_org_id;

  INSERT INTO appointment_organizations (appointment_id, organization_id, role, added_by)
  VALUES (p_appointment_id, v_org_id, 'cc', NULL);

  RETURN jsonb_build_object('action','created','org_id',v_org_id);
END;
$function$;
