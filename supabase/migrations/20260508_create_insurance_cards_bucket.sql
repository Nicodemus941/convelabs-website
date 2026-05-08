-- 2026-05-08 — CRITICAL: insurance-cards bucket never existed
--
-- Audit on Charles Cook's case revealed: the public.storage.buckets table
-- had NO 'insurance-cards' row. Every reference to it (booking flow drops,
-- phleb-side PhlebUploadInsuranceCardButton, extract-insurance-ocr
-- download path) had been failing silently with "bucket not found" since
-- launch. That's why the bucket was empty in last night's audit, and why
-- 0.2% (1 of 495) of patients had insurance_card_path on file.
--
-- Charles told us he uploaded his card the day he booked — he wasn't
-- wrong. The browser said "uploading", the spinner cleared, the OCR
-- toast fired (because OCR ran on the in-memory base64 even when
-- storage upload failed). The file just had nowhere to land.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'insurance-cards',
  'insurance-cards',
  false,
  10 * 1024 * 1024,
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/heic','image/heif','image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated patients (logged-in account holders) can upload their own card
CREATE POLICY "anyone authenticated can upload insurance cards"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'insurance-cards');

-- Anonymous booking flow uploads (patient hasn't created an account yet)
CREATE POLICY "anonymous can upload insurance cards (booking flow)"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'insurance-cards');

-- Reads: admin + phleb + provider/office_manager (org-staff)
CREATE POLICY "platform admin reads insurance cards"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'insurance-cards'
    AND lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'role','')) = ANY (
      ARRAY['super_admin','admin','owner','phlebotomist','provider','office_manager']
    )
  );

-- Deletes (orphan cleanup) — admin only
CREATE POLICY "platform admin deletes insurance cards"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'insurance-cards'
    AND lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'role','')) = ANY (ARRAY['super_admin','admin','owner'])
  );
