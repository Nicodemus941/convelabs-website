-- Create table for service staff assignments
CREATE TABLE public.service_staff_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL,
  staff_id UUID NOT NULL,
  can_lead BOOLEAN NOT NULL DEFAULT false,
  can_assist BOOLEAN NOT NULL DEFAULT true,
  hourly_rate INTEGER, -- in cents
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(service_id, staff_id)
);

-- Create table for sub-services (add-ons)
CREATE TABLE public.service_add_ons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_service_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  additional_price INTEGER NOT NULL DEFAULT 0, -- in cents
  additional_duration_minutes INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.service_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_add_ons ENABLE ROW LEVEL SECURITY;

-- Create policies for service_staff_assignments
CREATE POLICY "Admins can manage service staff assignments" 
ON public.service_staff_assignments 
FOR ALL 
USING (is_user_admin())
WITH CHECK (is_user_admin());

CREATE POLICY "Staff can view their service assignments" 
ON public.service_staff_assignments 
FOR SELECT 
USING (staff_id IN (
  SELECT sp.id FROM staff_profiles sp WHERE sp.user_id = auth.uid()
));

-- Create policies for service_add_ons
CREATE POLICY "Admins can manage service add-ons" 
ON public.service_add_ons 
FOR ALL 
USING (is_user_admin())
WITH CHECK (is_user_admin());

CREATE POLICY "Anyone can view active service add-ons" 
ON public.service_add_ons 
FOR SELECT 
USING (is_active = true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_service_staff_assignments_updated_at
BEFORE UPDATE ON public.service_staff_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_service_add_ons_updated_at
BEFORE UPDATE ON public.service_add_ons
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_service_staff_assignments_service_id ON public.service_staff_assignments(service_id);
CREATE INDEX idx_service_staff_assignments_staff_id ON public.service_staff_assignments(staff_id);
CREATE INDEX idx_service_add_ons_parent_service_id ON public.service_add_ons(parent_service_id);
CREATE INDEX idx_service_add_ons_active ON public.service_add_ons(is_active);