-- Create tables for visitor analytics and optimization

-- Visitor analyses table to store AI analysis results
CREATE TABLE IF NOT EXISTS public.visitor_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  visitor_data JSONB NOT NULL,
  analysis_result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Visitor interactions table to track user behavior
CREATE TABLE IF NOT EXISTS public.visitor_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('cta_click', 'form_start', 'form_complete', 'video_play', 'scroll_depth', 'exit_intent')),
  element TEXT NOT NULL,
  value TEXT,
  page_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add session_id column to existing page_views table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'page_views' AND column_name = 'session_id') THEN
    ALTER TABLE public.page_views ADD COLUMN session_id TEXT;
  END IF;
END $$;

-- Add time_on_page column to existing page_views table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'page_views' AND column_name = 'time_on_page') THEN
    ALTER TABLE public.page_views ADD COLUMN time_on_page INTEGER;
  END IF;
END $$;

-- A/B test experiments table
CREATE TABLE IF NOT EXISTS public.ab_test_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  variants JSONB NOT NULL, -- Array of variant configurations
  traffic_split JSONB NOT NULL, -- Percentage allocation for each variant
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  success_metric TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- A/B test assignments table
CREATE TABLE IF NOT EXISTS public.ab_test_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.ab_test_experiments(id),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  variant TEXT NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Conversion events table
CREATE TABLE IF NOT EXISTS public.conversion_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('booking', 'membership_signup', 'consultation_request', 'newsletter_signup')),
  event_value NUMERIC,
  experiment_id UUID REFERENCES public.ab_test_experiments(id),
  variant TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.visitor_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for visitor_analyses
CREATE POLICY "Allow all access to visitor_analyses" ON public.visitor_analyses FOR ALL USING (true);

-- Create RLS policies for visitor_interactions  
CREATE POLICY "Allow all access to visitor_interactions" ON public.visitor_interactions FOR ALL USING (true);

-- Create RLS policies for ab_test_experiments (admin only for modifications)
CREATE POLICY "Anyone can view ab_test_experiments" ON public.ab_test_experiments FOR SELECT USING (true);
CREATE POLICY "Admin can manage ab_test_experiments" ON public.ab_test_experiments FOR ALL USING (public.is_admin());

-- Create RLS policies for ab_test_assignments
CREATE POLICY "Allow all access to ab_test_assignments" ON public.ab_test_assignments FOR ALL USING (true);

-- Create RLS policies for conversion_events
CREATE POLICY "Allow all access to conversion_events" ON public.conversion_events FOR ALL USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_visitor_analyses_session_id ON public.visitor_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_analyses_user_id ON public.visitor_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_visitor_analyses_created_at ON public.visitor_analyses(created_at);

CREATE INDEX IF NOT EXISTS idx_visitor_interactions_session_id ON public.visitor_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_interactions_user_id ON public.visitor_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_visitor_interactions_type ON public.visitor_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_visitor_interactions_created_at ON public.visitor_interactions(created_at);

CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON public.page_views(session_id);

CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_experiment_id ON public.ab_test_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_session_id ON public.ab_test_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_user_id ON public.ab_test_assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_conversion_events_session_id ON public.conversion_events(session_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_user_id ON public.conversion_events(user_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_type ON public.conversion_events(event_type);
CREATE INDEX IF NOT EXISTS idx_conversion_events_experiment_id ON public.conversion_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_created_at ON public.conversion_events(created_at);

-- Create trigger for ab_test_experiments
CREATE TRIGGER update_ab_test_experiments_updated_at 
    BEFORE UPDATE ON public.ab_test_experiments 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();