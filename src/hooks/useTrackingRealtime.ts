import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PhlebotomistLocation {
  latitude: number;
  longitude: number;
  updated_at: string;
}

interface TrackingData {
  appointmentStatus: string;
  phlebotomistLocation: PhlebotomistLocation | null;
  phlebotomistName: string | null;
  phlebotomistPhoto: string | null;
  eta: number | null;
  specimenLabName: string | null;
  specimenTrackingId: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useTrackingRealtime(appointmentId: string): TrackingData {
  const [data, setData] = useState<TrackingData>({
    appointmentStatus: 'scheduled',
    phlebotomistLocation: null,
    phlebotomistName: null,
    phlebotomistPhoto: null,
    eta: null,
    specimenLabName: null,
    specimenTrackingId: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!appointmentId) return;

    // Fetch initial appointment data
    const fetchAppointment = async () => {
      const { data: appt, error } = await supabase
        .from('appointments')
        .select('*, staff_profiles(*)')
        .eq('id', appointmentId)
        .maybeSingle();

      if (error || !appt) {
        setData(prev => ({ ...prev, isLoading: false, error: 'Appointment not found' }));
        return;
      }

      setData(prev => ({
        ...prev,
        appointmentStatus: appt.status,
        eta: appt.phlebotomist_eta_minutes,
        specimenLabName: appt.specimen_lab_name,
        specimenTrackingId: appt.specimen_tracking_id,
        isLoading: false,
      }));

      // If phlebotomist assigned, fetch their profile and location
      if (appt.phlebotomist_id) {
        const { data: profile } = await supabase
          .from('staff_profiles')
          .select('photo_url, user_id')
          .eq('id', appt.phlebotomist_id)
          .maybeSingle();

        if (profile?.user_id) {
          const { data: userProfile } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('id', profile.user_id)
            .maybeSingle();

          setData(prev => ({
            ...prev,
            phlebotomistName: userProfile?.full_name || null,
            phlebotomistPhoto: profile?.photo_url || null,
          }));
        }

        // Fetch latest location
        const { data: location } = await supabase
          .from('phlebotomist_locations')
          .select('latitude, longitude, updated_at')
          .eq('phlebotomist_id', appt.phlebotomist_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (location) {
          setData(prev => ({ ...prev, phlebotomistLocation: location }));
        }

        // Subscribe to location updates
        const locationChannel = supabase
          .channel(`phleb-location-${appt.phlebotomist_id}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'phlebotomist_locations',
            filter: `phlebotomist_id=eq.${appt.phlebotomist_id}`,
          }, (payload) => {
            const loc = payload.new as any;
            if (loc?.latitude && loc?.longitude) {
              setData(prev => ({
                ...prev,
                phlebotomistLocation: {
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  updated_at: loc.updated_at,
                },
              }));
            }
          })
          .subscribe();

        // Cleanup location subscription
        return () => { supabase.removeChannel(locationChannel); };
      }
    };

    fetchAppointment();

    // Subscribe to appointment status changes
    const appointmentChannel = supabase
      .channel(`appointment-${appointmentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'appointments',
        filter: `id=eq.${appointmentId}`,
      }, (payload) => {
        const appt = payload.new as any;
        setData(prev => ({
          ...prev,
          appointmentStatus: appt.status,
          eta: appt.phlebotomist_eta_minutes,
          specimenLabName: appt.specimen_lab_name,
          specimenTrackingId: appt.specimen_tracking_id,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(appointmentChannel);
    };
  }, [appointmentId]);

  return data;
}
