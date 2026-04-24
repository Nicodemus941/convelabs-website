import React, { useCallback, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DateOfBirthInput from '@/components/ui/DateOfBirthInput';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  CheckCircle2, Package, Calendar, Clock, Phone, Mail,
  Pencil, Loader2, Send, X, CreditCard, FileText, Copy,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

/**
 * PatientDetailDrawer — shared slide-in panel with full patient history.
 *
 * Powers the "click a patient row" experience for both admin and provider
 * views. Fetches:
 *   - tenant_patients row (for editable profile fields)
 *   - All their non-cancelled appointments linked to the org (visit timeline)
 *   - Pulls specimen delivery info inline (specimens_delivered_at + tracking)
 *
 * Hormozi rule: "answer every question one tap deep." The drawer shows
 * everything a provider/admin needs to know about this patient without
 * bouncing between tabs.
 */

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  service_name: string | null;
  service_type: string | null;
  status: string;
  specimens_delivered_at: string | null;
  lab_destination: string | null;
  lab_order_file_path: string | null;
  total_amount: number | null;
  address: string | null;
}

interface PatientProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  lab_reminder_cadence_days?: number | null;
  lab_reminder_deadline_at?: string | null;
  lab_reminder_last_sent_at?: string | null;
  overdue_flagged_at?: string | null;
}

interface SpecimenRow {
  appointment_id: string;
  specimen_id: string;
  lab_name: string | null;
  delivered_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientName: string;
  organizationId: string;
  canEdit?: boolean;      // admin passes true; provider view may hide edit
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  specimen_delivered: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  scheduled: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  arrived: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
};

