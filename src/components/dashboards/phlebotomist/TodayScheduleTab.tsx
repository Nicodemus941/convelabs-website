
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { calculateDistance, GeoCoordinates } from '@/services/geocodingService';
import { Map, Navigation, Clock, MapPin } from 'lucide-react';
import AppointmentCard, { AppointmentType } from './AppointmentCard';

// Define an appointment type with the added travel information
interface AppointmentWithTravel {
  id: string;
  appointment_date: string;
  status: string;
  address: string;
  zipcode: string;
  patient_name?: string;
  patient_phone?: string;
  patient_email?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  estimated_travel_time?: number;
  distance_to_next?: number;
  travel_time_to_next?: number;
  previous_appointment_id?: string;
  next_appointment_id?: string;
  patientId: string;  // For compatibility with AppointmentCard
  patientName: string;  // For compatibility with AppointmentCard
  time: string;  // For compatibility with AppointmentCard
  orderStatus: string;  // For compatibility with AppointmentCard
  orderFile: string;  // For compatibility with AppointmentCard
}

const TodayScheduleTab = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentWithTravel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalTravelTime, setTotalTravelTime] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  
  // Fetch today's appointments
  useEffect(() => {
    const fetchAppointments = async () => {
      if (!user) return;
      
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      
      try {
        // First get the appointments
        const { data: appointmentsData, error: appointmentsError } = await supabase
          .from('appointments')
          .select('*')
          .eq('phlebotomist_id', user.id)
          .like('appointment_date', `${todayStr}%`)
          .not('status', 'in', '("cancelled")')
          .order('appointment_date', { ascending: true });
          
        if (appointmentsError) throw appointmentsError;
        
        if (!appointmentsData || appointmentsData.length === 0) {
          setAppointments([]);
          setIsLoading(false);
          return;
        }
        
        // Then fetch patient details separately for each appointment
        const appointmentsWithDetails = await Promise.all(appointmentsData.map(async (appt) => {
          // Try to get patient information
          let patientName = 'Unknown Patient';
          let patientPhone = null;
          let patientEmail = null;
          
          if (appt.patient_id) {
            const { data: patientData } = await supabase
              .from('tenant_patients')
              .select('first_name, last_name, email, phone')
              .eq('id', appt.patient_id)
              .single();
            
            if (patientData) {
              patientName = `${patientData.first_name} ${patientData.last_name}`;
              patientPhone = patientData.phone;
              patientEmail = patientData.email;
            }
          }
          
          return {
            ...appt,
            patient_name: patientName,
            patient_phone: patientPhone,
            patient_email: patientEmail
          };
        }));
        
        // Calculate travel details between appointments
        let totalDistanceMiles = 0;
        let totalTravelTimeMinutes = 0;
        
        const appointmentsWithTravel = await Promise.all(appointmentsWithDetails.map(async (appt, index) => {
          // Format time for display
          const appointmentTime = new Date(appt.appointment_date);
          const formattedTime = format(appointmentTime, 'h:mm a');
          
          // For all appointments except the last one, calculate distance to next
          let distanceToNext = null;
          let travelTimeToNext = null;
          
          if (index < appointmentsWithDetails.length - 1 && 
              appt.latitude && appt.longitude && 
              appointmentsWithDetails[index + 1].latitude && appointmentsWithDetails[index + 1].longitude) {
                
            const distanceResult = await calculateDistance(
              { latitude: appt.latitude, longitude: appt.longitude },
              { 
                latitude: appointmentsWithDetails[index + 1].latitude, 
                longitude: appointmentsWithDetails[index + 1].longitude 
              }
            );
            
            if (distanceResult) {
              distanceToNext = distanceResult.distance;
              travelTimeToNext = Math.ceil(distanceResult.duration / 60); // Convert to minutes
              
              totalDistanceMiles += distanceResult.distance;
              totalTravelTimeMinutes += travelTimeToNext;
            }
          }
          
          // Format for AppointmentCard compatibility
          return {
            ...appt,
            distance_to_next: distanceToNext,
            travel_time_to_next: travelTimeToNext,
            patientId: appt.patient_id,
            patientName: appt.patient_name,
            time: formattedTime,
            orderStatus: appt.status,
            orderFile: appt.lab_order_file_path || 'No file'
          } as AppointmentWithTravel;
        }));
        
        setAppointments(appointmentsWithTravel);
        setTotalDistance(totalDistanceMiles);
        setTotalTravelTime(totalTravelTimeMinutes);
      } catch (error) {
        console.error('Error fetching appointments:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAppointments();
  }, [user]);
  
  // Navigation URL to open in maps
  const getNavigationUrl = (latitude: number, longitude: number) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  };
  
  const handleStartAppointment = (appointment: AppointmentType) => {
    // Handle start appointment action
    console.log('Starting appointment:', appointment);
  };
  
  if (isLoading) {
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Today's Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (appointments.length === 0) {
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Today's Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Clock className="h-6 w-6 text-gray-500" />
            </div>
            <h3 className="text-lg font-medium mb-2">No appointments scheduled for today</h3>
            <p className="text-gray-500">Enjoy your free time or check back later.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Today's Schedule</CardTitle>
            <div className="flex space-x-4">
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-2 text-amber-500" />
                <span className="text-sm font-medium">
                  {totalTravelTime} min travel time
                </span>
              </div>
              <div className="flex items-center">
                <Navigation className="h-4 w-4 mr-2 text-blue-500" />
                <span className="text-sm font-medium">
                  {totalDistance.toFixed(1)} miles total
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {appointments.map((appointment, index) => (
              <div key={appointment.id} className="relative">
                {index > 0 && appointment.previous_appointment_id && (
                  <div className="absolute left-6 -top-4 h-4 w-0.5 bg-gray-200"></div>
                )}
                
                <div className="flex">
                  <div className="pt-2 pr-6">
                    <div className="bg-gray-100 rounded-full h-12 w-12 flex items-center justify-center">
                      <span className="text-gray-700 font-medium">{index + 1}</span>
                    </div>
                    
                    {appointment.distance_to_next && (
                      <div className="h-full flex flex-col items-center">
                        <div className="h-12 w-0.5 bg-gray-200"></div>
                        <div className="p-1 rounded bg-blue-50 text-xs text-blue-700 my-1">
                          {appointment.travel_time_to_next} min
                        </div>
                        <div className="text-xs text-gray-500">
                          {appointment.distance_to_next.toFixed(1)} mi
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <AppointmentCard 
                      appointment={appointment} 
                      onStartAppointment={handleStartAppointment}
                    />
                    
                    {/* Additional travel info for optimized scheduling */}
                    {appointment.latitude && appointment.longitude && (
                      <div className="mt-3 border-t pt-3">
                        <div className="flex justify-between items-center">
                          <Badge variant="outline" className="bg-blue-50 flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> 
                            {appointment.zipcode}
                          </Badge>
                          
                          <a 
                            href={getNavigationUrl(appointment.latitude, appointment.longitude)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="outline" className="text-xs">
                              <Map className="h-3 w-3 mr-1" /> Get Directions
                            </Button>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default TodayScheduleTab;
