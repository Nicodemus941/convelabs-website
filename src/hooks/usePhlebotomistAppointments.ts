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
  service_name: string | null;
  notes: string | null;
  total_amount: number;
  tip_amount: number;
  service_price: number;
  payment_status: string | null;
  invoice_status: string | null;
  is_vip: boolean;
  booking_source: string | null;
  gate_code: string | null;
  // Specimen delivery destination — where the phleb should drop off samples.
  // On manually-created appointments this is often empty; the card falls back
  // to scanning notes or showing "check with office".
  lab_destination: string | null;
  // Uploaded file paths (Supabase Storage → bucket 'lab-orders')
  lab_order_file_path: string | null;
  insurance_card_path: string | null;
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
          // PRIORITY 1: Use appointment columns directly (most reliable)
          let patientName = appt.patient_name || 'Unknown Patient';
          let patientPhone: string | null = appt.patient_phone || null;
          let patientEmail: string | null = appt.patient_email || null;
          let patientDob: string | null = null;
          let patientInsurance: string | null = null;
          let patientInsuranceId: string | null = null;
          let patientInsuranceGroup: string | null = null;
          let labOrderPath: string | null = appt.lab_order_file_path || null;

          // PRIORITY 2: Lookup tenant_patients for insurance/DOB and missing fields
          let tpData: any = null;
          if (appt.patient_id) {
            // Try by patient_id (could be tenant_patients.id)
            const { data } = await supabase
              .from('tenant_patients')
              .select('*')
              .eq('id', appt.patient_id)
              .maybeSingle();
            if (data) tpData = data;
            else {
              // Try by user_id (could be auth.users.id)
              const { data: byUser } = await supabase
                .from('tenant_patients')
                .select('*')
                .eq('user_id', appt.patient_id)
                .maybeSingle();
              if (byUser) tpData = byUser;
            }
          }

          // Try by email if still no match
          if (!tpData && (patientEmail || appt.notes?.includes('Email:'))) {
            const email = patientEmail || appt.notes?.match(/Email:\s*([^\s|]+)/)?.[1]?.trim();
            if (email) {
              const { data } = await supabase
                .from('tenant_patients')
                .select('*')
                .ilike('email', email)
                .maybeSingle();
              if (data) tpData = data;
            }
          }

          // Fill from tenant_patients data
          if (tpData) {
            if (patientName === 'Unknown Patient') patientName = `${tpData.first_name || ''} ${tpData.last_name || ''}`.trim() || patientName;
            if (!patientPhone && tpData.phone) patientPhone = tpData.phone;
            if (!patientEmail && tpData.email) patientEmail = tpData.email;
            patientDob = tpData.date_of_birth || null;
            patientInsurance = tpData.insurance_provider || null;
            patientInsuranceId = tpData.insurance_member_id || null;
            patientInsuranceGroup = tpData.insurance_group_number || null;
            // Sync address from tenant_patients if appointment address is missing or placeholder
            const apptAddr = (appt.address || '').trim().toLowerCase();
            if (!apptAddr || apptAddr === 'tbd' || apptAddr === 'address pending') {
              if (tpData.address) {
                const fullAddr = [tpData.address, tpData.city, tpData.state, tpData.zipcode].filter(Boolean).join(', ');
                appt.address = fullAddr;
                appt.zipcode = tpData.zipcode || appt.zipcode;
                // Also update the appointment record so it stays synced
                supabase.from('appointments').update({ address: fullAddr, zipcode: tpData.zipcode || appt.zipcode }).eq('id', appt.id).then(() => {});
              }
            }
          }

          // PRIORITY 3: Parse from notes (oldest fallback)
          if (patientName === 'Unknown Patient' && appt.notes) {
            const nameMatch = appt.notes.match(/Patient:\s*([^|]+)/);
            if (nameMatch) patientName = nameMatch[1].trim();
          }
          if (!patientPhone && appt.notes) {
            const phoneMatch = appt.notes.match(/Phone:\s*([^|\s]+)/);
            if (phoneMatch) patientPhone = phoneMatch[1].trim();
          }
          if (!patientEmail && appt.notes) {
            const emailMatch = appt.notes.match(/Email:\s*([^|\s]+)/);
            if (emailMatch) patientEmail = emailMatch[1].trim();
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
            service_name: appt.service_name || null,
            notes: appt.notes,
            total_amount: appt.total_amount || 0,
            tip_amount: appt.tip_amount || 0,
            service_price: appt.service_price || 0,
            payment_status: appt.payment_status || null,
            invoice_status: appt.invoice_status || null,
            is_vip: appt.is_vip || false,
            booking_source: appt.booking_source || 'online',
            gate_code: appt.gate_code || null,
            lab_destination: appt.lab_destination || null,
            lab_order_file_path: labOrderPath,
            insurance_card_path: appt.insurance_card_path || null,
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
          }).then(({ error: seqErr }) => {
            if (seqErr) toast.error('Follow-up sequence failed — admin notified');
            else toast.success('Post-visit follow-up sequence triggered');
          }).catch(() => toast.error('Follow-up sequence failed'));
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
