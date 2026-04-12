-- Check if service_add_ons table exists, if not create it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'service_add_ons') THEN
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
        ALTER TABLE public.service_add_ons ENABLE ROW LEVEL SECURITY;

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

        -- Create trigger for automatic timestamp updates
        CREATE TRIGGER update_service_add_ons_updated_at
        BEFORE UPDATE ON public.service_add_ons
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();

        -- Add indexes for better performance
        CREATE INDEX idx_service_add_ons_parent_service_id ON public.service_add_ons(parent_service_id);
        CREATE INDEX idx_service_add_ons_active ON public.service_add_ons(is_active);
    END IF;
END $$;