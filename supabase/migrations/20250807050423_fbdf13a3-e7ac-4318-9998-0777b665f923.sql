-- Real-time analytics tables for conversion dashboard

-- Visitor sessions table
CREATE TABLE IF NOT EXISTS visitor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  visitor_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  
  -- Location data
  ip_address INET,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  coordinates POINT,
  
  -- Session tracking
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  total_duration_seconds INTEGER DEFAULT 0,
  
  -- Device info
  user_agent TEXT,
  device_type TEXT, -- mobile, desktop, tablet
  browser TEXT,
  operating_system TEXT,
  
  -- Referral data
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  
  -- Conversion tracking
  visitor_score INTEGER DEFAULT 0, -- 1-10 quality score
  is_high_value BOOLEAN DEFAULT false,
  converted BOOLEAN DEFAULT false,
  conversion_value INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Page view events
CREATE TABLE IF NOT EXISTS page_view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES visitor_sessions(session_id),
  
  page_path TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  
  -- Timing data
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  time_on_page_seconds INTEGER,
  exit_page BOOLEAN DEFAULT false,
  bounce BOOLEAN DEFAULT false,
  
  -- Engagement metrics
  scroll_depth_percentage INTEGER DEFAULT 0,
  clicks_count INTEGER DEFAULT 0,
  form_interactions INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Conversion funnel events
CREATE TABLE IF NOT EXISTS conversion_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES visitor_sessions(session_id),
  
  -- Funnel stages
  stage TEXT NOT NULL, -- homepage, services, pricing, pre_qualification, booking_intent, booking_completed
  stage_order INTEGER NOT NULL,
  
  -- Event data
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  event_data JSONB DEFAULT '{}',
  
  -- Conversion tracking
  converted_to_next_stage BOOLEAN DEFAULT false,
  time_to_next_stage_seconds INTEGER,
  abandoned_at_stage BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- A/B test performance tracking
CREATE TABLE IF NOT EXISTS ab_test_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES ab_test_experiments(id),
  variant TEXT NOT NULL,
  
  -- Performance metrics
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hour INTEGER NOT NULL DEFAULT EXTRACT(HOUR FROM now()),
  
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  
  -- Calculated rates (updated via triggers)
  click_rate DECIMAL(5,4) DEFAULT 0,
  conversion_rate DECIMAL(5,4) DEFAULT 0,
  revenue_per_visitor DECIMAL(10,2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(experiment_id, variant, date, hour)
);

-- Real-time metrics cache
CREATE TABLE IF NOT EXISTS analytics_metrics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  time_period TEXT NOT NULL, -- hour, day, week, month
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Metric values
  metric_value DECIMAL(15,2) NOT NULL,
  metric_count INTEGER DEFAULT 0,
  additional_data JSONB DEFAULT '{}',
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  UNIQUE(metric_name, time_period, period_start)
);

-- Booking attribution tracking
CREATE TABLE IF NOT EXISTS booking_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES visitor_sessions(session_id),
  booking_id TEXT, -- External booking system ID
  appointment_id UUID REFERENCES appointments(id),
  
  -- Attribution data
  service_type TEXT NOT NULL,
  service_amount INTEGER NOT NULL,
  booking_completed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Full journey tracking
  first_page TEXT,
  pages_visited TEXT[],
  total_session_time_seconds INTEGER,
  
  -- Marketing attribution
  traffic_source TEXT,
  campaign_data JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Real-time alerts
CREATE TABLE IF NOT EXISTS conversion_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL, -- abandoned_booking, high_value_visitor, low_conversion_rate
  session_id TEXT REFERENCES visitor_sessions(session_id),
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  
  -- Alert data
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  alert_data JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS policies
ALTER TABLE visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_view_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_metrics_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for analytics data
CREATE POLICY "Admins can view all analytics data" ON visitor_sessions FOR ALL USING (is_user_admin());
CREATE POLICY "Admins can view all page view events" ON page_view_events FOR ALL USING (is_user_admin());
CREATE POLICY "Admins can view all funnel events" ON conversion_funnel_events FOR ALL USING (is_user_admin());
CREATE POLICY "Admins can view all test performance" ON ab_test_performance FOR ALL USING (is_user_admin());
CREATE POLICY "Admins can view all metrics cache" ON analytics_metrics_cache FOR ALL USING (is_user_admin());
CREATE POLICY "Admins can view all booking attribution" ON booking_attribution FOR ALL USING (is_user_admin());
CREATE POLICY "Admins can view all alerts" ON conversion_alerts FOR ALL USING (is_user_admin());

