-- ============================================================================
-- DRAFT — NOT APPLIED
-- ============================================================================
-- Backend follow-ups surfaced by the Partners + Team admin redesign
-- (branch feat/redesign-partners-team). The UI on that branch works WITHOUT
-- this file; everything here is optional hardening / cleanup. Review each
-- block, rename the file to a real timestamped migration, and apply via the
-- normal migration path when the owner decides to.
--
-- Nothing in this file sends email/SMS or moves money.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. organizations.outreach_status — live data uses two values the UI/type
--    didn't know about ('welcomed', 'unreachable_no_email'). The UI now
--    handles them; this pins the vocabulary so a typo can't create a new bucket.
--    Verified live distribution (2026-10-02): untouched 92, unreachable_no_email 8,
--    welcomed 5, signed 1, merged 1 (declined/emailed/called present historically).
-- ----------------------------------------------------------------------------
-- ALTER TABLE public.organizations
--   ADD CONSTRAINT organizations_outreach_status_check
--   CHECK (outreach_status IS NULL OR outreach_status IN (
--     'untouched', 'emailed', 'called', 'welcomed', 'unreachable_no_email',
--     'signed', 'declined', 'merged'
--   )) NOT VALID;
-- -- then, after confirming no rows violate it:
-- -- ALTER TABLE public.organizations VALIDATE CONSTRAINT organizations_outreach_status_check;


-- ----------------------------------------------------------------------------
-- 2. Patient appointment counts — UserManagementTab currently pages through
--    every non-cancelled appointment (489 today) to count per patient. A view
--    keeps that to one round-trip and stays correct past 1,000 rows.
--    RLS: appointments is already readable by admins; a security-invoker view
--    inherits that. Add `GRANT SELECT` for authenticated if the view is used
--    from the client.
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.patient_appointment_counts
--   WITH (security_invoker = true) AS
-- SELECT
--   patient_id,
--   count(*)                         AS appointment_count,
--   max(appointment_date)            AS last_appointment_at,
--   count(*) FILTER (WHERE status = 'completed') AS completed_count
-- FROM public.appointments
-- WHERE patient_id IS NOT NULL AND status <> 'cancelled'
-- GROUP BY patient_id;
-- GRANT SELECT ON public.patient_appointment_counts TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. Staff completed-draw counts — StaffManagementTab counts completed
--    appointments per phlebotomist client-side (appointments.phlebotomist_id
--    is the auth user id, NOT staff_profiles.id). Same shape as (2).
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.staff_draw_counts
--   WITH (security_invoker = true) AS
-- SELECT
--   phlebotomist_id                  AS user_id,
--   count(*)                         AS completed_draws,
--   max(appointment_date)            AS last_draw_at
-- FROM public.appointments
-- WHERE phlebotomist_id IS NOT NULL AND status = 'completed'
-- GROUP BY phlebotomist_id;
-- GRANT SELECT ON public.staff_draw_counts TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. staff_profiles.hired_date is NULL for every row today; the UI falls back
--    to created_at. Backfill once so "Hired" reads correctly. Pure data fix —
--    run only after the owner confirms the dates.
-- ----------------------------------------------------------------------------
-- UPDATE public.staff_profiles
--    SET hired_date = created_at::date
--  WHERE hired_date IS NULL;


-- ----------------------------------------------------------------------------
-- 5. Direct "Add staff" calls supabase.auth.admin.createUser from the
--    browser, which fails with the anon key ("User not allowed"). The working
--    path is the create-staff-invitation edge function (InviteStaffDialog).
--    Recommended: delete the direct-add flow from the UI, or move it behind a
--    service-role edge function (`admin-create-staff`) that:
--      - verifies the caller is super_admin (app_metadata after the roles
--        migration lands),
--      - creates the auth user with email_confirm=false,
--      - inserts staff_profiles + user_profiles in one transaction,
--      - triggers the password-set email.
--    No SQL needed for this item; it is an edge-function change.


-- ----------------------------------------------------------------------------
-- 6. time_blocks has no index on (end_date) / (staff_id). The Team schedule
--    view lists upcoming vs past; cheap to index as the table grows (73 rows
--    today — not urgent).
-- ----------------------------------------------------------------------------
-- CREATE INDEX IF NOT EXISTS time_blocks_end_date_idx ON public.time_blocks (end_date);
-- CREATE INDEX IF NOT EXISTS time_blocks_staff_id_idx ON public.time_blocks (staff_id) WHERE staff_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 7. Dead code, not SQL: src/components/dashboards/admin/users/* (UserTable,
--    UserFilters, UserFormDialog, useUserManagement, usersService) and
--    OrgSubscriptionTierCard.tsx are not imported anywhere. Safe to delete in
--    a follow-up PR.
-- ----------------------------------------------------------------------------
