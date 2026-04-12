-- Create storage bucket for corporate CSV uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('corporate-uploads', 'corporate-uploads', false);

-- Create RLS policies for corporate uploads bucket
CREATE POLICY "Authenticated users can upload corporate files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'corporate-uploads' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can view their corporate uploads" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'corporate-uploads' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can delete their corporate uploads" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'corporate-uploads' 
  AND auth.uid() IS NOT NULL
);

-- Create table to track CSV upload jobs
CREATE TABLE public.csv_upload_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  successful_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  error_details JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_status CHECK (status IN ('processing', 'completed', 'failed'))
);

-- Enable RLS on csv_upload_jobs
ALTER TABLE public.csv_upload_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for csv_upload_jobs
CREATE POLICY "Users can view their own upload jobs" 
ON public.csv_upload_jobs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own upload jobs" 
ON public.csv_upload_jobs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update upload jobs" 
ON public.csv_upload_jobs 
FOR UPDATE 
USING (true);