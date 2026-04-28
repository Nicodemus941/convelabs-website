-- 2026-04-28
-- Plus-aliased org emails (like elitemedicalconcierge+roy.parker@gmail.com)
-- are still the same RFC 5322 mailbox as the base address. Elite Medical
-- Concierge uses this pattern intentionally to route per-patient Stripe
-- invoices through their own inbox while keeping the org tag visible.
--
-- The previous trigger version short-circuited on '%+%' to "be safe" but
-- that meant Roy Parker's $72.25 visit booked under
-- elitemedicalconcierge+roy.parker@gmail.com went patient-billed instead
-- of org-billed (Elite Medical's actual policy). Stripe charged Roy's
-- card; the org never saw it in their portal.
--
-- New behavior: strip +tag before comparing to org contact_email/
-- billing_email so plus-aliased addresses match the same way the email
-- provider routes them.

CREATE OR REPLACE FUNCTION public.block_org_email_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  matched_org_id uuid;
  matched_org_name text;
  normalized_email text;
BEGIN
  IF NEW.patient_email IS NULL OR NEW.patient_email = '' THEN
    RETURN NEW;
  END IF;

  -- Strip +tag from email: foo+bar@x.com → foo@x.com (RFC 5322)
  normalized_email := lower(
    regexp_replace(NEW.patient_email, '\+[^@]*@', '@')
  );

  SELECT id, name INTO matched_org_id, matched_org_name
    FROM organizations
   WHERE (
       lower(contact_email) = normalized_email
    OR lower(billing_email) = normalized_email
    OR lower(regexp_replace(coalesce(contact_email,''), '\+[^@]*@', '@')) = normalized_email
    OR lower(regexp_replace(coalesce(billing_email,''), '\+[^@]*@', '@')) = normalized_email
       )
     AND is_active = true
   LIMIT 1;

  IF matched_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.billed_to IS DISTINCT FROM 'org' OR NEW.organization_id IS NULL THEN
    NEW.billed_to := 'org';
    NEW.organization_id := matched_org_id;
    NEW.notes := COALESCE(NEW.notes || E'\n', '') ||
      '[auto-routed to org-billed: email ' || NEW.patient_email ||
      ' belongs to ' || matched_org_name || ' — booked via online checkout]';
    RAISE NOTICE 'auto-routed appointment to org % (%) on email collision (normalized=%)',
      matched_org_name, matched_org_id, normalized_email;
  END IF;

  RETURN NEW;
END;
$function$;
