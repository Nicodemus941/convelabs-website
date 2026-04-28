-- 2026-04-28
-- block_org_email_on_appointment used to RAISE EXCEPTION when patient_email
-- matched an org's contact/billing email. That made sense as a HIPAA guard
-- against admins typing the wrong email — but it ALSO silently killed every
-- online booking where an org rep booked themselves a personal visit OR
-- where the org and the contact share an email. Stripe webhook completed,
-- payment cleared, but the appointment row was never created. Patient
-- showed up to nothing on the calendar. Worst possible failure mode.
--
-- New behavior: when collision detected, AUTO-ROUTE to org-billed instead
-- of blocking:
--   - if billed_to is already 'patient' (default), flip to 'org'
--   - stamp organization_id with the matched org
--   - keep patient_email so the org rep still gets the confirmation
-- This preserves the original HIPAA intent (patient PHI doesn't bleed into
-- a different org's data) while not silently dropping bookings.
--
-- Caught in production 2026-04-28 17:54 — Clinical Associates of Orlando
-- booked online via smartin@clinicalassociatesorlando.com. Stripe charged
-- successfully (event evt_1TRFqUAPnMg8iHar0UsBw4WL). Webhook returned 200
-- but the appointment was never inserted. Patient ghosted from calendar.

CREATE OR REPLACE FUNCTION public.block_org_email_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  matched_org_id uuid;
  matched_org_name text;
BEGIN
  IF NEW.patient_email IS NULL OR NEW.patient_email = '' OR NEW.patient_email LIKE '%+%' THEN
    RETURN NEW;
  END IF;

  SELECT id, name INTO matched_org_id, matched_org_name
    FROM organizations
   WHERE (lower(NEW.patient_email) = lower(contact_email)
       OR lower(NEW.patient_email) = lower(billing_email))
     AND is_active = true
   LIMIT 1;

  IF matched_org_id IS NULL THEN
    RETURN NEW;  -- no collision, proceed normally
  END IF;

  -- Collision detected. Auto-route to org-billed if not already.
  IF NEW.billed_to IS DISTINCT FROM 'org' OR NEW.organization_id IS NULL THEN
    NEW.billed_to := 'org';
    NEW.organization_id := matched_org_id;
    NEW.notes := COALESCE(NEW.notes || E'\n', '') ||
      '[auto-routed to org-billed: email ' || NEW.patient_email ||
      ' belongs to ' || matched_org_name || ' — booked via online checkout]';
    RAISE NOTICE 'auto-routed appointment to org % (%) on email collision', matched_org_name, matched_org_id;
  END IF;

  RETURN NEW;
END;
$function$;
