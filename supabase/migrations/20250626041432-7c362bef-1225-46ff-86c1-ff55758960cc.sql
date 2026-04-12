
-- Add location columns to the page_views table
ALTER TABLE public.page_views 
ADD COLUMN ip_address inet,
ADD COLUMN city text,
ADD COLUMN state text,
ADD COLUMN zip_code text,
ADD COLUMN country text,
ADD COLUMN latitude numeric,
ADD COLUMN longitude numeric;

-- Create an index on location columns for faster queries
CREATE INDEX idx_page_views_location ON public.page_views(country, state, city);
CREATE INDEX idx_page_views_ip ON public.page_views(ip_address);

-- Create a table for optional user demographics surveys
CREATE TABLE public.user_demographics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  age_range TEXT,
  gender TEXT,
  income_range TEXT,
  occupation TEXT,
  interests TEXT[],
  survey_completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS policies for user demographics
ALTER TABLE public.user_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own demographics" 
  ON public.user_demographics 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own demographics" 
  ON public.user_demographics 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own demographics" 
  ON public.user_demographics 
  FOR UPDATE 
  USING (auth.uid() = user_id);
