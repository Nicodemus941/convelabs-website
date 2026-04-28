-- 2026-04-28 SECURITY HARDENING TIER 1
-- Source: Supabase advisor — 80 ERROR-level findings, 448 total.
-- This migration closes the highest-severity items: direct data exposure
-- through views/tables with RLS off. Privilege-escalation fixes (47 RLS
-- policies that read user_metadata) ship in Tier 2.

DROP VIEW IF EXISTS public.provider_role_audit CASCADE;

-- Canonical admin check — replaces unsafe (auth.jwt()->user_metadata->>role)
-- pattern used by 47 RLS policies. user_metadata is user-editable via
-- Supabase Auth APIs; user_roles is not.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin','admin','office_manager')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
COMMENT ON FUNCTION public.is_admin() IS
  'Canonical admin check. Use in RLS policies as USING (public.is_admin()).';

-- Enable + force RLS on 16 tables that had it disabled.
DO $$
DECLARE tbl text;
  tables text[] := ARRAY[
    'memberships','payments','subscriptions',
    'stripe_qb_mapping','stripe_qb_sync_log','stripe_qb_payout_log',
    'leads','reschedule_tokens','apology_credits',
    'booking_audit_log','provider_partnership_inquiries',
    'email_send_log','membership_offers_sent','owner_sms_log',
    'member_verification_codes','practice_enrollments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
  tables text[] := ARRAY[
    'memberships','payments','subscriptions',
    'stripe_qb_mapping','stripe_qb_sync_log','stripe_qb_payout_log',
    'leads','reschedule_tokens','apology_credits',
    'booking_audit_log','provider_partnership_inquiries',
    'email_send_log','membership_offers_sent','owner_sms_log',
    'member_verification_codes','practice_enrollments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                     tbl || '_admin_read', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())',
        tbl || '_admin_read', tbl);
    END IF;
  END LOOP;
END $$;

-- Flip SECURITY DEFINER views to SECURITY INVOKER.
DO $$
DECLARE v text;
  views text[] := ARRAY[
    'membership_lookup','v_active_baa_signatures','v_appointment_delivery_recipients'
  ];
BEGIN
  FOREACH v IN ARRAY views LOOP
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name=v) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    END IF;
  END LOOP;
END $$;
