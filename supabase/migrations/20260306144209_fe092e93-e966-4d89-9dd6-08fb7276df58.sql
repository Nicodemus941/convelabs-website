CREATE TABLE public.booking_sync_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_id UUID REFERENCES public.booking_holds(id) ON DELETE SET NULL,
  ghs_error TEXT,
  ghs_status_code INT,
  payload JSONB,
  retry_count INT DEFAULT 0,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.booking_sync_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sync failures"
ON public.booking_sync_failures
FOR ALL
TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

CREATE POLICY "Service role full access on sync failures"
ON public.booking_sync_failures
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);