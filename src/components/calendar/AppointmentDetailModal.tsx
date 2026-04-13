import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User, Calendar, Clock, MapPin, Phone, Mail, MessageSquare,
  Edit3, CalendarClock, XCircle, DollarSign, FileText, Shield,
  ChevronDown, UserPlus, Stethoscope,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import RescheduleAppointmentModal from './RescheduleAppointmentModal';

interface AppointmentDetailModalProps {
  appointment: any | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Pending', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  en_route: { label: 'En Route', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
};

const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  appointment, open, onClose, onUpdate,
}) => {
  const [patientData, setPatientData] = useState<any>(null);
  const [showInsurance, setShowInsurance] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const appt = appointment;

  // Load patient data from tenant_patients
  useEffect(() => {
    if (!appt?.patient_id) return;
    supabase.from('tenant_patients').select('*').eq('id', appt.patient_id).maybeSingle()
      .then(({ data }) => setPatientData(data));
  }, [appt?.patient_id]);

  if (!appt) return null;

  const patientName = patientData
    ? `${patientData.first_name || ''} ${patientData.last_name || ''}`.trim()
    : appt.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim() || 'Unknown Patient';

  const patientEmail = patientData?.email || appt.notes?.match(/Email:\s*([^|]+)/)?.[1]?.trim() || '';
  const patientPhone = patientData?.phone || appt.notes?.match(/Phone:\s*([^|]+)/)?.[1]?.trim() || '';
  const patientDOB = patientData?.date_of_birth || '';
  const insuranceProvider = patientData?.insurance_provider || '';
  const insuranceMemberId = patientData?.insurance_member_id || '';
  const insuranceGroup = patientData?.insurance_group_number || '';

  const dateStr = appt.appointment_date?.substring(0, 10) || '';
  const formattedDate = dateStr ? format(new Date(dateStr + 'T12:00:00'), 'MMMM do, yyyy') : '';
  const timeStr = appt.appointment_time || '';
  const serviceType = (appt.service_type || 'mobile').replace(/_|-/g, ' ');
  const statusCfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;

  const handleStatusChange = async (newStatus: string) => {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', appt.id);
    if (error) { toast.error('Failed to update status'); return; }
    toast.success(`Status updated to ${newStatus}`);
    onUpdate();
    onClose();
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this appointment? This cannot be undone.')) return;
    await handleStatusChange('cancelled');
  };

  const handleMessage = () => {
    if (patientPhone) {
      window.open(`sms:${patientPhone}`, '_blank');
    } else {
      toast.error('No phone number on file');
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">Appointment Details</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <User className="h-3.5 w-3.5" />
                <span>{patientName}</span>
                <span>|</span>
                <span className="capitalize">{serviceType}</span>
                <span>|</span>
                <span>{dateStr ? format(new Date(dateStr + 'T12:00:00'), 'MMM d') : ''}, {timeStr}</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Badge variant="outline" className={`${statusCfg.color} font-medium`}>{statusCfg.label}</Badge>
              {appt.payment_status === 'completed' && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">Paid</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="px-6 pb-6">
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="laborders">Lab Orders</TabsTrigger>
            <TabsTrigger value="more">More</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-0">
            {/* Patient Information */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <User className="h-4 w-4" /> Patient Information
              </div>
              <div className="pl-6 space-y-1.5">
                <p className="font-medium">{patientName}</p>
                {patientDOB && <p className="text-xs text-muted-foreground">DOB: {patientDOB}</p>}
                {patientEmail && (
                  <p className="flex items-center gap-1.5 text-sm"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {patientEmail}</p>
                )}
                {patientPhone && (
                  <p className="flex items-center gap-1.5 text-sm"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {patientPhone}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Payment Method: <span className="font-medium text-foreground">{appt.payment_status === 'completed' ? 'Paid' : insuranceProvider ? 'Insurance' : 'Self Pay'}</span>
                </p>
              </div>
            </div>

            {/* Insurance (collapsible) */}
            <button
              className="w-full border rounded-lg p-4 flex items-center justify-between text-sm font-semibold hover:bg-muted/30 transition"
              onClick={() => setShowInsurance(!showInsurance)}
            >
              <div className="flex items-center gap-2"><Shield className="h-4 w-4" /> Insurance Information</div>
              <ChevronDown className={`h-4 w-4 transition-transform ${showInsurance ? 'rotate-180' : ''}`} />
            </button>
            {showInsurance && (
              <div className="border rounded-lg p-4 pl-10 space-y-1 text-sm -mt-2">
                {insuranceProvider ? (
                  <>
                    <p><span className="text-muted-foreground">Provider:</span> {insuranceProvider}</p>
                    {insuranceMemberId && <p><span className="text-muted-foreground">Member ID:</span> {insuranceMemberId}</p>}
                    {insuranceGroup && <p><span className="text-muted-foreground">Group:</span> {insuranceGroup}</p>}
                  </>
                ) : (
                  <p className="text-muted-foreground">No insurance on file. Self-pay patient.</p>
                )}
              </div>
            )}

            {/* Appointment Details */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Calendar className="h-4 w-4" /> Appointment Details
              </div>
              <div className="pl-6 space-y-1.5 text-sm">
                <p className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {formattedDate}</p>
                <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" /> {timeStr || 'Time TBD'}</p>
                <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {appt.address || 'Address TBD'}</p>
              </div>
            </div>

            {/* Service Information */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Stethoscope className="h-4 w-4" /> Service Information
              </div>
              <div className="pl-6 text-sm">
                <p>Service Type: <span className="font-medium capitalize">{serviceType}</span></p>
                {appt.total_amount > 0 && <p>Amount: <span className="font-medium">${appt.total_amount}</span></p>}
              </div>
            </div>

            {/* Assigned Staff */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <UserPlus className="h-4 w-4" /> Assigned Staff
                </div>
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                  <UserPlus className="h-3 w-3" /> Assign
                </Button>
              </div>
              <div className="pl-6 text-sm">
                <p className="font-medium">Nicodemme "Nico" Jean-Baptiste</p>
                <p className="text-xs text-muted-foreground">Owner / Phlebotomist</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="billing" className="space-y-4 mt-0">
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <DollarSign className="h-4 w-4" /> Billing Information
              </div>
              <div className="pl-6 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Service Fee</span><span className="font-medium">${appt.total_amount || 0}</span></div>
                {appt.tip_amount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tip</span><span className="font-medium text-emerald-600">${appt.tip_amount}</span></div>}
                <div className="flex justify-between border-t pt-1.5 mt-1.5"><span className="font-semibold">Total</span><span className="font-bold">${(appt.total_amount || 0) + (appt.tip_amount || 0)}</span></div>
              </div>
            </div>
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <FileText className="h-4 w-4" /> Invoice Status
              </div>
              <div className="pl-6 space-y-1.5 text-sm">
                <p>Status: <Badge variant="outline" className="text-xs ml-1">{appt.invoice_status || 'N/A'}</Badge></p>
                <p>Payment: <Badge variant="outline" className={`text-xs ml-1 ${appt.payment_status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{appt.payment_status || 'pending'}</Badge></p>
                {appt.booking_source && <p>Source: <span className="capitalize">{appt.booking_source}</span></p>}
                {appt.stripe_invoice_id && <p className="text-xs text-muted-foreground truncate">Stripe: {appt.stripe_invoice_id}</p>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="laborders" className="mt-0">
            <div className="border rounded-lg p-8 text-center">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-600">Lab Orders</p>
              <p className="text-sm text-muted-foreground mt-1">Lab order uploads and status will appear here.</p>
            </div>
          </TabsContent>

          <TabsContent value="more" className="space-y-4 mt-0">
            {appt.notes && (
              <div className="border rounded-lg p-4">
                <p className="font-semibold text-sm mb-2">Notes</p>
                <p className="text-sm text-muted-foreground">{appt.notes}</p>
              </div>
            )}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-semibold text-sm">Status Actions</p>
              <div className="flex flex-wrap gap-2">
                {appt.status === 'scheduled' && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => handleStatusChange('confirmed')}>Confirm</Button>
                )}
                {(appt.status === 'scheduled' || appt.status === 'confirmed') && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => handleStatusChange('en_route')}>En Route</Button>
                )}
                {appt.status === 'en_route' && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => handleStatusChange('in_progress')}>Begin Job</Button>
                )}
                {appt.status === 'in_progress' && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => handleStatusChange('completed')}>Complete</Button>
                )}
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <p className="font-semibold text-sm mb-1">Appointment ID</p>
              <p className="text-xs text-muted-foreground font-mono">{appt.id}</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Bottom Action Bar */}
        <div className="border-t px-6 py-3 flex flex-wrap gap-2 bg-gray-50/50">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleMessage}>
            <MessageSquare className="h-3.5 w-3.5" /> Message
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setRescheduleOpen(true)}>
            <CalendarClock className="h-3.5 w-3.5" /> Reschedule
          </Button>
          {appt.status !== 'cancelled' && appt.status !== 'completed' && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-red-600 hover:bg-red-50" onClick={handleCancel}>
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Reschedule Modal */}
    <RescheduleAppointmentModal
      appointment={appt}
      open={rescheduleOpen}
      onClose={() => setRescheduleOpen(false)}
      onRescheduled={() => { onUpdate(); onClose(); }}
    />
    </>
  );
};

export default AppointmentDetailModal;
