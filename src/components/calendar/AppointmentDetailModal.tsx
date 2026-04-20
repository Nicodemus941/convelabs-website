import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  User, Calendar, Clock, MapPin, Phone, Mail, MessageSquare,
  CalendarClock, XCircle, DollarSign, FileText, Shield,
  ChevronDown, ChevronUp, UserPlus, AlertTriangle, UserX,
  X, MoreHorizontal, ChevronRight, Upload, ExternalLink,
  Pencil, Save, Loader2, Crown,
} from 'lucide-react';

// Tier -> badge style. Extracted so the modal + chart match pixel-for-pixel.
const tierBadgeClass = (tier: string | undefined) => {
  switch (tier) {
    case 'concierge': return 'bg-gradient-to-r from-purple-600 to-pink-500 text-white';
    case 'vip': return 'bg-gradient-to-r from-amber-500 to-yellow-400 text-white';
    case 'member': return 'bg-emerald-100 text-emerald-700 border border-emerald-300';
    default: return 'bg-gray-100 text-gray-600';
  }
};
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import RescheduleAppointmentModal from './RescheduleAppointmentModal';
import CancelAppointmentModal from './CancelAppointmentModal';
import NoShowAppointmentModal from './NoShowAppointmentModal';
import AppointmentLabOrdersPanel from './AppointmentLabOrdersPanel';
import StaffRefundButton from '@/components/admin/StaffRefundButton';
import AssignOrgButton from '@/components/admin/AssignOrgButton';
import MarkSpecimenDeliveredButton from '@/components/admin/MarkSpecimenDeliveredButton';