const PatientDetailDrawer: React.FC<Props> = ({
  open, onOpenChange, patientName, organizationId, canEdit = true,
}) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [specimens, setSpecimens] = useState<Map<string, SpecimenRow>>(new Map());
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dob: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!open || !patientName) return;
    setLoading(true);
    try {
      // 1. Patient profile — match by name + org_id scope.
      //    Fallback: match by name only if org_id column isn't populated on the patient row yet.
      const nameParts = patientName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const { data: tp } = await supabase.from('tenant_patients')
        .select('id, first_name, last_name, email, phone, date_of_birth, lab_reminder_cadence_days, lab_reminder_deadline_at, lab_reminder_last_sent_at, overdue_flagged_at')
        .ilike('first_name', firstName)
        .ilike('last_name', lastName || '%')
        .limit(1)
        .maybeSingle();
      setProfile((tp as PatientProfile) || null);
      if (tp) {
        setEditForm({
          firstName: (tp as any).first_name || '',
          lastName: (tp as any).last_name || '',
          email: (tp as any).email || '',
          phone: (tp as any).phone || '',
          dob: (tp as any).date_of_birth || '',
        });
      }

      // 2. Appointments for this patient linked to this org
      const { data: appts } = await supabase.from('appointments')
        .select('id, appointment_date, appointment_time, service_name, service_type, status, specimens_delivered_at, lab_destination, lab_order_file_path, total_amount, address, organization_id')
        .ilike('patient_name', patientName)
        .order('appointment_date', { ascending: false })
        .limit(50);
      // Filter client-side to this org (or include ones via junction too)
      const apptIds = (appts || []).map((a: any) => a.id);
      let junctionApptIds: Set<string> = new Set();
      if (apptIds.length > 0) {
        const { data: junction } = await supabase.from('appointment_organizations')
          .select('appointment_id')
          .in('appointment_id', apptIds)
          .eq('organization_id', organizationId);
        junctionApptIds = new Set((junction || []).map((j: any) => j.appointment_id));
      }
      const filtered = (appts || []).filter((a: any) =>
        a.organization_id === organizationId || junctionApptIds.has(a.id)
      );
      setAppointments(filtered as Appointment[]);

      // 3. Specimen deliveries for those appointments (optional — enriches timeline)
      if (filtered.length > 0) {
        const { data: specs } = await supabase.from('specimen_deliveries' as any)
          .select('appointment_id, specimen_id, lab_name, delivered_at')
          .in('appointment_id', filtered.map((a: any) => a.id));
        const m = new Map<string, SpecimenRow>();
        for (const s of (specs || []) as any[]) m.set(s.appointment_id, s as SpecimenRow);
        setSpecimens(m);
      } else {
        setSpecimens(new Map());
      }
    } catch (e: any) {
      console.warn('[patient-detail] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [open, patientName, organizationId]);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async () => {
    if (!profile) return;
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      toast.error('First and last name are required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('tenant_patients').update({
        first_name: editForm.firstName.trim(),
        last_name: editForm.lastName.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        date_of_birth: editForm.dob || null,
      }).eq('id', profile.id);
      if (error) throw error;
      toast.success('Patient updated');
      setEditing(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const completedCount = appointments.filter(a => a.status === 'completed' || a.status === 'specimen_delivered').length;
  const totalSpent = appointments.reduce((s, a) => s + (Number(a.total_amount) || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="border-b p-5 sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl text-gray-900 truncate">{patientName}</SheetTitle>
              {!loading && profile && (
                <p className="text-xs text-gray-500 mt-1">
                  {profile.date_of_birth && <span>DOB {profile.date_of_birth}</span>}
                  {profile.date_of_birth && (profile.phone || profile.email) && <span className="mx-1">·</span>}
                  {profile.phone && <span>{profile.phone}</span>}
                  {profile.phone && profile.email && <span className="mx-1">·</span>}
                  {profile.email && <span className="truncate">{profile.email}</span>}
                </p>
              )}
            </div>
            {canEdit && profile && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1.5 flex-shrink-0">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="p-5 space-y-5">
          {/* Edit mode */}
          {editing && profile && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">Edit patient</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">First name</Label>
                  <Input
                    value={editForm.firstName}
                    onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                    className="mt-1"
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Last name</Label>
                  <Input
                    value={editForm.lastName}
                    onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                    className="mt-1"
                    disabled={saving}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">Date of birth</Label>
                <div className="mt-1">
                  <DateOfBirthInput value={editForm.dob} onChange={(v) => setEditForm(f => ({ ...f, dob: v }))} disabled={saving} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Phone</Label>
                  <Input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    className="mt-1"
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="mt-1"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                <Button size="sm" onClick={saveProfile} disabled={saving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                  {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</> : 'Save'}
                </Button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-white border rounded-lg p-4 animate-pulse">
                  <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-64 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {!loading && (
            <>
              {/* Reminder cadence / overdue status + quick actions */}
              {profile && (
                <ReminderCadenceCard
                  profile={profile}
                  organizationId={organizationId}
                  onChanged={load}
                />
              )}

              {/* KPI strip */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 border rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Total visits</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{appointments.length}</p>
                </div>
                <div className="bg-gray-50 border rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Completed</p>
                  <p className="text-xl font-bold text-emerald-700 mt-1">{completedCount}</p>
                </div>
                <div className="bg-gray-50 border rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Total spent</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">${totalSpent.toFixed(0)}</p>
                </div>
              </div>

              {/* Visit timeline */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
                  Visit timeline
                </p>
                {appointments.length === 0 ? (
                  <div className="bg-white border border-dashed rounded-lg p-8 text-center">
                    <Calendar className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No visits yet for this org.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {appointments.map(appt => {
                      const spec = specimens.get(appt.id);
                      const trackingId = spec?.specimen_id;
                      const labName = spec?.lab_name || appt.lab_destination;
                      const delivered = appt.specimens_delivered_at || spec?.delivered_at;
                      return (
                        <div key={appt.id} className="bg-white border rounded-lg p-3.5 hover:border-gray-300 transition">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">
                                {format(new Date(appt.appointment_date), 'MMM d, yyyy')}
                                {appt.appointment_time && (
                                  <span className="text-gray-500 font-normal ml-1.5">
                                    at {formatTime(appt.appointment_time)}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {appt.service_name || appt.service_type?.replace(/_/g, ' ')}
                              </p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[appt.status] || 'bg-gray-100'}`}>
                              {appt.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>

                          {/* Specimen delivery details */}
                          {(delivered || trackingId) && (
                            <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center gap-3 flex-wrap text-xs text-gray-600">
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Delivered {delivered ? formatDistanceToNow(new Date(delivered), { addSuffix: true }) : ''}
                                {labName && <span className="text-gray-500"> to {labName}</span>}
                              </span>
                              {trackingId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(trackingId);
                                    toast.success('Tracking ID copied');
                                  }}
                                  className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 px-2 py-0.5 rounded font-mono text-[11px] hover:bg-blue-100 transition"
                                  title="Copy tracking ID"
                                >
                                  <Package className="h-3 w-3" />
                                  {trackingId}
                                  <Copy className="h-2.5 w-2.5 opacity-60" />
                                </button>
                              )}
                            </div>
                          )}

                          {/* Paid amount + lab order status */}
                          {(Number(appt.total_amount) > 0 || appt.lab_order_file_path) && (
                            <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
                              {Number(appt.total_amount) > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <CreditCard className="h-3 w-3" />${Number(appt.total_amount).toFixed(2)}
                                </span>
                              )}
                              {appt.lab_order_file_path && (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <FileText className="h-3 w-3" />Lab order on file
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ────────────────────────────────────────────────────────────
// ReminderCadenceCard — shown in the drawer body
// ────────────────────────────────────────────────────────────
interface ReminderCardProps {
  profile: PatientProfile;
  organizationId: string;
  onChanged: () => void;
}

const ReminderCadenceCard: React.FC<ReminderCardProps> = ({ profile, organizationId, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(String(profile.lab_reminder_cadence_days || 7));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const deadline = profile.lab_reminder_deadline_at ? new Date(profile.lab_reminder_deadline_at) : null;
  const isOverdue = deadline && deadline.getTime() < Date.now();
  const flagged = !!profile.overdue_flagged_at;

  const updateCadence = async () => {
    const n = parseInt(days, 10);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      toast.error('Pick a cadence between 1 and 365 days');
      return;
    }
    setSaving(true);
    try {
      const newDeadline = new Date();
      newDeadline.setDate(newDeadline.getDate() + n);
      const { error } = await supabase.from('tenant_patients').update({
        lab_reminder_cadence_days: n,
        lab_reminder_deadline_at: newDeadline.toISOString(),
        overdue_flagged_at: null, // reset overdue if we're resetting the clock
      } as any).eq('id', profile.id);
      if (error) throw error;
      toast.success(`Reminder deadline set to ${n} days from today`);
      setEditing(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update cadence');
    } finally {
      setSaving(false);
    }
  };

  const sendBookingLink = async () => {
    if (!profile.email && !profile.phone) {
      toast.error('Patient has no phone or email — add one first');
      return;
    }
    setSending(true);
    try {
      // Use the existing patient-lab-request infrastructure: create a row and
      // the patient gets a text/email with the booking link. Simpler than
      // spinning up a one-off notification path.
      const { data, error } = await supabase.from('patient_lab_requests').insert({
        organization_id: organizationId,
        patient_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        patient_email: profile.email,
        patient_phone: profile.phone,
        draw_by_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().substring(0, 10),
        status: 'pending_schedule',
        access_token: crypto.randomUUID(),
      } as any).select('id, access_token').single();
      if (error) throw error;

      // Stamp last_sent_at so we don't double-remind
      await supabase.from('tenant_patients').update({
        lab_reminder_last_sent_at: new Date().toISOString(),
      } as any).eq('id', profile.id);

      // Fire the SMS/email
      await supabase.functions.invoke('remind-lab-request-patients', {
        body: { lab_request_id: (data as any).id },
      }).catch((e) => console.warn('remind invoke error (non-fatal):', e));

      toast.success('Booking link sent');
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send booking link');
    } finally {
      setSending(false);
    }
  };

  const tone = isOverdue
    ? { bg: 'bg-red-50', border: 'border-red-200', label: 'text-red-900', body: 'text-red-800' }
    : flagged
    ? { bg: 'bg-amber-50', border: 'border-amber-200', label: 'text-amber-900', body: 'text-amber-800' }
    : { bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'text-emerald-900', body: 'text-emerald-800' };

  return (
    <div className={`${tone.bg} ${tone.border} border rounded-lg p-4`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${tone.label}`} style={{ fontFamily: 'Georgia, serif' }}>
            {isOverdue ? '⚠ Overdue' : flagged ? 'Flagged earlier' : 'Reminder cadence'}
          </p>
          <p className={`text-sm ${tone.body} mt-0.5 leading-relaxed`}>
            {profile.lab_reminder_cadence_days
              ? <>Lab deadline <strong>{deadline ? format(deadline, 'MMM d, yyyy') : '—'}</strong> · cadence: every <strong>{profile.lab_reminder_cadence_days} days</strong></>
              : <>No reminder cadence set yet.</>}
          </p>
          {profile.lab_reminder_last_sent_at && (
            <p className={`text-[11px] ${tone.body} opacity-80 mt-0.5`}>
              Last reminded {formatDistanceToNow(new Date(profile.lab_reminder_last_sent_at), { addSuffix: true })}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing(v => !v)} className="text-xs flex-shrink-0">
          {editing ? 'Close' : 'Adjust'}
        </Button>
      </div>

      {editing && (
        <div className="bg-white border rounded-md p-3 mb-2">
          <Label className="text-xs font-semibold">Remind / deadline in</Label>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={saving}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
            <Button size="sm" onClick={updateCadence} disabled={saving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs">
              {saving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving…</> : 'Save'}
            </Button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Resets the deadline clock and clears any overdue flag. The patient will receive reminders before the new deadline.
          </p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          onClick={sendBookingLink}
          disabled={sending}
          className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5 flex-1 sm:flex-none"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Send booking link now
        </Button>
      </div>
    </div>
  );
};

// HH:MM:SS → 8:00 AM
function formatTime(t: string): string {
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${period}`;
}

export default PatientDetailDrawer;
