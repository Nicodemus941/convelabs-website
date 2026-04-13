import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import {
  FileText, Search, RefreshCw, Plus, Phone, Mail, Calendar,
  AlertTriangle, XCircle, ClipboardList, MessageSquare, Clock,
  User, Send, Download,
} from 'lucide-react';
import { toast } from 'sonner';

const ACTIVITY_TYPES = [
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

interface ActivityEntry {
  id: string;
  activity_type: string;
  description: string;
  patient_id: string | null;
  appointment_id: string | null;
  created_by_name: string;
  created_at: string;
  metadata: any;
}

const NotesTab: React.FC = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddNote, setShowAddNote] = useState(false);

  // New note form
  const [noteType, setNoteType] = useState('note');
  const [noteDescription, setNoteDescription] = useState('');
  const [notePatientSearch, setNotePatientSearch] = useState('');
  const [notePatientId, setNotePatientId] = useState<string | null>(null);
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setActivities((data as ActivityEntry[]) || []);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // Patient search for note creation
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
      const { error } = await supabase.from('activity_log' as any).insert({
        activity_type: noteType,
        description: noteDescription.trim(),
        patient_id: notePatientId,
        created_by_name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Staff',
        staff_id: user?.id,
      });
      if (error) throw error;
      toast.success('Note added');
      setNoteDescription('');
      setNotePatientSearch('');
      setNotePatientId(null);
      setShowAddNote(false);
      fetchActivities();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add note');
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = activities.filter(a => {
    if (filterType !== 'all' && a.activity_type !== filterType) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return a.description.toLowerCase().includes(q) || (a.created_by_name && a.created_by_name.toLowerCase().includes(q));
  });

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Description', 'By'];
    const rows = filtered.map(a => [
      a.created_at ? format(new Date(a.created_at), 'MMM d yyyy h:mm a') : '',
      a.activity_type, a.description, a.created_by_name || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `convelabs-activity-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-[#B91C1C]" /> Activity Log & Notes
          </h1>
          <p className="text-sm text-muted-foreground">{activities.length} entries</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={() => setShowAddNote(!showAddNote)}>
            <Plus className="h-4 w-4" /> Add Note
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1"><Download className="h-4 w-4" /> Export</Button>
          <Button variant="outline" size="sm" onClick={fetchActivities} className="gap-1"><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      {/* Add Note Form */}
      {showAddNote && (
        <Card className="shadow-sm border-[#B91C1C]/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Activity Type</label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <label className="text-xs font-medium">Patient (optional)</label>
                <Input
                  value={notePatientSearch}
                  onChange={e => { setNotePatientSearch(e.target.value); setNotePatientId(null); }}
                  placeholder="Search patient..."
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
              <Textarea value={noteDescription} onChange={e => setNoteDescription(e.target.value)} placeholder="Describe the activity..." rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddNote(false)}>Cancel</Button>
              <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={handleAddNote} disabled={isSaving}>
                <Send className="h-3.5 w-3.5" /> Save Note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={filterType === 'all' ? 'default' : 'outline'}
            className={`text-xs h-7 ${filterType === 'all' ? 'bg-[#B91C1C]' : ''}`}
            onClick={() => setFilterType('all')}>All</Button>
          {ACTIVITY_TYPES.slice(0, 6).map(t => (
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
              <p className="font-semibold">No activity logs yet</p>
              <p className="text-sm text-muted-foreground">Notes and activities will appear here. Click "Add Note" to create one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(activity => {
                const typeCfg = ACTIVITY_TYPES.find(t => t.value === activity.activity_type) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
                const Icon = typeCfg.icon;
                return (
                  <div key={activity.id} className="flex gap-3 p-3 rounded-lg border hover:bg-muted/20 transition">
                    <div className={`w-9 h-9 rounded-lg ${typeCfg.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${typeCfg.color}`}>{typeCfg.label}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {activity.created_at ? format(new Date(activity.created_at), 'MMM d, h:mm a') : ''}
                        </span>
                        <span className="text-[10px] text-muted-foreground">by {activity.created_by_name || 'System'}</span>
                      </div>
                      <p className="text-sm mt-1">{activity.description}</p>
                    </div>
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
