import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MapPin, Clock, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface StatusUpdateInterfaceProps {
  appointment: {
    id: string;
    patient_name: string;
    address: string;
    appointment_time: string;
    service_type: string;
    status: string;
    phone_number?: string;
  };
  onStatusUpdate: () => void;
}

const StatusUpdateInterface: React.FC<StatusUpdateInterfaceProps> = ({ 
  appointment, 
  onStatusUpdate 
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [etaMinutes, setEtaMinutes] = useState('');
  const [labName, setLabName] = useState('');
  const [trackingId, setTrackingId] = useState('');
  const [notes, setNotes] = useState('');

  const updateStatus = async (newStatus: string) => {
    try {
      setIsUpdating(true);

      // Update appointment status
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({ 
          status: newStatus,
          eta_minutes: etaMinutes ? parseInt(etaMinutes) : null
        })
        .eq('id', appointment.id);

      if (appointmentError) throw appointmentError;

      // Insert status update record
      const { error: statusError } = await supabase
        .from('appointment_status_updates')
        .insert({
          appointment_id: appointment.id,
          status: newStatus,
          eta_minutes: etaMinutes ? parseInt(etaMinutes) : null,
          lab_name: labName || null,
          tracking_id: trackingId || null,
          notes: notes || null
        });

      if (statusError) throw statusError;

      // Send SMS notification if phone number available
      if (appointment.phone_number) {
        const { error: smsError } = await supabase.functions.invoke('send-sms-notification', {
          body: {
            appointmentId: appointment.id,
            notificationType: newStatus,
            phoneNumber: appointment.phone_number,
            eta: etaMinutes ? parseInt(etaMinutes) : null,
            labName: labName || null,
            trackingId: trackingId || null
          }
        });

        if (smsError) {
          console.error('SMS notification failed:', smsError);
          // Don't throw error for SMS failure
        }
      }

      toast.success(`Status updated to ${newStatus}`);
      onStatusUpdate();
      
      // Reset form
      setEtaMinutes('');
      setLabName('');
      setTrackingId('');
      setNotes('');

    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Update Appointment Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 p-3 rounded-lg">
          <p className="font-medium">{appointment.patient_name}</p>
          <p className="text-sm text-muted-foreground">{appointment.address}</p>
          <p className="text-sm text-muted-foreground">
            {appointment.appointment_time} - {appointment.service_type}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="eta">ETA (minutes)</Label>
            <Input
              id="eta"
              type="number"
              placeholder="15"
              value={etaMinutes}
              onChange={(e) => setEtaMinutes(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab">Lab Name</Label>
            <Input
              id="lab"
              placeholder="Quest Diagnostics"
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tracking">Tracking ID</Label>
          <Input
            id="tracking"
            placeholder="TRK-123456"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {appointment.status === 'scheduled' && (
            <Button
              onClick={() => updateStatus('en_route')}
              disabled={isUpdating}
              className="flex items-center gap-2"
            >
              <Clock className="h-4 w-4" />
              Mark En Route
            </Button>
          )}

          {appointment.status === 'en_route' && (
            <Button
              onClick={() => updateStatus('sample_delivered')}
              disabled={isUpdating}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Sample Delivered
            </Button>
          )}

          {appointment.status === 'sample_delivered' && (
            <Button
              onClick={() => updateStatus('completed')}
              disabled={isUpdating}
              className="flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Mark Complete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StatusUpdateInterface;