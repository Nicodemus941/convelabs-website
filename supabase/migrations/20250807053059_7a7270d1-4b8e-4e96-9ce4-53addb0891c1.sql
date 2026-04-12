-- ========================================
-- PHASE 2B: AI LEAD SCORING ENGINE TABLES (FIXED)
-- ========================================

-- Lead profiles table to store visitor intelligence
CREATE TABLE IF NOT EXISTS lead_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Geographic and demographic data
  ip_address INET,
  location_city TEXT,
  location_state TEXT,
  location_zipcode TEXT,
  location_country TEXT DEFAULT 'US',
  wealth_index INTEGER DEFAULT 5, -- 1-10 scale based on location
  device_type TEXT, -- 'mobile', 'tablet', 'desktop'
  
  -- Behavioral scoring data
  total_page_views INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  services_viewed TEXT[] DEFAULT '{}',
  pricing_page_viewed BOOLEAN DEFAULT false,
  started_pre_qualification BOOLEAN DEFAULT false,
  clicked_book_now BOOLEAN DEFAULT false,
  abandoned_booking BOOLEAN DEFAULT false,
  
  -- Lead scoring results
  behavioral_score NUMERIC(3,1) DEFAULT 0, -- 0-40 points
  demographic_score NUMERIC(3,1) DEFAULT 0, -- 0-30 points  
  intent_score NUMERIC(3,1) DEFAULT 0, -- 0-30 points
  total_score NUMERIC(3,1) DEFAULT 0, -- 0-100 points
  lead_grade TEXT DEFAULT 'cold', -- 'hot', 'warm', 'cold'
  
  -- Revenue prediction
  predicted_ltv INTEGER DEFAULT 0, -- lifetime value in cents
  conversion_probability NUMERIC(3,2) DEFAULT 0.00, -- 0.00-1.00
  recommended_service TEXT,
  
  -- Follow-up tracking
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  follow_up_stage TEXT DEFAULT 'none', -- 'none', 'immediate', '1hour', '24hour', '3day', '1week'
  last_follow_up_at TIMESTAMP WITH TIME ZONE,
  
  -- Attribution data
  traffic_source TEXT,
  utm_campaign TEXT,
  utm_medium TEXT,
  utm_source TEXT,
  referrer TEXT,
  landing_page TEXT
);

-- Lead scoring events table for tracking all interactions
CREATE TABLE IF NOT EXISTS lead_scoring_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_profile_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Event details
  event_type TEXT NOT NULL, -- 'page_view', 'service_interest', 'pricing_view', 'book_click', 'form_start', 'form_abandon'
  event_data JSONB DEFAULT '{}',
  page_path TEXT,
  service_name TEXT,
  time_spent_seconds INTEGER DEFAULT 0,
  
  -- Scoring impact
  behavioral_points NUMERIC(3,1) DEFAULT 0,
  demographic_points NUMERIC(3,1) DEFAULT 0,
  intent_points NUMERIC(3,1) DEFAULT 0,
  
  FOREIGN KEY (lead_profile_id) REFERENCES lead_profiles(id) ON DELETE CASCADE
);

-- Lead follow-up actions table
CREATE TABLE IF NOT EXISTS lead_follow_up_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_profile_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  executed_at TIMESTAMP WITH TIME ZONE,
  
  -- Action details
  action_type TEXT NOT NULL, -- 'exit_popup', 'sms', 'email', 'phone_call', 'retargeting_ad'
  trigger_stage TEXT NOT NULL, -- 'immediate', '1hour', '24hour', '3day', '1week'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  
  -- Content and targeting
  subject_line TEXT,
  message_content TEXT,
  offer_type TEXT, -- 'discount', 'free_consultation', 'urgency', 'social_proof'
  offer_value TEXT,
  
  -- Results tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'opened', 'clicked', 'converted', 'failed'
  response_received BOOLEAN DEFAULT false,
  converted_to_booking BOOLEAN DEFAULT false,
  conversion_value INTEGER DEFAULT 0,
  
  FOREIGN KEY (lead_profile_id) REFERENCES lead_profiles(id) ON DELETE CASCADE
);

-- High-value lead alerts table
CREATE TABLE IF NOT EXISTS high_value_lead_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_profile_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Alert details
  alert_type TEXT NOT NULL, -- 'hot_lead', 'high_value_abandon', 'competitor_research', 'vip_location'
  severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Action needed
  recommended_action TEXT,
  assigned_to UUID, -- staff member to follow up
  urgency_level INTEGER DEFAULT 5, -- 1-10 scale
  
  -- Business impact
  potential_revenue INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  
  FOREIGN KEY (lead_profile_id) REFERENCES lead_profiles(id) ON DELETE CASCADE
);

