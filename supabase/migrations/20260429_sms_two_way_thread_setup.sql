-- 2026-04-29 Two-way SMS threading
-- Inbound SMS replies (twilio-inbound-sms) were never written to
-- sms_messages — they only updated patient_lab_requests counters and
-- replied via TwiML. Result: admin Messages tab couldn't see patient
-- replies, no notification bell, no two-way thread.
-- Outbound SMS (send-sms-notification) had no thread-logging at all.
--
-- This migration adds the threading anchors. The function changes
-- (twilio-inbound-sms, send-sms-notification) write through these.

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_conversations_phone_norm
  ON public.sms_conversations ((public.normalize_phone(patient_phone)))
  WHERE patient_phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_or_create_sms_conversation(
  p_patient_phone text,
  p_patient_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_norm text := public.normalize_phone(p_patient_phone);
  v_id uuid;
BEGIN
  IF v_norm IS NULL OR length(v_norm) < 10 THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM sms_conversations
   WHERE public.normalize_phone(patient_phone) = v_norm LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE sms_conversations
       SET last_message_at = now(),
           patient_id = COALESCE(patient_id, p_patient_id)
     WHERE id = v_id;
    RETURN v_id;
  END IF;
  INSERT INTO sms_conversations (patient_phone, patient_id, last_message_at)
  VALUES (p_patient_phone, p_patient_id, now())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_sms_conversation(text, uuid) TO authenticated, service_role;
