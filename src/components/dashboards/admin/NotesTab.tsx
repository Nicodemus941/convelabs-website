/**
 * NotesTab — "Notes & tasks": the owned, dated work list plus the activity
 * journal, on one activity_log table.
 *
 *   • A task is an activity_log row with task_status set. It has an owner
 *     (assigned_to_user_id), a priority, a due date and a thread (replies
 *     carry parent_id). Status flows open → in_progress → done / cancelled.
 *   • A note is any row with task_status NULL — the journal of every call,
 *     text, email and complaint the office logs.
 *   • Both arrive live over the activity_log realtime channel.
 *
 * Assignment is fixed here: the old rpc('get_assignable_staff') never
 * existed (404 on every load) and its fallback read columns staff_profiles
 * does not have, so the Owner dropdown was always empty. Staff now come
 * from inbox/staff.ts (get_staff_activity_summary, which exists and is
 * admin-gated), with the intended RPC in a DRAFT migration.
 *
 * Layout follows LabOrdersTab: title row → count tiles → chips → "Needs
 * action" lane (overdue, urgent, due today, assigned to me) over
 * "Everything else" → task drawer with the full thread. The daily-pace
 * coaching widgets (scoreboard, morning ritual, quick log) and the team
 * activity card still exist, folded under the list so the work comes first.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow, isToday, isPast } from 'date-fns';
import {
  FileText, Search, Phone, Mail, Calendar, AlertTriangle, XCircle, ClipboardList, MessageSquare, Clock,
  Send, Download, CheckCircle2, Loader2, ArrowRight, Reply, CornerDownRight, Flag, X, Link2, Plus,
  RotateCcw, UserCheck, ChevronDown,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import StaffActivityCard from './StaffActivityCard';
import { InboxHero, ChipRow, LaneHeader } from './inbox/InboxHero';
import CreateTaskSheet, { type TaskDefaults } from './inbox/CreateTaskSheet';
import { fetchAssignableStaff, staffLabel, initialsOf, type StaffMember } from './inbox/staff';
import { adminBasePath } from './inbox/inboxQueries';

const db = supabase as any;

const ACTIVITY_TYPES = [
  { value: 'task', label: 'Task', icon: Flag, color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'call', label: 'Phone call', icon: Phone, color: 'bg-blue-50 text-blue-700' },
  { value: 'sms', label: 'SMS sent', icon: MessageSquare, color: 'bg-emerald-50 text-emerald-700' },
  { value: 'email', label: 'Email sent', icon: Mail, color: 'bg-purple-50 text-purple-700' },
  { value: 'voicemail', label: 'Left voicemail', icon: Phone, color: 'bg-amber-50 text-amber-700' },
  { value: 'contact_attempt', label: 'Contact attempt', icon: Phone, color: 'bg-orange-50 text-orange-700' },
  { value: 'specimen_request', label: 'Specimen request', icon: ClipboardList, color: 'bg-teal-50 text-teal-700' },
  { value: 'lab_order_missing', label: 'Lab order not received', icon: AlertTriangle, color: 'bg-red-50 text-red-700' },
  { value: 'cancellation', label: 'Appointment cancelled', icon: XCircle, color: 'bg-red-50 text-red-700' },
  { value: 'reschedule', label: 'Appointment rescheduled', icon: Calendar, color: 'bg-indigo-50 text-indigo-700' },
  { value: 'complaint', label: 'Complaint', icon: AlertTriangle, color: 'bg-rose-50 text-rose-800 border-rose-300' },
  { value: 'results_request', label: 'Results request', icon: FileText, color: 'bg-cyan-50 text-cyan-700' },
  { value: 'inquiry', label: 'Inquiry', icon: MessageSquare, color: 'bg-sky-50 text-sky-700' },
  { value: 'owner_call', label: 'Owner personal call', icon: Phone, color: 'bg-fuchsia-50 text-fuchsia-700' },
  { value: 'message_inbound', label: 'Inbound message', icon: Mail, color: 'bg-lime-50 text-lime-700' },
  { value: 'appointment_confirmed', label: 'Appt confirmed', icon: Calendar, color: 'bg-green-50 text-green-700' },
  { value: 'system', label: 'System', icon: Clock, color: 'bg-gray-50 text-gray-600' },
  { value: 'note', label: 'Note', icon: FileText, color: 'bg-gray-50 text-gray-700' },
];
const typeCfg = (t: string) => ACTIVITY_TYPES.find(x => x.value === t) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];

// Hormozi daily target: 50 documented touches/day.
const DAILY_TOUCH_GOAL = 50;
const MORNING_CHECKLIST = [
  { id: 'email_review', label: 'Clear overnight email inbox (results requests, inquiries, complaints)', expectedActivity: 'email' },
  { id: 'no_show_followup', label: "Follow up on yesterday's no-shows & cancellations (reschedule them)", expectedActivity: 'contact_attempt' },
  { id: 'provider_portal_check', label: 'Check provider portal for new lab orders (route to right phleb)', expectedActivity: 'specimen_request' },
  { id: 'unpaid_invoices', label: 'Review Stripe unpaid invoices — text/email patients owing money', expectedActivity: 'contact_attempt' },
  { id: 'pheb_huddle', label: "5-min standup with phleb on the day's route + any prep needs", expectedActivity: 'note' },
];
const QUICK_LOG = [
  { type: 'call', label: 'Call', desc: 'Phone call: ' },
  { type: 'voicemail', label: 'Voicemail', desc: 'Left voicemail for: ' },
  { type: 'sms', label: 'SMS', desc: 'SMS to: ' },
  { type: 'email', label: 'Email', desc: 'Email to: ' },
  { type: 'inquiry', label: 'Inquiry', desc: 'Inquiry from: ' },
  { type: 'complaint', label: 'Complaint', desc: 'Complaint from: ' },
  { type: 'results_request', label: 'Results', desc: 'Results request from: ' },
  { type: 'owner_call', label: 'Owner call', desc: 'Personal call for Nico from: ' },
  { type: 'appointment_confirmed', label: 'Confirmed', desc: 'Confirmed appt for: ' },
  { type: 'specimen_request', label: 'Specimen', desc: 'Specimen request for: ' },
];

const PRIORITY_PILL: Record<string, string> = {
  urgent: 'bg-red-600 text-white border-red-600',
  normal: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-gray-100 text-gray-700 border-gray-200',
};
const STATUS_PILL: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
};
const STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' };

type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

interface ActivityEntry {
  id: string;
  activity_type: string;
  description: string;
  patient_id: string | null;
  appointment_id: string | null;
  parent_id: string | null;
  created_by_name: string;
  created_at: string;
  metadata: any;
  staff_id: string | null;
  assigned_to_user_id: string | null;
  task_status: TaskStatus | null;
  task_priority: 'low' | 'normal' | 'urgent' | null;
  task_due_at: string | null;
  task_completed_at: string | null;
}

type FilterKey = 'open' | 'mine' | 'overdue' | 'unassigned' | 'in_progress' | 'done' | 'notes';

const isOpenStatus = (s: TaskStatus | null) => s === 'open' || s === 'in_progress';
const isOverdue = (a: ActivityEntry) => !!a.task_due_at && isOpenStatus(a.task_status) && isPast(new Date(a.task_due_at));
const isDueToday = (a: ActivityEntry) => !!a.task_due_at && isOpenStatus(a.task_status) && isToday(new Date(a.task_due_at));

const NotesTab: React.FC = () => {
  const { user } = useAuth();
  const myUserId = user?.id;
  const basePath = adminBasePath(user?.role);
  const myDisplayName = useMemo(
    () => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Staff',
    [user],
  );

  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('open');
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDefaults, setComposerDefaults] = useState<TaskDefaults | null>(null);
  const openComposer = (d: TaskDefaults | null = null) => { setComposerDefaults(d); setComposerOpen(true); };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPace, setShowPace] = useState(false);
  const [showTeam, setShowTeam] = useState(false);

  const staffById = useMemo(() => new Map(staff.map(s => [s.id, s])), [staff]);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      setActivities((data as ActivityEntry[]) || []);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchActivities(); fetchAssignableStaff().then(setStaff); }, [fetchActivities]);

  // Resolve patient names for linked rows (one query, cached by id).
  useEffect(() => {
    const ids = Array.from(new Set(activities.map(a => a.patient_id).filter((x): x is string => !!x && !patientNames[x])));
    if (ids.length === 0) return;
    db.from('tenant_patients').select('id, first_name, last_name').in('id', ids.slice(0, 200)).then(({ data }: any) => {
      if (!data) return;
      setPatientNames(prev => {
        const next = { ...prev };
        for (const p of data) next[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient';
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  // Realtime — new tasks/notes and status flips appear without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel('activity_log_realtime')
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload: any) => {
        const row = payload.new as ActivityEntry;
        setActivities(prev => [row, ...prev.filter(a => a.id !== row.id)]);
        if (row.assigned_to_user_id === myUserId && row.task_status === 'open' && row.staff_id !== myUserId) {
          toast.info(`New task for you: ${row.description.slice(0, 80)}`);
        }
      })
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'activity_log' }, (payload: any) => {
        const row = payload.new as ActivityEntry;
        setActivities(prev => prev.map(a => a.id === row.id ? row : a));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myUserId]);

  /* ─── Mutations ───────────────────────────────────────────────── */

  const logSystem = async (parentId: string, text: string) => {
    await db.from('activity_log').insert({ activity_type: 'system', description: text, parent_id: parentId, staff_id: myUserId, created_by_name: myDisplayName });
  };

  const updateTaskStatus = async (id: string, status: TaskStatus) => {
    setBusyId(id);
    try {
      const patch: Record<string, unknown> = { task_status: status };
      if (status === 'done') { patch.task_completed_at = new Date().toISOString(); patch.task_completed_by = myUserId; }
      if (status === 'open') { patch.task_completed_at = null; patch.task_completed_by = null; }
      const { error } = await db.from('activity_log').update(patch).eq('id', id);
      if (error) throw error;
      await logSystem(id, `Task marked ${STATUS_LABEL[status].toLowerCase()} by ${myDisplayName}`);
      toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (e: any) {
      toast.error(e?.message || 'Status update failed');
    } finally {
      setBusyId(null);
    }
  };

  const reassign = async (id: string, assigneeId: string | null) => {
    setBusyId(id);
    try {
      const { error } = await db.from('activity_log').update({ assigned_to_user_id: assigneeId, task_status: 'open' }).eq('id', id);
      if (error) throw error;
      await logSystem(id, assigneeId ? `Reassigned to ${staffLabel(staffById.get(assigneeId))} by ${myDisplayName}` : `Unassigned by ${myDisplayName}`);
      toast.success(assigneeId ? `Assigned to ${staffLabel(staffById.get(assigneeId))}` : 'Unassigned');
    } catch (e: any) {
      toast.error(e?.message || 'Reassign failed');
    } finally {
      setBusyId(null);
    }
  };

  const setDue = async (id: string, dueLocal: string) => {
    setBusyId(id);
    try {
      const iso = dueLocal ? new Date(dueLocal).toISOString() : null;
      const { error } = await db.from('activity_log').update({ task_due_at: iso }).eq('id', id);
      if (error) throw error;
      await logSystem(id, iso ? `Due date set to ${format(new Date(iso), 'MMM d, h:mm a')} by ${myDisplayName}` : `Due date cleared by ${myDisplayName}`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not update due date');
    } finally {
      setBusyId(null);
    }
  };

  const submitReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    setReplyBusy(true);
    try {
      const { error } = await db.from('activity_log').insert({
        activity_type: 'note', description: replyText.trim(), parent_id: parentId, staff_id: myUserId, created_by_name: myDisplayName,
      });
      if (error) throw error;
      setReplyText('');
      toast.success('Added to the thread');
    } catch (e: any) {
      toast.error(e?.message || 'Reply failed');
    } finally {
      setReplyBusy(false);
    }
  };

  /* ─── Derived ─────────────────────────────────────────────────── */

  const threadsByParent = useMemo(() => {
    const m = new Map<string, ActivityEntry[]>();
    for (const a of activities) {
      if (!a.parent_id) continue;
      const arr = m.get(a.parent_id) || [];
      arr.push(a);
      m.set(a.parent_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return m;
  }, [activities]);

  const roots = useMemo(() => activities.filter(a => !a.parent_id), [activities]);
  const tasks = useMemo(() => roots.filter(a => !!a.task_status), [roots]);
  const notes = useMemo(() => roots.filter(a => !a.task_status), [roots]);

  const counts = useMemo(() => ({
    open: tasks.filter(a => isOpenStatus(a.task_status)).length,
    mine: tasks.filter(a => a.assigned_to_user_id === myUserId && isOpenStatus(a.task_status)).length,
    overdue: tasks.filter(isOverdue).length,
    due_today: tasks.filter(a => isDueToday(a) && !isOverdue(a)).length,
    unassigned: tasks.filter(a => !a.assigned_to_user_id && isOpenStatus(a.task_status)).length,
    in_progress: tasks.filter(a => a.task_status === 'in_progress').length,
    done: tasks.filter(a => a.task_status === 'done' && a.task_completed_at && Date.now() - new Date(a.task_completed_at).getTime() < 7 * 86_400_000).length,
    notes: notes.length,
  }), [tasks, notes, myUserId]);

  const needsAction = useCallback((a: ActivityEntry) =>
    isOpenStatus(a.task_status) && (isOverdue(a) || isDueToday(a) || a.task_priority === 'urgent' || a.assigned_to_user_id === myUserId),
  [myUserId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = filter === 'notes' ? notes : tasks;
    return base.filter(a => {
      if (filter === 'open' && !isOpenStatus(a.task_status)) return false;
      if (filter === 'mine' && !(a.assigned_to_user_id === myUserId && isOpenStatus(a.task_status))) return false;
      if (filter === 'overdue' && !isOverdue(a)) return false;
      if (filter === 'unassigned' && !(!a.assigned_to_user_id && isOpenStatus(a.task_status))) return false;
      if (filter === 'in_progress' && a.task_status !== 'in_progress') return false;
      if (filter === 'done' && !(a.task_status === 'done' || a.task_status === 'cancelled')) return false;
      if (!q) return true;
      const owner = staffLabel(staffById.get(a.assigned_to_user_id || ''));
      const patient = a.patient_id ? patientNames[a.patient_id] || '' : '';
      return [a.description, a.created_by_name, owner, patient, a.activity_type].some(v => (v || '').toLowerCase().includes(q));
    }).sort((a, b) => {
      // Overdue first, then by due date, then newest.
      const ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.task_due_at && b.task_due_at) return new Date(a.task_due_at).getTime() - new Date(b.task_due_at).getTime();
      if (a.task_due_at) return -1;
      if (b.task_due_at) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [tasks, notes, filter, search, myUserId, staffById, patientNames]);

  const lanes = useMemo(() => {
    if (filter !== 'open') return null;
    return { action: filtered.filter(needsAction), rest: filtered.filter(a => !needsAction(a)) };
  }, [filtered, filter, needsAction]);

  const selected = useMemo(() => activities.find(a => a.id === selectedId) || null, [activities, selectedId]);

  const CHIPS: Array<{ key: FilterKey; label: string; count: number; dot?: string; desc: string }> = [
    { key: 'open', label: 'Open tasks', count: counts.open, desc: 'Every open or in-progress task' },
    { key: 'mine', label: 'Mine', count: counts.mine, dot: 'bg-[#B91C1C]', desc: 'Open tasks assigned to me' },
    { key: 'overdue', label: 'Overdue', count: counts.overdue, dot: 'bg-red-500', desc: 'Past the due date' },
    { key: 'unassigned', label: 'Unassigned', count: counts.unassigned, dot: 'bg-gray-400', desc: 'Nobody owns these yet' },
    { key: 'in_progress', label: 'In progress', count: counts.in_progress, dot: 'bg-blue-500', desc: 'Someone has started' },
    { key: 'done', label: 'Done', count: tasks.filter(a => a.task_status === 'done' || a.task_status === 'cancelled').length, dot: 'bg-emerald-500', desc: 'Completed or cancelled' },
    { key: 'notes', label: 'Activity feed', count: counts.notes, dot: 'bg-gray-300', desc: 'Logged calls, texts, emails and notes' },
  ];

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Status', 'Priority', 'Due', 'Description', 'By', 'Owner', 'Patient'];
    const rows = filtered.map(a => [
      a.created_at ? format(new Date(a.created_at), 'MMM d yyyy h:mm a') : '',
      a.activity_type, a.task_status || '', a.task_priority || '',
      a.task_due_at ? format(new Date(a.task_due_at), 'MMM d yyyy h:mm a') : '',
      a.description, a.created_by_name || '',
      staffLabel(staffById.get(a.assigned_to_user_id || '')),
      a.patient_id ? patientNames[a.patient_id] || a.patient_id : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `convelabs-tasks-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  /* ─── Row ─────────────────────────────────────────────────────── */

  const OwnerChip: React.FC<{ id: string | null }> = ({ id }) => {
    const s = id ? staffById.get(id) : null;
    const label = id ? staffLabel(s) : 'Unassigned';
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        id ? (id === myUserId ? 'bg-[#B91C1C]/10 text-[#B91C1C] border-[#B91C1C]/30' : 'bg-gray-50 text-gray-700 border-gray-200') : 'bg-white text-gray-400 border-dashed border-gray-300')}>
        <span className={cn('h-4 w-4 rounded-full text-[9px] font-bold flex items-center justify-center', id ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-500')}>{id ? initialsOf(label) : '?'}</span>
        {id === myUserId ? 'Me' : label}
      </span>
    );
  };

  const SourceLink: React.FC<{ meta: any }> = ({ meta }) => {
    const src = meta?.source;
    if (!src?.type || src.type === 'manual') return null;
    const inner = <><Link2 className="h-3 w-3" aria-hidden="true" /> {src.label || src.type.replace('_', ' ')}</>;
    return src.url
      ? <Link to={src.url} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:underline">{inner}</Link>
      : <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">{inner}</span>;
  };

  const renderTask = (a: ActivityEntry) => {
    const cfg = typeCfg(a.activity_type);
    const Icon = cfg.icon;
    const thread = threadsByParent.get(a.id) || [];
    const mine = a.assigned_to_user_id === myUserId;
    const overdue = isOverdue(a);
    const dueToday = isDueToday(a) && !overdue;
    const open = () => setSelectedId(a.id);
    return (
      <Card key={a.id} role="button" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
        aria-label={`${a.description.slice(0, 80)}. Open task`}
        className={cn('shadow-sm cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40 hover:border-gray-300',
          overdue && 'border-l-4 border-l-red-500', !overdue && a.task_priority === 'urgent' && isOpenStatus(a.task_status) && 'border-l-4 border-l-orange-500',
          a.task_status === 'done' && 'opacity-70')}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex gap-3">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', cfg.color)} aria-hidden="true"><Icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className={cn('text-[10px]', STATUS_PILL[a.task_status || 'open'])}>{STATUS_LABEL[a.task_status || 'open']}</Badge>
                {a.task_priority && isOpenStatus(a.task_status) && <Badge variant="outline" className={cn('text-[10px] capitalize', PRIORITY_PILL[a.task_priority])}>{a.task_priority}</Badge>}
                {overdue && <Badge variant="outline" className="text-[10px] bg-red-600 text-white border-red-600">Overdue</Badge>}
                {dueToday && <Badge variant="outline" className="text-[10px] bg-amber-500 text-white border-amber-500">Due today</Badge>}
                <OwnerChip id={a.assigned_to_user_id} />
                <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
              </div>
              <p className={cn('text-sm mt-1.5 text-gray-900', a.task_status === 'done' && 'line-through')}>{a.description}</p>
              <div className="flex flex-wrap gap-x-2 gap-y-1 items-center mt-1.5 text-[10px] text-gray-500">
                <span>{cfg.label} · by {a.created_by_name || 'System'}</span>
                {a.task_due_at && <span className={cn(overdue ? 'text-red-700 font-semibold' : dueToday ? 'text-amber-700 font-semibold' : '')}>· due {format(new Date(a.task_due_at), 'MMM d, h:mm a')}</span>}
                {a.patient_id && <span className="inline-flex items-center gap-1 text-gray-700">· <UserCheck className="h-3 w-3" aria-hidden="true" /> {patientNames[a.patient_id] || 'patient'}</span>}
                {thread.length > 0 && <span>· {thread.length} update{thread.length === 1 ? '' : 's'}</span>}
                <SourceLink meta={a.metadata} />
              </div>

              {isOpenStatus(a.task_status) && (
                <div className="flex flex-wrap gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                  {a.task_status === 'open' && (mine || !a.assigned_to_user_id) && (
                    <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1" disabled={busyId === a.id}
                      onClick={() => { if (!a.assigned_to_user_id && myUserId) reassign(a.id, myUserId).then(() => updateTaskStatus(a.id, 'in_progress')); else updateTaskStatus(a.id, 'in_progress'); }}>
                      <ArrowRight className="h-3 w-3" /> {a.assigned_to_user_id ? 'Start' : 'Take it'}
                    </Button>
                  )}
                  <Button size="sm" className="h-8 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busyId === a.id} onClick={() => updateTaskStatus(a.id, 'done')}>
                    <CheckCircle2 className="h-3 w-3" /> Done
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-[11px] gap-1" onClick={() => { setSelectedId(a.id); }}>
                    <Reply className="h-3 w-3" /> Add update
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderNote = (a: ActivityEntry) => {
    const cfg = typeCfg(a.activity_type);
    const Icon = cfg.icon;
    return (
      <div key={a.id} className="flex gap-3 p-3 rounded-lg border bg-white">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', cfg.color)} aria-hidden="true"><Icon className="h-3.5 w-3.5" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px]', cfg.color)}>{cfg.label}</Badge>
            {a.patient_id && <span className="text-[10px] text-gray-600 inline-flex items-center gap-1"><UserCheck className="h-3 w-3" /> {patientNames[a.patient_id] || 'patient'}</span>}
            <span className="text-[10px] text-gray-400 ml-auto">{format(new Date(a.created_at), 'MMM d, h:mm a')}</span>
          </div>
          <p className="text-sm mt-1 text-gray-800 whitespace-pre-wrap">{a.description}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">by {a.created_by_name || 'System'}</p>
        </div>
      </div>
    );
  };

  /* ─── Daily pace (folded) ─────────────────────────────────────── */

  const todayStr = new Date().toISOString().substring(0, 10);
  const todayActivities = activities.filter(a => (a.created_at || '').startsWith(todayStr));
  const totalToday = todayActivities.length;
  const paceTone = totalToday >= DAILY_TOUCH_GOAL ? 'emerald' : totalToday >= DAILY_TOUCH_GOAL / 2 ? 'amber' : 'red';
  const hasTypeToday = (type: string) => todayActivities.some(a => a.activity_type === type);
  const morningDone = MORNING_CHECKLIST.filter(i => hasTypeToday(i.expectedActivity)).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <InboxHero
        icon={ClipboardList}
        title="Notes & tasks"
        subtitle={<>Owned, dated work for the team — plus the journal of every touch. {counts.mine > 0 && <span className="font-medium text-red-700">{counts.mine} open for you.</span>}</>}
        loading={loading}
        onRefresh={fetchActivities}
        activeKey={['mine', 'overdue', 'unassigned', 'done'].includes(filter) ? filter : null}
        onTile={(k) => setFilter(filter === k ? 'open' : (k as FilterKey))}
        tiles={[
          { key: 'mine', label: 'Mine · open', value: counts.mine, tone: 'red', hot: true, desc: 'Open tasks assigned to me' },
          { key: 'overdue', label: 'Overdue', value: counts.overdue, tone: 'red', hot: true, desc: 'Past the due date' },
          { key: 'unassigned', label: 'Unassigned', value: counts.unassigned, tone: 'amber', desc: 'Nobody owns these yet' },
          { key: 'done', label: 'Done · 7 days', value: counts.done, tone: 'emerald', desc: 'Completed this week' },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCSV} className="h-10 sm:h-9 text-xs gap-1 hidden sm:inline-flex"><Download className="h-4 w-4" /> Export</Button>
            <Button size="sm" className="h-10 sm:h-9 text-xs bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5" onClick={() => openComposer({ activityType: 'task', source: { type: 'manual' } })}>
              <Plus className="h-4 w-4" /> New task
            </Button>
          </>
        }
      />

      {/* Quick log — one tap opens a pre-filled note */}
      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap items-center" role="group" aria-label="Quick log">
        <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">Quick log:</span>
        {QUICK_LOG.map(b => (
          <button key={b.type} type="button" onClick={() => openComposer({ activityType: b.type, description: b.desc, source: { type: 'manual' } })}
            className="text-[11px] h-8 px-2.5 rounded-full bg-white border border-gray-200 hover:border-[#B91C1C]/50 hover:text-[#B91C1C] whitespace-nowrap transition">
            {b.label}
          </button>
        ))}
      </div>

      {/* Search + chips */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks, notes, owner, patient…" aria-label="Search tasks" className="h-10 sm:h-9 pl-8 text-sm" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>}
        </div>
        <ChipRow chips={CHIPS} active={filter} onChange={k => setFilter(k as FilterKey)} ariaLabel="Task filter" />
      </div>

      {/* Body */}
      {loading && activities.length === 0 ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold">{filter === 'mine' ? "You're all caught up" : filter === 'notes' ? 'Nothing logged yet' : 'No tasks here'}</p>
          <p className="text-xs text-gray-500 mt-1">
            {search ? <button type="button" onClick={() => setSearch('')} className="text-[#B91C1C] hover:underline">Clear the search</button>
              : filter === 'open' ? 'Create a task with "New task", or turn an inbox item or a website chat into one.' : <button type="button" onClick={() => setFilter('open')} className="text-[#B91C1C] hover:underline">Show open tasks</button>}
          </p>
        </CardContent></Card>
      ) : filter === 'notes' ? (
        <div className="space-y-2">{filtered.map(renderNote)}</div>
      ) : lanes ? (
        <div className="space-y-5">
          {lanes.action.length > 0 && (
            <section aria-labelledby="lane-task-action" className="space-y-2">
              <LaneHeader id="lane-task-action" title="Needs action" count={lanes.action.length} tone="red" hint="overdue, due today, urgent, or yours" />
              {lanes.action.map(renderTask)}
            </section>
          )}
          {lanes.rest.length > 0 && (
            <section aria-labelledby="lane-task-rest" className="space-y-2">
              <LaneHeader id="lane-task-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
              {lanes.rest.map(renderTask)}
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-2">{filtered.map(renderTask)}</div>
      )}

      <p className="text-[11px] text-gray-400">Showing {filtered.length} · {tasks.length} task{tasks.length === 1 ? '' : 's'} and {notes.length} note{notes.length === 1 ? '' : 's'} loaded (newest 500).</p>

      {/* Daily pace — folded coaching widgets */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <button type="button" onClick={() => setShowPace(v => !v)} aria-expanded={showPace}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
            <span className="text-sm font-semibold flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', paceTone === 'emerald' ? 'bg-emerald-500' : paceTone === 'amber' ? 'bg-amber-500' : 'bg-red-500')} aria-hidden="true" />
              Today's pace · <span className="tabular-nums">{totalToday}</span><span className="text-gray-400 font-normal">/{DAILY_TOUCH_GOAL} touches</span>
              <span className="text-xs text-gray-500 font-normal hidden sm:inline">· morning ritual {morningDone}/{MORNING_CHECKLIST.length}</span>
            </span>
            <ChevronDown className={cn('h-4 w-4 text-gray-400 transition', showPace && 'rotate-180')} aria-hidden="true" />
          </button>
          {showPace && (
            <div className="px-4 pb-4 space-y-3 border-t pt-3">
              <div className="flex flex-wrap gap-1.5">
                {[['call', 'Calls'], ['sms', 'SMS'], ['email', 'Emails'], ['voicemail', 'Voicemails'], ['appointment_confirmed', 'Confirmed'], ['inquiry', 'Inquiries'], ['complaint', 'Complaints'], ['results_request', 'Results req'], ['owner_call', 'Owner calls']].map(([k, l]) => (
                  <span key={k} className="text-[11px] bg-white border border-gray-200 rounded-full px-2.5 py-0.5"><strong>{todayActivities.filter(a => a.activity_type === k).length}</strong> {l}</span>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Morning ritual · before 9 AM ET</p>
                <ul className="space-y-1 text-xs">
                  {MORNING_CHECKLIST.map(item => {
                    const done = hasTypeToday(item.expectedActivity);
                    return (
                      <li key={item.id} className={cn('flex items-start gap-2', done ? 'text-emerald-800' : 'text-gray-700')}>
                        <CheckCircle2 className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', done ? 'text-emerald-600' : 'text-gray-300')} aria-hidden="true" />
                        <span className={done ? 'line-through opacity-70' : ''}>{item.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <button type="button" onClick={() => setShowTeam(v => !v)} aria-expanded={showTeam} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
            <span className="text-sm font-semibold">Team activity</span>
            <ChevronDown className={cn('h-4 w-4 text-gray-400 transition', showTeam && 'rotate-180')} aria-hidden="true" />
          </button>
          {showTeam && <div className="px-2 pb-2 border-t"><StaffActivityCard /></div>}
        </CardContent>
      </Card>

      <CreateTaskSheet open={composerOpen} onOpenChange={setComposerOpen} defaults={composerDefaults} />

      {/* Task drawer — full thread, owner, due, status */}
      <Sheet open={!!selected} onOpenChange={(v) => { if (!v) { setSelectedId(null); setReplyText(''); } }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
          {selected && (() => {
            const a = selected;
            const cfg = typeCfg(a.activity_type);
            const thread = threadsByParent.get(a.id) || [];
            const overdue = isOverdue(a);
            const dueLocal = a.task_due_at ? (() => { const d = new Date(a.task_due_at); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; })() : '';
            return (
              <>
                <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-4 sm:p-5 sticky top-0 z-10">
                  <SheetHeader className="text-left space-y-1">
                    <p className="text-[11px] uppercase tracking-wider opacity-90">{cfg.label}{a.task_status ? ' · task' : ''}</p>
                    <SheetTitle className="text-white text-base leading-snug">{a.description}</SheetTitle>
                    <SheetDescription className="text-rose-100 text-xs">
                      Created {format(new Date(a.created_at), 'MMM d, h:mm a')} by {a.created_by_name || 'System'}
                      {a.patient_id && <> · patient {patientNames[a.patient_id] || ''}</>}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {a.task_status && <Badge variant="outline" className={cn('text-[10px] bg-white/95', STATUS_PILL[a.task_status])}>{STATUS_LABEL[a.task_status]}</Badge>}
                    {a.task_priority && <Badge variant="outline" className={cn('text-[10px] capitalize bg-white/95', PRIORITY_PILL[a.task_priority])}>{a.task_priority}</Badge>}
                    {overdue && <Badge variant="outline" className="text-[10px] bg-white text-red-700 border-white">Overdue</Badge>}
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-4">
                  {a.metadata?.source && a.metadata.source.type !== 'manual' && (
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs flex items-center justify-between gap-2">
                      <span className="text-gray-700 truncate">From <strong>{a.metadata.source.label || a.metadata.source.type}</strong></span>
                      {a.metadata.source.url && <Link to={a.metadata.source.url} className="text-blue-700 hover:underline whitespace-nowrap">Open source</Link>}
                    </div>
                  )}

                  {a.task_status && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700">Owner</label>
                        <Select value={a.assigned_to_user_id || 'unassigned'} onValueChange={(v) => reassign(a.id, v === 'unassigned' ? null : v)} disabled={busyId === a.id}>
                          <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {staff.map(s => <SelectItem key={s.id} value={s.id}>{staffLabel(s)}{s.id === myUserId ? ' (me)' : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label htmlFor="drawer-due" className="text-xs font-medium text-gray-700">Due</label>
                        <Input id="drawer-due" type="datetime-local" defaultValue={dueLocal} key={a.id + dueLocal} className="h-10 mt-1"
                          onBlur={e => { if (e.target.value !== dueLocal) setDue(a.id, e.target.value); }} />
                      </div>
                    </div>
                  )}

                  {a.task_status && (
                    <div className="flex flex-wrap gap-2">
                      {a.task_status === 'open' && <Button size="sm" variant="outline" className="h-10 text-xs gap-1" disabled={busyId === a.id} onClick={() => updateTaskStatus(a.id, 'in_progress')}><ArrowRight className="h-3.5 w-3.5" /> Start working</Button>}
                      {isOpenStatus(a.task_status) && <Button size="sm" className="h-10 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busyId === a.id} onClick={() => updateTaskStatus(a.id, 'done')}><CheckCircle2 className="h-3.5 w-3.5" /> Mark done</Button>}
                      {isOpenStatus(a.task_status) && <Button size="sm" variant="ghost" className="h-10 text-xs gap-1 text-gray-500" disabled={busyId === a.id} onClick={() => updateTaskStatus(a.id, 'cancelled')}><XCircle className="h-3.5 w-3.5" /> Cancel task</Button>}
                      {!isOpenStatus(a.task_status) && <Button size="sm" variant="outline" className="h-10 text-xs gap-1" disabled={busyId === a.id} onClick={() => updateTaskStatus(a.id, 'open')}><RotateCcw className="h-3.5 w-3.5" /> Reopen</Button>}
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">Thread · {thread.length}</p>
                    {thread.length === 0 ? (
                      <p className="text-xs text-gray-400">No updates yet. Every status change and reply lands here.</p>
                    ) : (
                      <div className="space-y-2 border-l-2 border-gray-200 pl-3">
                        {thread.map(r => {
                          const rc = typeCfg(r.activity_type);
                          const RIcon = rc.icon;
                          return (
                            <div key={r.id} className="flex items-start gap-2 text-xs">
                              <CornerDownRight className="h-3.5 w-3.5 text-gray-300 mt-0.5 flex-shrink-0" aria-hidden="true" />
                              <RIcon className="h-3.5 w-3.5 text-gray-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                              <div className="min-w-0 flex-1">
                                <div className={cn('text-gray-800 whitespace-pre-wrap', r.activity_type === 'system' && 'text-gray-500 italic')}>{r.description}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">{r.created_by_name || 'System'} · {format(new Date(r.created_at), 'MMM d, h:mm a')}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="sticky bottom-0 bg-white border-t p-3 sm:p-4">
                  <label htmlFor="drawer-reply" className="sr-only">Add an update</label>
                  <div className="flex gap-2">
                    <Textarea id="drawer-reply" value={replyText} onChange={e => setReplyText(e.target.value)} rows={2} className="text-sm"
                      placeholder="What did you do? (saved to the thread)"
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply(a.id); }} />
                    <Button className="h-auto self-stretch bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={() => submitReply(a.id)} disabled={replyBusy || !replyText.trim()} aria-label="Send update">
                      {replyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default NotesTab;
