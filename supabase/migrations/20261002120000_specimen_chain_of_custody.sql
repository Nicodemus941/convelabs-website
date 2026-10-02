-- ============================================================================
-- Reviewed with the owner 2026-10-02. Applied manually via the Supabase MCP
-- (project yluyonhrxxtyuiyrdixl) after review; safe to re-run (idempotent).
--
-- Specimen chain-of-custody backend gaps surfaced by the admin
-- "Specimen tracking" redesign (src/components/dashboards/admin/
-- SpecimenTrackingTab.tsx). The phleb app (SpecimenDeliveryModal /
-- AdditionalSpecimenDelivery) does not write collected_at / in_transit yet;
-- until it does, the backfill below is the only source for those.
--
-- Verified live facts this addresses (specimen_deliveries, 414 rows):
--   • collection_time == delivered_at on every row — it is NOT a draw time.
--   • status is 'delivered' on every row; nothing models "drawn, en route".
--   • 10 shipping rows carry the carrier number in specimen_id with
--     tracking_number NULL (and courier / delivery_method NULL on 8 of them).
--   • delivered_by is free text with 3 spellings of the same phlebotomist.
--   • 13 completed appointments in the last 60 days have no delivery row.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Real draw time. `collection_time` is kept (reads still work) but is no
--    longer what the UI treats as the draw; `collected_at` is the honest one,
--    written by the phleb app when the draw is confirmed, not at delivery.
-- ----------------------------------------------------------------------------
ALTER TABLE public.specimen_deliveries
  ADD COLUMN IF NOT EXISTS collected_at timestamptz;

COMMENT ON COLUMN public.specimen_deliveries.collected_at IS
  'When the specimen was actually drawn. Set at draw confirmation, NOT at delivery. '
  'collection_time is legacy (== delivered_at historically) — prefer this column.';

-- Backfill: the closest honest signal we have is the appointment''s
-- completion stamp; where that is missing leave NULL rather than lie.
UPDATE public.specimen_deliveries d
   SET collected_at = a.completion_time
  FROM public.appointments a
 WHERE a.id = d.appointment_id
   AND d.collected_at IS NULL
   AND a.completion_time IS NOT NULL
   AND a.completion_time <= COALESCE(d.delivered_at, now());

-- ----------------------------------------------------------------------------
-- 2. Status pipeline. Today every row is 'delivered'. Add the in-transit leg
--    so the admin screen can get its reserved "In transit" bucket:
--
--      collected   → drawn, still with the phleb (row created at draw time)
--      in_transit  → handed to a courier, tracking number on file
--      delivered   → at the lab (drop-off) or carrier confirms delivery
--      void        → logged in error / duplicate, kept for audit
--
--    Enforced with a CHECK, not an enum, so adding a state later is one line.
-- ----------------------------------------------------------------------------
ALTER TABLE public.specimen_deliveries
  ALTER COLUMN status SET DEFAULT 'delivered';

ALTER TABLE public.specimen_deliveries
  DROP CONSTRAINT IF EXISTS specimen_deliveries_status_check;

ALTER TABLE public.specimen_deliveries
  ADD CONSTRAINT specimen_deliveries_status_check
  CHECK (status IN ('collected', 'in_transit', 'delivered', 'void'));

-- Normalise delivery_method while we are here (live values: NULL, 'ship').
ALTER TABLE public.specimen_deliveries
  DROP CONSTRAINT IF EXISTS specimen_deliveries_delivery_method_check;

UPDATE public.specimen_deliveries
   SET delivery_method = 'ship'
 WHERE delivery_method IS NULL
   AND (lab_name ILIKE '%(shipping)%' OR courier IS NOT NULL);

UPDATE public.specimen_deliveries
   SET delivery_method = 'dropoff'
 WHERE delivery_method IS NULL;

ALTER TABLE public.specimen_deliveries
  ADD CONSTRAINT specimen_deliveries_delivery_method_check
  CHECK (delivery_method IN ('dropoff', 'ship'));

