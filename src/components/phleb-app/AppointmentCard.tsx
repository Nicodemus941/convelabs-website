import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { User, Phone, Mail, MapPin, FileText, Clock, Truck, CheckCircle, Play, Package } from 'lucide-react';
import NavigateButton from './NavigateButton';
import { useAppointmentStatus } from '@/hooks/useAppointmentStatus';
import { supabase, publicStorageUrl } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Appointment {
  id: string;
  patient_name?: string;
  patient_email?: string;
  patient_phone?: string;
  address?: string;
  appointment_time?: string;
  service_name?: string;
  service_type?: string;
  status: string;
  notes?: string;
  lab_order_file_path?: string;
}

interface AppointmentCardProps {
  appointment: Appointment;
  phlebotomistName: string;
  onStatusChange: () => void;
}

const STATUS_FLOW = ['scheduled', 'en_route', 'arrived', 'in_progress', 'specimens_delivered', 'completed'];

const LAB_DESTINATIONS = ['Quest Diagnostics', 'LabCorp', 'Hospital Lab', 'UPS', 'FedEx'];

const AppointmentCard: React.FC<AppointmentCardProps> = ({ appointment, phlebotomistName, onStatusChange }) => {
  const { updateStatus } = useAppointmentStatus();
  const [showETADialog, setShowETADialog] = useState(false);
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [eta, setEta] = useState('15');
  const [labName, setLabName] = useState('');
  const [trackingId, setTrackingId] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const currentStatusIndex = STATUS_FLOW.indexOf(appointment.status);
  const nextStatus = STATUS_FLOW[currentStatusIndex + 1];

  const handleStatusAction = async () => {
    if (nextStatus === 'en_route') {
      setShowETADialog(true);
      return;
    }
    if (nextStatus === 'specimens_delivered') {
      setShowDeliveryDialog(true);
      return;
    }

    setIsUpdating(true);
    const success = await updateStatus({
      appointmentId: appointment.id,
      status: nextStatus,
      phlebotomistName,
      patientPhone: appointment.patient_phone,
    });
    if (success) {
      toast.success(`Status updated to ${nextStatus.replace('_', ' ')}`);
      onStatusChange();
    }
    setIsUpdating(false);
  };

  const handleETASubmit = async () => {
    setIsUpdating(true);
    const success = await updateStatus({
      appointmentId: appointment.id,
      status: 'en_route',
      etaMinutes: parseInt(eta),
      phlebotomistName,
      patientPhone: appointment.patient_phone,
    });
    if (success) {
      toast.success('Patient notified you are on your way');
      onStatusChange();
    }
    setShowETADialog(false);
    setIsUpdating(false);
  };

  const handleDeliverySubmit = async () => {
    if (!labName) { toast.error('Select a lab destination'); return; }
    if (!trackingId.trim()) { toast.error('Enter a lab ID or tracking number'); return; }

    setIsUpdating(true);
    const success = await updateStatus({
      appointmentId: appointment.id,
      status: 'specimens_delivered',
      specimenLabName: labName,
      specimenTrackingId: trackingId.trim(),
      phlebotomistName,
      patientPhone: appointment.patient_phone,
    });
    if (success) {
      toast.success('Patient notified of specimen delivery');
      onStatusChange();
    }
    setShowDeliveryDialog(false);
    setIsUpdating(false);
  };

  const handleLabOrderDownload = async () => {
    if (!appointment.lab_order_file_path) return;
    // Multi-file: the trigger-maintained list is newline-joined (legacy rows
    // may be comma-joined). Open EVERY file in its own tab — previously this
    // code used the whole string as a single path and 404'd whenever the
    // appointment had >1 lab order. Mary Rienzi 5/1/2026 had 3 files; only
    // the first opened until this fix.
    const raw = appointment.lab_order_file_path;
    const paths = (raw.includes('\n') ? raw.split('\n') : raw.split(','))
      .map((p) => p.trim())
      .filter(Boolean);
    for (const path of paths) {
      // Manually-encoded public URL (per-segment encodeURIComponent) —
      // fixes the comma/space 404 that Supabase's getPublicUrl misses.
      // Verified live: %2C %20 encoded variants return 200 + real PDF
      // bytes for Mary Rienzi's 5/1 appointment.
      window.open(publicStorageUrl('lab-orders', path), '_blank');
    }
  };

  const getActionButton = () => {
    if (!nextStatus || appointment.status === 'completed') return null;

    const labels: Record<string, { text: string; icon: React.ReactNode; color: string }> = {
      en_route: { text: 'On My Way', icon: <Truck className="h-4 w-4" />, color: 'bg-orange-500 hover:bg-orange-600' },
      arrived: { text: 'Arrived', icon: <MapPin className="h-4 w-4" />, color: 'bg-green-500 hover:bg-green-600' },
      in_progress: { text: 'Begin Job', icon: <Play className="h-4 w-4" />, color: 'bg-purple-500 hover:bg-purple-600' },
      specimens_delivered: { text: 'Specimens Delivered', icon: <Package className="h-4 w-4" />, color: 'bg-teal-500 hover:bg-teal-600' },
      completed: { text: 'Job Complete', icon: <CheckCircle className="h-4 w-4" />, color: 'bg-gray-700 hover:bg-gray-800' },
    };

    const config = labels[nextStatus];
    if (!config) return null;

    return (
      <Button
        onClick={handleStatusAction}
        disabled={isUpdating}
        className={`w-full text-white ${config.color} gap-2`}
      >
        {config.icon}
        {isUpdating ? 'Updating...' : config.text}
      </Button>
    );
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div className={`h-1.5 ${
          appointment.status === 'en_route' ? 'bg-orange-500' :
          appointment.status === 'arrived' ? 'bg-green-500' :
          appointment.status === 'in_progress' ? 'bg-purple-500' :
          'bg-blue-500'
        }`} />
        <CardContent className="p-4 space-y-3">
          {/* Time & Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{appointment.appointment_time || 'TBD'}</span>
            </div>
            <Badge variant="outline" className="text-xs capitalize">
              {appointment.status.replace('_', ' ')}
            </Badge>
          </div>

          {/* Patient info */}
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium">{appointment.patient_name || 'Unknown'}</span>
            </div>
            {appointment.patient_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a href={`tel:${appointment.patient_phone}`} className="text-primary underline">
                  {appointment.patient_phone}
                </a>
              </div>
            )}
            {appointment.patient_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground truncate">{appointment.patient_email}</span>
              </div>
            )}
          </div>

          {/* Address + Navigate */}
          {appointment.address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm">{appointment.address}</p>
                <div className="mt-2">
                  <NavigateButton address={appointment.address} />
                </div>
              </div>
            </div>
          )}

          {/* Service */}
          {appointment.service_name && (
            <p className="text-sm text-muted-foreground">
              Service: <span className="font-medium text-foreground">{appointment.service_name}</span>
            </p>
          )}

          {/* Lab order download */}
          {appointment.lab_order_file_path && (
            <Button variant="outline" size="sm" onClick={handleLabOrderDownload} className="gap-2">
              <FileText className="h-4 w-4" />
              Download Lab Order
            </Button>
          )}

          {/* Notes */}
          {appointment.notes && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              Notes: {appointment.notes}
            </p>
          )}

          {/* Action button */}
          <div className="pt-2">
            {getActionButton()}
          </div>
        </CardContent>
      </Card>

      {/* ETA Dialog */}
      <Dialog open={showETADialog} onOpenChange={setShowETADialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Estimated Arrival Time</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <label className="text-sm font-medium">ETA (minutes)</label>
            <Input
              type="number"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              min="1"
              max="120"
              placeholder="15"
            />
            <p className="text-xs text-muted-foreground">
              The patient will receive an SMS: "Your phlebotomist {phlebotomistName} is on the way! ETA: {eta} minutes."
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowETADialog(false)}>Cancel</Button>
            <Button onClick={handleETASubmit} disabled={isUpdating} className="bg-orange-500 hover:bg-orange-600 text-white">
              {isUpdating ? 'Sending...' : 'Send & Start'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Specimen Delivery Dialog */}
      <Dialog open={showDeliveryDialog} onOpenChange={setShowDeliveryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Specimen Delivery Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Lab Destination</label>
              <Select value={labName} onValueChange={setLabName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {LAB_DESTINATIONS.map((lab) => (
                    <SelectItem key={lab} value={lab}>{lab}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Lab Generated ID / Tracking Number</label>
              <Input
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                placeholder="Enter lab ID or tracking number"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The patient will receive an SMS with the lab name and tracking ID.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeliveryDialog(false)}>Cancel</Button>
            <Button onClick={handleDeliverySubmit} disabled={isUpdating} className="bg-teal-500 hover:bg-teal-600 text-white">
              {isUpdating ? 'Sending...' : 'Confirm Delivery'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AppointmentCard;
