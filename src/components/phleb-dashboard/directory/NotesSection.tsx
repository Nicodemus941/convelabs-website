import React, { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Search, Plus, Pin, PinOff, Pencil, Trash2, Loader2, Heart, User, Stethoscope, Map } from 'lucide-react';

/**
 * NotesSection — patient-continuity notes.
 *
 * Scope: all patients the phleb has ever served. Phlebs can add/edit/pin/
 * delete notes. All staff (other phlebs + admin) can read them too so the
 * next visit benefits from this one.
 *
 * Categories:
 *   patient_prefs — "left arm only", "prefers quiet", "needs blood reminder"
 *   medical       — "narrow vein on right", "hx of vasovagal"
 *   logistics     — "gate code on back porch", "dog barks — honk twice"
 *   other         — catch-all
 */

interface Patient {
  patient_name: string;
  patient_id: string | null;
  visit_count: number;
}

interface Note {
  id: string;
  patient_id: string;
  body: string;
  category: 'patient_prefs' | 'medical' | 'logistics' | 'other';
  pinned: boolean;
  author_name: string | null;
  author_role: string | null;
  created_at: string;
  updated_at: string;
}

const CATS = [
  { k: 'patient_prefs', label: 'Prefs', Icon: Heart, bg: 'bg-rose-50', border: 'border-rose-200', color: 'text-rose-700' },
  { k: 'medical', label: 'Medical', Icon: Stethoscope, bg: 'bg-red-50', border: 'border-red-200', color: 'text-red-700' },
  { k: 'logistics', label: 'Logistics', Icon: Map, bg: 'bg-amber-50', border: 'border-amber-200', color: 'text-amber-700' },
  { k: 'other', label: 'Other', Icon: User, bg: 'bg-gray-50', border: 'border-gray-200', color: 'text-gray-700' },
] as const;

type Cat = typeof CATS[number]['k'];

const NotesSection: React.FC = () => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [q, setQ] = useState('');
  const [activePatient, setActivePatient] = useState<Patient | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('get_phleb_served_patients' as any);
        const rows = (data || []).filter((p: any) => p.patient_id) as Patient[];
        setPatients(rows);
      } finally { setLoadingPatients(false); }
    })();
  }, []);

  const filtered = patients.filter((p) => !q.trim() || p.patient_name.toLowerCase().includes(q.trim().toLowerCase()));

  if (activePatient) {
    return <PatientNotesDetail patient={activePatient} onBack={() => setActivePatient(null)} userId={user?.id} userName={user?.user_metadata?.full_name || user?.email?.split('@')[0]} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 leading-relaxed">
        Pick a patient to view or add care notes. Notes stick to the patient — the next phleb on their next visit will see them.
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patients…" className="pl-9 h-10" />
      </div>
      {loadingPatients ? (
        <div className="space-y-2">{[0, 1].map(i => <div key={i} className="bg-white border rounded-lg p-4 animate-pulse h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-10 text-center">
          <p className="text-sm text-gray-500">No patients yet — finish a visit to start tracking their preferences here.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {filtered.map((p) => (
            <button
              key={p.patient_name}
              type="button"
              onClick={() => setActivePatient(p)}
              className="w-full p-3 sm:p-4 text-left hover:bg-gray-50 flex items-center justify-between transition"
            >
              <span className="font-semibold text-sm text-gray-900 truncate">{p.patient_name}</span>
              <span className="text-[11px] text-gray-500 flex-shrink-0">{p.visit_count} visit{p.visit_count === 1 ? '' : 's'} →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PatientNotesDetail: React.FC<{
  patient: Patient;
  onBack: () => void;
  userId?: string;
  userName?: string;
}> = ({ patient, onBack, userId, userName }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Cat>('patient_prefs');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patient.patient_id) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('patient_care_notes')
        .select('*')
        .eq('patient_id', patient.patient_id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      setNotes((data || []) as Note[]);
    } finally { setLoading(false); }
  }, [patient.patient_id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!body.trim() || !patient.patient_id) return;
    setWriting(true);
    try {
      if (editingId) {
        await supabase.from('patient_care_notes').update({ body: body.trim(), category }).eq('id', editingId);
      } else {
        await supabase.from('patient_care_notes').insert({
          patient_id: patient.patient_id,
          body: body.trim(),
          category,
          author_id: userId || null,
          author_name: userName || 'Phleb',
          author_role: 'phlebotomist',
        } as any);
      }
      setBody('');
      setCategory('patient_prefs');
      setEditingId(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save note');
    } finally { setWriting(false); }
  };

  const togglePin = async (n: Note) => {
    await supabase.from('patient_care_notes').update({ pinned: !n.pinned }).eq('id', n.id);
    await load();
  };
  const del = async (n: Note) => {
    if (!confirm('Delete this note?')) return;
    await supabase.from('patient_care_notes').delete().eq('id', n.id);
    await load();
  };
  const startEdit = (n: Note) => { setEditingId(n.id); setBody(n.body); setCategory(n.category); };

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-[#B91C1C] -ml-1">← Back to patients</button>
      <div>
        <h3 className="text-lg font-bold text-gray-900">{patient.patient_name}</h3>
        <p className="text-[11px] text-gray-500">{patient.visit_count} visit{patient.visit_count === 1 ? '' : 's'} with you</p>
      </div>

      {/* Compose */}
      <div className="bg-white border rounded-lg p-3 space-y-2.5">
        <div className="flex gap-1.5 flex-wrap">
          {CATS.map((c) => {
            const sel = category === c.k;
            const Icon = c.Icon;
            return (
              <button
                key={c.k}
                type="button"
                onClick={() => setCategory(c.k)}
                className={`px-2.5 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1 ${
                  sel ? `${c.bg} ${c.border} ${c.color}` : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                <Icon className="h-3 w-3" /> {c.label}
              </button>
            );
          })}
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note — prefs, tricky veins, gate code, anything the next phleb should know…"
          rows={3}
          className="text-sm"
          disabled={writing}
        />
        <div className="flex justify-end gap-2">
          {editingId && (
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setBody(''); }} disabled={writing}>Cancel</Button>
          )}
          <Button size="sm" onClick={save} disabled={writing || !body.trim()} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
            {writing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-0.5" />}
            {editingId ? 'Save changes' : 'Add note'}
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[0, 1].map(i => <div key={i} className="bg-white border rounded-lg p-4 animate-pulse h-20" />)}</div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-4">No notes yet for this patient.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const c = CATS.find(x => x.k === n.category)!;
            const Icon = c.Icon;
            return (
              <div key={n.id} className={`border rounded-lg p-3 ${n.pinned ? 'bg-amber-50/40 border-amber-300' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start gap-2">
                  <div className={`w-7 h-7 rounded-md ${c.bg} ${c.border} border flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${c.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.color} border-0`}>{c.label}</Badge>
                      {n.pinned && <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">📌 Pinned</Badge>}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {n.author_name || 'Staff'} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      {n.updated_at !== n.created_at && <> · edited</>}
                    </p>
                    <p className="text-sm text-gray-800 mt-1.5 whitespace-pre-wrap leading-relaxed">{n.body}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button type="button" onClick={() => togglePin(n)} className="h-7 w-7 rounded hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-amber-600" title={n.pinned ? 'Unpin' : 'Pin'}>
                      {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" onClick={() => startEdit(n)} className="h-7 w-7 rounded hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-900" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => del(n)} className="h-7 w-7 rounded hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-600" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NotesSection;
