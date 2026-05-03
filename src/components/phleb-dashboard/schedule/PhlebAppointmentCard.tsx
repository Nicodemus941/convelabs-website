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
  Route, Utensils, Clock3, Printer, Repeat,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { PhlebAppointment, AppointmentStatus } from '@/hooks/usePhlebotomistAppointments';
import OnTheWayDialog from './OnTheWayDialog';
import PatientEditModal from './PatientEditModal';
import SpecimenDeliveryModal from './SpecimenDeliveryModal';
import CancelAppointmentModal from '@/components/calendar/CancelAppointmentModal';
import LabOrderViewerModal from './LabOrderViewerModal';
import RunningLateModal from './RunningLateModal';
import TubeLabelModal from './TubeLabelModal';
import PhlebUploadLabOrderButton from './PhlebUploadLabOrderButton';
import PhlebUploadInsuranceCardButton from './PhlebUploadInsuranceCardButton';
import RequestLabOrderButton from './RequestLabOrderButton';
import LabOrderRequestStatus from './LabOrderRequestStatus';
import AppointmentEarningPill from './AppointmentEarningPill';
import AssignOrgButton from '@/components/phleb/AssignOrgButton';
import LabOrderStatusList from './LabOrderStatusList';
import { computeReadiness, detectFastingRequirement, buildLabRouteUrl, extractPanelBadges } from '@/lib/phlebHelpers';

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
  const [showRunningLate, setShowRunningLate] = useState(false);
  const [showTubeLabel, setShowTubeLabel] = useState(false);
  const [labOrderViewer, setLabOrderViewer] = useState<{ open: boolean; path: string | null; name?: string }>({ open: false, path: null });
  // Bumped after every phleb-side lab-order upload so the status list re-fetches immediately
  const [labOrderRefreshKey, setLabOrderRefreshKey] = useState(0);
  // Local override — flips the "Lab Orders" conditional branch the moment
  // an upload finishes, without waiting for the parent appointment row to
  // re-fetch. The DB stamp inside PhlebUploadLabOrderButton ensures next
  // page-load is also consistent. Same pattern for insurance card.
  const [labOrderJustUploaded, setLabOrderJustUploaded] = useState(false);
  const [insuranceJustUploaded, setInsuranceJustUploaded] = useState<string | null>(null);
  const statusConfig = STATUS_CONFIG[appointment.status] || STATUS_CONFIG.scheduled;

  // Pre-flight readiness: does this visit have everything the phleb needs?
  const readiness = computeReadiness(appointment as any);
  // Fasting requirement heuristic (now enriched with OCR text + detected panels)
  const fasting = detectFastingRequirement(appointment as any);
  // Lab route URL (for "Route to Lab" button in Specimen Delivery section)
  const labRouteUrl = buildLabRouteUrl(appointment.lab_destination, appointment.zipcode);
  // Detected panels from OCR — shown as chips on the card
  const panelBadges = extractPanelBadges((appointment as any).lab_order_panels);

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
                    {/* Hormozi: show what THIS visit pays the phleb. Real
                        amount via compute_phleb_take_cents — same RPC
                        Stripe Connect uses to split the charge. Tips
                        captured at online checkout are baked in. */}
                    <AppointmentEarningPill
                      appointmentId={appointment.id}
                      serviceType={appointment.service_type}
                      tipAmount={(appointment as any).tip_amount}
                      hasCompanion={!!(appointment as any).family_group_id}
                    />
                    {/* Org badge — phleb needs to know "billed through X" for
                        masked/org-covered patients (Aristotle, Elite Medical)
                        so they route questions + invoices correctly. */}
                    {appointment.organization_name && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200"
                        title={appointment.billed_to === 'org' ? `Billed to ${appointment.organization_name}` : `Partner: ${appointment.organization_name}`}
                      >
                        🏢 {appointment.organization_name}
                      </span>
                    )}
                    {/* Pre-flight readiness pill — only for delivery visits */}
                    {readiness.status !== 'na' && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${readiness.colorClass}`}
                        title={readiness.reasons.length > 0 ? readiness.reasons.join(' · ') : 'All pre-visit checks passed'}
                      >
                        {readiness.label}
                      </span>
                    )}
                    {/* Provider-initiated badge — this visit came from a doctor's lab order request */}
                    {appointment.lab_request_id && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-purple-50 text-purple-700 border-purple-200"
                        title="This visit was requested by the patient's provider (delegated booking)"
                      >
                        Provider-initiated
                      </span>
                    )}
                    {/* Series indicator (Sprint 4) */}
                    {appointment.recurrence_total && appointment.recurrence_total > 1 && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${appointment.visit_bundle_id ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}
                        title={appointment.visit_bundle_id ? 'Prepaid bundle — no invoice at this visit' : 'Recurring series — invoice per visit'}
                      >
                        <Repeat className="h-2.5 w-2.5" />
                        {appointment.recurrence_sequence}/{appointment.recurrence_total}
                        {appointment.visit_bundle_id ? ' · prepaid' : ''}
                      </span>
                    )}
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

            {/* Navigate / Message / Running Late */}
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-9" onClick={(e) => { e.stopPropagation(); handleNavigate(); }}>
                <Navigation className="h-3.5 w-3.5" /> Navigate
              </Button>
              <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-9 border-gray-200" onClick={(e) => { e.stopPropagation(); handleMessage(); }}>
                <MessageSquare className="h-3.5 w-3.5" /> Message
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-9 border-amber-300 text-amber-700 hover:bg-amber-50 px-2.5"
                title="Notify patient I'm running late"
                onClick={(e) => { e.stopPropagation(); setShowRunningLate(true); }}
              >
                <Clock3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Late</span>
              </Button>
            </div>
          </div>

          {/* Expanded Detail */}
          {isExpanded && (
            <div className="border-t bg-white">
              {/* Fasting warning — first thing phleb sees when expanded */}
              {fasting.required && (
                <div className="px-4 py-3 bg-red-50 border-b-2 border-red-200 flex items-start gap-2">
                  <Utensils className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-red-800">FASTING REQUIRED</p>
                    <p className="text-xs text-red-700">
                      {fasting.reason}. Confirm patient fasted 8–12 hrs. Water only.
                    </p>
                  </div>
                </div>
              )}

              {/* Readiness detail banner (show reasons when BLOCKED or CHECK) */}
              {(readiness.status === 'blocked' || readiness.status === 'warning') && (
                <div className={`px-4 py-3 border-b-2 flex items-start gap-2 ${
                  readiness.status === 'blocked' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                    readiness.status === 'blocked' ? 'text-red-600' : 'text-amber-600'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${readiness.status === 'blocked' ? 'text-red-800' : 'text-amber-800'}`}>
                      {readiness.status === 'blocked' ? 'Do NOT depart yet' : 'Double-check before departing'}
                    </p>
                    <ul className={`text-xs mt-0.5 ${readiness.status === 'blocked' ? 'text-red-700' : 'text-amber-700'}`}>
                      {readiness.reasons.map(r => <li key={r}>• {r}</li>)}
                    </ul>
                  </div>
                </div>
              )}

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
              {/* Show for ALL service types. Even in-office and partner visits
                  may need the specimen delivered to LabCorp/Quest/etc. — phleb
                  needs to see the destination. (Isabella Millians case 2026-04-21) */}
              {(
                <div className="px-4 py-3 border-b bg-indigo-50/30">
                  <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-indigo-600" />
                    Specimen Delivery
                  </p>
                  {appointment.lab_destination ? (
                    <div className="space-y-2">
                      <div>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-0.5">Drop off at</p>
                        <p className="text-sm font-semibold text-gray-900">{appointment.lab_destination}</p>
                      </div>
                      {labRouteUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5 h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          onClick={(e) => { e.stopPropagation(); window.open(labRouteUrl, '_blank'); }}
                        >
                          <Route className="h-3.5 w-3.5" />
                          Route to nearest {appointment.lab_destination}
                        </Button>
                      )}
                    </div>
                  ) : (appointment as any).lab_destination_pending ? (
                    <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                      <HelpCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Patient asked us to call them</p>
                        <p className="text-amber-600 mt-0.5">They'll confirm lab with their doctor. Admin is following up — do NOT deliver without confirming destination.</p>
                      </div>
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

              {/* Organization — view linked practice, reassign, edit details */}
              <div className="px-4 py-3 border-b">
                <AssignOrgButton
                  appointmentId={appointment.id}
                  currentOrgId={(appointment as any).organization_id}
                  variant="primary"
                />
              </div>

              {/* Lab Order files (uploaded requisitions) */}
              {(appointment.lab_order_file_path || labOrderJustUploaded) ? (() => {
                // Newline-first split (current trigger output); fall back to
                // comma-split for legacy rows. Lab-order filenames CAN contain
                // commas ("Rienzi, Mary Ellen.pdf") which broke the old
                // comma-only split — Mary Rienzi 5/1/2026 was the trigger.
                //
                // Null-safe: when entering this branch via the local
                // labOrderJustUploaded flag (parent appointment row hasn't
                // refetched yet), lab_order_file_path is still null. Default
                // to an empty string so the .includes/.split chain doesn't
                // crash; the LabOrderStatusList below will surface the new
                // upload via its own realtime query.
                const _raw = appointment.lab_order_file_path || '';
                const _parts = _raw
                  ? (_raw.includes('\n') ? _raw.split('\n') : _raw.split(','))
                  : [];
                return (
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-gray-500" />
                    Lab Orders ({_parts.length})
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {_parts.map((p: string, i: number) => {
                      const path = p.trim();
                      const fileName = path.split('/').pop() || `Lab Order ${i + 1}`;
                      return (
                        <Button
                          key={path + i}
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs justify-start h-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLabOrderViewer({ open: true, path, name: fileName });
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="truncate flex-1 text-left">{fileName.length > 30 ? fileName.slice(0, 30) + '…' : fileName}</span>
                        </Button>
                      );
                    })}
                  </div>

                  {/* Phleb can add another lab order from the field */}
                  <div className="mt-2">
                    <PhlebUploadLabOrderButton
                      appointmentId={appointment.id}
                      variant="subtle"
                      label="Add another"
                      onUploaded={() => { setLabOrderRefreshKey(k => k + 1); setLabOrderJustUploaded(true); }}
                    />
                  </div>

                  {/* Inline OCR + org-match status per lab order */}
                  <LabOrderStatusList
                    appointmentId={appointment.id}
                    refreshKey={labOrderRefreshKey}
                  />

                  {/* Detected panel chips (from OCR) — gives phleb an at-a-glance view
                      of what's being drawn without opening the file. */}
                  {panelBadges.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                        Detected panels
                        {(appointment as any).ocr_processed_at && (
                          <span className="text-gray-400 normal-case lowercase"> · auto-read from file</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {panelBadges.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })() : (
                // Show a "no lab order" hint for services that typically need one
                !['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type || '') && (
                  <div className="px-4 py-3 border-b">
                    <p className="text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-gray-500" />
                      Lab Orders
                    </p>
                    <p className="text-xs text-amber-600 mb-2">
                      No lab order uploaded. Capture it now — or text/email the patient a one-tap upload link.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <PhlebUploadLabOrderButton
                        appointmentId={appointment.id}
                        variant="primary"
                        label="Upload Lab Order"
                        onUploaded={() => { setLabOrderRefreshKey(k => k + 1); setLabOrderJustUploaded(true); }}
                      />
                      <RequestLabOrderButton
                        appointmentId={appointment.id}
                        patientName={appointment.patient_name}
                      />
                    </div>
                    <LabOrderRequestStatus appointmentId={appointment.id} />
                    {/* Inline OCR + org-match status — appears the moment a row exists */}
                    <LabOrderStatusList
                      appointmentId={appointment.id}
                      refreshKey={labOrderRefreshKey}
                    />
                  </div>
                )
              )}

              {/* Insurance Card — view + capture from the field. Phleb
                  can snap a photo of front/back; saves to the appointment
                  AND to the patient's profile so future visits inherit. */}
              {(appointment.insurance_card_path || insuranceJustUploaded) ? (
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-gray-500" />
                    Insurance Card
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs justify-start h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLabOrderViewer({
                          open: true,
                          path: insuranceJustUploaded || appointment.insurance_card_path!,
                          name: 'Insurance Card',
                        });
                      }}>
                      <Shield className="h-3.5 w-3.5" />
                      <span>View Insurance Card</span>
                    </Button>
                    <PhlebUploadInsuranceCardButton
                      appointmentId={appointment.id}
                      patientId={(appointment as any).patient_id || null}
                      label="Replace / Add back"
                      variant="subtle"
                      onUploaded={(p) => setInsuranceJustUploaded(p)}
                    />
                  </div>
                </div>
              ) : (
                // Only warn for services that usually need insurance
                !['in-office', 'partner-nd-wellness', 'partner-restoration-place', 'partner-elite-medical-concierge', 'partner-naturamed', 'partner-aristotle-education'].includes(appointment.service_type || '') && (
                  <div className="px-4 py-3 border-b">
                    <p className="text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-gray-500" />
                      Insurance Card
                    </p>
                    <p className="text-xs text-amber-600 mb-2">
                      No insurance card on file. Snap a photo at the visit — we'll save it to the patient's chart.
                    </p>
                    <PhlebUploadInsuranceCardButton
                      appointmentId={appointment.id}
                      patientId={(appointment as any).patient_id || null}
                      label="Capture Insurance Card"
                      variant="primary"
                      onUploaded={(p) => setInsuranceJustUploaded(p)}
                    />
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

                  {/* Tube Label (NIIMBOT) — available once arrived, highlighted when in_progress */}
                  <Button
                    size="sm"
                    className={`h-16 flex flex-col gap-1 col-span-2 ${
                      ['arrived', 'in_progress'].includes(appointment.status)
                        ? (appointment as any).collection_at
                          ? 'bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    disabled={!['arrived', 'in_progress', 'specimen_delivered', 'completed'].includes(appointment.status)}
                    onClick={(e) => { e.stopPropagation(); setShowTubeLabel(true); }}
                  >
                    <Printer className="h-4 w-4" />
                    <span className="text-xs">
                      {(appointment as any).collection_at
                        ? 'Tube Label (stamped ✓)'
                        : 'Tube Label (NIIMBOT)'}
                    </span>
                  </Button>
                  {/* Specimen Delivery — ALL service types may need delivery.
                      Previously gated to hide for in-office + partner-*, but real
                      workflow still needs chain-of-custody tracking regardless of
                      where the draw happened (Isabella Millians case 2026-04-21:
                      partner-naturamed visit, sample needed delivery to LabCorp). */}
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
                  <Button
                    size="sm"
                    className={`col-span-2 h-12 flex flex-row gap-2 ${
                      appointment.status === 'specimen_delivered'
                        ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    disabled={appointment.status !== 'specimen_delivered'}
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

      <LabOrderViewerModal
        open={labOrderViewer.open}
        onClose={() => setLabOrderViewer({ open: false, path: null })}
        filePath={labOrderViewer.path}
        fileName={labOrderViewer.name}
      />

      <RunningLateModal
        open={showRunningLate}
        onClose={() => setShowRunningLate(false)}
        patientFirstName={appointment.patient_name || 'there'}
        patientPhone={appointment.patient_phone}
        appointmentId={appointment.id}
      />

      <TubeLabelModal
        open={showTubeLabel}
        onClose={() => setShowTubeLabel(false)}
        appointmentId={appointment.id}
        patientName={appointment.patient_name}
        patientDob={appointment.patient_dob}
        existingCollectionAt={(appointment as any).collection_at || null}
        onMarked={() => { /* parent will refetch on next update */ }}
      />
    </>
  );
};

export default PhlebAppointmentCard;
