-- Enhanced Service Management System
CREATE TABLE IF NOT EXISTS public.services_enhanced (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  base_price INTEGER NOT NULL DEFAULT 0, -- in cents
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  category TEXT NOT NULL DEFAULT 'lab_draw',
  service_type TEXT NOT NULL DEFAULT 'individual', -- individual, package, add_on
  parent_service_id UUID REFERENCES public.services_enhanced(id), -- for sub-services/add-ons
  requires_lab_order BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Service Staff Assignments (which staff can perform which services)
CREATE TABLE IF NOT EXISTS public.service_staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services_enhanced(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  certification_level TEXT DEFAULT 'standard', -- standard, advanced, specialist
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_id, staff_id)
);

-- Staff Time Off Requests
CREATE TABLE IF NOT EXISTS public.staff_time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  request_type TEXT NOT NULL DEFAULT 'vacation', -- vacation, sick, personal, other
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, denied
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Staff Date Blocks (admins blocking staff on certain dates)
CREATE TABLE IF NOT EXISTS public.staff_date_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason TEXT NOT NULL,
  blocked_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, blocked_date)
);

-- Secure Lab Orders Storage
CREATE TABLE IF NOT EXISTS public.appointment_lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, -- path in storage bucket
  original_filename TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  access_log JSONB DEFAULT '[]'::jsonb -- track who accessed the file when
);

-- SMS Notification Tracking
CREATE TABLE IF NOT EXISTS public.sms_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- on_the_way, sample_delivered, completed
  phone_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  eta_minutes INTEGER, -- for on_the_way notifications
  lab_name TEXT, -- for sample_delivered notifications
  tracking_id TEXT, -- for sample_delivered notifications
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivery_status TEXT DEFAULT 'sent', -- sent, delivered, failed
  twilio_message_sid TEXT,
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Appointment Status Tracking for SMS workflow
CREATE TABLE IF NOT EXISTS public.appointment_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- en_route, sample_delivered, completed
  updated_by UUID REFERENCES public.staff_profiles(id),
  eta_minutes INTEGER,
  lab_name TEXT,
  tracking_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Google Review Requests
CREATE TABLE IF NOT EXISTS public.review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES auth.users(id),
  review_url TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  clicked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rating INTEGER, -- if we track the rating they give
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced appointment cancellation policies
CREATE TABLE IF NOT EXISTS public.appointment_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  cancelled_by UUID REFERENCES auth.users(id),
  cancelled_at TIMESTAMPTZ DEFAULT NOW(),
  hours_before_appointment INTEGER,
  cancellation_fee INTEGER DEFAULT 0, -- in cents
  refund_amount INTEGER DEFAULT 0, -- in cents
  reason TEXT,
  policy_applied TEXT -- which cancellation policy was applied
);

