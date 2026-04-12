export interface ServiceEnhanced {
  id: string;
  tenant_id?: string;
  name: string;
  description?: string;
  base_price: number; // in cents
  duration_minutes: number;
  category: string;
  service_type: 'individual' | 'package' | 'add_on';
  parent_service_id?: string;
  requires_lab_order: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  parent_service?: ServiceEnhanced;
  sub_services?: ServiceEnhanced[];
}

export interface ServiceStaffAssignment {
  id: string;
  service_id: string;
  staff_id: string;
  certification_level: 'standard' | 'advanced' | 'specialist';
  created_at: string;
  service?: ServiceEnhanced;
  staff?: StaffProfile;
}

export interface StaffTimeOffRequest {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
  request_type: 'vacation' | 'sick' | 'personal' | 'other';
  status: 'pending' | 'approved' | 'denied';
  requested_at?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  admin_notes?: string;
  approved_at?: string;
  approved_by?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface StaffDateBlock {
  id: string;
  staff_id: string;
  blocked_date: string;
  reason: string;
  blocked_by: string;
  created_at: string;
}

export interface AppointmentLabOrder {
  id: string;
  appointment_id: string;
  file_path: string;
  original_filename: string;
  file_size?: number;
  mime_type?: string;
  uploaded_by?: string;
  uploaded_at: string;
  access_log: any[];
}

export interface SMSNotification {
  id: string;
  appointment_id: string;
  notification_type: 'on_the_way' | 'sample_delivered' | 'completed';
  phone_number: string;
  message_content: string;
  eta_minutes?: number;
  lab_name?: string;
  tracking_id?: string;
  sent_at: string;
  delivery_status: 'sent' | 'delivered' | 'failed';
  twilio_message_sid?: string;
  created_by?: string;
  metadata: any;
}

export interface AppointmentStatusUpdate {
  id: string;
  appointment_id: string;
  status: 'en_route' | 'sample_delivered' | 'completed';
  updated_by?: string;
  eta_minutes?: number;
  lab_name?: string;
  tracking_id?: string;
  notes?: string;
  created_at: string;
}

export interface StaffProfile {
  id: string;
  user_id?: string;
  first_name?: string;
  last_name?: string;
  specialty?: string;
  certification_level?: string;
  hourly_rate?: number;
  phone?: string;
  email?: string;
  address?: string;
  emergency_contact?: string;
  hire_date?: string;
  status?: string;
  created_at: string;
  updated_at: string;
}