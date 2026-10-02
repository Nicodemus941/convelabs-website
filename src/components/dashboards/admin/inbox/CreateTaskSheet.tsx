/**
 * CreateTaskSheet — one task composer for the whole Inbox.
 *
 * Opened from Notes & tasks ("New task"), from a Needs-attention card
 * ("Make this a task"), and from a website-chat thread ("Create task"). Every
 * caller lands in the same drawer with the same fields, and the thing it was
 * opened from is recorded in activity_log.metadata.source so the task row can
 * link straight back to the chat / insurance change / practice it came from.
 *
 * Writes one activity_log row (the hybrid notes+tasks table):
 *   activity_type, description, patient_id, assigned_to_user_id,
 *   task_status='open', task_priority, task_due_at, metadata.source
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Send, Link2, User, X } from 'lucide-react';
import { fetchAssignableStaff, staffLabel, type StaffMember } from './staff';

const db = supabase as any;

export type TaskSource = {
  type: 'chat' | 'insurance_change' | 'discovered_org' | 'partner_inquiry' | 'manual';
  id?: string | null;
  label?: string | null;
  /** In-app path to reopen the source (e.g. `${basePath}/inbox/chat?c=<id>`). */
  url?: string | null;
};

export interface TaskDefaults {
  description?: string;
  activityType?: string;
  patientId?: string | null;
  patientLabel?: string | null;
  assigneeId?: string | null;
  priority?: 'low' | 'normal' | 'urgent';
  /** ISO or datetime-local string. */
  dueAt?: string | null;
  source?: TaskSource | null;
}

export const TASK_TYPES: Array<{ value: string; label: string }> = [
  { value: 'task', label: 'Task' },
  { value: 'call', label: 'Phone call' },
  { value: 'sms', label: 'SMS sent' },
  { value: 'email', label: 'Email sent' },
  { value: 'voicemail', label: 'Left voicemail' },
  { value: 'contact_attempt', label: 'Contact attempt' },
  { value: 'specimen_request', label: 'Specimen request' },
  { value: 'lab_order_missing', label: 'Lab order not received' },
  { value: 'cancellation', label: 'Appointment cancelled' },
  { value: 'reschedule', label: 'Appointment rescheduled' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'results_request', label: 'Results request' },
  { value: 'inquiry', label: 'Inquiry / new patient question' },
  { value: 'owner_call', label: 'Owner personal call' },
  { value: 'message_inbound', label: 'Inbound message' },
  { value: 'appointment_confirmed', label: 'Appointment confirmed' },
  { value: 'note', label: 'General note' },
];

