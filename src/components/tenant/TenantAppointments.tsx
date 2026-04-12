
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tenant, AppointmentData } from '@/types/tenant'; 
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Calendar, Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAppointments } from '@/hooks/useAppointments';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { ensureDate } from '@/services/appointments/appointmentMappers';

interface TenantAppointmentsProps {
  tenant: Tenant;
}

const TenantAppointments: React.FC<TenantAppointmentsProps> = ({ tenant }) => {
  const navigate = useNavigate();
  const { appointments, isLoading, getAppointments, cancelAppointment, confirmAppointment } = useAppointments();
  
  useEffect(() => {
    getAppointments();
  }, [getAppointments]);
  
  const formatDate = (dateString: string | Date) => {
    const date = ensureDate(dateString);
    if (!date) return 'Unknown date';
    
    const options: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
    };
    return format(date, 'MMM d, yyyy');
  };
  
  const formatTime = (dateString: string | Date) => {
    const date = ensureDate(dateString);
    if (!date) return 'Unknown time';
    
    return format(date, 'h:mm a');
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 hover:bg-blue-50">Scheduled</Badge>;
      case 'confirmed':
        return <Badge variant="outline" className="bg-green-50 text-green-600 hover:bg-green-50">Confirmed</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-600 hover:bg-green-50">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-red-50 text-red-600 hover:bg-red-50">Cancelled</Badge>;
      case 'no_show':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-600 hover:bg-yellow-50">No Show</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Appointments</h2>
          <Skeleton className="h-10 w-40" />
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Appointments</h2>
        <Button onClick={() => navigate(`/book/${tenant.id}`)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Book New Appointment
        </Button>
      </div>
      
      {appointments.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {appointments.map((appointment) => (
            <Card key={appointment.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  <div className="p-4 md:p-6 flex-1">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                      <h3 className="font-medium">{appointment.patient_name}</h3>
                      {getStatusBadge(appointment.status)}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2 text-sm">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1 text-gray-500" />
                        <span>{formatDate(appointment.appointment_date!)}</span>
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-1 text-gray-500" />
                        <span>{formatTime(appointment.appointment_date!)}</span>
                      </div>
                    </div>
                    <div className="flex items-center text-sm mb-2">
                      <MapPin className="h-4 w-4 mr-1 text-gray-500" />
                      <span>{appointment.address}</span>
                    </div>
                    {appointment.patient_phone && (
                      <p className="text-sm mt-2">Phone: {appointment.patient_phone}</p>
                    )}
                    {appointment.notes && (
                      <p className="text-sm mt-2">Notes: {appointment.notes}</p>
                    )}
                  </div>
                  <div className="flex md:flex-col border-t md:border-t-0 md:border-l border-gray-200">
                    <Button 
                      variant="ghost" 
                      className="flex-1 rounded-none h-14"
                      onClick={() => navigate(`/tenant/dashboard/${tenant.id}/appointments/${appointment.id}`)}
                    >
                      Details
                    </Button>
                    {appointment.status === 'scheduled' && (
                      <Button 
                        variant="ghost" 
                        className="flex-1 rounded-none h-14 text-green-600"
                        onClick={() => confirmAppointment(appointment.id)}
                      >
                        Confirm
                      </Button>
                    )}
                    {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                      <Button 
                        variant="ghost" 
                        className="flex-1 rounded-none h-14 text-red-600"
                        onClick={() => cancelAppointment(appointment.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground pb-4">
              No appointments have been scheduled yet.
            </p>
            <div className="flex justify-center">
              <Button onClick={() => navigate(`/book/${tenant.id}`)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Book First Appointment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TenantAppointments;
