import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from '@/components/ui/sonner';
import { cacheAppointments, readCachedAppointments, subscribeToOnlineStatus } from '@/lib/offlineAppointments';

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
  // OCR-extracted content from the lab order (populated by ocr-lab-order edge fn)
  lab_order_ocr_text: string | null;
  lab_order_panels: string[] | null;
  ocr_processed_at: string | null;
  // Patient selected "I'll confirm with my doctor" — admin follow-up required
  lab_destination_pending: boolean;
  // Sprint 3.5: collection timestamp + optional geo-stamp (from TubeLabelModal)
  collection_at: string | null;
  // Sprint 4: recurring series linkage (prepaid bundles or per-visit)
  recurrence_group_id: string | null;
  recurrence_sequence: number | null;
  recurrence_total: number | null;
  visit_bundle_id: string | null;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  patient_dob: string | null;
  patient_insurance: string | null;
  patient_insurance_id: string | null;
  patient_insurance_group: string | null;
  // Partner org linkage — admin-assigned via AssignOrgButton OR from
  // partner booking flow. Phleb card shows the name so the phleb knows
  // to bill through the right practice + not call patient directly
  // (for masked org_covers patients like Aristotle).
  organization_id: string | null;
  organization_name: string | null;
  billed_to: 'patient' | 'org' | null;
}

export function usePhlebotomistAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<PhlebAppointment[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastCacheAt, setLastCacheAt] = useState<number | null>(null);
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

      // Pre-load org names in one query (not N+1) so the phleb card can
      // show "Billed through: Aristotle Education" etc. Fixes the gap
      // where admin linked an org but phleb dashboard didn't show it.
      const orgIds = Array.from(new Set((appts || [])
        .map((a: any) => a.organization_id)
        .filter(Boolean)));
      const orgNameById = new Map<string, string>();
      if (orgIds.length > 0) {
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', orgIds);
        for (const o of (orgs || [])) orgNameById.set(o.id, o.name);
      }

      // Family-group dedupe: a household with multiple patients per visit
      // generates one primary row + one row per companion (companion_role
      // set, family_group_id = primary's id). Phleb only needs ONE card
      // per household — show the primary, list companions inside the card.
      // Filter companions out of the main list and build a lookup by group.
      const companionsByGroup = new Map<string, Array<{ name: string; role: string | null }>>();
      for (const a of (appts || []) as any[]) {
        if (a.family_group_id && a.id !== a.family_group_id && a.companion_role) {
          const list = companionsByGroup.get(a.family_group_id) || [];
          list.push({ name: a.patient_name || 'Companion', role: a.companion_role || null });
          companionsByGroup.set(a.family_group_id, list);
        }
      }
      const apptsDeduped = (appts || []).filter((a: any) =>
        !a.family_group_id || a.id === a.family_group_id || !a.companion_role
      );

      // Build set of dates that have appointments (extract yyyy-MM-dd from timestamp)
      const dates = new Set<string>();
      apptsDeduped.forEach((a: any) => {
        if (a.appointment_date) {
          const dateOnly = a.appointment_date.substring(0, 10); // "2026-04-13" from "2026-04-13 12:00:00+00"
          dates.add(dateOnly);
        }
      });
      setMonthDates(dates);

      // Enrich with patient data
      const enriched: PhlebAppointment[] = await Promise.all(
        apptsDeduped.map(async (appt: any) => {
          // PRIORITY 1: Use appointment columns directly (most reliable)
          let patientName = appt.patient_name || 'Unknown Patient';
          // Append companion names so the phleb card reads as a household visit
          const companions = appt.family_group_id ? (companionsByGroup.get(appt.family_group_id) || []) : [];
          if (companions.length > 0) {
            const names = companions.map(c => c.name).join(', ');
            patientName = `${patientName} + ${names}`;
          }
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
            lab_destination_pending: !!appt.lab_destination_pending,
            lab_order_file_path: labOrderPath,
            insurance_card_path: appt.insurance_card_path || null,
            lab_order_ocr_text: appt.lab_order_ocr_text || null,
            lab_order_panels: Array.isArray(appt.lab_order_panels) ? appt.lab_order_panels : null,
            ocr_processed_at: appt.ocr_processed_at || null,
            collection_at: appt.collection_at || null,
            recurrence_group_id: appt.recurrence_group_id || null,
            recurrence_sequence: appt.recurrence_sequence ?? null,
            recurrence_total: appt.recurrence_total ?? null,
            visit_bundle_id: appt.visit_bundle_id || null,
            patient_id: appt.patient_id,
            patient_name: patientName,
            patient_phone: patientPhone,
            patient_email: patientEmail,
            patient_dob: patientDob,
            patient_insurance: patientInsurance,
            patient_insurance_id: patientInsuranceId,
            patient_insurance_group: patientInsuranceGroup,
            organization_id: appt.organization_id || null,
            organization_name: appt.organization_id ? (orgNameById.get(appt.organization_id) || null) : null,
            billed_to: (appt.billed_to as 'patient' | 'org') || null,
          };
        })
      );

      setAppointments(enriched);

      // Mirror into IndexedDB for offline mode
      cacheAppointments(enriched).catch(() => { /* non-blocking */ });
    } catch (err) {
      console.error('Error fetching appointments:', err);
      // Attempt offline fallback — if we're offline (or query failed), read cache
      try {
        const { rows, lastSync } = await readCachedAppointments<PhlebAppointment>();
        if (rows.length > 0) {
          setAppointments(rows);
          const mins = lastSync ? Math.round((Date.now() - lastSync) / 60_000) : null;
          toast.info(`Offline mode — showing cached schedule${mins !== null ? ` (${mins} min old)` : ''}`);
        } else {
          toast.error('Failed to load appointments and no offline cache available');
        }
      } catch {
        toast.error('Failed to load appointments');
      }
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

  // Refetch when the PWA tab regains focus. Without this, an admin
  // scheduling a manual appointment never showed up on the phleb's
  // calendar until they navigated months or closed+reopened.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        fetchMonthAppointments();
      }
    };
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [fetchMonthAppointments]);

  // Realtime push: subscribe to INSERT/UPDATE on appointments scoped
  // to this phleb. Any new manual booking by admin pushes to the PWA
  // within seconds. Falls back gracefully if realtime is unavailable.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`appts-phleb-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `phlebotomist_id=eq.${user.id}` },
        () => { fetchMonthAppointments(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchMonthAppointments]);

  // Online/offline status subscription — used by the offline banner
  useEffect(() => {
    return subscribeToOnlineStatus((online) => setIsOnline(online));
  }, []);

  // Track last cache time for the "cache age" display
  useEffect(() => {
    readCachedAppointments().then(({ lastSync }) => setLastCacheAt(lastSync));
  }, [appointments.length]);

  return {
    appointments,
    isLoading,
    monthDates,
    isOnline,
    lastCacheAt,
    fetchMonthAppointments,
    updateStatus,
    getAppointmentsForDate,
    getCompletedAppointments,
  };
}