-- Allow public insertion for tracking (with proper validation in edge functions)
CREATE POLICY "Allow public visitor session creation" ON visitor_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public page view tracking" ON page_view_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public funnel tracking" ON conversion_funnel_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public test performance updates" ON ab_test_performance FOR INSERT WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_visitor_sessions_session_id ON visitor_sessions(session_id);
CREATE INDEX idx_visitor_sessions_started_at ON visitor_sessions(started_at);
CREATE INDEX idx_visitor_sessions_city_state ON visitor_sessions(city, state);
CREATE INDEX idx_visitor_sessions_is_high_value ON visitor_sessions(is_high_value) WHERE is_high_value = true;

CREATE INDEX idx_page_view_events_session_id ON page_view_events(session_id);
CREATE INDEX idx_page_view_events_viewed_at ON page_view_events(viewed_at);
CREATE INDEX idx_page_view_events_page_path ON page_view_events(page_path);

CREATE INDEX idx_conversion_funnel_events_session_id ON conversion_funnel_events(session_id);
CREATE INDEX idx_conversion_funnel_events_stage ON conversion_funnel_events(stage);
CREATE INDEX idx_conversion_funnel_events_occurred_at ON conversion_funnel_events(occurred_at);

CREATE INDEX idx_ab_test_performance_date_hour ON ab_test_performance(date, hour);
CREATE INDEX idx_ab_test_performance_experiment_variant ON ab_test_performance(experiment_id, variant);

CREATE INDEX idx_analytics_cache_metric_period ON analytics_metrics_cache(metric_name, time_period, period_start);
CREATE INDEX idx_analytics_cache_expires_at ON analytics_metrics_cache(expires_at);

CREATE INDEX idx_booking_attribution_session_id ON booking_attribution(session_id);
CREATE INDEX idx_booking_attribution_completed_at ON booking_attribution(booking_completed_at);

CREATE INDEX idx_conversion_alerts_triggered_at ON conversion_alerts(triggered_at);
CREATE INDEX idx_conversion_alerts_severity ON conversion_alerts(severity);
CREATE INDEX idx_conversion_alerts_unresolved ON conversion_alerts(resolved_at) WHERE resolved_at IS NULL;

-- Enable realtime for dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE visitor_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE page_view_events;
ALTER PUBLICATION supabase_realtime ADD TABLE conversion_funnel_events;
ALTER PUBLICATION supabase_realtime ADD TABLE ab_test_performance;
ALTER PUBLICATION supabase_realtime ADD TABLE analytics_metrics_cache;
ALTER PUBLICATION supabase_realtime ADD TABLE booking_attribution;
ALTER PUBLICATION supabase_realtime ADD TABLE conversion_alerts;

-- Triggers for automatic updates
CREATE OR REPLACE FUNCTION update_visitor_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate visitor quality score based on behavior
  UPDATE visitor_sessions 
  SET 
    visitor_score = LEAST(10, GREATEST(1, 
      (CASE WHEN total_duration_seconds > 180 THEN 3 ELSE 1 END) +
      (CASE WHEN EXISTS(SELECT 1 FROM page_view_events WHERE session_id = NEW.session_id AND page_path LIKE '%pricing%') THEN 2 ELSE 0 END) +
      (CASE WHEN EXISTS(SELECT 1 FROM page_view_events WHERE session_id = NEW.session_id AND page_path LIKE '%services%') THEN 2 ELSE 0 END) +
      (CASE WHEN EXISTS(SELECT 1 FROM conversion_funnel_events WHERE session_id = NEW.session_id AND stage = 'pre_qualification') THEN 3 ELSE 0 END)
    )),
    is_high_value = (
      total_duration_seconds > 180 AND
      EXISTS(SELECT 1 FROM page_view_events WHERE session_id = NEW.session_id AND page_path LIKE '%pricing%') AND
      EXISTS(SELECT 1 FROM page_view_events WHERE session_id = NEW.session_id AND page_path LIKE '%services%')
    ),
    updated_at = now()
  WHERE session_id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_visitor_score
  AFTER INSERT OR UPDATE ON page_view_events
  FOR EACH ROW EXECUTE FUNCTION update_visitor_score();

-- Function to update AB test performance metrics
CREATE OR REPLACE FUNCTION update_ab_test_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ab_test_performance 
  SET 
    click_rate = CASE WHEN impressions > 0 THEN clicks::DECIMAL / impressions ELSE 0 END,
    conversion_rate = CASE WHEN clicks > 0 THEN conversions::DECIMAL / clicks ELSE 0 END,
    revenue_per_visitor = CASE WHEN impressions > 0 THEN revenue_cents::DECIMAL / 100 / impressions ELSE 0 END,
    updated_at = now()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ab_test_metrics
  AFTER INSERT OR UPDATE ON ab_test_performance
  FOR EACH ROW EXECUTE FUNCTION update_ab_test_metrics();