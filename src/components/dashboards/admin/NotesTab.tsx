import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import {
  FileText, Search, RefreshCw, Plus, Phone, Mail, Calendar,
  AlertTriangle, XCircle, ClipboardList, MessageSquare, Clock,
  Send, Download, CheckCircle2, Loader2, ArrowRight, Reply,
  CornerDownRight, UserCheck, Flag,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * NotesTab — Hormozi-graded activity log + task assignment workspace.
 *
 *   • Owner creates a "task" by adding a note + selecting an assignee.
 *   • Assignee sees it live (Supabase realtime channel on activity_log
 *     INSERT/UPDATE) and gets a one-tap "Mark in progress / Mark done"
 *     button.
 *   • Every activity threads under its parent task via parent_id, so
 *     every action on a task is visible in one place — required by
 *     the "she adds notes for every activity performed" workflow.
 *   • A "My Tasks" tab is the default view for any user with open
 *     tasks; "Activity Feed" is the firehose view of everything.
 */

const ACTIVITY_TYPES = [
  { value: 'task', label: 'Task', icon: Flag, color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'call', label: 'Phone Call', icon: Phone, color: 'bg-blue-50 text-blue-700' },
  { value: 'sms', label: 'SMS Sent', icon: MessageSquare, color: 'bg-emerald-50 text-emerald-700' },
  { value: 'email', label: 'Email Sent', icon: Mail, color: 'bg-purple-50 text-purple-700' },
  { value: 'voicemail', label: 'Left Voicemail', icon: Phone, color: 'bg-amber-50 text-amber-700' },
  { value: 'contact_attempt', label: 'Contact Attempt', icon: Phone, color: 'bg-orange-50 text-orange-700' },
  { value: 'specimen_request', label: 'Specimen Request', icon: ClipboardList, color: 'bg-teal-50 text-teal-700' },
  { value: 'lab_order_missing', label: 'Lab Order Not Received', icon: AlertTriangle, color: 'bg-red-50 text-red-700' },
  { value: 'cancellation', label: 'Appointment Cancelled', icon: XCircle, color: 'bg-red-50 text-red-700' },
  { value: 'reschedule', label: 'Appointment Rescheduled', icon: Calendar, color: 'bg-indigo-50 text-indigo-700' },
  { value: 'system', label: 'System Event', icon: Clock, color: 'bg-gray-50 text-gray-600' },
  { value: 'note', label: 'General Note', icon: FileText, color: 'bg-gray-50 text-gray-700' },
];

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'bg-red-600 text-white border-red-600',
  normal: 'bg-amber-100 text-amber-800 border-amber-200',
  low:    'bg-gray-100 text-gray-700 border-gray-200',
};

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
  task_status: 'open' | 'in_progress' | 'done' | 'cancelled' | null;
  task_priority: 'low' | 'normal' | 'urgent' | null;
  task_due_at: string | null;
  task_completed_at: string | null;
}

interface AssigneeUser {
  id: string;
  email: string;
  full_name: string | null;
}