/** Quick due presets — relative to now, in local time. */
function presetDue(kind: 'today' | 'tomorrow' | 'week'): string {
  const d = new Date();
  if (kind === 'today') { d.setHours(17, 0, 0, 0); if (d.getTime() < Date.now()) d.setTime(Date.now() + 2 * 3600_000); }
  if (kind === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  if (kind === 'week') { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
  return toLocalInput(d);
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const CreateTaskSheet: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaults?: TaskDefaults | null;
  onCreated?: (row: any) => void;
}> = ({ open, onOpenChange, defaults, onCreated }) => {
  const { user } = useAuth();
  const myUserId = user?.id;
  const myDisplayName = useMemo(
    () => `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() || user?.email || 'Staff',
    [user],
  );

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [type, setType] = useState('task');
  const [description, setDescription] = useState('');
  const [assignTo, setAssignTo] = useState<string>('unassigned');
  const [priority, setPriority] = useState<'low' | 'normal' | 'urgent'>('normal');
  const [dueAt, setDueAt] = useState('');
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Hydrate from defaults each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setType(defaults?.activityType || 'task');
    setDescription(defaults?.description || '');
    setAssignTo(defaults?.assigneeId || 'unassigned');
    setPriority(defaults?.priority || 'normal');
    setDueAt(defaults?.dueAt ? (defaults.dueAt.includes('T') && defaults.dueAt.length <= 16 ? defaults.dueAt : toLocalInput(new Date(defaults.dueAt))) : '');
    setPatientId(defaults?.patientId || null);
    setPatientSearch(defaults?.patientLabel || '');
    setPatientResults([]);
    setStaffLoading(true);
    fetchAssignableStaff().then(s => { setStaff(s); }).finally(() => setStaffLoading(false));
  }, [open, defaults]);

  // Patient lookup (name / email / phone).
  useEffect(() => {
    if (!open || patientId || patientSearch.trim().length < 2) { setPatientResults([]); return; }
    const q = patientSearch.trim();
    const t = setTimeout(async () => {
      const { data } = await db
        .from('tenant_patients')
        .select('id, first_name, last_name, email, phone')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
        .is('deleted_at', null)
        .limit(6);
      setPatientResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [patientSearch, patientId, open]);

  const isTask = type === 'task' || assignTo !== 'unassigned' || !!dueAt;

  const submit = async () => {
    if (!description.trim()) { toast.error('Describe what needs to happen'); return; }
    setSaving(true);
    try {
      const src = defaults?.source || null;
      const payload: Record<string, unknown> = {
        activity_type: type,
        description: description.trim(),
        patient_id: patientId,
        created_by_name: myDisplayName,
        staff_id: myUserId,
        assigned_to_user_id: assignTo !== 'unassigned' ? assignTo : null,
        task_status: isTask ? 'open' : null,
        task_priority: isTask ? priority : null,
        task_due_at: isTask && dueAt ? new Date(dueAt).toISOString() : null,
        metadata: src && src.type !== 'manual' ? { source: src } : {},
      };
      const { data, error } = await db.from('activity_log').insert(payload).select('*').single();
      if (error) throw error;
      toast.success(isTask ? (assignTo !== 'unassigned' ? `Task sent to ${staffLabel(staff.find(s => s.id === assignTo))}` : 'Task created') : 'Note added');
      onCreated?.(data);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-4 sm:p-5">
          <SheetHeader className="text-left space-y-1">
            <p className="text-[11px] uppercase tracking-wider opacity-90">{isTask ? 'New task' : 'New note'}</p>
            <SheetTitle className="text-white text-lg">{isTask ? 'Hand this to someone' : 'Log what happened'}</SheetTitle>
            <SheetDescription className="text-rose-100 text-xs">
              Assigned tasks show up live for the owner, with a due date and a thread for every follow-up.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {defaults?.source && defaults.source.type !== 'manual' && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Linked to <strong>{defaults.source.label || defaults.source.type.replace('_', ' ')}</strong></span>
            </div>
          )}

          <div>
            <label htmlFor="task-desc" className="text-xs font-medium text-gray-700">What needs to happen? *</label>
            <Textarea id="task-desc" value={description} onChange={e => setDescription(e.target.value)} rows={4} autoFocus
              placeholder="Be specific so the assignee knows exactly what to do, and what 'done' looks like." className="mt-1 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Priority</label>
              <Select value={priority} onValueChange={v => setPriority(v as any)}>
                <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700">Owner</label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger className="h-10 mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned (just a note)</SelectItem>
                {staff.map(s => (
                  <SelectItem key={s.id} value={s.id}>{staffLabel(s)}{s.id === myUserId ? ' (me)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!staffLoading && staff.length === 0 && (
              <p className="text-[11px] text-amber-700 mt-1">No assignable staff found — the task will be saved unassigned.</p>
            )}
          </div>

          <div>
            <label htmlFor="task-due" className="text-xs font-medium text-gray-700">Due</label>
            <div className="flex gap-1.5 mt-1 mb-1.5">
              {([['today', 'Today 5 PM'], ['tomorrow', 'Tomorrow 9 AM'], ['week', 'In a week']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setDueAt(presetDue(k))}
                  className="text-[11px] px-2.5 h-7 rounded-full border border-gray-200 bg-white hover:border-[#B91C1C]/50 hover:text-[#B91C1C]">
                  {l}
                </button>
              ))}
              {dueAt && (
                <button type="button" onClick={() => setDueAt('')} className="text-[11px] px-2 h-7 text-gray-500 hover:text-gray-800" aria-label="Clear due date">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Input id="task-due" type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="h-10" />
          </div>

          <div className="relative">
            <label htmlFor="task-patient" className="text-xs font-medium text-gray-700">Patient (optional)</label>
            <div className="relative mt-1">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Input id="task-patient" value={patientSearch} className="h-10 pl-8"
                onChange={e => { setPatientSearch(e.target.value); setPatientId(null); }}
                placeholder="Search by name, email or phone…" />
              {patientId && (
                <button type="button" onClick={() => { setPatientId(null); setPatientSearch(''); }} aria-label="Clear patient"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
              )}
            </div>
            {patientResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-44 overflow-y-auto">
                {patientResults.map((p: any) => (
                  <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    onClick={() => { setPatientId(p.id); setPatientSearch(`${p.first_name} ${p.last_name}`); setPatientResults([]); }}>
                    {p.first_name} {p.last_name} <span className="text-xs text-gray-500">{p.email || p.phone || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-3 sm:p-4 flex gap-2 justify-end">
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="h-10 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5" onClick={submit} disabled={saving || !description.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isTask ? (assignTo !== 'unassigned' ? 'Send task' : 'Create task') : 'Save note'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CreateTaskSheet;
