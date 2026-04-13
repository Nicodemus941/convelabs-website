import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from '@/components/ui/sonner';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'en_route' | 'arrived' | 'in_progress' | 'specimen_delivered' | 'completed' | 'cancelled';

export interface PhlebAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  status: AppointmentStatus;
  address: string;
  zipcode: string;
  service_type: string;
  notes: string | null;
  total_amount: number;
  tip_amount: number;
  service_price: number;
  payment_status: string | null;
  invoice_status: string | null;
  is_vip: boolean;
  booking_source: string | null;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  patient_dob: string | null;
  patient_insurance: string | null;
  patient_insurance_id: string | null;
  patient_insurance_group: string | null;
}

export function usePhlebotomistAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<PhlebAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [monthDates, setMonthDates] = useState<Set<string>>(new Set());
  // Fetch all appointments for the current month for this phlebotomist
  const fetchMonthAppointments = useCallback(async (targetMonth?: Date) => {
    if (!user) return;
    setIsLoading(true);

    const month = targetMonth || new Date();
    const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

    try {
      // phlebotomist_id stores the auth user ID (not staff_profiles.id)
      const isPhlebRole = user.role === 'phlebotomist';

      let query = supabase
        .from('appointments')
        .select('*')
        .gte('appointment_date', monthStart)
        .lte('appointment_date', monthEnd)
        .not('status', 'eq', 'cancelled')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

      // Phlebotomists only see their own appointments
      // Admins/owners see all
      if (isPhlebRole) {
        query = query.eq('phlebotomist_id', user.id);
      }

      const { data: appts, error } = await query;

      if (error) throw error;

      // Build set of dates that have appointments (extract yyyy-MM-dd from timestamp)
      const dates = new Set<string>();
      (appts || []).forEach((a: any) => {
        if (a.appointment_date) {
          const dateOnly = a.appointment_date.substring(0, 10); // "2026-04-13" from "2026-04-13 12:00:00+00"
          dates.add(dateOnly);
        }
      });
      setMonthDates(dates);

      // Enrich with patient data
      const enriched: PhlebAppointment[] = await Promise.all(
        (appts || []).map(async (appt: any) => {
          let patientName = 'Unknown Patient';
          let patientPhone: string | null = null;
          let patientEmail: string | null = null;
          let patientDob: string | null = null;
          let patientInsurance: string | null = null;
          let patientInsuranceId: string | null = null;
          let patientInsuranceGroup: string | null = null;

          // Try lookup by patient_id first, then by email from notes
          if (appt.patient_id) {
            const { data: patient } = await supabase
              .from('tenant_patients')
              .select('id, first_name, last_name, phone, email, date_of_birth, insurance_provider, insurance_member_id, insurance_group_number')
              .eq('id', appt.patient_id)
              .maybeSingle();

            if (patient) {
              patientName = `${patient.first_name} ${patient.last_name}`.trim();
              patientPhone = patient.phone;
              patientEmail = patient.email;
              patientDob = patient.date_of_birth;
              patientInsurance = patient.insurance_provider;
              patientInsuranceId = patient.insurance_member_id;
              patientInsuranceGroup = patient.insurance_group_number;
            }
          }

          // Fallback: parse from notes and lookup by email
          if (patientName === 'Unknown Patient' && appt.notes) {
            const nameMatch = appt.notes.match(/Patient:\s*([^|]+)/);
            const emailMatch = appt.notes.match(/Email:\s*([^|]+)/);
            const phoneMatch = appt.notes.match(/Phone:\s*([^|]+)/);
            if (nameMatch) patientName = nameMatch[1].trim();
            if (phoneMatch) patientPhone = phoneMatch[1].trim();
            if (emailMatch) patientEmail = emailMatch[1].trim();

            // Try email lookup in tenant_patients for phone/insurance
            if (patientEmail && !patientPhone) {
              const { data: tpByEmail } = await supabase
                .from('tenant_patients')
                .select('phone, email, insurance_provider, insurance_member_id, insurance_group_number')
                .ilike('email', patientEmail.trim())
                .maybeSingle();
              if (tpByEmail) {
                if (tpByEmail.phone) patientPhone = tpByEmail.phone;
                if (tpByEmail.insurance_provider) patientInsurance = tpByEmail.insurance_provider;
                if (tpByEmail.insurance_member_id) patientInsuranceId = tpByEmail.insurance_member_id;
                if (tpByEmail.insurance_group_number) patientInsuranceGroup = tpByEmail.insurance_group_number;
              }
            }
          }

          // Normalize appointment_date to yyyy-MM-dd (may come as full timestamp)
          const normalizedDate = appt.appointment_date ? appt.appointment_date.substring(0, 10) : appt.appointment_date;

          return {
            id: appt.id,
            appointment_date: normalizedDate,
            appointment_time: appt.appointment_time,
            status: appt.status as AppointmentStatus,
            address: appt.address || 'Address pending',
            zipcode: appt.zipcode || '',
            service_type: appt.service_type || 'mobile',
            notes: appt.notes,
            total_amount: appt.total_amount || 0,
            tip_amount: appt.tip_amount || 0,
            service_price: appt.service_price || 0,
            payment_status: appt.payment_status || null,
            invoice_status: appt.invoice_status || null,
            is_vip: appt.is_vip || false,
            booking_source: appt.booking_source || 'online',
            patient_id: appt.patient_id,
            patient_name: patientName,
            patient_phone: patientPhone,
            patient_email: patientEmail,
            patient_dob: patientDob,
            patient_insurance: patientInsurance,
            patient_insurance_id: patientInsuranceId,
            patient_insurance_group: patientInsuranceGroup,
          };
        })
      );

      setAppointments(enriched);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      toast.error('Failed to load appointments');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const updateStatus = useCallback(async (appointmentId: string, newStatus: AppointmentStatus) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', appointmentId);

      if (error) throw error;

      setAppointments(prev =>
        prev.map(a => a.id === appointmentId ? { ...a, status: newStatus } : a)
      );

      // Trigger post-visit sequence when appointment is completed
      if (newStatus === 'completed') {
        const appt = appointments.find(a => a.id === appointmentId);
        if (appt) {
          supabase.functions.invoke('trigger-post-visit-sequence', {
            body: {
              appointmentId,
              patientId: appt.patient_id,
              patientEmail: appt.patient_email,
              patientPhone: appt.patient_phone,
              patientName: appt.patient_name,
            },
          }).catch(err => console.error('Post-visit trigger error (non-blocking):', err));
        }
      }

      return true;
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
      return false;
    }
  }, []);

  const getAppointmentsForDate = useCallback((dateStr: string) => {
    return appointments.filter(a => a.appointment_date === dateStr);
  }, [appointments]);

  const getCompletedAppointments = useCallback((startDate?: string, endDate?: string) => {
    return appointments.filter(a => {
      if (a.status !== 'completed') return false;
      if (startDate && a.appointment_date < startDate) return false;
      if (endDate && a.appointment_date > endDate) return false;
      return true;
    });
  }, [appointments]);

  useEffect(() => {
    fetchMonthAppointments();
  }, [fetchMonthAppointments]);

  return {
    appointments,
    isLoading,
    monthDates,
    fetchMonthAppointments,
    updateStatus,
    getAppointmentsForDate,
    getCompletedAppointments,
  };
}
