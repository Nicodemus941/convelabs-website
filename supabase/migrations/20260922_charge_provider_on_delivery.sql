-- The practice's card is charged when the specimens reach the lab.
--
-- Until now it was charged when the patient booked (schedule-lab-request).
-- That missed every visit staff booked directly: six Elite draws in Aug/Sep
-- were delivered with a card on file and provider_charge_attempted_at null,
-- because the booking never went through that path. Delivery is the one
-- event every draw passes through, and it is also the honest moment to
-- charge -- the work is done.
--
-- This extends the existing delivery trigger (which already notifies the
-- practice) with a second call to charge-provider-on-delivery. That function
-- is idempotent: it only charges a request still sitting at 'card_on_file',
-- and uses a Stripe idempotency key per lab request.

create or replace function public.on_appointment_specimen_delivered()
returns trigger
language plpgsql
security definer
as $$
DECLARE
  v_key text;
  v_old_delivered timestamptz;
  v_new_delivered timestamptz;
BEGIN
  v_old_delivered := COALESCE(OLD.delivered_at, OLD.specimens_delivered_at);
  v_new_delivered := COALESCE(NEW.delivered_at, NEW.specimens_delivered_at);

  IF v_new_delivered IS NOT NULL
     AND v_old_delivered IS NULL
     AND NEW.organization_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='SERVICE_ROLE_KEY' LIMIT 1;
    IF v_key IS NOT NULL THEN
      -- Tell the practice their specimens landed (unchanged).
      PERFORM net.http_post(
        url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/send-specimen-delivery-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object('appointment_id', NEW.id)
      );

      -- Then settle it, if this is a practice-billed draw with a card saved.
      -- Separate call on purpose: a billing problem must never stop the
      -- delivery notice going out.
      PERFORM net.http_post(
        url := 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/charge-provider-on-delivery',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object('appointment_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