interface AppointmentDetailModalProps {
  appointment: any | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  confirmed: { label: 'Confirmed', color: 'text-blue-800', bg: 'bg-blue-100 border-blue-300' },
  en_route: { label: 'En Route', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  in_progress: { label: 'In Progress', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200' },
  completed: { label: 'Completed', color: 'text-gray-600', bg: 'bg-gray-100 border-gray-300' },
  cancelled: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
};

const PAYMENT_BADGE: Record<string, { label: string; icon: string; className: string }> = {
  completed: { label: 'Paid', icon: '✓', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: 'Unpaid', icon: '○', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  refunded: { label: 'Refunded', icon: '↩', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  partial_refund: { label: 'Partial Refund', icon: '↩', className: 'bg-amber-50 text-amber-600 border-amber-200' },
};

const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  appointment, open, onClose, onUpdate,
}) => {
  const [patientData, setPatientData] = useState<any>(null);
  const [staffName, setStaffName] = useState<string>('');
  const [showInsurance, setShowInsurance] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noShowCount, setNoShowCount] = useState(0);
  const [appointmentHistory, setAppointmentHistory] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    patient_name: '', patient_email: '', patient_phone: '',
    address: '', gate_code: '', notes: '',
  });

  const appt = appointment;

  // Resolve assigned phleb's display name from staff_profiles (join auth.users
  // via a view or fallback to email). Prevents the modal from showing "Assigned
  // Staff" / hardcoded names when a real phleb is on file.
  useEffect(() => {
    if (!appt?.phlebotomist_id) { setStaffName(''); return; }
    (async () => {
      const { data } = await supabase
        .from('staff_profiles')
        .select('user_id, phone')
        .eq('user_id', appt.phlebotomist_id)
        .maybeSingle();
      if (!data) { setStaffName(''); return; }
      // Hydrate display name from user_profiles / auth metadata (public.users view)
      const { data: u } = await supabase
        .from('users' as any)
        .select('first_name, last_name, email')
        .eq('id', appt.phlebotomist_id)
        .maybeSingle();
      const nm = u ? `${(u as any).first_name || ''} ${(u as any).last_name || ''}`.trim() || (u as any).email : '';
      setStaffName(nm || 'Assigned Staff');
    })();
  }, [appt?.phlebotomist_id]);

  useEffect(() => {
    if (!appt) return;
    const lookup = async () => {
      if (appt.patient_id) {
        const { data } = await supabase.from('tenant_patients').select('*').eq('id', appt.patient_id).maybeSingle();
        if (data) { setPatientData(data); return; }
        const { data: byUserId } = await supabase.from('tenant_patients').select('*').eq('user_id', appt.patient_id).maybeSingle();
        if (byUserId) { setPatientData(byUserId); return; }
      }
      const email = appt.patient_email || appt.notes?.match(/Email:\s*([^|\s]+)/)?.[1]?.trim();
      if (email) {
        const { data } = await supabase.from('tenant_patients').select('*').ilike('email', email).maybeSingle();
        if (data) { setPatientData(data); return; }
      }
      setPatientData(null);
    };
    lookup();

    // No-show history
    const email = appt.patient_email;
    if (email) {
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .ilike('patient_email', email).eq('no_show', true)
        .then(({ count }) => setNoShowCount(count || 0));

      // Appointment history for this patient
      supabase.from('appointments')
        .select('id, appointment_date, appointment_time, service_name, service_type, total_amount, status, notes')
        .ilike('patient_email', email)
        .order('appointment_date', { ascending: false })
        .limit(10)
        .then(({ data }) => setAppointmentHistory(data || []));
    }
  }, [appt?.id, appt?.patient_id]);

  // Reset edit mode when appointment changes
  useEffect(() => {
    setIsEditing(false);
  }, [appt?.id]);

  const startEditing = () => {
    setEditForm({
      patient_name: appt.patient_name || '',
      patient_email: appt.patient_email || patientData?.email || '',
      patient_phone: appt.patient_phone || patientData?.phone || '',
      address: appt.address || '',
      gate_code: appt.gate_code || '',
      notes: appt.notes || '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update appointment record
      const updatePayload = {
        patient_name: editForm.patient_name,
        patient_email: editForm.patient_email,
        patient_phone: editForm.patient_phone,
        address: editForm.address,
        gate_code: editForm.gate_code,
        notes: editForm.notes,
      };
      console.log('[AppointmentEdit] Saving appointment', appt.id, updatePayload);
      const { data: updatedRows, error: apptError } = await supabase
        .from('appointments')
        .update(updatePayload)
        .eq('id', appt.id)
        .select();

      if (apptError) {
        console.error('[AppointmentEdit] Supabase error:', apptError);
        throw apptError;
      }
      console.log('[AppointmentEdit] Updated rows:', updatedRows);

      if (!updatedRows || updatedRows.length === 0) {
        toast.error('No rows updated — you may not have permission');
        return;
      }

      // Also update tenant_patients record if we have one
      if (patientData?.id) {
        const nameParts = editForm.patient_name.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const { error: patientError } = await supabase.from('tenant_patients').update({
          first_name: firstName,
          last_name: lastName,
          email: editForm.patient_email,
          phone: editForm.patient_phone,
        }).eq('id', patientData.id);
        if (patientError) console.warn('[AppointmentEdit] tenant_patients update error:', patientError);
      }

      // Mutate the local appointment object so the panel shows updated data immediately
      Object.assign(appt, updatePayload);

      toast.success('Patient information saved');
      setIsEditing(false);
      onUpdate();
    } catch (err: any) {
      console.error('[AppointmentEdit] Save failed:', err);
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!appt) return null;

  const patientName = appt.patient_name
    || (patientData ? `${patientData.first_name || ''} ${patientData.last_name || ''}`.trim() : '')
    || appt.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim()
    || 'Unknown Patient';

  const patientEmail = appt.patient_email || patientData?.email || '';
  const patientPhone = appt.patient_phone || patientData?.phone || '';
  const insuranceProvider = patientData?.insurance_provider || '';
  const insuranceMemberId = patientData?.insurance_member_id || '';
  const insuranceGroup = patientData?.insurance_group_number || '';

  const serviceName = appt.service_name || appt.notes?.match(/Service:\s*([^|]+)/)?.[1]?.trim() || '';
  const dateStr = appt.appointment_date?.substring(0, 10) || '';
  const formattedDate = dateStr ? format(new Date(dateStr + 'T12:00:00'), 'EEEE, MMMM d, yyyy') : '';
  const timeStr = appt.appointment_time || '';
  const durationMin = appt.duration_minutes || 60;
  const statusCfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
  const paymentCfg = PAYMENT_BADGE[appt.payment_status] || PAYMENT_BADGE.pending;

  // Calculate end time for display
  const getTimeRange = () => {
    if (!timeStr) return 'Time TBD';
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return timeStr;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const period = match[3]?.toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const endH = h + Math.floor((m + durationMin) / 60);
    const endM = (m + durationMin) % 60;
    const fmt = (hr: number, mn: number) => {
      const p = hr >= 12 ? 'pm' : 'am';
      const h12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
      return `${h12}:${String(mn).padStart(2, '0')} ${p}`;
    };
    return `${fmt(h, m)} – ${fmt(endH, endM)} (${durationMin} mins)`;
  };

  const handleStatusChange = async (newStatus: string) => {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', appt.id);
    if (error) { toast.error('Failed to update status'); return; }
    toast.success(`Status updated to ${newStatus}`);
    onUpdate();
    onClose();
  };

  const handleCancel = () => {
    setCancelOpen(true);
  };

  const handleNoShow = () => {
    setNoShowOpen(true);
  };

  const handleMessage = () => {
    if (patientPhone) window.open(`sms:${patientPhone}`, '_blank');
    else toast.error('No phone number on file');
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-[420px] p-0 overflow-y-auto" side="right">
        <VisuallyHidden><SheetTitle>Appointment Details</SheetTitle></VisuallyHidden>
        {/* Top bar — actions */}
        <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-md transition">
            <X className="h-5 w-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRescheduleOpen(true)}>
              <CalendarClock className="h-3.5 w-3.5 mr-1" /> Reschedule
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleMessage}>
              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Message
            </Button>
          </div>
        </div>

        {/* Payment + Series badges */}
        <div className="px-5 pt-4 flex items-center gap-2 flex-wrap">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${paymentCfg.className}`}>
            <span>{paymentCfg.icon}</span>
            {appt.total_amount > 0 ? `$${((appt.total_amount || 0) + (appt.tip_amount || 0)).toFixed(2)} ${paymentCfg.label.toLowerCase()}` : paymentCfg.label}
          </div>
          {/* Sprint 4: recurring-series badge + cancel-series button */}
          {appt.recurrence_group_id && appt.recurrence_total > 1 && (
            <>
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${appt.visit_bundle_id ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                🔁 Visit {appt.recurrence_sequence}/{appt.recurrence_total}{appt.visit_bundle_id ? ' · prepaid' : ''}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] border-red-200 text-red-600 hover:bg-red-50"
                onClick={async () => {
                  const remaining = appt.recurrence_total - (appt.recurrence_sequence || 1) + 1;
                  if (!confirm(`Cancel ALL ${remaining} remaining visit(s) in this series?`)) return;
                  const { error } = await supabase
                    .from('appointments')
                    .update({ status: 'cancelled' })
                    .eq('recurrence_group_id', appt.recurrence_group_id)
                    .in('status', ['scheduled', 'confirmed']);
                  if (error) { toast.error(error.message); return; }
                  if (appt.visit_bundle_id) {
                    try {
                      await supabase.from('visit_bundles' as any).update({ credits_remaining: 0 }).eq('id', appt.visit_bundle_id);
                    } catch (e) { console.warn('bundle zero-out failed:', e); }
                  }
                  toast.success(`Series cancelled. ${appt.visit_bundle_id ? 'Bundle frozen — issue refund in Stripe if needed.' : 'Future invoices won\u2019t be sent.'}`);
                  onUpdate();
                  onClose();
                }}
              >
                Cancel entire series
              </Button>
            </>
          )}
          {/* Assign to org — admin 1-click */}
          <AssignOrgButton
            appointmentId={appt.id}
            patientEmail={appt.patient_email}
            currentOrgId={appt.organization_id}
            currentOrgName={appt.organization_name || null}
            onAssigned={onUpdate}
          />

          {/* Mark specimen delivered — fires org notification via DB trigger */}
          {['completed', 'specimen_delivered', 'in_progress', 'en_route'].includes(appt.status) && (
            <MarkSpecimenDeliveredButton
              appointmentId={appt.id}
              alreadyDelivered={!!(appt.delivered_at || appt.specimens_delivered_at)}
              deliveredAt={appt.delivered_at || appt.specimens_delivered_at}
              currentLabName={appt.specimen_lab_name}
              currentTrackingId={appt.specimen_tracking_id}
              orgNotifiedAt={appt.org_notified_delivery_at}
              onDelivered={onUpdate}
            />
          )}

          {/* Staff refund button — only shows for paid appointments */}
          {appt.payment_status === 'completed' && (appt.total_amount || 0) > 0 && (
            <StaffRefundButton
              appointmentId={appt.id}
              patientEmail={appt.patient_email}
              patientName={appt.patient_name}
              totalAmountDollars={appt.total_amount || 0}
              alreadyRefunded={!!appt.refunded_at || appt.refund_status === 'refunded'}
              refundedAmountCents={appt.refund_amount_cents}
              onRefunded={onUpdate}
            />
          )}
        </div>

        {/* Patient name + contact */}
        <div className="px-5 pt-4 pb-3">
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 uppercase tracking-wide">Patient Name</label>
                <Input value={editForm.patient_name} onChange={e => setEditForm(f => ({ ...f, patient_name: e.target.value }))} className="h-9 text-sm mt-0.5" />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 uppercase tracking-wide">Phone</label>
                <Input value={editForm.patient_phone} onChange={e => setEditForm(f => ({ ...f, patient_phone: e.target.value }))} className="h-9 text-sm mt-0.5" />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 uppercase tracking-wide">Email</label>
                <Input value={editForm.patient_email} onChange={e => setEditForm(f => ({ ...f, patient_email: e.target.value }))} className="h-9 text-sm mt-0.5" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">{patientName}</h2>
                {patientData?.membership_tier && patientData.membership_tier !== 'none' && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${tierBadgeClass(patientData.membership_tier)}`}>
                    <Crown className="h-3 w-3" /> {patientData.membership_tier}
                  </span>
                )}
                {noShowCount > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[10px] gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" /> {noShowCount} no-show{noShowCount > 1 ? 's' : ''}
                  </Badge>
                )}
                <button onClick={startEditing} className="ml-auto p-1.5 hover:bg-gray-100 rounded-md transition" title="Edit patient info">
                  <Pencil className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>
              <Badge variant="outline" className={`mt-1.5 text-[11px] font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                {statusCfg.label}
              </Badge>

              <div className="mt-3 space-y-1.5">
                {patientPhone && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      <a href={`tel:${patientPhone}`} className="text-blue-600 hover:underline">{patientPhone}</a>
                    </div>
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide">Phone</span>
                  </div>
                )}
                {patientEmail && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <a href={`mailto:${patientEmail}`} className="text-blue-600 hover:underline truncate max-w-[220px]">{patientEmail}</a>
                    </div>
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide">Email</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <Separator />

        {/* Time & Date */}
        <div className="px-5 py-4 space-y-1">
          <p className="text-sm font-semibold text-gray-900">{getTimeRange()}</p>
          <p className="text-sm text-gray-500">{formattedDate}</p>
        </div>

        <Separator />

        {/* Location & Staff */}
        <div className="px-5 py-4 space-y-3">
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 uppercase tracking-wide">Address</label>
                <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="h-9 text-sm mt-0.5" />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 uppercase tracking-wide">Gate Code</label>
                <Input value={editForm.gate_code} onChange={e => setEditForm(f => ({ ...f, gate_code: e.target.value }))} className="h-9 text-sm mt-0.5" placeholder="Gate code (optional)" />
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Location</p>
                <p className="text-sm text-gray-900">{appt.address || 'TBD'}</p>
                {appt.gate_code && <p className="text-xs text-gray-500 mt-0.5">Gate: {appt.gate_code}</p>}
              </div>
              <div className="text-right">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Staff</p>
                <p className="text-sm text-gray-900">
                  {staffName || (appt.phlebotomist_id ? 'Assigned Staff' : <span className="text-gray-400">Unassigned</span>)}
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Notes */}
        {(appt.notes || isEditing) && (
          <>
            <div className="px-5 py-4">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Notes</p>
              {isEditing ? (
                <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="text-sm min-h-[60px]" placeholder="Add notes..." />
              ) : (
                <p className="text-sm text-gray-700">{appt.notes}</p>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Booked by */}
        <div className="px-5 py-4">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Booked By</p>
          <p className="text-sm text-gray-700">
            {appt.booked_by_name || (appt.booking_source === 'manual' ? 'Admin (Manual)' : patientName)}
            {appt.created_at && ` on ${format(new Date(appt.created_at), 'MMM d, yyyy \'at\' h:mm a')}`}
          </p>
        </div>

        <Separator />

        {/* Services & Items — Square style */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm font-bold text-gray-900">Services & Items</p>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{serviceName || 'Blood Draw Service'}</p>
              <p className="text-xs text-gray-500">{timeStr} · {durationMin} minutes</p>
            </div>
            <p className="text-sm font-medium">${(appt.service_price || appt.total_amount || 0).toFixed(2)}</p>
          </div>

          {appt.tip_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tip</span>
              <span className="text-emerald-600">${Number(appt.tip_amount).toFixed(2)}</span>
            </div>
          )}

          <Separator className="my-1" />

          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span>${(appt.total_amount || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span>Total</span>
            <span>${((appt.total_amount || 0) + (appt.tip_amount || 0)).toFixed(2)}</span>
          </div>

          {/* Invoice link if exists */}
          {appt.stripe_invoice_id && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
              <FileText className="h-3 w-3" />
              <span className="truncate">{appt.stripe_invoice_id}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Insurance (collapsible) */}
        <button
          className="w-full px-5 py-3 flex items-center justify-between text-sm hover:bg-gray-50 transition"
          onClick={() => setShowInsurance(!showInsurance)}
        >
          <div className="flex items-center gap-2 font-medium text-gray-900">
            <Shield className="h-4 w-4 text-gray-400" /> Insurance
          </div>
          {showInsurance ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
        {showInsurance && (
          <div className="px-5 pb-4 text-sm">
            {insuranceProvider ? (
              <div className="space-y-1 pl-6">
                <p><span className="text-gray-400">Provider:</span> {insuranceProvider}</p>
                {insuranceMemberId && <p><span className="text-gray-400">Member ID:</span> {insuranceMemberId}</p>}
                {insuranceGroup && <p><span className="text-gray-400">Group:</span> {insuranceGroup}</p>}
              </div>
            ) : (
              <p className="text-gray-400 pl-6">No insurance on file — self-pay patient</p>
            )}
          </div>
        )}

        <Separator />

        {/* Lab Orders — Hormozi-structured staged upload + OCR readback */}
        <div className="px-5 py-4">
          <AppointmentLabOrdersPanel
            appointmentId={appt.id}
            patientName={appt.patient_name}
            canEdit={true}
            onChanged={onUpdate}
          />
        </div>

        <Separator />

        {/* Lab Destination — where phleb drops the specimen */}
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm font-bold text-gray-900">Specimen Delivery Destination</p>
          <p className="text-xs text-gray-500">Where the phleb should drop the drawn specimen.</p>
          <select
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            value={appt.lab_destination || ''}
            onChange={async (e) => {
              const val = e.target.value || null;
              const { error } = await supabase.from('appointments').update({ lab_destination: val }).eq('id', appt.id);
              if (error) { toast.error('Failed to save destination'); return; }
              toast.success(val ? `Destination set to ${val}` : 'Destination cleared');
              onUpdate();
            }}
          >
            <option value="">— Not set —</option>
            <option value="LabCorp">LabCorp</option>
            <option value="Quest Diagnostics">Quest Diagnostics</option>
            <option value="AdventHealth">AdventHealth</option>
            <option value="Orlando Health">Orlando Health</option>
            <option value="Genova Diagnostics">Genova Diagnostics (ship)</option>
            <option value="UPS">UPS (specialty kit)</option>
            <option value="FedEx">FedEx (specialty kit)</option>
            <option value="Other">Other (see notes)</option>
          </select>
          {!appt.lab_destination && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              No destination set — phleb will not know where to deliver.
            </p>
          )}
        </div>

        <Separator />

        {/* Insurance Card upload (admin can attach retroactively) */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm font-bold text-gray-900">Insurance Card</p>
          {appt.insurance_card_path ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full justify-start h-8" onClick={async () => {
              const { data } = await supabase.storage.from('lab-orders').createSignedUrl(appt.insurance_card_path, 3600);
              if (data?.signedUrl) window.open(data.signedUrl, '_blank');
              else toast.error('Could not load file');
            }}>
              <Shield className="h-3.5 w-3.5" /> View Insurance Card
              <ExternalLink className="h-3 w-3 ml-auto" />
            </Button>
          ) : (
            <p className="text-xs text-gray-400">No insurance card on file</p>
          )}
          <label className="cursor-pointer">
            <div className="border border-dashed border-gray-200 hover:border-blue-300 rounded-lg p-3 text-center transition-colors">
              <Upload className="h-4 w-4 mx-auto text-gray-400 mb-1" />
              <p className="text-xs text-gray-500">Upload insurance card</p>
            </div>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                toast.info(`Uploading ${file.name}...`);
                const fileName = `insurance_${appt.id}_${Date.now()}_${file.name}`;
                const { error: uploadErr } = await supabase.storage.from('lab-orders').upload(fileName, file);
                if (uploadErr) { toast.error('Upload failed: ' + uploadErr.message); return; }
                const { error: updateErr } = await supabase.from('appointments').update({ insurance_card_path: fileName }).eq('id', appt.id);
                if (updateErr) { toast.error('Failed to link file'); return; }
                toast.success('Insurance card uploaded');
                onUpdate();
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <Separator />

        {/* Appointment History */}
        {appointmentHistory.length > 0 && (
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm font-bold text-gray-900">Appointment History</p>
            {appointmentHistory.slice(0, 5).map((hist) => {
              const hDate = hist.appointment_date?.substring(0, 10);
              return (
                <div key={hist.id} className={`text-xs space-y-0.5 ${hist.id === appt.id ? 'font-semibold' : ''}`}>
                  <div className="flex justify-between">
                    <span className="text-gray-700">
                      {hDate ? format(new Date(hDate + 'T12:00:00'), 'EEE, MMM d, yyyy') : '—'}, {hist.appointment_time || ''}
                    </span>
                    <span className="font-medium">${hist.total_amount || 0}</span>
                  </div>
                  <p className="text-gray-500">{hist.service_name || hist.service_type || 'Blood Draw'}</p>
                  {hist.status === 'cancelled' && <p className="text-red-500">Cancelled</p>}
                </div>
              );
            })}
          </div>
        )}

        <Separator />

        {/* Status Actions — sticky bottom */}
        <div className="sticky bottom-0 bg-white border-t px-5 py-3 space-y-2">
          {/* Edit save/cancel bar */}
          {isEditing && (
            <div className="flex gap-2 mb-1">
              <Button size="sm" className="flex-1 h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setIsEditing(false)} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          )}

          {/* Quick status progression */}
          <div className="flex flex-wrap gap-2">
            {appt.status === 'scheduled' && (
              <Button size="sm" className="flex-1 h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleStatusChange('confirmed')}>
                Confirm
              </Button>
            )}
            {(appt.status === 'scheduled' || appt.status === 'confirmed') && (
              <Button size="sm" className="flex-1 h-9 text-xs bg-orange-500 hover:bg-orange-600 text-white" onClick={() => handleStatusChange('en_route')}>
                En Route
              </Button>
            )}
            {appt.status === 'en_route' && (
              <Button size="sm" className="flex-1 h-9 text-xs bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => handleStatusChange('in_progress')}>
                Begin Job
              </Button>
            )}
            {appt.status === 'in_progress' && (
              <Button size="sm" className="flex-1 h-9 text-xs bg-gray-700 hover:bg-gray-800 text-white" onClick={() => handleStatusChange('completed')}>
                Complete
              </Button>
            )}
          </div>

          {/* Destructive actions */}
          {appt.status !== 'cancelled' && appt.status !== 'completed' && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-amber-600 border-amber-200 hover:bg-amber-50" onClick={handleNoShow}>
                <UserX className="h-3.5 w-3.5 mr-1" /> No-Show
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={handleCancel}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    <RescheduleAppointmentModal
      appointment={appt}
      open={rescheduleOpen}
      onClose={() => setRescheduleOpen(false)}
      onRescheduled={() => { onUpdate(); onClose(); }}
    />

    <CancelAppointmentModal
      appointment={appt}
      open={cancelOpen}
      onClose={() => setCancelOpen(false)}
      onCancelled={() => { onUpdate(); onClose(); }}
    />

    <NoShowAppointmentModal
      appointment={appt}
      open={noShowOpen}
      onClose={() => setNoShowOpen(false)}
      onMarked={() => { onUpdate(); onClose(); }}
    />
    </>
  );
};

export default AppointmentDetailModal;
