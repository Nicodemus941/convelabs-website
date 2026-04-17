import React, { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { formatAppointmentDate, formatAppointmentTime, dateOnlyToLocalDate } from '@/lib/appointmentDate';
import {
  Clock, MapPin, Navigation, MessageSquare, User, Phone, Mail,
  ChevronRight, ChevronUp, CheckCircle2, Truck, Play, Package,
  Stethoscope, Shield, CalendarClock, DollarSign, Crown, AlertTriangle,
  Globe, Pencil, FileText, FlaskConical, HelpCircle,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { PhlebAppointment, AppointmentStatus } from '@/hooks/usePhlebotomistAppointments';
import OnTheWayDialog from './OnTheWayDialog';
import PatientEditModal from './PatientEditModal';
import SpecimenDeliveryModal from './SpecimenDeliveryModal';
import CancelAppointmentModal from '@/components/calendar/CancelAppointmentModal';

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  scheduled: { label: 'Scheduled', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', borderColor: '#3B82F6' },
  confirmed: { label: 'Confirmed', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', borderColor: '#059669' },
  en_route: { label: 'On the Way', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', borderColor: '#D97706' },
  arrived: { label: 'Arrived', color: 'text-teal-700', bgColor: 'bg-teal-50 border-teal-200', borderColor: '#0D9488' },
  in_progress: { label: 'In Progress', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200', borderColor: '#7C3AED' },
  specimen_delivered: { label: 'Specimen Delivered', color: 'text-indigo-700', bgColor: 'bg-indigo-50 border-indigo-200', borderColor: '#4F46E5' },
  completed: { label: 'Completed', color: 'text-gray-600', bgColor: 'bg-gray-50 border-gray-200', borderColor: '#9CA3AF' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200', borderColor: '#DC2626' },
};

interface Props {
  appointment: PhlebAppointment;
  onStatusUpdate: (id: string, status: AppointmentStatus) => Promise<boolean>;
  isExpanded: boolean;
  onToggle: () => void;
}

const PhlebAppointmentCard: React.FC<Props> = ({ appointment, onStatusUpdate, isExpanded, onToggle }) => {
  const [showOnTheWay, setShowOnTheWay] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPatientEdit, setShowPatientEdit] = useState(() => {
    return sessionStorage.getItem('phleb-editing-patient') === appointment.id;
  });
  const [showSpecimenDelivery, setShowSpecimenDelivery] = useState(false);
  const statusConfig = STATUS_CONFIG[appointment.status] || STATUS_CONFIG.scheduled;

  // Persist patient edit modal state so it survives PWA background/reload
  const openPatientEdit = useCallback(() => {
    sessionStorage.setItem('phleb-editing-patient', appointment.id);
    setShowPatientEdit(true);
  }, [appointment.id]);

  const closePatientEdit = useCallback(() => {
    sessionStorage.removeItem('phleb-editing-patient');
    setShowPatientEdit(false);
  }, []);

  const handleNavigate = () => {
    const addr = encodeURIComponent(appointment.address);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS) {
      // Apple Maps deep link — opens native Maps app on iOS
      window.location.href = `maps://maps.apple.com/?daddr=${addr}`;
    } else if (isStandalone) {
      // Android PWA — use intent to open Google Maps app
      window.location.href = `geo:0,0?q=${addr}`;
    } else {
      // Regular browser — Google Maps in new tab
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${addr}`, '_blank');
    }
  };

  const handleMessage = () => {
    if (appointment.patient_phone) {
      window.open(`sms:${appointment.patient_phone}`, '_blank');
    } else {
      toast.error(`No phone number for ${appointment.patient_name}`);
    }
  };

  const handleCall = () => {
    if (appointment.patient_phone) window.open(`tel:${appointment.patient_phone}`);
    else toast.error(`No phone number for ${appointment.patient_name}`);
  };

  const handleEmail = () => {
    if (appointment.patient_email) window.open(`mailto:${appointment.patient_email}`);
    else toast.error(`No email for ${appointment.patient_name}`);
  };

  const WorkflowButton = ({ label, icon: Icon, targetStatus, enabledWhen }: {
    label: string; icon: React.ElementType; targetStatus: AppointmentStatus; enabledWhen: AppointmentStatus[];
  }) => {
    const enabled = enabledWhen.includes(appointment.status);
    return (
      <Button
        size="sm"
        className={`h-16 flex flex-col gap-1 ${
          enabled ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
        disabled={!enabled}
        onClick={(e) => {
          e.stopPropagation();
          if (targetStatus === 'en_route') {
            setShowOnTheWay(true);
          } else {
            onStatusUpdate(appointment.id, targetStatus);
          }
        }}
      >
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </Button>
    );
  };

  return (
    <>
      <Card
        className="shadow-sm border-l-4 overflow-hidden transition-all duration-200"
        style={{ borderLeftColor: statusConfig.borderColor }}
      >
        <CardContent className="p-0">
          {/* Header */}
          <div className="p-4 cursor-pointer" onClick={onToggle}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className="font-semibold text-gray-900 truncate cursor-pointer hover:text-[#B91C1C] hover:underline transition-colors"
                      onClick={(e) => { e.stopPropagation(); openPatientEdit(); }}
                      title="Click to edit patient details"
                    >{appointment.patient_name}</h3>
                    <Badge variant="outline" className={`text-xs font-medium border ${statusConfig.bgColor} ${statusConfig.color}`}>
                      {statusConfig.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1 flex-wrap">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{appointment.appointment_time || format(dateOnlyToLocalDate(appointment.appointment_date), 'h:mm a')}</span>
                    {/* Payment indicator */}
                    {appointment.payment_status === 'completed' ? (
                      <span className="text-emerald-600" title="Paid"><DollarSign className="h-3.5 w-3.5" /></span>
                    ) : appointment.invoice_status === 'sent' || appointment.invoice_status === 'reminded' ? (
                      <span className="text-amber-500" title="Invoice Sent"><DollarSign className="h-3.5 w-3.5" /></span>
                    ) : appointment.invoice_status === 'cancelled' ? (
                      <span className="text-red-500" title="No Invoice"><AlertTriangle className="h-3.5 w-3.5" /></span>
                    ) : (
                      <span className="text-gray-300" title="No Invoice"><DollarSign className="h-3.5 w-3.5" /></span>
                    )}
                    {/* Booking source */}
                    {appointment.booking_source === 'manual' ? (
                      <span className="text-blue-500" title="Manual Booking"><Pencil className="h-3 w-3" /></span>
                    ) : appointment.booking_source === 'online' ? (
                      <span className="text-green-500" title="Online Booking"><Globe className="h-3 w-3" /></span>
                    ) : null}
                    {/* VIP */}
                    {appointment.is_vip && (
                      <span className="text-amber-500" title="VIP"><Crown className="h-3.5 w-3.5" /></span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{appointment.address}</span>
                  </div>
                </div>
              </div>
              {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground ml-2" /> : <ChevronRight className="h-5 w-5 text-muted-foreground ml-2" />}
            </div>

            {/* Navigate / Message */}
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-9" onClick={(e) => { e.stopPropagation(); handleNavigate(); }}>
                <Navigation className="h-3.5 w-3.5" /> Navigate
              </Button>
              <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-9 border-gray-200" onClick={(e) => { e.stopPropagation(); handleMessage(); }}>
                <MessageSquare className="h-3.5 w-3.5" /> Message
              </Button>
            </div>
          </div>

          {/* Expanded Detail */}
          {isExpanded && (
            <div className="border-t bg-white">
              {/* Date & Address */}
              <div className="px-4 py-3 space-y-2 border-b">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{appointment.appointment_time || 'Time TBD'}</p>
                    <p className="text-muted-foreground text-xs">{formatAppointmentDate(appointment.appointment_date)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <p>{appointment.address}</p>
                </div>
              </div>

              {/* Patient Details */}
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold text-gray-800 mb-2">Patient Details</p>
                {/* Contact info */}
                <div className="space-y-1 mb-3 text-sm">
                  {appointment.patient_phone ? (
                    <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> <a href={`tel:${appointment.patient_phone}`} className="text-[#B91C1C] hover:underline">{appointment.patient_phone}</a></p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No phone on file</p>
                  )}
                  {appointment.patient_email && (
                    <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> <a href={`mailto:${appointment.patient_email}`} className="text-[#B91C1C] hover:underline text-xs">{appointment.patient_email}</a></p>
                  )}
                </div>
                <div className="flex gap-2 mb-3">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs" onClick={handleCall}>
                    <Phone className="h-3 w-3" /> Call
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs" onClick={handleEmail}>
                    <Mail className="h-3 w-3" /> Email
                  </Button>
                </div>
                {appointment.patient_insurance && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Insurance</p>
                    </div>
                    <p className="text-sm font-medium">
                      {appointment.patient_insurance}
                      {appointment.patient_insurance_id && ` (ID: ${appointment.patient_insurance_id})`}
                    </p>
                    {appointment.patient_insurance_group && (
                      <p className="text-xs text-muted-foreground">Group: {appointment.patient_insurance_group}</p>
                    )}
                  </div>
                )}
                {appointment.patient_dob && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">DOB: </span>
                    <span className="font-medium">{format(new Date(appointment.patient_dob + 'T00:00:00'), 'MMM d, yyyy')}</span>
                  </p>
                )}
              </div>

              {/* Services */}
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold text-gray-800 mb-2">Services</p>
                <Badge className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1">
                  <Stethoscope className="h-3 w-3" />
                  {appointment.service_name || appointment.service_type?.replace(/_/g, ' ')}
                </Badge>
                {appointment.gate_code && (
                  <p className="text-sm mt-2 flex items-center gap-1.5">
                    <span className="text-muted-foreground">Gate Code:</span>
                    <span className="font-mono font-bold text-[#B91C1C]">{appointment.gate_code}</span>
                  </p>
                )}
              </div>

              {/* ═══ Specimen Delivery — WHERE to drop the samples ═══ */}
              {/* Only relevant for services that require physical delivery — not in-office/partner */}
              {!['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type) && (
                <div className="px-4 py-3 border-b bg-indigo-50/30">
                  <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-indigo-600" />
                    Specimen Delivery
                  </p>
                  {appointment.lab_destination ? (
                    <div>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-0.5">Drop off at</p>
                      <p className="text-sm font-semibold text-gray-900">{appointment.lab_destination}</p>
                    </div>
                  ) : (() => {
                    // Fallback: scan notes for common "Lab:" / "Deliver to:" patterns
                    const notes = appointment.notes || '';
                    const labMatch = notes.match(/(?:Lab|Deliver(?:\s+to)?|Destination|Drop[\s-]?off):\s*([^|]+)/i);
                    if (labMatch) {
                      return (
                        <div>
                          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-0.5">Drop off at (from notes)</p>
                          <p className="text-sm font-semibold text-gray-900">{labMatch[1].trim()}</p>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                        <HelpCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Lab destination not specified</p>
                          <p className="text-amber-600 mt-0.5">Check with office — call (941) 527-9169 before delivery.</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Lab Order files (uploaded requisitions) */}
              {appointment.lab_order_file_path ? (
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-gray-500" />
                    Lab Orders ({appointment.lab_order_file_path.split(',').length})
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {appointment.lab_order_file_path.split(',').map((p: string, i: number) => {
                      const path = p.trim();
                      const fileName = path.split('/').pop() || `Lab Order ${i + 1}`;
                      return (
                        <Button
                          key={path + i}
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs justify-start h-8"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { data } = await supabase.storage.from('lab-orders').createSignedUrl(path, 3600);
                            if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                            else toast.error('Could not load lab order');
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="truncate flex-1 text-left">{fileName.length > 30 ? fileName.slice(0, 30) + '…' : fileName}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Show a "no lab order" hint for services that typically need one
                !['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type) && (
                  <div className="px-4 py-3 border-b">
                    <p className="text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-gray-500" />
                      Lab Orders
                    </p>
                    <p className="text-xs text-amber-600">
                      No lab order uploaded. Confirm with patient at visit or call office.
                    </p>
                  </div>
                )
              )}

              {/* Insurance Card */}
              {appointment.insurance_card_path ? (
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-gray-500" />
                    Insurance Card
                  </p>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs justify-start h-8"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { data } = await supabase.storage.from('lab-orders').createSignedUrl(appointment.insurance_card_path!, 3600);
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                      else toast.error('Could not load insurance card');
                    }}>
                    <Shield className="h-3.5 w-3.5" />
                    <span>View Insurance Card</span>
                  </Button>
                </div>
              ) : (
                // Only warn for services that usually need insurance
                !['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type) && (
                  <div className="px-4 py-3 border-b">
                    <p className="text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-gray-500" />
                      Insurance Card
                    </p>
                    <p className="text-xs text-gray-500">No insurance card on file — ask patient at visit if required.</p>
                  </div>
                )
              )}

              {/* Notes */}
              {appointment.notes && (
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold text-gray-800 mb-1">Notes</p>
                  <p className="text-sm text-muted-foreground">{appointment.notes}</p>
                </div>
              )}

              {/* Workflow Actions */}
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold text-gray-800 mb-3">Workflow Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <WorkflowButton label="On the Way" icon={Truck} targetStatus="en_route" enabledWhen={['scheduled', 'confirmed']} />
                  <WorkflowButton label="Arrive" icon={MapPin} targetStatus="arrived" enabledWhen={['en_route']} />
                  <WorkflowButton label="Begin Job" icon={Play} targetStatus="in_progress" enabledWhen={['arrived']} />
                  {/* Specimen Delivery — only for services that require it (not in-office/partner) */}
                  {!['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type) && (
                    <Button
                      size="sm"
                      className={`h-16 flex flex-col gap-1 ${
                        appointment.status === 'in_progress'
                          ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                      disabled={appointment.status !== 'in_progress'}
                      onClick={(e) => { e.stopPropagation(); setShowSpecimenDelivery(true); }}
                    >
                      <Package className="h-4 w-4" />
                      <span className="text-xs">Specimen Delivered</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className={`${['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type) ? 'col-span-2' : 'col-span-2'} h-12 flex flex-row gap-2 ${
                      (appointment.status === 'specimen_delivered' || (appointment.status === 'in_progress' && ['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type)))
                        ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    disabled={!(appointment.status === 'specimen_delivered' || (appointment.status === 'in_progress' && ['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type)))}
                    onClick={(e) => { e.stopPropagation(); onStatusUpdate(appointment.id, 'completed'); }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs">Job Completed</span>
                  </Button>
                </div>
              </div>

              {/* Manage */}
              <div className="px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-gray-800 mb-2">Manage Appointment</p>
                <Button variant="outline" size="sm" className="w-full gap-2 h-10" onClick={async (e) => {
                  e.stopPropagation();
                  // Quick reschedule — notify admin
                  const reason = prompt('Reason for reschedule:');
                  if (!reason) return;
                  await supabase.functions.invoke('send-sms-notification', {
                    body: { to: '9415279169', message: `Phleb reschedule request: ${appointment.patient_name} (${appointment.appointment_time}). Reason: ${reason}` },
                  }).catch(() => {});
                  toast.success('Reschedule request sent to admin');
                }}>
                  <CalendarClock className="h-4 w-4" /> Request Reschedule
                </Button>
                {['scheduled', 'confirmed'].includes(appointment.status) && (
                  <Button variant="outline" size="sm" className="w-full gap-2 h-10 border-red-200 text-red-600 hover:bg-red-50" onClick={(e) => {
                    e.stopPropagation();
                    setShowCancelModal(true);
                  }}>
                    <AlertTriangle className="h-4 w-4" /> Cancel (Patient No-Show)
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <OnTheWayDialog
        open={showOnTheWay}
        onOpenChange={setShowOnTheWay}
        appointmentId={appointment.id}
        patientName={appointment.patient_name}
        patientPhone={appointment.patient_phone}
        patientEmail={appointment.patient_email}
        onStatusUpdated={() => onStatusUpdate(appointment.id, 'en_route')}
      />

      <PatientEditModal
        open={showPatientEdit}
        onClose={closePatientEdit}
        patientId={appointment.patient_id}
        patientEmail={appointment.patient_email}
        initialName={appointment.patient_name}
      />

      <SpecimenDeliveryModal
        open={showSpecimenDelivery}
        onClose={() => setShowSpecimenDelivery(false)}
        appointmentId={appointment.id}
        patientId={appointment.patient_id}
        patientName={appointment.patient_name}
        patientPhone={appointment.patient_phone}
        patientEmail={appointment.patient_email}
        serviceType={appointment.service_type}
        onDelivered={() => onStatusUpdate(appointment.id, 'specimen_delivered')}
      />

      <CancelAppointmentModal
        appointment={appointment}
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onCancelled={() => onStatusUpdate(appointment.id, 'cancelled')}
        alsoNotifyAdmin={true}
        performedBy="phleb"
      />
    </>
  );
};

export default PhlebAppointmentCard;
