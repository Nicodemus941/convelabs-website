
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppointments } from "@/hooks/useAppointments";
import { Appointment } from "@/types/appointmentTypes";
import { Check, X, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const AppointmentHistory = () => {
  const { getAppointments, isLoading, appointments } = useAppointments();
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    // Load appointments when component mounts
    getAppointments();
  }, [getAppointments]);

  useEffect(() => {
    // Filter for only past appointments (completed, cancelled, or no-show)
    if (appointments?.length) {
      const past = appointments.filter(
        (appt) => ['completed', 'cancelled', 'no-show'].includes(appt.status)
      ).sort((a, b) => {
        const dateA = new Date(a.date || a.appointment_date || 0);
        const dateB = new Date(b.date || b.appointment_date || 0);
        return dateB.getTime() - dateA.getTime(); // Most recent first
      });
      
      setPastAppointments(past);
    }
  }, [appointments]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-red-500" />;
      case 'no-show':
        return <Clock className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700';
      case 'cancelled':
        return 'bg-red-50 text-red-700';
      case 'no-show':
        return 'bg-amber-50 text-amber-700';
      default:
        return 'bg-gray-50 text-gray-700';
    }
  };

  const getFormattedDate = (appointment: Appointment) => {
    const dateValue = appointment.date || appointment.appointment_date;
    if (!dateValue) return 'No date available';
    return new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div>
      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : pastAppointments.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No appointment history.</p>
          </div>
        ) : (
          pastAppointments.map((appointment) => (
            <div key={appointment.id} className="flex items-center justify-between border-b last:border-b-0 py-3">
              <div className="flex items-center">
                <div className="mr-3">
                  {getStatusIcon(appointment.status)}
                </div>
                <div>
                  <p className="font-medium">{getFormattedDate(appointment)}</p>
                  <p className="text-sm text-muted-foreground">
                    {appointment.serviceName || 'Blood Draw'}
                  </p>
                </div>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(appointment.status)}`}>
                {appointment.status}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AppointmentHistory;
