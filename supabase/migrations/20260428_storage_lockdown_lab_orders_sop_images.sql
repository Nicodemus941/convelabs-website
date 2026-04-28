-- 2026-04-28 Storage policy lockdown — lab-orders + sop-images
-- Source: Supabase advisor — public_bucket_allows_listing
--
-- Root cause: 4 catch-all "USING (true)" policies on storage.objects
-- granted universal access to every bucket regardless of role. Listing
-- exposed every patient PII filename (laborder_*_LastName_Req.pdf) to
-- anyone with the bucket name.
--
-- Fix: narrow the catch-all to exclude lab-orders + sop-images, then
-- add proper scoped policies for each.
--
-- Public URL fetches go through render.supabase.co/object/public/...
-- which honors bucket.public=true and skips storage.objects RLS, so
-- legit lab-order email attachments + image embeds keep working.
-- sop-images flipped to private (internal staff content only).

DROP POLICY IF EXISTS storage_select ON storage.objects;
DROP POLICY IF EXISTS storage_insert ON storage.objects;
DROP POLICY IF EXISTS storage_update ON storage.objects;
DROP POLICY IF EXISTS storage_delete ON storage.objects;

CREATE POLICY storage_select_open ON storage.objects FOR SELECT
  USING (bucket_id NOT IN ('lab-orders','sop-images'));
CREATE POLICY storage_insert_open ON storage.objects FOR INSERT
  WITH CHECK (bucket_id NOT IN ('lab-orders','sop-images'));
CREATE POLICY storage_update_open ON storage.objects FOR UPDATE
  USING (bucket_id NOT IN ('lab-orders','sop-images'))
  WITH CHECK (bucket_id NOT IN ('lab-orders','sop-images'));
CREATE POLICY storage_delete_open ON storage.objects FOR DELETE
  USING (bucket_id NOT IN ('lab-orders','sop-images'));

-- lab-orders: anyone can upload (booking flow, both anon + authed),
-- only admins can list/read/delete via Supabase API. Public URL
-- fetches still work for emails since bucket.public=true.
CREATE POLICY lab_orders_insert_anyone ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'lab-orders');
CREATE POLICY lab_orders_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lab-orders' AND public.is_admin());
CREATE POLICY lab_orders_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lab-orders' AND public.is_admin());

-- sop-images: drop public read; authed staff read only.
DROP POLICY IF EXISTS sop_images_public_read ON storage.objects;
CREATE POLICY sop_images_authed_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'sop-images');

-- Flip sop-images to private (admin/staff UI uses signed URLs or
-- service-role downloads).
UPDATE storage.buckets SET public = false WHERE name = 'sop-images';
