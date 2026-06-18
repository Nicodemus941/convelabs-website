import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Users, RefreshCw, Loader2 } from 'lucide-react';

/**
 * StaffActivityCard — "is the team actually working?" at a glance.
 *
 * Reads get_staff_activity_summary() (admin-gated RPC): per staff member,
 * last login, last logged note, total/7-day note counts, and org edits in the
 * last 30 days (now that organizations carry an audit trail via
 * org_change_log). Colors a staleness signal so the owner can spot anyone who
 * has gone quiet without reading the whole feed.
 */

interface StaffRow {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  last_sign_in_at: string | null;
  days_since_login: number | null;
  last_note_at: string | null;
  notes_total: number;
  notes_7d: number;
  org_edits_30d: number;
  last_org_edit_at: string | null;
}

function ago(d: string | null): string {
  if (!d) return 'never';
  const ms = Date.now() - new Date(d).getTime();
  const days = ms / 86_400_000;
  if (days < 1) {
    const h = Math.floor(days * 24);
    return h <= 0 ? 'just now' : `${h}h ago`;
  }
  return `${Math.floor(days)}d ago`;
}

// Staleness tone keyed off days since last login (or last activity).
function tone(days: number | null): string {
  if (days == null) return 'text-gray-400';
  if (days <= 2) return 'text-emerald-700';
  if (days <= 5) return 'text-amber-600';
  return 'text-red-600 font-semibold';
}

const StaffActivityCard: React.FC = () => {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc('get_staff_activity_summary' as any);
      if (error) throw error;
      // Hide never-logged-in placeholder accounts (owner@, seed admins) — keep
      // anyone who has actually signed in or logged a note.
      const real = ((data as StaffRow[]) || []).filter(r => r.last_sign_in_at || r.notes_total > 0);
      setRows(real);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load staff activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card className="shadow-sm border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm flex items-center gap-1.5">
            <Users className="h-4 w-4 text-[#B91C1C]" /> Staff activity
            <span className="text-[11px] font-normal text-gray-500">· logins, notes &amp; org edits</span>
          </h2>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {err ? (
          <p className="text-xs text-red-600">{err}</p>
        ) : loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No staff accounts found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-500 border-b">
                  <th className="text-left py-1.5 pr-2">Staff</th>
                  <th className="text-left px-2">Last login</th>
                  <th className="text-left px-2">Last note</th>
                  <th className="text-right px-2">Notes (7d / total)</th>
                  <th className="text-right pl-2">Org edits (30d)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <div className="font-medium text-gray-900 truncate max-w-[160px]">{r.full_name}</div>
                      <div className="text-[10px] text-gray-500">{r.role.replace('_', ' ')}</div>
                    </td>
                    <td className={`px-2 ${tone(r.days_since_login)}`}>{ago(r.last_sign_in_at)}</td>
                    <td className={`px-2 ${tone(r.last_note_at ? (Date.now() - new Date(r.last_note_at).getTime()) / 86_400_000 : null)}`}>
                      {ago(r.last_note_at)}
                    </td>
                    <td className="px-2 text-right tabular-nums">
                      <span className={r.notes_7d > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-400'}>{r.notes_7d}</span>
                      <span className="text-gray-400"> / {r.notes_total}</span>
                    </td>
                    <td className="pl-2 text-right tabular-nums">
                      <span className={r.org_edits_30d > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-400'}>{r.org_edits_30d}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 mt-2">
              Green = active in last 2 days · amber = 3–5 days · red = 6+ days quiet. Org-edit tracking began {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StaffActivityCard;
