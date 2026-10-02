-- APPLIED 2026-10-02 (via Supabase MCP) right after roles phase 2.
--
-- Phase 2 fixed staff_onboarding_read_own, which had made EVERY storage.objects
-- SELECT error ("permission denied for table users"). That error was masking
-- open read policies; once reads evaluated, anyone (incl. anon) could read
-- private buckets. Verified live before/after with persona checks.
-- Previous definitions are saved in public.role_migration_backup.

-- Was: bucket_id <> ALL ('lab-orders','sop-images') for {public} → every private
-- bucket (insurance-cards 172 files, specimen-labels, specimen-signatures, ...).
alter policy storage_select_open on storage.objects
  using (bucket_id in (select b.id from storage.buckets b where b.public)
         and bucket_id <> all (array['lab-orders','sop-images']));

-- Was: bucket_id = 'specimen-signatures' for {public}.
alter policy svc_read_signatures on storage.objects
  using (bucket_id = 'specimen-signatures'
         and (select public.jwt_role()) = any (array['super_admin','admin','owner','phlebotomist']));

-- Was: any authenticated user (patients saw 47 labels with other patients' names).
alter policy specimen_labels_auth_select on storage.objects
  using (bucket_id = 'specimen-labels'
         and (select public.jwt_role()) = any (array['super_admin','admin','owner','phlebotomist']));

-- Was: also provider/office_manager across ALL clinics (no org scoping).
alter policy "platform admin reads insurance cards" on storage.objects
  using (bucket_id = 'insurance-cards'
         and (select public.jwt_role()) = any (array['super_admin','admin','owner','phlebotomist']));