-- ----------------------------------------------------------------------------
-- 3. Tracking numbers. The 2026 shipping rows typed the carrier number into
--    specimen_id. Promote it to tracking_number (and infer the courier) when
--    the value is unmistakably a carrier code. Idempotent.
-- ----------------------------------------------------------------------------
UPDATE public.specimen_deliveries
   SET tracking_number = regexp_replace(specimen_id, '\s+', '', 'g'),
       courier = COALESCE(courier,
         CASE
           WHEN upper(regexp_replace(specimen_id, '\s+', '', 'g')) ~ '^1Z[A-Z0-9]{16}$' THEN 'ups'
           WHEN regexp_replace(specimen_id, '\s+', '', 'g') ~ '^(\d{12}|\d{15})$'      THEN 'fedex'
           WHEN regexp_replace(specimen_id, '\s+', '', 'g') ~ '^(94|93|92|420)\d{18,24}$' THEN 'usps'
         END)
 WHERE delivery_method = 'ship'
   AND tracking_number IS NULL
   AND (
        upper(regexp_replace(specimen_id, '\s+', '', 'g')) ~ '^1Z[A-Z0-9]{16}$'
     OR regexp_replace(specimen_id, '\s+', '', 'g') ~ '^(\d{12}|\d{15})$'
     OR regexp_replace(specimen_id, '\s+', '', 'g') ~ '^(94|93|92|420)\d{18,24}$'
   );

-- ----------------------------------------------------------------------------
-- 4. Who logged it, as a real FK — delivered_by stays as the display string
--    but we stop relying on free text for identity.
-- ----------------------------------------------------------------------------
ALTER TABLE public.specimen_deliveries
  ADD COLUMN IF NOT EXISTS delivered_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- New rows record whoever logged them, without any app change.
ALTER TABLE public.specimen_deliveries
  ALTER COLUMN delivered_by_user_id SET DEFAULT auth.uid();

-- Backfill from the appointment''s assigned phlebotomist (all live rows were
-- logged by the assigned phleb).
UPDATE public.specimen_deliveries d
   SET delivered_by_user_id = a.phlebotomist_id
  FROM public.appointments a
 WHERE a.id = d.appointment_id
   AND d.delivered_by_user_id IS NULL
   AND a.phlebotomist_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. Indexes the admin screen's queries want.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS specimen_deliveries_appointment_id_idx
  ON public.specimen_deliveries (appointment_id);
CREATE INDEX IF NOT EXISTS specimen_deliveries_delivered_at_idx
  ON public.specimen_deliveries (delivered_at DESC);
CREATE INDEX IF NOT EXISTS specimen_deliveries_status_idx
  ON public.specimen_deliveries (status)
  WHERE status <> 'delivered';
-- Gap detection ("completed visit, no delivery row") joins on this.
CREATE INDEX IF NOT EXISTS appointments_completed_by_date_idx
  ON public.appointments (appointment_date DESC)
  WHERE status = 'completed';

-- ----------------------------------------------------------------------------
-- 6. RLS — tighten INSERT and UPDATE. Before this, "Authenticated insert
--    specimens" / "Authenticated update specimens" let ANY authenticated user
--    (patients included) create or edit any row.
--
--    office_manager is deliberately NOT here: today that role belongs to
--    partner-clinic staff (scoped to their own org by
--    org_staff_read_their_specimens), not ConveLabs staff.
--
--    NOTE: these checks read the role from user_metadata, like every other
--    policy in this project. user_metadata is user-editable, so this is only
--    as strong as the platform-wide role model — tracked separately.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated insert specimens" ON public.specimen_deliveries;
DROP POLICY IF EXISTS "phleb_or_admin_inserts_specimens" ON public.specimen_deliveries;
CREATE POLICY "phleb_or_admin_inserts_specimens"
ON public.specimen_deliveries FOR INSERT TO authenticated
WITH CHECK (
  lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('phlebotomist','super_admin','admin','owner')
);

DROP POLICY IF EXISTS "Authenticated update specimens" ON public.specimen_deliveries;
DROP POLICY IF EXISTS "admin_or_logger_updates_specimens" ON public.specimen_deliveries;
CREATE POLICY "admin_or_logger_updates_specimens"
ON public.specimen_deliveries FOR UPDATE TO authenticated
USING (
  lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner')
  OR delivered_by_user_id = auth.uid()
)
WITH CHECK (
  lower(COALESCE(auth.jwt()->'user_metadata'->>'role','')) IN ('super_admin','admin','owner')
  OR delivered_by_user_id = auth.uid()
);

COMMIT;

-- ============================================================================
-- Follow-ups (not in this migration)
--   • Phleb app should set collected_at at draw confirmation and insert the
--     shipping leg as status='in_transit' (+ tracking_number).
--   • A carrier webhook or daily cron should flip in_transit → delivered.
--   • Completed visits with no delivery row are NOT backfilled — a human has
--     to say where the specimen went.
--   • SpecimenDeliveryModal ignores the insert's {error}, so a failed save
--     looks like success — likely cause of the missing records.
--   • Roles live in user-editable user_metadata across all policies.
-- ============================================================================
