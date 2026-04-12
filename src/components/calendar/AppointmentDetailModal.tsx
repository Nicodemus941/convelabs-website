import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { User, Calendar, Clock, MapPin, FileText, Phone, Mail, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AppointmentDetailModalProps {
  appointment: any | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  en_route: 'bg-orange-100 text-orange-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
};

const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  appointment,
  open,
  onClose,
  onUpdate,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  if (!appointment) return null;

  const patientName = appointment.notes?.startsWith('Patient: ')
    ? appointment.notes.split(' | ')[0].replace('Patient: ', '')
    : appointment.patient_email || 'Unknown';

  const serviceName = appointment.notes?.includes('Service: ')
    ? appointment.notes.split('Service: ')[1]?.split(' | ')[0]
    : appointment.service_type || 'Blood Draw';

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    const { error } = await supabase
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', appointment.id);

    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success(`Status updated to ${newStatus}`);
      onUpdate();
      onClose();
    }
    setIsUpdating(false);
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    await handleStatusChange('cancelled');
  };

  const dateStr = appointment.appointment_date
    ? new Date(appointment.appointment_date).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : '';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Appointment Details</span>
            <Badge className={STATUS_COLORS[appointment.status] || 'bg-gray-100'}>
              {appointment.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient */}
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-semibold">{patientName}</p>
              {appointment.patient_email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {appointment.patient_email}
                </p>
              )}
              {appointment.patient_phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {appointment.patient_phone}
                </p>
              )}
            </div>
          </div>

          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">{dateStr}</p>
              {appointment.appointment_time && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {appointment.appointment_time}
                </p>
              )}
            </div>
          </div>

          {/* Service */}
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">{serviceName}</p>
              {appointment.total_amount > 0 && (
                <p className="text-sm text-muted-foreground">${appointment.total_amount.toFixed(2)}</p>
              )}
            </div>
          </div>

          {/* Address */}
          {appointment.address && appointment.address !== 'Imported from GHS' && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <p className="text-sm">{appointment.address}</p>
            </div>
          )}

          {/* Notes */}
          {appointment.notes && !appointment.notes.startsWith('Patient: ') && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">{appointment.notes}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {appointment.status === 'scheduled' && (
              <>
                <Button size="sm" onClick={() => handleStatusChange('confirmed')} disabled={isUpdating}
                  className="bg-green-600 hover:bg-green-700 text-white">
                  Confirm
                </Button>
                <Button size="sm" variant="destructive" onClick={handleCancel} disabled={isUpdating}>
                  Cancel
                </Button>
              </>
            )}
            {appointment.status === 'confirmed' && (
              <>
                <Button size="sm" onClick={() => handleStatusChange('en_route')} disabled={isUpdating}
                  className="bg-orange-500 hover:bg-orange-600 text-white">
                  Mark En Route
                </Button>
                <Button size="sm" variant="destructive" onClick={handleCancel} disabled={isUpdating}>
                  Cancel
                </Button>
              </>
            )}
            {appointment.status === 'en_route' && (
              <Button size="sm" onClick={() => handleStatusChange('in_progress')} disabled={isUpdating}
                className="bg-purple-600 hover:bg-purple-700 text-white">
                Begin Job
              </Button>
            )}
            {appointment.status === 'in_progress' && (
              <Button size="sm" onClick={() => handleStatusChange('completed')} disabled={isUpdating}
                className="bg-gray-700 hover:bg-gray-800 text-white">
                Mark Complete
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentDetailModal;
