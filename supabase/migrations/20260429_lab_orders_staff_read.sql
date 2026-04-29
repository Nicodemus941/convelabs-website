-- 2026-04-29 Allow phlebs to view lab-orders bucket files
-- Yesterday's storage lockdown restricted lab-orders SELECT to admins
-- only. But phlebs need to view lab orders for the patients they're
-- assigned to (they open Katherine Bucher Jacobson's appointment in
-- the PWA, click the lab order file → modal calls createSignedUrl()
-- → storage.objects RLS denies → blank modal).
--
-- createSignedUrl() goes through RLS (unlike the public render URL
-- that bypasses RLS for public buckets). Since our PWA viewer uses
-- signed URLs, phlebs need their own SELECT policy.
--
-- DELETE remains admin-only (only admins should be able to remove
-- patient lab orders).

DROP POLICY IF EXISTS lab_orders_admin_read ON storage.objects;

CREATE POLICY lab_orders_staff_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lab-orders'
    AND (public.is_admin() OR public.is_phleb())
  );
