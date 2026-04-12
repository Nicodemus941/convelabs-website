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