-- Lead source performance table
CREATE TABLE IF NOT EXISTS lead_source_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hour INTEGER NOT NULL DEFAULT EXTRACT(hour FROM now()),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Source identification
  traffic_source TEXT NOT NULL,
  utm_campaign TEXT,
  utm_medium TEXT,
  utm_source TEXT,
  landing_page TEXT,
  
  -- Volume metrics
  total_visitors INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  hot_leads INTEGER DEFAULT 0,
  warm_leads INTEGER DEFAULT 0,
  cold_leads INTEGER DEFAULT 0,
  
  -- Quality metrics
  avg_lead_score NUMERIC(4,2) DEFAULT 0,
  avg_time_on_site INTEGER DEFAULT 0,
  bounce_rate NUMERIC(4,2) DEFAULT 0,
  conversion_rate NUMERIC(4,2) DEFAULT 0,
  
  -- Revenue metrics
  total_bookings INTEGER DEFAULT 0,
  total_revenue_cents INTEGER DEFAULT 0,
  avg_order_value_cents INTEGER DEFAULT 0,
  cost_per_acquisition_cents INTEGER DEFAULT 0,
  roi_percentage NUMERIC(6,2) DEFAULT 0,
  
  -- Predictions
  predicted_monthly_bookings INTEGER DEFAULT 0,
  predicted_monthly_revenue_cents INTEGER DEFAULT 0,
  
  UNIQUE(date, hour, traffic_source, utm_campaign, utm_medium, utm_source, landing_page)
);

