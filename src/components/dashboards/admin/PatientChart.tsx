/**
 * PatientChart — one patient, everything an admin needs about them.
 *
 * Rendered by PatientProfileTab when a directory row is opened. Same
 * component for super_admin and office_manager; the only role-gated control
 * is "Delete patient" (`canDelete`, super_admin only).
 *
 * Holds PHI. Nothing here is logged beyond ids and error codes, and nothing
 * is sent to the patient without an explicit confirm.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft, Phone, Mail, MapPin, Shield, Crown, Edit3, CalendarPlus, Zap, Receipt, MessageSquare,
  Sparkles, MoreHorizontal, Send, Copy, ClipboardList, AlertTriangle, Stethoscope, CreditCard,
  FlaskConical, User, CalendarClock, Loader2, Notebook,
} from 'lucide-react';
import AddressAutocomplete from '@/components/ui/address-autocomplete';
import MembershipActionsModal from './MembershipActionsModal';
import RecurringGapsCard from './RecurringGapsCard';
import StaffRefundButton from '@/components/admin/StaffRefundButton';
import ScheduleAppointmentModal from '@/components/calendar/ScheduleAppointmentModal';
import SendBookingLinkModal from '@/components/admin/SendBookingLinkModal';
import PatientCommsTimeline from '@/components/admin/PatientCommsTimeline';
import FamilyHouseholdCard from '@/components/admin/FamilyHouseholdCard';
import AppointmentDetailModal from '@/components/calendar/AppointmentDetailModal';
import SendRescheduleLinkButton from '@/components/appointments/SendRescheduleLinkButton';
import {
  APPT_STATUS_PILL, CLOSED_STATUSES, DONE_STATUSES, LIVE_STATUSES, PATIENT_PAID, SETTLED_PAYMENT,
  type MemberTier, type PatientRow, apptDay, fmtDay, fullName, openMessageThread, serviceLabel,
  stashAdminPrefill, tierBadgeClass, todayKey, toPrefilledPatient,
} from './patientDirectory';

// Untyped table access — several columns used here (patient_notes, billed_to,
// invoice_status, …) aren't in the generated Database type.
const db = supabase as any;

interface Props {
  patient: PatientRow;
  memberTier: MemberTier | undefined;
  isProtected: boolean;
  /** super_admin only — office managers never see the delete control. */
  canDelete: boolean;
  onBack: () => void;
  /** Edit saved — parent swaps the row in the directory and in `patient`. */
  onPatientSaved: (updated: PatientRow) => void;
  onPatientDeleted: () => void;
  /** Open another chart (household member click). */
  onOpenPatient: (p: any) => void;
  /** Re-pull the directory (counts/buckets) after anything that changes visits. */
  refreshDirectory: () => void;
}

const EMPTY_EDIT = {
  firstName: '', lastName: '', email: '', phone: '', dob: '', address: '', city: '', state: '', zipcode: '',
  gateCode: '', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '', patientNotes: '',
};

const EMPTY_INVOICE = {
  amount: '',
  description: '',
  memo: '',
  // Explicit payer routing — patient (default) or organization.
  recipient: 'patient' as 'patient' | 'organization',
  // Attach to an existing appointment instead of creating a phantom row.
  attachAppointmentId: '',
  orgId: '',
};

