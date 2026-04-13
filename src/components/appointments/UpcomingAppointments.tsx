
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppointments } from "@/hooks/useAppointments";
import { Appointment } from "@/types/appointmentTypes";
import { formatDate } from "@/utils/dateUtils";
import { CalendarClock, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";

const UpcomingAppointments = () => {
  const { getAppointments, isLoading, appointments, cancelAppointment } = useAppointments();
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    // Load appointments when component mounts
    getAppointments();
  }, [getAppointments]);

  useEffect(() => {
    // Filter for only upcoming appointments (scheduled or confirmed)
    if (appointments?.length) {
      const upcoming = appointments.filter(
        (appt) => ['scheduled', 'confirmed'].includes(appt.status)
      ).sort((a, b) => new Date(a.date || a.appointment_date || 0).getTime() - new Date(b.date || b.appointment_date || 0).getTime());
      
      setUpcomingAppointments(upcoming);
    }
  }, [appointments]);

  const formatAppointmentTime = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : upcomingAppointments.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
          <Button variant="outline" className="mt-4" asChild>
            <a href="/book-now">Book An Appointment</a>
          </Button>
        </div>
      ) : (
        upcomingAppointments.map((appointment) => {
          const appointmentDate = appointment.date || appointment.appointment_date;
          return (
            <Card key={appointment.id} className="overflow-hidden">
              <div className={`h-2 ${appointment.status === 'confirmed' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-lg">
                      {appointmentDate ? new Date(appointmentDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date not available'}
                    </p>
                    <div className="flex items-center text-sm text-muted-foreground mt-1">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>{appointmentDate ? formatAppointmentTime(appointmentDate) : 'Time not available'}</span>
                    </div>
                  </div>
                  
                  <div className="bg-slate-100 px-2 py-1 rounded text-xs font-medium capitalize">
                    {appointment.status}
                  </div>
                </div>
                
                {appointment.location && (
                  <div className="mt-3 flex items-start">
                    <MapPin className="h-4 w-4 mr-1 mt-0.5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{appointment.location}</p>
                  </div>
                )}
                
                {appointment.serviceName && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Service: </span>
                      <span>{appointment.serviceName}</span>
                    </p>
                  </div>
                )}
                
                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/appointments/${appointment.id}/details`}>View Details</a>
                  </Button>
                  {appointment.status === 'scheduled' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">Cancel</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to cancel this appointment? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                              const success = await cancelAppointment(appointment.id);
                              if (success) {
                                toast.success('Appointment cancelled');
                                getAppointments();
                              } else {
                                toast.error('Failed to cancel appointment');
                              }
                            }}
                          >
                            Cancel Appointment
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default UpcomingAppointments;
