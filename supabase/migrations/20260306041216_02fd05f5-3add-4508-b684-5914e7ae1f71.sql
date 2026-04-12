
CREATE TABLE public.ghs_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  booking_id TEXT,
  payload_json JSONB,
  processed_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_ghs_webhook_event_type ON public.ghs_webhook_events(event_type);
CREATE INDEX idx_ghs_webhook_booking_id ON public.ghs_webhook_events(booking_id);
CREATE INDEX idx_ghs_webhook_status ON public.ghs_webhook_events(processed_status);

ALTER TABLE public.ghs_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook events"
  ON public.ghs_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update webhook events"
  ON public.ghs_webhook_events FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service role can insert webhook events"
  ON public.ghs_webhook_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update webhook events"
  ON public.ghs_webhook_events FOR UPDATE
  TO service_role
  USING (true);