const PatientChart: React.FC<Props> = ({
  patient: p, memberTier, isProtected, canDelete, onBack, onPatientSaved, onPatientDeleted, onOpenPatient, refreshDirectory,
}) => {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [referringProvider, setReferringProvider] = useState<any>(null);
  const [allOrgs, setAllOrgs] = useState<any[]>([]);

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [sendLinkModalOpen, setSendLinkModalOpen] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [savingPatient, setSavingPatient] = useState(false);
  // Inline error surface — toasts hide behind the dialog overlay.
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(EMPTY_INVOICE);
  const [sendingInvoice, setSendingInvoice] = useState(false);

  // Orgs for the invoice modal's "bill a partner practice" picker.
  useEffect(() => {
    db.from('organizations').select('id, name, billing_email, contact_email, default_billed_to, org_invoice_price_cents, locked_price_cents')
      .eq('is_active', true).order('name')
      .then(({ data }: any) => setAllOrgs(data || []));
  }, []);

  // Every fetch is independently guarded (allSettled) so one RLS denial or
  // network blip never leaves the chart spinning forever.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        p.email
          ? db.from('patient_referring_providers')
              .select('provider_name, practice_name, practice_city, status, matched_org_id, converted_at')
              .ilike('patient_email', p.email)
              .order('discovered_at', { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [] as any[], error: null }),
        db.from('appointments').select('*').eq('patient_id', p.id).order('appointment_date', { ascending: false }),
        db.from('specimen_deliveries').select('*').eq('patient_id', p.id).order('delivered_at', { ascending: false }),
        db.from('activity_log').select('*').eq('patient_id', p.id).order('created_at', { ascending: false }),
      ]);
      const [refsRes, apptsRes, specsRes, actsRes] = results as PromiseSettledResult<any>[];

      if (refsRes.status === 'fulfilled') {
        const refs = (refsRes.value?.data as any[]) || [];
        setReferringProvider(refs.length > 0 ? refs[0] : null);
      } else {
        console.warn('[patient-chart] referring-provider fetch failed:', refsRes.reason?.code || refsRes.reason);
        setReferringProvider(null);
      }
      if (apptsRes.status === 'fulfilled') {
        setAppointments((apptsRes.value?.data as any[]) || []);
      } else {
        console.warn('[patient-chart] appointments fetch failed:', apptsRes.reason?.code || apptsRes.reason);
        setAppointments([]);
        toast.error("Couldn't load appointment history — refresh, or check your sign-in.");
      }
      if (specsRes.status === 'fulfilled') setSpecimens((specsRes.value?.data as any[]) || []);
      else { console.warn('[patient-chart] specimens fetch failed:', specsRes.reason?.code || specsRes.reason); setSpecimens([]); }
      if (actsRes.status === 'fulfilled') setActivities((actsRes.value?.data as any[]) || []);
      else { console.warn('[patient-chart] activity-log fetch failed:', actsRes.reason?.code || actsRes.reason); setActivities([]); }
    } catch (e: any) {
      console.error('[patient-chart] unexpected load error:', e?.code || e?.message || e);
      toast.error("Couldn't load this patient's chart. Try again or refresh.");
    } finally {
      setLoading(false);
    }
  }, [p.id, p.email]);

  useEffect(() => { load(); }, [load]);

  const reloadAll = () => { load(); refreshDirectory(); };

  // ── Derived groups ─────────────────────────────────────────────
  const today = todayKey();
  const groups = useMemo(() => {
    const upcoming: any[] = [], unresolved: any[] = [], past: any[] = [], cancelled: any[] = [];
    for (const a of appointments) {
      const day = apptDay(a);
      if (CLOSED_STATUSES.has(a.status)) cancelled.push(a);
      else if (LIVE_STATUSES.has(a.status) && day && day >= today) upcoming.push(a);
      else if (LIVE_STATUSES.has(a.status)) unresolved.push(a);
      else past.push(a); // completed / specimen_delivered / anything else final
    }
    upcoming.sort((a, b) => (apptDay(a) || '').localeCompare(apptDay(b) || ''));
    return { upcoming, unresolved, past, cancelled };
  }, [appointments, today]);

  const money = useMemo(() => {
    let paid = 0, orgBilled = 0, outstanding = 0, tips = 0, paidCount = 0;
    for (const a of appointments) {
      const amt = Number(a.total_amount) || 0;
      tips += Number(a.tip_amount) || 0;
      if (CLOSED_STATUSES.has(a.status)) continue;
      const ps = String(a.payment_status || '');
      if (PATIENT_PAID.has(ps)) { paid += amt; paidCount++; }
      else if (ps === 'org_billed') orgBilled += amt;
      else if (!SETTLED_PAYMENT.has(ps)) {
        const day = apptDay(a);
        if ((day && day < today) || DONE_STATUSES.has(a.status)) outstanding += amt;
      }
    }
    return { paid, orgBilled, outstanding, tips, paidCount };
  }, [appointments, today]);

  // ── Actions ────────────────────────────────────────────────────
  const openEdit = () => {
    setEditForm({
      firstName: p.first_name || '', lastName: p.last_name || '', email: p.email || '', phone: p.phone || '',
      dob: p.date_of_birth || '', address: p.address || '', city: p.city || '', state: p.state || '', zipcode: p.zipcode || '',
      gateCode: p.gate_code || '', insuranceProvider: p.insurance_provider || '', insuranceMemberId: p.insurance_member_id || '',
      insuranceGroup: p.insurance_group_number || '', patientNotes: p.patient_notes || '',
    });
    setEditError(null);
    setEditModalOpen(true);
  };

  const openSchedule = () => {
    // BookingFlow consumes this on mount so admin never retypes the patient.
    stashAdminPrefill(p);
    // Admin ScheduleAppointmentModal (override powers) — NOT the public /book-now flow.
    setScheduleModalOpen(true);
  };

  const message = () => {
    if (!openMessageThread(p.phone, p.email)) toast.error('No phone or email on file');
  };

  const sendInvoiceReminder = async (appointment: any) => {
    const who = appointment.patient_name || fullName(p);
    if (!window.confirm(`Send a friendly invoice reminder to ${who}? Email + SMS will go out.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('send-manual-invoice-reminder', {
        body: { appointment_id: appointment.id, email: true, sms: true },
      });
      if (error) throw error;
      const results = (data as any)?.results || {};
      const okBits: string[] = [];
      if (results.email?.ok) okBits.push('email');
      if (results.sms?.ok) okBits.push('SMS');
      if (okBits.length === 0) { toast.error(`Reminder failed — ${results.email?.error || results.sms?.error || 'unknown'}`); return; }
      toast.success(`Reminder sent via ${okBits.join(' + ')}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send reminder');
    }
  };

  const sendAppointmentPayLink = async (appointmentId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-appointment-pay-token', { body: { appointment_id: appointmentId } });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error('No link returned');
      try { await navigator.clipboard.writeText(url); } catch { /* clipboard may be blocked */ }
      if ((data as any)?.emailed) toast.success('Pay link emailed to patient (and copied to clipboard)');
      else toast.success('Pay link copied — paste it to the patient', { description: url, duration: 15000 });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create pay link');
    }
  };

  const copyVisitAddress = async (appointment: any) => {
    if (!appointment?.address) { toast.error('No visit address on file'); return; }
    const lines = [appointment.address];
    if (appointment.gate_code) lines.push(`Gate code: ${appointment.gate_code}`);
    try { await navigator.clipboard.writeText(lines.join('\n')); toast.success('Visit address copied'); }
    catch { toast.error('Could not copy the visit address'); }
  };

  const deletePatient = async () => {
    const reason = window.prompt(
      `Delete patient "${fullName(p)}"?\n\n` +
      `Patients with appointment history are SOFT-deleted (hidden but audit-preserved for HIPAA).\n` +
      `Patients with no history are removed permanently.\n\n` +
      `Enter a short reason (min 3 chars):`,
    );
    if (!reason || reason.trim().length < 3) return;
    setDeleting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const role = (sess?.session?.user?.user_metadata as any)?.role || (sess?.session?.user?.app_metadata as any)?.role || 'unknown';
      const { data, error } = await db.rpc('delete_patient', { p_patient_id: p.id, p_reason: reason.trim(), p_hard_delete: true });
      if (error) {
        const details = `code=${error.code || 'n/a'} · ${error.message || 'no message'}${error.hint ? ' · hint: ' + error.hint : ''} · role=${role}`;
        toast.error(`Delete failed: ${details}`, { duration: 12000 });
        return;
      }
      if (data?.action === 'hard_delete') toast.success('Patient permanently deleted (no history)');
      else toast.success(`Patient soft-deleted${data?.note ? ` · ${data.note}` : ''}`);
      setEditModalOpen(false);
      onPatientDeleted();
    } catch (err: any) {
      console.error('[delete-patient] threw', err?.code || err?.message || err);
      toast.error(`Delete crashed: ${err?.message || String(err)}`, { duration: 12000 });
    } finally {
      setDeleting(false);
    }
  };

  const savePatient = async () => {
    if (savingPatient) return;
    setSavingPatient(true);
    setEditError(null);
    try {
      // An expired JWT silently turns auth.role() into 'anon' and RLS blocks
      // the write with "0 rows" and no error — catch it up front.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setEditError('Your session expired. Please refresh the page and sign in again, then re-open Edit.');
        toast.error('Session expired — refresh + sign in again', { duration: 12000 });
        return;
      }
      const updatePayload: any = {
        first_name: editForm.firstName, last_name: editForm.lastName,
        email: editForm.email, phone: editForm.phone, date_of_birth: editForm.dob || null,
        address: editForm.address || null, city: editForm.city || null, state: editForm.state || null, zipcode: editForm.zipcode || null,
        gate_code: editForm.gateCode || null,
        insurance_provider: editForm.insuranceProvider || null,
        insurance_member_id: editForm.insuranceMemberId || null,
        insurance_group_number: editForm.insuranceGroup || null,
        patient_notes: editForm.patientNotes.trim() || null,
      };
      const { data, error } = await db.from('tenant_patients').update(updatePayload).eq('id', p.id).select();

      if (error) {
        console.error('[patient-save] DB error:', error.code, error.message);
        // 23505 on email — show who else holds it so admin can decide.
        if (error.code === '23505' && /email/i.test(error.message || '')) {
          const target = (editForm.email || '').trim().toLowerCase();
          let conflictDetail = '';
          try {
            const { data: collide } = await db.from('tenant_patients')
              .select('id, first_name, last_name, phone, deleted_at, created_at')
              .ilike('email', target).is('deleted_at', null).neq('id', p.id).limit(3);
            const list = (collide as any[] | null) || [];
            if (list.length > 0) {
              conflictDetail = list.map(r => `• ${r.first_name || ''} ${r.last_name || ''} (id ${String(r.id).slice(0, 8)}…${r.phone ? ` · ${r.phone}` : ''})`).join('\n');
            }
          } catch { /* best-effort */ }
          setEditError(`Email "${editForm.email}" is already used by another active patient${conflictDetail ? `:\n${conflictDetail}` : '.'}\n\nFix options:\n  1. Edit the OTHER patient first (change or remove their email)\n  2. Use a different email here\n  3. Soft-delete the other patient if it's a duplicate`);
          toast.error('Email already in use by another patient — see the red banner for details', { duration: 14000 });
          return;
        }
        const detail = `Update failed — code ${error.code || 'n/a'}: ${error.message || 'no message'}${error.hint ? ` · hint: ${error.hint}` : ''}`;
        setEditError(detail);
        toast.error(detail, { duration: 12000 });
        return;
      }
      if (!data || data.length === 0) {
        const role = (session.user as any)?.user_metadata?.role || 'unknown';
        const { data: probe } = await db.from('tenant_patients').select('id, deleted_at').eq('id', p.id).maybeSingle();
        const detail = !probe
          ? `No patient row found for id ${p.id}. Reload and try again — the patient may have been deleted in another tab.`
          : probe.deleted_at
            ? `This patient was soft-deleted on ${probe.deleted_at}. Reload to see the current list.`
            : `Update returned 0 rows — RLS blocked the write. Your role: ${role}. Need super_admin / office_manager. Sign out + back in.`;
        setEditError(detail);
        toast.error(detail, { duration: 12000 });
        return;
      }
      toast.success('Patient info updated');

      // Email change → offer to void + reissue open Stripe invoices, which
      // were addressed to the OLD email at booking time.
      const emailChanged = editForm.email && p.email && editForm.email.trim().toLowerCase() !== p.email.trim().toLowerCase();
      if (emailChanged) {
        try {
          const { data: openInvoices } = await db.from('appointments')
            .select('id, total_amount, service_type, appointment_date, invoice_status, stripe_invoice_id')
            .ilike('patient_email', p.email)
            .in('invoice_status', ['sent', 'reminded', 'final_warning', 'pending_send']);
          const list = (openInvoices as any[]) || [];
          if (list.length > 0) {
            const summary = list.slice(0, 5).map((a: any, i: number) => `  ${i + 1}. ${a.appointment_date?.substring(0, 10) || '?'} · $${a.total_amount} · ${a.invoice_status}`).join('\n');
            const more = list.length > 5 ? `\n  …and ${list.length - 5} more` : '';
            const ok = window.confirm(
              `${list.length} open invoice${list.length === 1 ? '' : 's'} ${list.length === 1 ? 'is' : 'are'} still on the old email (${p.email}).\n\n${summary}${more}\n\nVoid and reissue ${list.length === 1 ? 'it' : 'them all'} to ${editForm.email}?\n\n(Click Cancel to leave the existing invoices on the old email.)`,
            );
            if (ok) {
              let success = 0, failed = 0;
              for (const inv of list) {
                try {
                  const { error: rxErr } = await supabase.functions.invoke('reissue-stripe-invoice', {
                    body: {
                      appointmentId: inv.id,
                      newPatientEmail: editForm.email,
                      newPatientName: `${editForm.firstName} ${editForm.lastName}`.trim(),
                      reason: `Patient email corrected from ${p.email} to ${editForm.email}`,
                    },
                  });
                  if (rxErr) { failed++; console.warn('[reissue-on-email-change] failed for', inv.id); } else success++;
                } catch { failed++; console.warn('[reissue-on-email-change] threw for', inv.id); }
              }
              if (success > 0) toast.success(`${success} invoice${success === 1 ? '' : 's'} reissued to ${editForm.email}`);
              if (failed > 0) toast.error(`${failed} reissue${failed === 1 ? '' : 's'} failed — check Invoices tab`, { duration: 8000 });
            }
          }
        } catch (e: any) {
          console.warn('[reissue-on-email-change] lookup failed (non-blocking):', e?.code || e?.message);
        }
      }

      onPatientSaved({
        ...p,
        first_name: editForm.firstName, last_name: editForm.lastName,
        email: editForm.email, phone: editForm.phone, date_of_birth: editForm.dob || null,
        address: editForm.address || null, city: editForm.city || null, state: editForm.state || null, zipcode: editForm.zipcode || null,
        gate_code: editForm.gateCode || null,
        insurance_provider: editForm.insuranceProvider || null, insurance_member_id: editForm.insuranceMemberId || null,
        insurance_group_number: editForm.insuranceGroup || null,
        patient_notes: editForm.patientNotes.trim() || null,
      });
      setEditModalOpen(false);
    } catch (err: any) {
      console.error('[patient-save] threw:', err?.code || err?.message || err);
      const detail = `Save crashed: ${err?.message || String(err)}. Open DevTools Console for the full trace.`;
      setEditError(detail);
      toast.error(detail, { duration: 12000 });
    } finally {
      setSavingPatient(false);
    }
  };

  const sendInvoice = async () => {
    if (sendingInvoice) return;
    setSendingInvoice(true);
    try {
      const amount = parseFloat(invoiceForm.amount);
      const selectedOrg = allOrgs.find(o => o.id === invoiceForm.orgId);
      const recipientEmail = invoiceForm.recipient === 'organization'
        ? (selectedOrg?.billing_email || selectedOrg?.contact_email || '')
        : (p.email || '');
      const recipientName = invoiceForm.recipient === 'organization' ? (selectedOrg?.name || 'Organization') : fullName(p);
      let appointmentId = invoiceForm.attachAppointmentId;

      if (appointmentId) {
        // Case A: attach to an existing appointment — update its invoice columns.
        const { error: updateErr } = await db.from('appointments').update({
          total_amount: amount, service_price: amount,
          invoice_status: 'sent', invoice_sent_at: new Date().toISOString(),
          invoice_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          payment_status: 'pending',
          billed_to: invoiceForm.recipient === 'organization' ? 'org' : 'patient',
          ...(invoiceForm.recipient === 'organization' && invoiceForm.orgId ? { organization_id: invoiceForm.orgId } : {}),
          notes: invoiceForm.memo || null,
        }).eq('id', appointmentId);
        if (updateErr) throw updateErr;
      } else {
        // Case B: standalone placeholder appointment (org-aware).
        const { data: appt, error } = await db.from('appointments').insert([{
          appointment_date: new Date().toISOString(), patient_id: p.id,
          patient_name: fullName(p), patient_email: p.email || null,
          service_type: 'invoice', service_name: invoiceForm.description || 'Invoice',
          status: 'scheduled', address: 'Invoice Only', zipcode: '32801',
          total_amount: amount, service_price: amount, booking_source: 'manual',
          invoice_status: 'sent', invoice_sent_at: new Date().toISOString(),
          invoice_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          payment_status: 'pending', notes: invoiceForm.memo || null,
          billed_to: invoiceForm.recipient === 'organization' ? 'org' : 'patient',
          ...(invoiceForm.recipient === 'organization' && invoiceForm.orgId ? { organization_id: invoiceForm.orgId } : {}),
        }]).select().single();
        if (error) throw error;
        appointmentId = appt.id;
      }

      await supabase.functions.invoke('send-appointment-invoice', {
        body: {
          appointmentId,
          patientName: recipientName,
          patientEmail: recipientEmail,
          serviceName: invoiceForm.description || 'ConveLabs Service',
          servicePrice: amount,
          memo: invoiceForm.memo || (invoiceForm.recipient === 'organization' ? `Patient: ${fullName(p)}` : ''),
          orgName: invoiceForm.recipient === 'organization' ? (selectedOrg?.name || undefined) : undefined,
        },
      });
      toast.success(`Invoice for $${amount.toFixed(2)} sent to ${recipientEmail}`);
      setInvoiceModalOpen(false);
      reloadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed');
    } finally {
      setSendingInvoice(false);
    }
  };

  // ── Header bits ────────────────────────────────────────────────
  const currentTier = (memberTier || '').toLowerCase();
  const membershipLabel = currentTier === 'concierge' ? null
    : currentTier === 'member' ? 'Upgrade · VIP'
    : currentTier === 'vip' ? 'Upgrade · Concierge'
    : 'Membership';
  const subtitleBits = [
    p.date_of_birth ? `DOB ${fmtDay(p.date_of_birth)}` : null,
    p.phone || null,
    p.email || null,
  ].filter(Boolean) as string[];
  const addressLine = (() => {
    const line1 = p.address || '';
    const line2 = [p.city, p.state, p.zipcode].filter(Boolean).join(', ');
    const tp = [line1, line2].filter(Boolean).join(', ');
    if (tp) return tp;
    const latest = appointments.find(a => a.address && a.address !== 'Pending' && a.address !== 'Invoice Only');
    return latest?.address || null;
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-10 w-10 sm:h-9 sm:w-9 p-0 -ml-2 flex-shrink-0" aria-label="Back to patients">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900 flex-wrap">
              <User className="h-6 w-6 text-[#B91C1C] flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{fullName(p)}</span>
              {memberTier && (
                <span className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full text-[11px] font-bold uppercase tracking-wide', tierBadgeClass(memberTier))}>
                  <Crown className="h-3 w-3" aria-hidden="true" /> {memberTier}
                </span>
              )}
              {isProtected && !memberTier && (
                <span title="Protected from auto-cancel — not a paid member" className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-300">
                  <Shield className="h-3 w-3" aria-hidden="true" /> Protected
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              Patient chart{subtitleBits.length > 0 ? ` · ${subtitleBits.join(' · ')}` : ''}
            </p>
            {referringProvider && (referringProvider.provider_name || referringProvider.practice_name) && (
              <div className={cn('inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-md text-[11px] border',
                referringProvider.status === 'converted' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : referringProvider.status === 'unsubscribed' || referringProvider.status === 'declined' ? 'bg-gray-50 border-gray-200 text-gray-500'
                : 'bg-blue-50 border-blue-200 text-blue-800')}>
                <Stethoscope className="h-3 w-3" aria-hidden="true" />
                <span className="font-semibold">Referred by:</span>
                <span>
                  {referringProvider.provider_name || ''}
                  {referringProvider.provider_name && referringProvider.practice_name ? ' · ' : ''}
                  {referringProvider.practice_name || ''}
                  {referringProvider.practice_city ? ` (${referringProvider.practice_city})` : ''}
                </span>
                {referringProvider.status === 'converted' && <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-semibold">✓ Active partner</span>}
                {referringProvider.status === 'contacted' && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-semibold">In sequence</span>}
                {referringProvider.status === 'unsubscribed' && <span className="text-[10px] bg-gray-400 text-white px-1.5 py-0.5 rounded-full font-semibold">Unsubscribed</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap pl-8 sm:pl-0">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-10 sm:h-9" onClick={openEdit}>
            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" /> Edit info
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-10 sm:h-9" onClick={openSchedule}>
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Schedule
          </Button>
          {(p.email || p.phone) && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-10 sm:h-9 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => setSendLinkModalOpen(true)}>
              <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Send booking link
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-10 sm:h-9" onClick={() => { setInvoiceForm(EMPTY_INVOICE); setInvoiceModalOpen(true); }}>
            <Receipt className="h-3.5 w-3.5" aria-hidden="true" /> Invoice
          </Button>
          {(p.phone || p.email) && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-10 sm:h-9" onClick={message}>
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Message
            </Button>
          )}
          {/* Never stop selling the next tier up; hides only at Concierge. */}
          {p.email && membershipLabel && (
            <Button
              size="sm"
              className="gap-1.5 text-xs h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white"
              onClick={() => setShowMembershipModal(true)}
              title={currentTier ? `${p.first_name || 'Patient'} is currently ${currentTier.toUpperCase()} — send a one-tier-up offer` : 'Send a membership offer to this patient'}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {membershipLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Needs-action notices */}
      {!loading && money.outstanding > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2" role="status">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p><span className="font-semibold">${money.outstanding.toFixed(2)} outstanding</span> on past visits. Use the row menu on the unpaid visit to send a pay link or an invoice reminder.</p>
        </div>
      )}
      {!loading && groups.unresolved.length > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900 flex items-start gap-2" role="status">
          <CalendarClock className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p><span className="font-semibold">{groups.unresolved.length} visit{groups.unresolved.length === 1 ? '' : 's'} dated in the past</span> {groups.unresolved.length === 1 ? 'is' : 'are'} still open — mark {groups.unresolved.length === 1 ? 'it' : 'them'} completed or cancelled under Appointments.</p>
        </div>
      )}

      {/* KPI tiles */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
        <div className="grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-cols-5 sm:grid-flow-row gap-2" role="group" aria-label="Patient summary">
          <Kpi label="Visits" value={appointments.length} loading={loading} />
          <Kpi label="Upcoming" value={groups.upcoming.length} loading={loading} tone={groups.upcoming.length > 0 ? 'text-blue-700' : ''} />
          <Kpi label="Specimens" value={specimens.length} loading={loading} />
          <Kpi label="Paid" value={`$${money.paid.toFixed(0)}`} loading={loading} tone="text-emerald-700" sub={money.orgBilled > 0 ? `+ $${money.orgBilled.toFixed(0)} org-billed` : undefined} />
          <Kpi label="Outstanding" value={`$${money.outstanding.toFixed(0)}`} loading={loading} tone={money.outstanding > 0 ? 'text-red-700' : ''} />
        </div>
      </div>

      {/* Recurring-series gap detector — only renders if gaps exist. */}
      <RecurringGapsCard patientId={p.id} onGapsFilled={reloadAll} />

      {/* Unified comms timeline — every SMS/email/tokenized link for this patient. */}
      <PatientCommsTimeline patientId={p.id} patientEmail={p.email || null} patientPhone={p.phone || null} />

      {/* Patient info */}
      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2 text-sm">
              <SectionLabel>Contact</SectionLabel>
              {p.email ? <p className="flex items-center gap-2 min-w-0"><Mail className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" /><span className="truncate">{p.email}</span></p>
                : <p className="flex items-center gap-2 text-amber-700"><Mail className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> No email on file</p>}
              {p.phone ? <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" /> {p.phone}</p>
                : <p className="flex items-center gap-2 text-amber-700"><Phone className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> No phone on file</p>}
              {addressLine ? (
                <p className="flex items-start gap-2"><MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" aria-hidden="true" /><span>{addressLine}{p.gate_code ? <span className="block text-xs text-amber-700">Gate: {p.gate_code}</span> : null}</span></p>
              ) : (
                <p className="flex items-start gap-2 text-amber-700"><MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" /><span>No address on file — <button type="button" className="underline font-medium" onClick={openEdit}>add one</button></span></p>
              )}
              {!p.date_of_birth && <p className="text-xs text-amber-700">No date of birth on file — labs need it on the requisition.</p>}
            </div>

            <div className="space-y-2 text-sm">
              <SectionLabel><Shield className="h-3.5 w-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />Insurance</SectionLabel>
              {p.insurance_provider ? (
                <>
                  <p className="font-medium text-gray-900">{p.insurance_provider}</p>
                  {p.insurance_member_id && <p className="text-xs text-gray-500">Member ID: {p.insurance_member_id}</p>}
                  {p.insurance_group_number && <p className="text-xs text-gray-500">Group: {p.insurance_group_number}</p>}
                  {p.insurance_card_path && <p className="text-xs text-emerald-700 inline-flex items-center gap-1"><CreditCard className="h-3 w-3" aria-hidden="true" /> Card on file</p>}
                </>
              ) : (
                <p className="text-gray-500">Self-pay (no insurance on file)</p>
              )}
              {p.pays_cash && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">Pays cash{p.pays_cash_note ? ` · ${p.pays_cash_note}` : ''}</p>}
            </div>

            <div className="space-y-2 text-sm">
              <SectionLabel><Notebook className="h-3.5 w-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />Preferences &amp; notes</SectionLabel>
              {(p.preferred_day || p.preferred_time) && (
                <p className="text-xs text-gray-700">Prefers {[p.preferred_day, p.preferred_time].filter(Boolean).join(' · ')}</p>
              )}
              {p.standing_order_doctor && <p className="text-xs text-gray-700">Standing order: {p.standing_order_doctor}</p>}
              {p.referred_by && <p className="text-xs text-gray-700">Referred by: {p.referred_by}</p>}
              {p.patient_notes ? (
                <p className="text-xs text-gray-800 whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">{p.patient_notes}</p>
              ) : (
                <p className="text-xs text-gray-400">No notes — <button type="button" className="underline" onClick={openEdit}>add a note</button></p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Family / household — feeds one-click family booking downstream. */}
      <FamilyHouseholdCard patient={p} onChanged={reloadAll} onOpenPatient={onOpenPatient} />

      {/* Tabs */}
      <Tabs defaultValue="appointments">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
          <TabsTrigger value="appointments" className="h-10 sm:h-9">Appointments ({appointments.length})</TabsTrigger>
          <TabsTrigger value="specimens" className="h-10 sm:h-9">Specimens ({specimens.length})</TabsTrigger>
          <TabsTrigger value="notes" className="h-10 sm:h-9">Activity ({activities.length})</TabsTrigger>
          <TabsTrigger value="billing" className="h-10 sm:h-9">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="space-y-4 mt-4">
          {loading ? (
            <LoadingBlock label="Loading visits" />
          ) : appointments.length === 0 ? (
            <EmptyBlock icon={CalendarClock} title="No visits yet." hint="Schedule one, or send the patient a booking link." action={<Button size="sm" variant="outline" className="mt-3 text-xs h-9" onClick={openSchedule}>Schedule a visit</Button>} />
          ) : (
            <>
              {groups.upcoming.length > 0 && (
                <section aria-labelledby="lane-upcoming">
                  <LaneHeader id="lane-upcoming" title="Upcoming" count={groups.upcoming.length} tone="blue" />
                  <div className="space-y-2">
                    {groups.upcoming.map(a => (
                      <LiveVisitCard key={a.id} a={a} p={p} onManage={() => setSelectedAppointment(a)} onMessage={() => openMessageThread(a.patient_phone || p.phone, a.patient_email || p.email)} onPayLink={() => sendAppointmentPayLink(a.id)} onReminder={() => sendInvoiceReminder(a)} onCopyAddress={() => copyVisitAddress(a)} />
                    ))}
                  </div>
                </section>
              )}
              {groups.unresolved.length > 0 && (
                <section aria-labelledby="lane-unresolved">
                  <LaneHeader id="lane-unresolved" title="Needs action · date passed, still open" count={groups.unresolved.length} tone="red" />
                  <div className="space-y-2">
                    {groups.unresolved.map(a => (
                      <LiveVisitCard key={a.id} a={a} p={p} unresolved onManage={() => setSelectedAppointment(a)} onMessage={() => openMessageThread(a.patient_phone || p.phone, a.patient_email || p.email)} onPayLink={() => sendAppointmentPayLink(a.id)} onReminder={() => sendInvoiceReminder(a)} onCopyAddress={() => copyVisitAddress(a)} />
                    ))}
                  </div>
                </section>
              )}
              {groups.past.length > 0 && (
                <section aria-labelledby="lane-past">
                  <LaneHeader id="lane-past" title="Past" count={groups.past.length} tone="gray" />
                  <div className="space-y-2">
                    {groups.past.map(a => {
                      const amt = Number(a.total_amount) || 0;
                      const ps = String(a.payment_status || '');
                      const refunded = !!a.refunded_at || a.refund_status === 'refunded';
                      const unpaid = !SETTLED_PAYMENT.has(ps) && amt > 0;
                      return (
                        <Card key={a.id} className={cn('shadow-sm', unpaid && 'border-l-4 border-l-red-500')}>
                          <CardContent className="p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <StatusPill status={a.status} />
                                <span className="text-sm font-medium text-gray-900">{fmtDay(apptDay(a))}</span>
                                {refunded && <span className="inline-flex items-center px-2 h-5 rounded-full border text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">Refunded</span>}
                                {ps === 'org_billed' && <span className="inline-flex items-center px-2 h-5 rounded-full border text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200">Org-billed</span>}
                                {unpaid && <span className="inline-flex items-center px-2 h-5 rounded-full border text-[10px] font-semibold bg-red-50 text-red-700 border-red-200">Unpaid</span>}
                              </div>
                              <p className="text-xs text-gray-500 mt-1 capitalize truncate">{serviceLabel(a)}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm font-medium tabular-nums">${amt}</span>
                              <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => setSelectedAppointment(a)}>Manage</Button>
                              {ps === 'completed' && amt > 0 && (
                                <StaffRefundButton
                                  appointmentId={a.id}
                                  patientEmail={p.email || undefined}
                                  patientName={fullName(p)}
                                  totalAmountDollars={amt}
                                  alreadyRefunded={refunded}
                                  refundedAmountCents={a.refund_amount_cents}
                                  onRefunded={reloadAll}
                                />
                              )}
                              {unpaid && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label="Collect payment options"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onSelect={() => sendAppointmentPayLink(a.id)}><Send className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Send pay link</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => sendInvoiceReminder(a)}><Receipt className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Send invoice reminder</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              )}
              {groups.cancelled.length > 0 && (
                <section aria-labelledby="lane-cancelled">
                  <LaneHeader id="lane-cancelled" title="Cancelled" count={groups.cancelled.length} tone="gray" />
                  <div className="space-y-2">
                    {groups.cancelled.map(a => (
                      <Card key={a.id} className="shadow-sm opacity-60">
                        <CardContent className="p-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusPill status={a.status} />
                            <span className="text-sm text-gray-700">{fmtDay(apptDay(a), 'MMM d, yyyy')}</span>
                            <span className="text-xs text-gray-500 capitalize truncate hidden sm:inline">{serviceLabel(a)}</span>
                          </div>
                          <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => setSelectedAppointment(a)}>Manage</Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="specimens" className="mt-4">
          {loading ? <LoadingBlock label="Loading specimens" /> : specimens.length === 0 ? (
            <EmptyBlock icon={FlaskConical} title="No specimens recorded." hint="Specimens appear here once a phlebotomist logs a delivery for this patient." />
          ) : (
            <div className="space-y-2">
              {specimens.map((s: any) => (
                <Card key={s.id} className="shadow-sm">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono font-medium text-sm truncate">{s.specimen_id}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {s.lab_name && <span className="inline-flex items-center px-2 h-5 rounded-full border text-[10px] font-semibold bg-gray-50 text-gray-700 border-gray-200">{s.lab_name}</span>}
                        <span className="text-xs text-gray-500">{s.tube_count} tube{s.tube_count !== 1 ? 's' : ''}{s.tube_types ? ` (${s.tube_types})` : ''}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{s.delivered_at ? format(new Date(s.delivered_at), 'MMM d, h:mm a') : ''}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          {loading ? <LoadingBlock label="Loading activity" /> : activities.length === 0 ? (
            <EmptyBlock icon={ClipboardList} title="No activity logged for this patient." hint="Free-text notes live under Preferences & notes above (Edit info to change them)." />
          ) : (
            <div className="space-y-2">
              {activities.map((a: any) => (
                <div key={a.id} className="flex gap-3 p-3 rounded-lg border bg-white">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2 h-5 rounded-full border text-[10px] font-semibold bg-gray-50 text-gray-700 border-gray-200">{a.activity_type}</span>
                      <span className="text-[10px] text-gray-400">{a.created_at ? format(new Date(a.created_at), 'MMM d, h:mm a') : ''}</span>
                    </div>
                    <p className="text-sm mt-1 text-gray-800">{a.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-2.5 text-sm">
              <Row label="Total appointments" value={appointments.length} />
              <Row label="Paid by patient" value={`${money.paidCount} visit${money.paidCount === 1 ? '' : 's'} · $${money.paid.toFixed(2)}`} valueClass="text-emerald-700 font-semibold" />
              {money.orgBilled > 0 && <Row label="Billed to organization" value={`$${money.orgBilled.toFixed(2)}`} valueClass="text-purple-700" />}
              <Row label="Tips" value={`$${money.tips.toFixed(2)}`} />
              <Row label="Outstanding (past visits)" value={`$${money.outstanding.toFixed(2)}`} valueClass={money.outstanding > 0 ? 'text-red-600 font-semibold' : ''} />
              <Row label="Insurance" value={p.insurance_provider || 'Self-pay'} />
              {p.pays_cash && <Row label="Payment note" value="Pays cash" />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Modals ─────────────────────────────────────────────── */}
      <MembershipActionsModal
        open={showMembershipModal}
        onClose={() => setShowMembershipModal(false)}
        patientEmail={p.email || ''}
        patientName={fullName(p)}
        defaultTier={currentTier === 'member' ? 'vip' : currentTier === 'vip' ? 'concierge' : 'vip'}
        currentTier={currentTier}
        onSuccess={reloadAll}
      />

      <ScheduleAppointmentModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onCreated={() => { setScheduleModalOpen(false); reloadAll(); }}
        prefilledPatient={toPrefilledPatient(p)}
      />

      <SendBookingLinkModal
        open={sendLinkModalOpen}
        onClose={() => setSendLinkModalOpen(false)}
        patient={{ id: p.id, firstName: p.first_name || '', lastName: p.last_name || '', email: p.email, phone: p.phone }}
      />

      <AppointmentDetailModal
        appointment={selectedAppointment}
        open={!!selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        onUpdate={reloadAll}
      />

      {/* Edit patient */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-lg font-bold">Edit patient</DialogTitle></DialogHeader>
          <div className="divide-y">
            <EditRow label="First name"><Input value={editForm.firstName} onChange={e => setEditForm(pr => ({ ...pr, firstName: e.target.value }))} className="h-9" /></EditRow>
            <EditRow label="Last name"><Input value={editForm.lastName} onChange={e => setEditForm(pr => ({ ...pr, lastName: e.target.value }))} className="h-9" /></EditRow>
            <EditRow label="Date of birth"><Input type="date" value={editForm.dob} onChange={e => setEditForm(pr => ({ ...pr, dob: e.target.value }))} className="h-9" /></EditRow>
            <EditRow label="Address" top>
              <div className="space-y-2">
                <AddressAutocomplete
                  value={editForm.address}
                  onChange={v => setEditForm(pr => ({ ...pr, address: v }))}
                  onPlaceSelected={(place) => {
                    setEditForm(pr => ({ ...pr, address: place.street || place.address, city: place.city || pr.city, state: place.state || pr.state, zipcode: place.zipCode || pr.zipcode }));
                  }}
                  placeholder="Start typing address — Google suggestions"
                  className="h-9"
                />
                <Input value={editForm.city} onChange={e => setEditForm(pr => ({ ...pr, city: e.target.value }))} placeholder="City" className="h-9" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={editForm.state} onChange={e => setEditForm(pr => ({ ...pr, state: e.target.value }))} placeholder="State" maxLength={2} className="h-9" />
                  <Input value={editForm.zipcode} onChange={e => setEditForm(pr => ({ ...pr, zipcode: e.target.value }))} placeholder="ZIP" className="h-9" />
                </div>
              </div>
            </EditRow>
            <EditRow label="Gate code"><Input value={editForm.gateCode} onChange={e => setEditForm(pr => ({ ...pr, gateCode: e.target.value }))} placeholder="Gate code / access notes" className="h-9" /></EditRow>
            <EditRow label="Phone"><Input type="tel" value={editForm.phone} onChange={e => setEditForm(pr => ({ ...pr, phone: e.target.value }))} className="h-9" /></EditRow>
            <EditRow label="Email"><Input type="email" value={editForm.email} onChange={e => setEditForm(pr => ({ ...pr, email: e.target.value }))} className="h-9" /></EditRow>
            <EditRow label="Insurance" top>
              <div className="space-y-2">
                <Input value={editForm.insuranceProvider} onChange={e => setEditForm(pr => ({ ...pr, insuranceProvider: e.target.value }))} placeholder="Insurance provider" className="h-9 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={editForm.insuranceMemberId} onChange={e => setEditForm(pr => ({ ...pr, insuranceMemberId: e.target.value }))} placeholder="Member ID" className="h-9" />
                  <Input value={editForm.insuranceGroup} onChange={e => setEditForm(pr => ({ ...pr, insuranceGroup: e.target.value }))} placeholder="Group #" className="h-9" />
                </div>
              </div>
            </EditRow>
            <EditRow label="Notes" top>
              <textarea
                value={editForm.patientNotes}
                onChange={e => setEditForm(pr => ({ ...pr, patientNotes: e.target.value }))}
                rows={3}
                placeholder="Internal notes — hard stick, prefers mornings, dog at the door…"
                className="w-full text-sm border rounded-md px-3 py-2 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40"
              />
            </EditRow>
          </div>
          {editError && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 whitespace-pre-wrap" role="alert">
              <strong>Save failed:</strong> {editError}
            </div>
          )}
          <div className="flex justify-between items-center gap-3 pt-3 border-t">
            {canDelete ? (
              <Button variant="outline" disabled={deleting} className="h-10 px-4 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={deletePatient}>
                {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" /> Deleting…</> : 'Delete patient'}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditModalOpen(false)} className="h-10 px-5">Cancel</Button>
              <Button type="button" disabled={savingPatient} className="h-10 px-5 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-semibold disabled:opacity-60" onClick={savePatient}>
                {savingPatient ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate invoice — attach to a visit or standalone; patient or org. */}
      <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader><DialogTitle>Generate invoice for {p.first_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Attach to appointment <span className="text-gray-400 font-normal">(optional — leave blank for standalone)</span></Label>
              <select
                value={invoiceForm.attachAppointmentId}
                onChange={(e) => {
                  const apptId = e.target.value;
                  const appt = appointments.find(a => a.id === apptId);
                  setInvoiceForm(pr => ({
                    ...pr,
                    attachAppointmentId: apptId,
                    amount: appt ? String(appt.total_amount || appt.service_price || '') : pr.amount,
                    description: appt ? (appt.service_name || appt.service_type || '') : pr.description,
                    recipient: appt?.organization_id ? 'organization' : pr.recipient,
                    orgId: appt?.organization_id || pr.orgId,
                  }));
                }}
                className="mt-1 w-full h-9 text-sm border rounded-md px-2 bg-white"
              >
                <option value="">— Create new / standalone invoice —</option>
                {appointments.filter(a => a.payment_status !== 'completed').map(a => (
                  <option key={a.id} value={a.id}>
                    {a.appointment_date?.substring(0, 10)} · {a.service_name || a.service_type} · ${Number(a.total_amount || 0).toFixed(2)} · {a.payment_status || 'unpaid'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs">Send invoice to *</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button type="button" onClick={() => setInvoiceForm(pr => ({ ...pr, recipient: 'patient' }))}
                  aria-pressed={invoiceForm.recipient === 'patient'}
                  className={cn('text-left p-2 rounded border-2 text-sm', invoiceForm.recipient === 'patient' ? 'border-[#B91C1C] bg-red-50' : 'border-gray-200')}>
                  <span className="block font-semibold">Patient</span>
                  <span className="block text-[11px] text-gray-500 truncate">{p.email || 'no email on file'}</span>
                </button>
                <button type="button" onClick={() => setInvoiceForm(pr => ({ ...pr, recipient: 'organization' }))}
                  aria-pressed={invoiceForm.recipient === 'organization'}
                  className={cn('text-left p-2 rounded border-2 text-sm', invoiceForm.recipient === 'organization' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
                  <span className="block font-semibold">Organization</span>
                  <span className="block text-[11px] text-gray-500">Bill a partner practice</span>
                </button>
              </div>
            </div>

            {invoiceForm.recipient === 'organization' && (
              <div>
                <Label className="text-xs">Organization *</Label>
                <select value={invoiceForm.orgId} onChange={(e) => setInvoiceForm(pr => ({ ...pr, orgId: e.target.value }))} className="mt-1 w-full h-9 text-sm border rounded-md px-2 bg-white">
                  <option value="">— Select organization —</option>
                  {allOrgs.map(o => <option key={o.id} value={o.id}>{o.name} {o.billing_email ? `· ${o.billing_email}` : ''}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Amount ($) *</Label><Input type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={e => setInvoiceForm(pr => ({ ...pr, amount: e.target.value }))} placeholder="150.00" /></div>
              <div><Label className="text-xs">Service</Label><Input value={invoiceForm.description} onChange={e => setInvoiceForm(pr => ({ ...pr, description: e.target.value }))} placeholder="Blood Draw" /></div>
            </div>
            <div><Label className="text-xs">Memo</Label><Input value={invoiceForm.memo} onChange={e => setInvoiceForm(pr => ({ ...pr, memo: e.target.value }))} placeholder="Optional notes" /></div>

            {(() => {
              const selectedOrg = allOrgs.find(o => o.id === invoiceForm.orgId);
              const recipientEmail = invoiceForm.recipient === 'organization' ? (selectedOrg?.billing_email || selectedOrg?.contact_email || '') : (p.email || '');
              return (
                <p className={cn('text-xs', recipientEmail ? 'text-gray-500' : 'text-red-600')}>
                  Invoice will be sent to <strong>{recipientEmail || 'NO EMAIL ON FILE — pick a recipient with an email'}</strong>
                  {invoiceForm.attachAppointmentId && <span className="block text-emerald-700 mt-1">✓ Attached to existing appointment</span>}
                </p>
              );
            })()}

            <Button
              className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11"
              disabled={sendingInvoice || !invoiceForm.amount || (invoiceForm.recipient === 'patient' && !p.email) || (invoiceForm.recipient === 'organization' && !invoiceForm.orgId)}
              onClick={sendInvoice}
            >
              {sendingInvoice ? <><Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> Sending…</> : <>Send invoice — ${parseFloat(invoiceForm.amount || '0').toFixed(2)}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Small presentational pieces
// ──────────────────────────────────────────────────────────────────
const Kpi: React.FC<{ label: string; value: React.ReactNode; loading: boolean; tone?: string; sub?: string }> = ({ label, value, loading, tone, sub }) => (
  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 min-h-[64px] snap-start shadow-sm">
    <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 truncate">{label}</p>
    <p className={cn('text-2xl font-bold leading-tight mt-0.5 tabular-nums text-gray-900', tone)}>{loading ? '–' : value}</p>
    {sub && !loading && <p className="text-[10px] text-gray-500 truncate">{sub}</p>}
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{children}</p>
);

const Row: React.FC<{ label: string; value: React.ReactNode; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div className="flex justify-between gap-3"><span className="text-gray-500">{label}</span><span className={cn('font-medium text-right tabular-nums', valueClass)}>{value}</span></div>
);

const EditRow: React.FC<{ label: string; top?: boolean; children: React.ReactNode }> = ({ label, top, children }) => (
  <div className={cn('grid grid-cols-1 sm:grid-cols-[140px_1fr] py-3 gap-1 sm:gap-3', top ? 'items-start' : 'items-start sm:items-center')}>
    <Label className={cn('text-sm font-semibold text-gray-600', top && 'sm:mt-2')}>{label}</Label>
    {children}
  </div>
);

const LaneHeader: React.FC<{ id: string; title: string; count: number; tone: 'red' | 'gray' | 'blue' }> = ({ id, title, count, tone }) => (
  <div className="flex items-center gap-2 mb-2">
    <h2 id={id} className={cn('text-sm font-bold', tone === 'red' ? 'text-red-800' : tone === 'blue' ? 'text-blue-800' : 'text-gray-700')}>{title}</h2>
    <span className={cn('inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full', tone === 'red' ? 'bg-red-100 text-red-800' : tone === 'blue' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700')}>{count}</span>
  </div>
);

const StatusPill: React.FC<{ status: string }> = ({ status }) => (
  <span className={cn('inline-flex items-center px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap capitalize', APPT_STATUS_PILL[status] || 'bg-gray-50 text-gray-600 border-gray-200')}>
    {(status || '').replace(/_/g, ' ')}
  </span>
);

const LoadingBlock: React.FC<{ label: string }> = ({ label }) => (
  <div className="space-y-2" aria-busy="true" aria-label={label}>
    {[1, 2, 3].map(i => (
      <Card key={i} className="shadow-sm"><CardContent className="p-3 animate-pulse space-y-2"><div className="h-3.5 bg-gray-200 rounded w-40" /><div className="h-2.5 bg-gray-100 rounded w-64" /></CardContent></Card>
    ))}
  </div>
);

const EmptyBlock: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; hint: string; action?: React.ReactNode }> = ({ icon: Icon, title, hint, action }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <Icon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
      {action}
    </CardContent>
  </Card>
);

/** Upcoming / unresolved visit card — full action set. */
const LiveVisitCard: React.FC<{
  a: any; p: PatientRow; unresolved?: boolean;
  onManage: () => void; onMessage: () => void; onPayLink: () => void; onReminder: () => void; onCopyAddress: () => void;
}> = ({ a, p, unresolved, onManage, onMessage, onPayLink, onReminder, onCopyAddress }) => {
  const amt = Number(a.total_amount) || 0;
  const unpaid = !SETTLED_PAYMENT.has(String(a.payment_status || '')) && amt > 0;
  return (
    <Card className={cn('shadow-sm', unresolved && 'border-l-4 border-l-orange-400')}>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill status={a.status} />
              <span className="text-sm font-medium text-gray-900">{fmtDay(apptDay(a))}</span>
              <span className="text-xs text-gray-500">{a.appointment_time || ''}</span>
              {unpaid && <span className="inline-flex items-center px-2 h-5 rounded-full border text-[10px] font-semibold bg-amber-50 text-amber-700 border-amber-200">Unpaid</span>}
            </div>
            <p className="text-xs text-gray-500 mt-1 capitalize">{serviceLabel(a)}</p>
            {a.address && <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="h-3 w-3 flex-shrink-0" aria-hidden="true" /> <span className="truncate">{a.address}</span></p>}
            {a.gate_code && <p className="text-xs text-amber-700">Gate: {a.gate_code}</p>}
          </div>
          <span className="text-sm font-medium flex-shrink-0 tabular-nums">${amt}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-9 text-xs" onClick={onManage}>Manage</Button>
          {!unresolved && <SendRescheduleLinkButton appointmentId={a.id} size="sm" variant="outline" className="h-9 text-xs" label="Send reschedule link" />}
          {(a.patient_phone || p.phone || a.patient_email || p.email) && (
            <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={onMessage}><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Message</Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" aria-label="More actions for this visit"><MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onManage}>Manage appointment</DropdownMenuItem>
              {unpaid && (
                <>
                  <DropdownMenuItem onSelect={onPayLink}><Send className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Send pay link</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onReminder}><Receipt className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Send invoice reminder</DropdownMenuItem>
                </>
              )}
              {a.address && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onCopyAddress}><Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Copy visit address</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientChart;