const NotesTab: React.FC = () => {
  const { user } = useAuth();
  const myUserId = user?.id;

  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [assignees, setAssignees] = useState<AssigneeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [view, setView] = useState<'my_tasks' | 'all_tasks' | 'feed'>('my_tasks');
  const [showAddNote, setShowAddNote] = useState(false);

  // Add-note form state
  const [noteType, setNoteType] = useState('task');
  const [noteDescription, setNoteDescription] = useState('');
  const [notePatientSearch, setNotePatientSearch] = useState('');
  const [notePatientId, setNotePatientId] = useState<string | null>(null);
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [assignTo, setAssignTo] = useState<string>('unassigned');
  const [priority, setPriority] = useState<'low' | 'normal' | 'urgent'>('normal');
  const [dueAt, setDueAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Per-thread reply boxes (keyed by parent task id)
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const myDisplayName = useMemo(
    () => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Staff',
    [user]
  );

  // Initial fetch — pull a wider window so threads + their parents resolve
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(400);
      if (error) throw error;
      setActivities((data as unknown as ActivityEntry[]) || []);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load assignable staff (admins + office_managers + super_admins)
  const fetchAssignees = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_assignable_staff' as any);
      if (!error && Array.isArray(data) && data.length > 0) {
        setAssignees(data as any);
        return;
      }
      // Fallback: read user_roles directly
      const { data: rows } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['super_admin', 'admin', 'office_manager', 'owner']);
      const ids = Array.from(new Set((rows || []).map((r: any) => r.user_id)));
      if (ids.length === 0) { setAssignees([]); return; }
      const { data: profiles } = await supabase
        .from('staff_profiles' as any)
        .select('user_id, email, first_name, last_name')
        .in('user_id', ids);
      const list: AssigneeUser[] = (profiles || []).map((p: any) => ({
        id: p.user_id,
        email: p.email || '',
        full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
      }));
      setAssignees(list);
    } catch (e) {
      console.warn('[notes-tab] assignee load failed:', e);
      setAssignees([]);
    }
  }, []);

  useEffect(() => { fetchActivities(); fetchAssignees(); }, [fetchActivities, fetchAssignees]);

  // Realtime subscription — new tasks/notes appear without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel('activity_log_realtime')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload: any) => {
          const row = payload.new as ActivityEntry;
          setActivities(prev => [row, ...prev.filter(a => a.id !== row.id)]);
          if (row.assigned_to_user_id === myUserId && row.task_status === 'open') {
            toast.info(`📋 New task assigned to you: ${row.description.slice(0, 80)}`);
          }
        }
      )
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'activity_log' },
        (payload: any) => {
          const row = payload.new as ActivityEntry;
          setActivities(prev => prev.map(a => a.id === row.id ? row : a));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myUserId]);

  // Patient search for the new-note form
  useEffect(() => {
    if (notePatientSearch.length < 2) { setPatientResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.%${notePatientSearch}%,last_name.ilike.%${notePatientSearch}%`)
        .limit(5);
      setPatientResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [notePatientSearch]);

  const handleAddNote = async () => {
    if (!noteDescription.trim()) { toast.error('Description is required'); return; }
    setIsSaving(true);
    try {
      const isTask = noteType === 'task' || assignTo !== 'unassigned';
      const payload: any = {
        activity_type: noteType,
        description: noteDescription.trim(),
        patient_id: notePatientId,
        created_by_name: myDisplayName,
        staff_id: myUserId,
        assigned_to_user_id: assignTo !== 'unassigned' ? assignTo : null,
        task_status: isTask ? 'open' : null,
        task_priority: isTask ? priority : null,
        task_due_at: isTask && dueAt ? new Date(dueAt).toISOString() : null,
      };
      const { error } = await supabase.from('activity_log' as any).insert(payload);
      if (error) throw error;
      toast.success(isTask ? 'Task created' : 'Note added');
      setNoteDescription('');
      setNotePatientSearch('');
      setNotePatientId(null);
      setAssignTo('unassigned');
      setPriority('normal');
      setDueAt('');
      setNoteType('task');
      setShowAddNote(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add note');
    } finally {
      setIsSaving(false);
    }
  };

  const updateTaskStatus = async (id: string, status: 'open' | 'in_progress' | 'done' | 'cancelled') => {
    try {
      const patch: any = { task_status: status };
      if (status === 'done') {
        patch.task_completed_at = new Date().toISOString();
        patch.task_completed_by = myUserId;
      }
      const { error } = await supabase.from('activity_log' as any).update(patch).eq('id', id);
      if (error) throw error;

      // Auto-add a system thread reply so the audit trail is complete.
      await supabase.from('activity_log' as any).insert({
        activity_type: 'system',
        description: `Task marked ${status} by ${myDisplayName}`,
        parent_id: id,
        staff_id: myUserId,
        created_by_name: myDisplayName,
      });
      toast.success(`Marked ${status}`);
    } catch (e: any) {
      toast.error(e.message || 'Status update failed');
    }
  };

  const submitReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    setReplyBusy(true);
    try {
      const { error } = await supabase.from('activity_log' as any).insert({
        activity_type: 'note',
        description: replyText.trim(),
        parent_id: parentId,
        staff_id: myUserId,
        created_by_name: myDisplayName,
      });
      if (error) throw error;
      setReplyText('');
      setReplyTarget(null);
      toast.success('Reply added');
    } catch (e: any) {
      toast.error(e.message || 'Reply failed');
    } finally {
      setReplyBusy(false);
    }
  };

  // Build threaded view — group replies under their parents.
  const threadsByParent = useMemo(() => {
    const m = new Map<string, ActivityEntry[]>();
    for (const a of activities) {
      if (a.parent_id) {
        const arr = m.get(a.parent_id) || [];
        arr.push(a);
        m.set(a.parent_id, arr);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return m;
  }, [activities]);

  // Tabbed filtering
  const filtered = useMemo(() => {
    return activities.filter(a => {
      if (a.parent_id) return false; // replies render inside their parent
      if (view === 'my_tasks') {
        if (a.assigned_to_user_id !== myUserId) return false;
        if (!a.task_status || a.task_status === 'done' || a.task_status === 'cancelled') return false;
      } else if (view === 'all_tasks') {
        if (!a.task_status) return false;
      }
      if (filterType !== 'all' && a.activity_type !== filterType) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        a.description.toLowerCase().includes(q) ||
        (a.created_by_name && a.created_by_name.toLowerCase().includes(q))
      );
    });
  }, [activities, view, filterType, searchQuery, myUserId]);

  const myOpenCount = useMemo(
    () => activities.filter(a =>
      a.assigned_to_user_id === myUserId &&
      (a.task_status === 'open' || a.task_status === 'in_progress')
    ).length,
    [activities, myUserId]
  );

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Status', 'Priority', 'Due', 'Description', 'By', 'Assigned'];
    const rows = filtered.map(a => [
      a.created_at ? format(new Date(a.created_at), 'MMM d yyyy h:mm a') : '',
      a.activity_type,
      a.task_status || '',
      a.task_priority || '',
      a.task_due_at ? format(new Date(a.task_due_at), 'MMM d yyyy h:mm a') : '',
      a.description,
      a.created_by_name || '',
      a.assigned_to_user_id || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `convelabs-activity-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const renderThread = (thread: ActivityEntry[]) => (
    <div className="mt-2 ml-12 space-y-1.5 border-l-2 border-gray-200 pl-3">
      {thread.map(r => {
        const cfg = ACTIVITY_TYPES.find(t => t.value === r.activity_type) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
        const Icon = cfg.icon;
        return (
          <div key={r.id} className="flex items-start gap-2 text-xs">
            <CornerDownRight className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
            <Icon className="h-3.5 w-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-gray-700">{r.description}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {r.created_by_name || 'System'} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-[#B91C1C]" /> Activity Log &amp; Tasks
          </h1>
          <p className="text-sm text-muted-foreground">
            {activities.length} entries
            {myOpenCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-700 font-semibold">
                · {myOpenCount} open task{myOpenCount === 1 ? '' : 's'} for you
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={() => setShowAddNote(!showAddNote)}>
            <Plus className="h-4 w-4" /> {noteType === 'task' ? 'New Task' : 'Add Note'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1"><Download className="h-4 w-4" /> Export</Button>
          <Button variant="outline" size="sm" onClick={fetchActivities} className="gap-1"><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'my_tasks', label: `My Tasks${myOpenCount > 0 ? ` (${myOpenCount})` : ''}` },
          { key: 'all_tasks', label: 'All Tasks' },
          { key: 'feed', label: 'Activity Feed' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key as any)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
              view === tab.key ? 'border-[#B91C1C] text-[#B91C1C]' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Add Note / Task form */}
      {showAddNote && (
        <Card className="shadow-sm border-[#B91C1C]/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Type</label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Assign to</label>
                <Select value={assignTo} onValueChange={setAssignTo}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned (just a note)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned (just a note)</SelectItem>
                    {assignees.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name || a.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Priority</label>
                <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Due (optional)</label>
                <Input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="h-9" />
              </div>
              <div className="relative sm:col-span-2">
                <label className="text-xs font-medium">Patient (optional)</label>
                <Input
                  value={notePatientSearch}
                  onChange={e => { setNotePatientSearch(e.target.value); setNotePatientId(null); }}
                  placeholder="Search patient by name..."
                  className="h-9"
                />
                {patientResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                    {patientResults.map((p: any) => (
                      <button key={p.id} className="w-full text-left px-3 py-1.5 hover:bg-muted/50 text-sm"
                        onClick={() => { setNotePatientId(p.id); setNotePatientSearch(`${p.first_name} ${p.last_name}`); setPatientResults([]); }}>
                        {p.first_name} {p.last_name} <span className="text-xs text-muted-foreground">{p.email || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Description *</label>
              <Textarea value={noteDescription} onChange={e => setNoteDescription(e.target.value)} placeholder="What needs to happen? Be specific so the assignee knows exactly what to do." rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddNote(false)}>Cancel</Button>
              <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={handleAddNote} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {assignTo === 'unassigned' && noteType !== 'task' ? 'Save Note' : 'Send Task'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters (type + search) */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={filterType === 'all' ? 'default' : 'outline'}
            className={`text-xs h-7 ${filterType === 'all' ? 'bg-[#B91C1C]' : ''}`}
            onClick={() => setFilterType('all')}>All</Button>
          {ACTIVITY_TYPES.slice(0, 7).map(t => (
            <Button key={t.value} size="sm" variant={filterType === t.value ? 'default' : 'outline'}
              className={`text-xs h-7 ${filterType === t.value ? 'bg-[#B91C1C]' : ''}`}
              onClick={() => setFilterType(t.value)}>{t.label}</Button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="h-4 w-4 absolute left-2.5 top-1.5 text-muted-foreground" />
          <Input placeholder="Search notes..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-7 w-48 text-xs" />
        </div>
      </div>

      {/* Activity Feed */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-muted/50 animate-pulse rounded" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold">
                {view === 'my_tasks' ? 'You\'re all caught up' : 'No entries to show'}
              </p>
              <p className="text-sm text-muted-foreground">
                {view === 'my_tasks' ? 'No open tasks assigned to you. Switch tabs to see all tasks or activity feed.' : 'Click "New Task" to assign work, or change filters above.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(activity => {
                const typeCfg = ACTIVITY_TYPES.find(t => t.value === activity.activity_type) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
                const Icon = typeCfg.icon;
                const thread = threadsByParent.get(activity.id) || [];
                const isMineToDo = activity.assigned_to_user_id === myUserId &&
                                   (activity.task_status === 'open' || activity.task_status === 'in_progress');
                const isOverdue = activity.task_due_at && activity.task_status !== 'done' && new Date(activity.task_due_at) < new Date();
                return (
                  <div key={activity.id} className={`p-3 rounded-lg border transition ${
                    isMineToDo ? 'border-red-300 bg-red-50/40 hover:bg-red-50' : 'hover:bg-muted/20'
                  }`}>
                    <div className="flex gap-3">
                      <div className={`w-9 h-9 rounded-lg ${typeCfg.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${typeCfg.color}`}>{typeCfg.label}</Badge>
                          {activity.task_status && (
                            <Badge variant="outline" className={`text-[10px] ${
                              activity.task_status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              activity.task_status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              activity.task_status === 'cancelled' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {activity.task_status === 'in_progress' ? 'In progress' : activity.task_status}
                            </Badge>
                          )}
                          {activity.task_priority && activity.task_status !== 'done' && (
                            <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLOR[activity.task_priority] || ''}`}>
                              {activity.task_priority}
                            </Badge>
                          )}
                          {activity.assigned_to_user_id && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                              <UserCheck className="h-3 w-3" />
                              {assignees.find(a => a.id === activity.assigned_to_user_id)?.full_name ||
                               assignees.find(a => a.id === activity.assigned_to_user_id)?.email ||
                               'assigned'}
                            </span>
                          )}
                          {isOverdue && (
                            <Badge variant="outline" className="text-[10px] bg-red-600 text-white border-red-600">
                              OVERDUE
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {activity.created_at ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }) : ''}
                          </span>
                        </div>
                        <p className="text-sm mt-1.5">{activity.description}</p>
                        <div className="flex flex-wrap gap-1.5 items-center mt-1.5">
                          <span className="text-[10px] text-muted-foreground">
                            by {activity.created_by_name || 'System'}
                          </span>
                          {activity.task_due_at && (
                            <span className={`text-[10px] ${isOverdue ? 'text-red-700 font-semibold' : 'text-muted-foreground'}`}>
                              · due {format(new Date(activity.task_due_at), 'MMM d, h:mm a')}
                            </span>
                          )}
                        </div>

                        {/* Action row — task status + reply */}
                        {(activity.task_status || isMineToDo) && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {isMineToDo && activity.task_status === 'open' && (
                              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                                onClick={() => updateTaskStatus(activity.id, 'in_progress')}>
                                <ArrowRight className="h-3 w-3" /> Start working
                              </Button>
                            )}
                            {isMineToDo && (
                              <Button size="sm" className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => updateTaskStatus(activity.id, 'done')}>
                                <CheckCircle2 className="h-3 w-3" /> Mark done
                              </Button>
                            )}
                            {activity.task_status && activity.task_status !== 'done' && (
                              <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1"
                                onClick={() => setReplyTarget(replyTarget === activity.id ? null : activity.id)}>
                                <Reply className="h-3 w-3" /> Add note
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Inline reply box */}
                        {replyTarget === activity.id && (
                          <div className="mt-2 flex gap-1.5">
                            <Textarea
                              value={replyText}
                              onChange={e => setReplyText(e.target.value)}
                              placeholder="What did you do? (auto-saved to the task thread)"
                              rows={2}
                              className="text-xs"
                            />
                            <Button size="sm" className="h-9 self-start gap-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                              onClick={() => submitReply(activity.id)} disabled={replyBusy || !replyText.trim()}>
                              {replyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    {thread.length > 0 && renderThread(thread)}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotesTab;
