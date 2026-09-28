import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import AppointmentTracker from '@/components/patient/AppointmentTracker';
import LabOrderUpload from '@/components/patient/LabOrderUpload';

const PatientAppointmentSection = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAppointments();
  }, [user]);

  const fetchAppointments = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);

      // appointments.patient_id points at the patient's CHART
      // (tenant_patients.id), not at their login. Matching it against user.id
      // returned only the minority of rows that happen to carry an auth id --
      // which is why a patient could book a visit, get the confirmation, and
      // then see an empty dashboard.
      //
      // current_user_chart_ids() is SECURITY DEFINER because tenant_patients
      // has RLS of its own. If it is not deployed yet the catch leaves ids as
      // [user.id], which is exactly the old behaviour -- so this is safe to
      // ship ahead of the migration and starts working when that lands.
      const ids: string[] = [user.id];
      try {
        const { data: chartIds } = await supabase.rpc('current_user_chart_ids' as any);
        for (const row of (chartIds as any[]) || []) {
          const id = typeof row === 'string' ? row : row?.current_user_chart_ids ?? row?.id;
          if (id && !ids.includes(id)) ids.push(id);
        }
      } catch {
        /* pre-migration, or the function is unavailable -- fall back to the login id */
      }

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          phlebotomist:staff_profiles(first_name, last_name)
        `)
        .in('patient_id', ids)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const upcomingAppointments = appointments.filter(apt => 
    new Date(apt.appointment_date) >= new Date() && apt.status !== 'completed'
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Recent Appointments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p>Loading appointments...</p>
          ) : upcomingAppointments.length > 0 ? (
            upcomingAppointments.slice(0, 3).map((appointment) => (
              <AppointmentTracker 
                key={appointment.id}
                appointment={{
                  id: appointment.id,
                  status: appointment.status,
                  appointment_date: appointment.appointment_date,
                  appointment_time: appointment.appointment_time || '09:00',
                  address: appointment.address,
                  phlebotomist_name: appointment.phlebotomist 
                    ? `${appointment.phlebotomist.first_name} ${appointment.phlebotomist.last_name}`
                    : 'TBD',
                  eta_minutes: appointment.eta_minutes,
                  service_type: appointment.service_type || 'Lab Draw'
                }}
              />
            ))
          ) : (
            <p className="text-muted-foreground text-center py-6">
              No upcoming appointments
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Lab Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingAppointments.length > 0 ? (
            <LabOrderUpload 
              appointmentId={upcomingAppointments[0].id}
              onUploadComplete={fetchAppointments}
            />
          ) : (
            <p className="text-muted-foreground text-center py-6">
              Book an appointment to upload lab orders
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientAppointmentSection;