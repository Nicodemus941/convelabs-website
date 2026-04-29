-- 2026-04-29 RLS policies for appointment_lab_orders
-- Table had RLS enabled but ZERO policies — phleb upload flow was
-- failing with "new row violates row-level security policy" on
-- the INSERT step (storage upload succeeded; row-link insert failed).
--
-- Same root cause class as the lab-orders bucket SELECT regression
-- earlier today: enable RLS without granting non-admin staff access.

CREATE POLICY appointment_lab_orders_staff_insert ON public.appointment_lab_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_phleb());

CREATE POLICY appointment_lab_orders_staff_read ON public.appointment_lab_orders
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_phleb());

CREATE POLICY appointment_lab_orders_admin_update ON public.appointment_lab_orders
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY appointment_lab_orders_admin_delete ON public.appointment_lab_orders
  FOR DELETE TO authenticated
  USING (public.is_admin());