-- Wealth index lookup by zipcode (Florida luxury areas)
CREATE TABLE IF NOT EXISTS zipcode_wealth_index (
  zipcode TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT DEFAULT 'FL',
  wealth_index INTEGER NOT NULL DEFAULT 5, -- 1-10 scale
  avg_home_value INTEGER, -- in dollars
  luxury_community BOOLEAN DEFAULT false,
  vip_priority BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert Florida luxury zipcode data (fixed duplicates)
INSERT INTO zipcode_wealth_index (zipcode, city, wealth_index, avg_home_value, luxury_community, vip_priority) VALUES
('34786', 'Windermere', 10, 2500000, true, true),
('34787', 'Windermere', 9, 1800000, true, true),
('32836', 'Isleworth', 10, 3000000, true, true),
('32819', 'Bay Hill', 9, 1500000, true, true),
('32830', 'Lake Nona', 8, 800000, true, false),
('32827', 'Golden Oak', 10, 2200000, true, true),
('32813', 'Dr Phillips', 8, 750000, true, false), -- Changed from 32819 to 32813
('32789', 'Winter Park', 8, 900000, true, false),
('32832', 'Celebration', 7, 650000, false, false),
('32746', 'Heathrow', 8, 850000, true, false), -- Changed from 34787 to 32746
('32746', 'Lake Mary', 7, 600000, false, false),
('32803', 'Orlando Downtown', 6, 450000, false, false),
('32804', 'Orlando', 5, 350000, false, false),
('32805', 'Orlando', 4, 280000, false, false)
ON CONFLICT (zipcode) DO UPDATE SET
  wealth_index = EXCLUDED.wealth_index,
  avg_home_value = EXCLUDED.avg_home_value,
  luxury_community = EXCLUDED.luxury_community,
  vip_priority = EXCLUDED.vip_priority;

-- Enable RLS on all tables
ALTER TABLE lead_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_follow_up_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE high_value_lead_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_source_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE zipcode_wealth_index ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead_profiles
CREATE POLICY "Admins can view all lead profiles"
  ON lead_profiles FOR ALL
  USING (is_user_admin());

CREATE POLICY "Allow public lead profile tracking"
  ON lead_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public lead profile updates"
  ON lead_profiles FOR UPDATE
  USING (true);

-- RLS Policies for lead_scoring_events
CREATE POLICY "Admins can view all scoring events"
  ON lead_scoring_events FOR ALL
  USING (is_user_admin());

CREATE POLICY "Allow public scoring event tracking"
  ON lead_scoring_events FOR INSERT
  WITH CHECK (true);

-- RLS Policies for lead_follow_up_actions
CREATE POLICY "Admins can manage follow-up actions"
  ON lead_follow_up_actions FOR ALL
  USING (is_user_admin());

-- RLS Policies for high_value_lead_alerts
CREATE POLICY "Admins can view all lead alerts"
  ON high_value_lead_alerts FOR ALL
  USING (is_user_admin());

CREATE POLICY "System can create lead alerts"
  ON high_value_lead_alerts FOR INSERT
  WITH CHECK (true);

-- RLS Policies for lead_source_performance
CREATE POLICY "Admins can view source performance"
  ON lead_source_performance FOR ALL
  USING (is_user_admin());

CREATE POLICY "System can update source performance"
  ON lead_source_performance FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update source metrics"
  ON lead_source_performance FOR UPDATE
  USING (true);

-- RLS Policies for zipcode_wealth_index (public read)
CREATE POLICY "Anyone can view zipcode wealth data"
  ON zipcode_wealth_index FOR SELECT
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_profiles_session_id ON lead_profiles(session_id);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_total_score ON lead_profiles(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_lead_grade ON lead_profiles(lead_grade);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_location ON lead_profiles(location_zipcode, location_city);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_created_at ON lead_profiles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_scoring_events_lead_profile_id ON lead_scoring_events(lead_profile_id);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_events_session_id ON lead_scoring_events(session_id);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_events_event_type ON lead_scoring_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_events_created_at ON lead_scoring_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_follow_up_actions_lead_profile_id ON lead_follow_up_actions(lead_profile_id);
CREATE INDEX IF NOT EXISTS idx_lead_follow_up_actions_status ON lead_follow_up_actions(status);
CREATE INDEX IF NOT EXISTS idx_lead_follow_up_actions_trigger_stage ON lead_follow_up_actions(trigger_stage);

CREATE INDEX IF NOT EXISTS idx_high_value_lead_alerts_severity ON high_value_lead_alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_high_value_lead_alerts_acknowledged ON high_value_lead_alerts(acknowledged_at) WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_source_performance_date_hour ON lead_source_performance(date DESC, hour DESC);
CREATE INDEX IF NOT EXISTS idx_lead_source_performance_source ON lead_source_performance(traffic_source, utm_campaign);

-- Create function to calculate lead score
CREATE OR REPLACE FUNCTION calculate_lead_score(p_lead_profile_id UUID)
RETURNS VOID AS $$
DECLARE
  profile_record lead_profiles%ROWTYPE;
  behavioral_points NUMERIC(3,1) := 0;
  demographic_points NUMERIC(3,1) := 0;
  intent_points NUMERIC(3,1) := 0;
  total_points NUMERIC(3,1) := 0;
  lead_grade_result TEXT := 'cold';
  wealth_score INTEGER := 5;
BEGIN
  -- Get the lead profile
  SELECT * INTO profile_record FROM lead_profiles WHERE id = p_lead_profile_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate Behavioral Score (40% weight, max 40 points)
  -- Time on site (0-15 points)
  behavioral_points := behavioral_points + LEAST(15, profile_record.total_time_seconds / 12.0);
  
  -- Page views (0-10 points)
  behavioral_points := behavioral_points + LEAST(10, profile_record.total_page_views * 2);
  
  -- Services viewed (0-10 points)
  behavioral_points := behavioral_points + LEAST(10, COALESCE(array_length(profile_record.services_viewed, 1), 0) * 3);
  
  -- Pricing page viewed (0-5 points)
  IF profile_record.pricing_page_viewed THEN
    behavioral_points := behavioral_points + 5;
  END IF;
  
  -- Calculate Demographic Score (30% weight, max 30 points)
  -- Get wealth index for zipcode
  SELECT wealth_index INTO wealth_score 
  FROM zipcode_wealth_index 
  WHERE zipcode = profile_record.location_zipcode;
  
  IF wealth_score IS NULL THEN
    wealth_score := 5;
  END IF;
  
  -- Wealth index score (0-20 points)
  demographic_points := demographic_points + (wealth_score * 2.0);
  
  -- Device type bonus (0-5 points)
  CASE profile_record.device_type
    WHEN 'desktop' THEN demographic_points := demographic_points + 5;
    WHEN 'tablet' THEN demographic_points := demographic_points + 3;
    WHEN 'mobile' THEN demographic_points := demographic_points + 2;
    ELSE demographic_points := demographic_points + 2;
  END CASE;
  
  -- VIP location bonus (0-5 points)
  IF EXISTS(SELECT 1 FROM zipcode_wealth_index WHERE zipcode = profile_record.location_zipcode AND vip_priority = true) THEN
    demographic_points := demographic_points + 5;
  END IF;
  
  -- Calculate Intent Score (30% weight, max 30 points)
  -- Started pre-qualification (0-10 points)
  IF profile_record.started_pre_qualification THEN
    intent_points := intent_points + 10;
  END IF;
  
  -- Clicked book now (0-15 points)
  IF profile_record.clicked_book_now THEN
    intent_points := intent_points + 15;
  END IF;
  
  -- Abandoned booking penalty (-5 points)
  IF profile_record.abandoned_booking THEN
    intent_points := intent_points - 5;
  END IF;
  
  -- Multiple service interests (0-5 points)
  IF COALESCE(array_length(profile_record.services_viewed, 1), 0) >= 2 THEN
    intent_points := intent_points + 5;
  END IF;
  
  -- Calculate total score
  total_points := behavioral_points + demographic_points + intent_points;
  
  -- Determine lead grade
  IF total_points >= 80 THEN
    lead_grade_result := 'hot';
  ELSIF total_points >= 50 THEN
    lead_grade_result := 'warm';
  ELSE
    lead_grade_result := 'cold';
  END IF;
  
  -- Update the profile with calculated scores
  UPDATE lead_profiles SET
    behavioral_score = ROUND(behavioral_points, 1),
    demographic_score = ROUND(demographic_points, 1),
    intent_score = ROUND(intent_points, 1),
    total_score = ROUND(total_points, 1),
    lead_grade = lead_grade_result,
    updated_at = now()
  WHERE id = p_lead_profile_id;
  
  -- Create high-value alert if hot lead
  IF lead_grade_result = 'hot' AND total_points >= 85 THEN
    INSERT INTO high_value_lead_alerts (
      lead_profile_id,
      alert_type,
      severity,
      title,
      message,
      recommended_action,
      urgency_level,
      potential_revenue
    ) VALUES (
      p_lead_profile_id,
      'hot_lead',
      'high',
      '🔥 Hot Lead Alert',
      'High-value visitor from ' || COALESCE(profile_record.location_city, 'Unknown Location') || ' with ' || total_points || ' lead score',
      'Immediate follow-up recommended - call within 5 minutes',
      9,
      75000
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-calculate lead score when events are added
CREATE OR REPLACE FUNCTION trigger_lead_score_calculation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM calculate_lead_score(NEW.lead_profile_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_lead_score_on_event
  AFTER INSERT ON lead_scoring_events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_lead_score_calculation();

-- Create function to update source performance metrics
CREATE OR REPLACE FUNCTION update_source_performance_metrics()
RETURNS TRIGGER AS $$
DECLARE
  current_date DATE := CURRENT_DATE;
  current_hour INTEGER := EXTRACT(hour FROM now());
BEGIN
  -- Insert or update source performance record
  INSERT INTO lead_source_performance (
    date, hour, traffic_source, utm_campaign, utm_medium, utm_source, landing_page,
    total_visitors, unique_visitors,
    hot_leads, warm_leads, cold_leads
  ) VALUES (
    current_date, current_hour, 
    COALESCE(NEW.traffic_source, 'direct'),
    NEW.utm_campaign, NEW.utm_medium, NEW.utm_source, NEW.landing_page,
    1, 1,
    CASE WHEN NEW.lead_grade = 'hot' THEN 1 ELSE 0 END,
    CASE WHEN NEW.lead_grade = 'warm' THEN 1 ELSE 0 END,
    CASE WHEN NEW.lead_grade = 'cold' THEN 1 ELSE 0 END
  )
  ON CONFLICT (date, hour, traffic_source, utm_campaign, utm_medium, utm_source, landing_page)
  DO UPDATE SET
    total_visitors = lead_source_performance.total_visitors + 1,
    hot_leads = lead_source_performance.hot_leads + CASE WHEN NEW.lead_grade = 'hot' THEN 1 ELSE 0 END,
    warm_leads = lead_source_performance.warm_leads + CASE WHEN NEW.lead_grade = 'warm' THEN 1 ELSE 0 END,
    cold_leads = lead_source_performance.cold_leads + CASE WHEN NEW.lead_grade = 'cold' THEN 1 ELSE 0 END,
    updated_at = now();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_source_metrics_on_lead_update
  AFTER UPDATE OF lead_grade ON lead_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_source_performance_metrics();