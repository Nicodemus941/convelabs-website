import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import StatusUpdateInterface from '@/components/phlebotomist/StatusUpdateInterface';

const PhlebotomistAppointmentSection = () => {
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
      
      // Get phlebotomist's staff profile first
      const { data: staffData } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (!staffData) return;

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('phlebotomist_id', staffData.id)
        .order('appointment_date', { ascending: true });
      
      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const todayAppointments = appointments.filter(apt => 
    new Date(apt.appointment_date).toDateString() === new Date().toDateString()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Appointments ({todayAppointments.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p>Loading appointments...</p>
        ) : todayAppointments.length > 0 ? (
          todayAppointments.map((appointment) => (
            <StatusUpdateInterface
              key={appointment.id}
              appointment={{
                id: appointment.id,
                patient_name: appointment.patient_name || 'Patient',
                address: appointment.address,
                appointment_time: appointment.appointment_time || '09:00',
                service_type: appointment.service_type || 'Lab Draw',
                status: appointment.status,
                phone_number: appointment.patient_phone
              }}
              onStatusUpdate={fetchAppointments}
            />
          ))
        ) : (
          <p className="text-muted-foreground text-center py-6">
            No appointments scheduled for today
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PhlebotomistAppointmentSection;