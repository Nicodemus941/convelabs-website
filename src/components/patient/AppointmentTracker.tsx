import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, User, FileText, CalendarClock, Phone } from 'lucide-react';
import PatientRescheduleModal from './PatientRescheduleModal';

interface AppointmentTrackerProps {
  appointment: {
    id: string;
    status: string;
    appointment_date: string;
    appointment_time: string;
    address: string;
    phlebotomist_name?: string;
    eta_minutes?: number;
    service_type: string;
    reschedule_count?: number;
  };
  onRescheduleRequest?: (appointmentId: string) => void;
}

const AppointmentTracker: React.FC<AppointmentTrackerProps> = ({ appointment, onRescheduleRequest }) => {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const canReschedule = ['scheduled', 'confirmed'].includes(appointment.status)
    && (appointment.reschedule_count || 0) < 2;
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500';
      case 'en_route': return 'bg-yellow-500';
      case 'sample_delivered': return 'bg-purple-500';
      case 'completed': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Appointment Scheduled';
      case 'en_route': return 'Phlebotomist En Route';
      case 'sample_delivered': return 'Sample Delivered to Lab';
      case 'completed': return 'Appointment Complete';
      default: return status;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Appointment Status</span>
          <Badge className={`${getStatusColor(appointment.status)} text-white`}>
            {getStatusText(appointment.status)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {new Date(appointment.appointment_date).toLocaleDateString()} at {appointment.appointment_time}
            </p>
            {appointment.eta_minutes && (
              <p className="text-sm text-muted-foreground">
                ETA: {appointment.eta_minutes} minutes
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm">{appointment.address}</p>
        </div>

        {appointment.phlebotomist_name && (
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm">Phlebotomist: {appointment.phlebotomist_name}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm">Service: {appointment.service_type}</p>
        </div>

        {appointment.status === 'en_route' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              🚗 Your phlebotomist is on the way! Please have your lab order and ID ready.
            </p>
          </div>
        )}

        {appointment.status === 'sample_delivered' && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-sm text-purple-800">
              Your specimens have been successfully delivered to the lab. You will receive a confirmation text and email with your lab-generated tracking ID.
            </p>
          </div>
        )}

        {appointment.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              Your appointment is complete! Your specimens are on their way to the lab. We will notify you once they have been successfully delivered along with your lab-generated ID. Thank you for choosing ConveLabs!
            </p>
          </div>
        )}

        {/* Reschedule / Contact actions */}
        {['scheduled', 'confirmed'].includes(appointment.status) && (
          <div className="flex gap-2 pt-2 border-t">
            {canReschedule ? (
              <Button variant="outline" size="sm" className="flex-1 text-xs"
                onClick={() => setRescheduleOpen(true)}>
                <CalendarClock className="h-3.5 w-3.5 mr-1" /> Reschedule
              </Button>
            ) : (appointment.reschedule_count || 0) >= 2 ? (
              <Button variant="outline" size="sm" className="flex-1 text-xs"
                onClick={() => setRescheduleOpen(true)}>
                <CalendarClock className="h-3.5 w-3.5 mr-1" /> Reschedule
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="text-xs" asChild>
              <a href="tel:+19415279169"><Phone className="h-3.5 w-3.5 mr-1" /> Call Us</a>
            </Button>
          </div>
        )}
      </CardContent>

      <PatientRescheduleModal
        appointment={appointment}
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        onRescheduled={() => { setRescheduleOpen(false); window.location.reload(); }}
      />
    </Card>
  );
};

export default AppointmentTracker;