-- Storage bucket for lab orders
INSERT INTO storage.buckets (id, name, public) 
VALUES ('lab-orders', 'lab-orders', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for new tables
ALTER TABLE public.services_enhanced ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_date_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_status_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_cancellations ENABLE ROW LEVEL SECURITY;

-- Admin can manage all services
CREATE POLICY "Admins can manage services" ON public.services_enhanced
FOR ALL USING (is_user_admin());

-- Staff can view services they're assigned to
CREATE POLICY "Staff can view assigned services" ON public.services_enhanced
FOR SELECT USING (
  id IN (
    SELECT service_id FROM public.service_staff_assignments ssa
    JOIN public.staff_profiles sp ON ssa.staff_id = sp.id
    WHERE sp.user_id = auth.uid()
  )
);

-- Public can view active services
CREATE POLICY "Public can view active services" ON public.services_enhanced
FOR SELECT USING (is_active = true);

-- Service staff assignments policies
CREATE POLICY "Admins can manage service assignments" ON public.service_staff_assignments
FOR ALL USING (is_user_admin());

CREATE POLICY "Staff can view their assignments" ON public.service_staff_assignments
FOR SELECT USING (
  staff_id IN (
    SELECT id FROM public.staff_profiles WHERE user_id = auth.uid()
  )
);

-- Time off request policies
CREATE POLICY "Staff can manage their time off requests" ON public.staff_time_off_requests
FOR ALL USING (
  staff_id IN (
    SELECT id FROM public.staff_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all time off requests" ON public.staff_time_off_requests
FOR ALL USING (is_user_admin());

-- Staff date blocks policies
CREATE POLICY "Admins can manage staff blocks" ON public.staff_date_blocks
FOR ALL USING (is_user_admin());

CREATE POLICY "Staff can view their blocks" ON public.staff_date_blocks
FOR SELECT USING (
  staff_id IN (
    SELECT id FROM public.staff_profiles WHERE user_id = auth.uid()
  )
);

-- Lab orders policies
CREATE POLICY "Patients can upload lab orders for their appointments" ON public.appointment_lab_orders
FOR INSERT WITH CHECK (
  uploaded_by = auth.uid() AND
  appointment_id IN (
    SELECT id FROM public.appointments WHERE patient_id = auth.uid()
  )
);

CREATE POLICY "Patients can view their lab orders" ON public.appointment_lab_orders
FOR SELECT USING (
  appointment_id IN (
    SELECT id FROM public.appointments WHERE patient_id = auth.uid()
  )
);

CREATE POLICY "Assigned staff can view lab orders" ON public.appointment_lab_orders
FOR SELECT USING (
  appointment_id IN (
    SELECT id FROM public.appointments a
    JOIN public.staff_profiles sp ON a.phlebotomist_id = sp.id
    WHERE sp.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all lab orders" ON public.appointment_lab_orders
FOR ALL USING (is_user_admin());

-- SMS notifications policies
CREATE POLICY "System can manage SMS notifications" ON public.sms_notifications
FOR ALL USING (true);

CREATE POLICY "Staff can view SMS for their appointments" ON public.sms_notifications
FOR SELECT USING (
  appointment_id IN (
    SELECT id FROM public.appointments a
    JOIN public.staff_profiles sp ON a.phlebotomist_id = sp.id
    WHERE sp.user_id = auth.uid()
  )
);

-- Appointment status updates policies
CREATE POLICY "Staff can update their appointment statuses" ON public.appointment_status_updates
FOR ALL USING (
  updated_by IN (
    SELECT id FROM public.staff_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all status updates" ON public.appointment_status_updates
FOR ALL USING (is_user_admin());

-- Review requests policies
CREATE POLICY "Patients can view their review requests" ON public.review_requests
FOR SELECT USING (patient_id = auth.uid());

CREATE POLICY "System can manage review requests" ON public.review_requests
FOR ALL USING (true);

-- Appointment cancellations policies
CREATE POLICY "Users can view their cancellations" ON public.appointment_cancellations
FOR SELECT USING (
  cancelled_by = auth.uid() OR
  appointment_id IN (
    SELECT id FROM public.appointments WHERE patient_id = auth.uid()
  )
);

CREATE POLICY "System can manage cancellations" ON public.appointment_cancellations
FOR ALL USING (true);

-- Storage policies for lab orders bucket
CREATE POLICY "Patients can upload lab orders" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'lab-orders' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Patients can view their lab orders" ON storage.objects
FOR SELECT USING (
  bucket_id = 'lab-orders' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Assigned staff can view lab orders" ON storage.objects
FOR SELECT USING (
  bucket_id = 'lab-orders' AND
  EXISTS (
    SELECT 1 FROM public.appointments a
    JOIN public.staff_profiles sp ON a.phlebotomist_id = sp.id
    WHERE sp.user_id = auth.uid()
    AND (storage.foldername(name))[2] = a.id::text
  )
);

CREATE POLICY "Admins can manage all lab orders" ON storage.objects
FOR ALL USING (bucket_id = 'lab-orders' AND is_user_admin());

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_services_enhanced_updated_at BEFORE UPDATE ON public.services_enhanced
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_time_off_updated_at BEFORE UPDATE ON public.staff_time_off_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();