import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Pin, PinOff, Plus, Search, FileText, Loader2,
  Phone, AlertCircle, Sparkles, Bell, Pencil, Trash2, X,
} from 'lucide-react';

/**
 * OrgNotesTab — admin journal for an organization.
 *
 * Replaces the single `notes` textarea on organizations. Gives admins a
 * proper timeline of individual notes with:
 *  - Categories (contact_log / issue / opportunity / reminder) w/ icons + colors
 *  - Pinning (pinned notes sort to top, amber stripe)
 *  - Author attribution ("Added by Nico · 2d ago")
 *  - Inline search + category filter
 *  - Add / edit / delete
 *
 * Hormozi rule: every important conversation should leave a trace that
 * survives vacations and turnover.
 */

interface OrgNote {
  id: string;
  organization_id: string;
  title: string | null;
  body: string;
  category: 'contact_log' | 'issue' | 'opportunity' | 'reminder';
  pinned: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_META: Record<OrgNote['category'], { label: string; Icon: any; color: string; bg: string; border: string }> = {
  contact_log: { label: 'Contact log', Icon: Phone, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' },
  issue:       { label: 'Issue',       Icon: AlertCircle, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  opportunity: { label: 'Opportunity', Icon: Sparkles, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  reminder:    { label: 'Reminder',    Icon: Bell, color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200' },
};

interface Props {
  orgId: string;
}

type Filter = 'all' | OrgNote['category'];

const OrgNotesTab: React.FC<Props> = ({ orgId }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<OrgNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<OrgNote | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organization_notes')
        .select('*')
        .eq('organization_id', orgId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotes((data || []) as OrgNote[]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const togglePin = async (n: OrgNote) => {
    try {
      await supabase.from('organization_notes').update({ pinned: !n.pinned }).eq('id', n.id);
      await load();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
  };

  const del = async (n: OrgNote) => {
    if (!confirm('Delete this note?')) return;
    try {
      await supabase.from('organization_notes').delete().eq('id', n.id);
      toast.success('Note deleted');
      await load();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
  };

  const filtered = notes.filter(n => {
    if (filter !== 'all' && n.category !== filter) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (n.title || '').toLowerCase().includes(s) || (n.body || '').toLowerCase().includes(s);
  });

  const counts = {
    all: notes.length,
    contact_log: notes.filter(n => n.category === 'contact_log').length,
    issue: notes.filter(n => n.category === 'issue').length,
    opportunity: notes.filter(n => n.category === 'opportunity').length,
    reminder: notes.filter(n => n.category === 'reminder').length,
  };

  const Chip: React.FC<{ v: Filter; label: string; n: number; cat?: OrgNote['category'] }> = ({ v, label, n, cat }) => {
    const selected = filter === v;
    const meta = cat ? CATEGORY_META[cat] : null;
    return (
      <button
        type="button"
        onClick={() => setFilter(v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
          selected
            ? 'bg-gray-900 text-white border-gray-900'
            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
        }`}
      >
        {meta && <meta.Icon className="h-3 w-3" />}
        {label}
        <span className={`px-1.5 rounded-full text-[10px] ${selected ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{n}</span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header row: search + add */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            className="pl-9 h-10"
          />
        </div>
        <Button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          size="sm"
          className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 px-4 flex-shrink-0"
        >
          <Plus className="h-4 w-4" /> Add note
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        <Chip v="all" label="All" n={counts.all} />
        <Chip v="contact_log" label="Contact log" n={counts.contact_log} cat="contact_log" />
        <Chip v="opportunity" label="Opportunity" n={counts.opportunity} cat="opportunity" />
        <Chip v="issue" label="Issue" n={counts.issue} cat="issue" />
        <Chip v="reminder" label="Reminder" n={counts.reminder} cat="reminder" />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1].map(i => (
            <div key={i} className="bg-white border rounded-lg p-4 animate-pulse">
              <div className="h-4 w-48 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-10 text-center">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {q ? `No notes match "${q}"` : 'No notes yet. Add one to start the journal.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const meta = CATEGORY_META[n.category];
            const Icon = meta.Icon;
            return (
              <div
                key={n.id}
                className={`border rounded-lg p-4 transition hover:shadow-sm ${n.pinned ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className={`${meta.bg} ${meta.border} border w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {n.title && <p className="text-sm font-semibold text-gray-900">{n.title}</p>}
                        <Badge variant="outline" className={`text-[10px] ${meta.bg} ${meta.color} border-0`}>
                          {meta.label}
                        </Badge>
                        {n.pinned && (
                          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                            <Pin className="h-2.5 w-2.5 mr-0.5" /> Pinned
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {n.created_by_name || 'Admin'} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        {n.updated_at !== n.created_at && <> · edited</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => togglePin(n)}
                      className="h-7 w-7 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-amber-600 transition"
                      title={n.pinned ? 'Unpin' : 'Pin'}
                    >
                      {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(n); setModalOpen(true); }}
                      className="h-7 w-7 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 transition"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => del(n)}
                      className="h-7 w-7 rounded-md hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-600 transition"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ml-10">{n.body}</p>
              </div>
            );
          })}
        </div>
      )}

      <NoteModal
        open={modalOpen}
        onOpenChange={(v) => { setModalOpen(v); if (!v) setEditing(null); }}
        orgId={orgId}
        editing={editing}
        user={user}
        onSaved={() => { setModalOpen(false); setEditing(null); load(); }}
      />
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
// Add / Edit note modal
// ──────────────────────────────────────────────────────────────
const NoteModal: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  editing: OrgNote | null;
  user: any;
  onSaved: () => void;
}> = ({ open, onOpenChange, orgId, editing, user, onSaved }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<OrgNote['category']>('contact_log');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(editing?.title || '');
      setBody(editing?.body || '');
      setCategory(editing?.category || 'contact_log');
      setPinned(editing?.pinned || false);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!body.trim()) { toast.error('Note body is required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        title: title.trim() || null,
        body: body.trim(),
        category,
        pinned,
      };
      if (editing) {
        const { error } = await supabase.from('organization_notes').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Note updated');
      } else {
        const { error } = await supabase.from('organization_notes').insert({
          ...payload,
          organization_id: orgId,
          created_by: user?.id || null,
          created_by_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin',
        });
        if (error) throw error;
        toast.success('Note added');
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit note' : 'Add note'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs font-semibold">Category</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {(['contact_log', 'opportunity', 'issue', 'reminder'] as const).map(c => {
                const meta = CATEGORY_META[c];
                const Icon = meta.Icon;
                const selected = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`border rounded-md px-3 py-2 flex items-center gap-2 text-sm transition ${
                      selected ? `${meta.bg} ${meta.border} ${meta.color} font-semibold` : 'border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Title <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} className="mt-1" placeholder="Short headline for this note" />
          </div>

          <div>
            <Label className="text-xs font-semibold">Note *</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              disabled={saving}
              autoFocus={!editing}
              className="mt-1"
              placeholder="What happened? What's the follow-up?"
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              disabled={saving}
              className="h-4 w-4 rounded"
            />
            <Pin className="h-3.5 w-3.5 text-amber-600" />
            Pin this note to the top
          </label>
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white w-full sm:w-auto">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving…</> : editing ? 'Save changes' : 'Add note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrgNotesTab;
