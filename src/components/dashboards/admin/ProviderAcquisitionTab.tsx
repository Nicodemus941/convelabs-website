import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search, Users, Mail, Phone, ExternalLink, Send, PauseCircle, XCircle, CheckCircle2, Sparkles, Copy, Building2, Eye, AlertTriangle, Activity, ClipboardList, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Admin Provider Acquisition tab.
 *
 * Surfaces the funnel from every referred-in provider → conversion, and gives
 * admin the research + send-controls needed to run the Hormozi drip manually
 * when needed. The sequence scheduler cron drives automatic sends; this panel
 * covers the human-in-the-loop moments (email research, first-contact call,
 * manual fast-forward, pause, decline).
 */

type Status =
  | 'pending_research' | 'researching' | 'email_found' | 'contacted'
  | 'portal_viewed' | 'portal_activated' | 'converted' | 'unsubscribed' | 'declined';

interface ReferringProvider {
  id: string;
  provider_name: string | null;
  practice_name: string | null;
  practice_phone: string | null;
  practice_email: string | null;
  practice_city: string | null;
  patient_name: string | null;
  patient_email: string | null;
  appointment_id: string | null;
  patient_consent: boolean | null;
  status: Status;
  sequence_step: number | null;
  next_send_at: string | null;
  paused_at: string | null;
  discovered_at: string;
  first_contact_at: string | null;
  portal_activated_at: string | null;
  converted_at: string | null;
  claim_token: string | null;
  // Outreach assignment + audit (2026-05-13 Hormozi outreach ledger)
  assigned_to: string | null;
  last_outreach_at: string | null;
  last_outreach_by: string | null;
  last_outreach_action: string | null;
  next_followup_at: string | null;
}

interface OutreachLogEntry {
  id: string;
  referring_provider_id: string;
  acted_by: string | null;
  acted_by_name: string | null;
  action_type: 'call' | 'voicemail' | 'email_manual' | 'fax' | 'text' | 'visit_in_person' | 'note' | 'research';
  outcome: string | null;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
}

interface WeekStat {
  acted_by: string;
  acted_by_name: string | null;
  total_touches: number;
  calls: number;
  voicemails: number;
  emails_manual: number;
  texts: number;
  research_notes: number;
  providers_reached: number;
}

const ACTION_LABEL: Record<OutreachLogEntry['action_type'], string> = {
  call: '📞 Call',
  voicemail: '🎙️ Voicemail',
  email_manual: '✉️ Manual email',
  fax: '📠 Fax',
  text: '💬 Text',
  visit_in_person: '🚶 In-person',
  note: '📝 Note',
  research: '🔍 Research',
};

const OUTCOME_LABEL: Record<string, string> = {
  reached: 'Reached',
  voicemail_left: 'Left voicemail',
  no_answer: 'No answer',
  busy: 'Busy',
  wrong_number: 'Wrong number',
  gave_email: 'Gave email',
  gave_callback: 'Callback scheduled',
  declined: 'Declined',
  unsubscribed: 'Unsubscribed',
  no_decision: 'No decision yet',
  other: 'Other',
};

const STATUS_ORDER: Status[] = ['pending_research','email_found','contacted','portal_viewed','portal_activated','converted','declined','unsubscribed'];

const STATUS_LABEL: Record<Status, string> = {
  pending_research: 'Needs research',
  researching: 'Researching',
  email_found: 'Email found',
  contacted: 'In sequence',
  portal_viewed: 'Portal viewed',
  portal_activated: 'Portal activated',
  converted: 'Converted',
  unsubscribed: 'Unsubscribed',
  declined: 'Declined',
};

const STATUS_COLOR: Record<Status, string> = {
  pending_research: 'bg-amber-50 text-amber-700 border-amber-200',
  researching: 'bg-amber-50 text-amber-700 border-amber-200',
  email_found: 'bg-blue-50 text-blue-700 border-blue-200',
  contacted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  portal_viewed: 'bg-purple-50 text-purple-700 border-purple-200',
  portal_activated: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unsubscribed: 'bg-gray-50 text-gray-500 border-gray-200',
  declined: 'bg-gray-50 text-gray-500 border-gray-200',
};

const ProviderAcquisitionTab: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReferringProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hormozi outreach ledger (2026-05-13): "log a touch" modal + week stats
  const [logTouchFor, setLogTouchFor] = useState<ReferringProvider | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStat[]>([]);
  const [showQueueOnly, setShowQueueOnly] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('patient_referring_providers')
      .select('*')
      .order('discovered_at', { ascending: false })
      .limit(200);
    setRows((data as any as ReferringProvider[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Load weekly outreach stats (who-did-what this week). Drives the
  // "Naquala's week" / "This week" widget owner uses to see whether
  // admin is actually working the queue.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_outreach_week_stats' as any, {});
      setWeekStats((data as any) || []);
    })();
  }, [rows.length]);

  // Funnel counts
  const funnel = useMemo(() => {
    const counts: Record<string, number> = {
      captured: rows.length,
      email_found: rows.filter(r => !!r.practice_email).length,
      contacted: rows.filter(r => r.sequence_step && r.sequence_step >= 1).length,
      portal_viewed: rows.filter(r => r.status === 'portal_viewed' || r.status === 'portal_activated' || r.status === 'converted').length,
      converted: rows.filter(r => r.status === 'converted').length,
    };
    return counts;
  }, [rows]);

  // Today's queue = rows that need a human touch today.
  // Three signals (any one qualifies):
  //   1. No email on file AND not declined/unsubscribed → research/call needed
  //   2. next_followup_at is past or due today → callback owed
  //   3. last_outreach_at is NULL or > 48h ago AND status !== 'converted' → stale
  // Hormozi: "the operator should know in 1 glance what needs done TODAY."
  const todaysQueue = useMemo(() => {
    const now = Date.now();
    const TWO_DAYS = 48 * 60 * 60 * 1000;
    return rows.filter(r => {
      if (r.paused_at) return false;
      if (r.status === 'converted' || r.status === 'declined' || r.status === 'unsubscribed') return false;
      // Need email
      if (!r.practice_email) return true;
      // Callback due
      if (r.next_followup_at) {
        const fu = new Date(r.next_followup_at).getTime();
        if (fu <= now + 24 * 60 * 60 * 1000) return true;  // today or earlier
      }
      // Stale (no touch in 48h)
      const lastTouch = r.last_outreach_at ? new Date(r.last_outreach_at).getTime() : 0;
      if (now - lastTouch > TWO_DAYS) return true;
      return false;
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const baseRows = showQueueOnly ? todaysQueue : rows;
    return baseRows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [
        r.provider_name, r.practice_name, r.practice_email, r.practice_city,
        r.patient_name, r.patient_email,
      ].filter(Boolean).some(v => (v as string).toLowerCase().includes(q));
    });
  }, [rows, statusFilter, search, showQueueOnly, todaysQueue]);

  const selected = rows.find(r => r.id === selectedId) || null;

  // Actions
  const setEmail = async (id: string, email: string) => {
    const { error } = await supabase.from('patient_referring_providers')
      .update({
        practice_email: email.trim().toLowerCase(),
        status: 'email_found',
        email_found_at: new Date().toISOString(),
        next_send_at: new Date().toISOString(),  // fire E1 (or E3 if no consent) on next cron
      }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Email saved — drip will start on next hourly tick');
    load();
  };

  const fireNow = async (id: string) => {
    const { data, error } = await supabase.functions.invoke('send-provider-outreach', {
      body: { referring_provider_id: id },
    });
    if (error) { toast.error(error.message || 'Send failed'); return; }
    toast.success(`Step ${data?.step || '?'} sent${data?.skipped ? ` (skipped: ${data.skipped})` : ''}`);
    load();
  };

  const pause = async (id: string, paused: boolean) => {
    const { error } = await supabase.from('patient_referring_providers')
      .update({ paused_at: paused ? new Date().toISOString() : null }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(paused ? 'Paused' : 'Resumed');
    load();
  };

  const mark = async (id: string, status: Status) => {
    const patch: any = { status };
    if (status === 'declined' || status === 'unsubscribed') patch.paused_at = new Date().toISOString();
    const { error } = await supabase.from('patient_referring_providers').update(patch).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${STATUS_LABEL[status]}`);
    load();
  };

  const copyClaimUrl = (token: string | null) => {
    if (!token) { toast.error('No claim token yet — send email 1+ first'); return; }
    const url = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Claim URL copied');
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Provider Acquisition</h1>
        <p className="text-sm text-gray-500">Every patient booking is a potential warm provider introduction. The 5-email drip handles sends automatically — use this panel for research, fast-forwarding, and pause/decline.</p>
      </div>

      {/* TODAY'S QUEUE — the single number admin should care about right now.
          Hormozi: "every operator screen should answer ONE question loudest." */}
      <Card className={`shadow-sm border-2 ${todaysQueue.length > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-300 bg-emerald-50/30'}`}>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${todaysQueue.length > 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
              {todaysQueue.length > 0 ? (
                <ClipboardList className="h-6 w-6 text-amber-700" />
              ) : (
                <CheckCircle2 className="h-6 w-6 text-emerald-700" />
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-600">Needs human touch today</p>
              <p className="text-3xl font-bold text-gray-900">
                {todaysQueue.length}
                {todaysQueue.length > 0 ? (
                  <span className="text-sm font-normal text-gray-500 ml-2">{todaysQueue.length === 1 ? 'provider' : 'providers'}</span>
                ) : (
                  <span className="text-sm font-normal text-emerald-700 ml-2">— inbox zero ✓</span>
                )}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                No email · callback due · or no touch in 48h
              </p>
            </div>
          </div>
          {todaysQueue.length > 0 && (
            <Button
              size="sm"
              onClick={() => setShowQueueOnly(v => !v)}
              className={showQueueOnly ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'}
            >
              {showQueueOnly ? '← Show all providers' : `Work the queue (${todaysQueue.length})`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* THIS WEEK — owner-facing productivity feed.
          Per-admin row: calls/voicemails/manual emails/texts/research logged.
          Hormozi: "you can't improve what you don't measure, and the only
          measure that matters is what the operator actually DID this week." */}
      {weekStats.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#B91C1C]" /> This week's outreach by admin
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="space-y-2">
              {weekStats.map(s => (
                <div key={s.acted_by} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.acted_by_name || 'Unknown'}</p>
                    <p className="text-[11px] text-gray-500">{s.providers_reached} {s.providers_reached === 1 ? 'provider' : 'providers'} contacted · {s.total_touches} total touches</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    {s.calls > 0 && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">📞 {s.calls}</Badge>}
                    {s.voicemails > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">🎙️ {s.voicemails}</Badge>}
                    {s.emails_manual > 0 && <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">✉️ {s.emails_manual}</Badge>}
                    {s.texts > 0 && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">💬 {s.texts}</Badge>}
                    {s.research_notes > 0 && <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">🔍 {s.research_notes}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Funnel */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <FunnelTile label="Captured" value={funnel.captured} />
            <FunnelTile label="Email found" value={funnel.email_found} />
            <FunnelTile label="In sequence" value={funnel.contacted} />
            <FunnelTile label="Viewed portal" value={funnel.portal_viewed} />
            <FunnelTile label="Converted" value={funnel.converted} emphasize />
          </div>
          {funnel.captured > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              Conversion rate: <strong>{((funnel.converted / funnel.captured) * 100).toFixed(1)}%</strong> of captured
              {funnel.contacted > 0 && <> · <strong>{((funnel.converted / funnel.contacted) * 100).toFixed(1)}%</strong> of contacted</>}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search provider, practice, city, patient…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="grid md:grid-cols-[1fr_420px] gap-4">
        {/* List */}
        <Card className="shadow-sm">
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-[#B91C1C]" /> {filtered.length} providers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No providers match. When a patient books and names a doctor's office that isn't already with us, they land here.</div>
            ) : (
              <div className="divide-y max-h-[70vh] overflow-y-auto">
                {filtered.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left p-3 hover:bg-gray-50 transition ${selectedId === r.id ? 'bg-red-50/40 border-l-2 border-[#B91C1C]' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {r.practice_name || r.provider_name || '—'}
                          {r.provider_name && r.practice_name && <span className="text-gray-500 font-normal"> · {r.provider_name}</span>}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {r.practice_city && <>{r.practice_city} · </>}
                          Ref'd by {r.patient_name || 'patient'} · {formatDistanceToNow(new Date(r.discovered_at), { addSuffix: true })}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</Badge>
                          {r.paused_at && <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-500 border-gray-200">Paused</Badge>}
                          {r.sequence_step && r.sequence_step > 0 && <span className="text-[10px] text-gray-500">Step {r.sequence_step}/5</span>}
                          {/* SLA / touch-recency badges */}
                          {(() => {
                            const now = Date.now();
                            const lastT = r.last_outreach_at ? new Date(r.last_outreach_at).getTime() : 0;
                            const hoursSince = lastT ? (now - lastT) / 3_600_000 : null;
                            if (r.next_followup_at) {
                              const fu = new Date(r.next_followup_at).getTime();
                              if (fu <= now) return <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">⏰ Callback due</Badge>;
                              if (fu <= now + 24 * 3600 * 1000) return <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">📅 Callback today</Badge>;
                            }
                            if (hoursSince === null) {
                              return <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">No touch yet</Badge>;
                            }
                            if (hoursSince > 48) {
                              return <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">{Math.floor(hoursSince / 24)}d stale</Badge>;
                            }
                            return <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">✓ Touched {Math.round(hoursSince)}h ago</Badge>;
                          })()}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail */}
        <div className="space-y-3">
          {!selected ? (
            <Card className="shadow-sm"><CardContent className="p-8 text-center text-sm text-gray-500">
              Select a provider to see their outreach timeline and actions.
            </CardContent></Card>
          ) : (
            <ProviderDetailPanel
              row={selected}
              onSetEmail={setEmail}
              onFireNow={fireNow}
              onPause={pause}
              onMark={mark}
              onCopyClaim={copyClaimUrl}
              onLogTouch={() => setLogTouchFor(selected)}
            />
          )}
        </div>
      </div>

      {/* LOG-A-TOUCH MODAL — Hormozi outreach ledger. Every call, voicemail,
          manual email, fax, text or in-person visit gets a row. Surfaces
          in the per-provider timeline + the owner's weekly view. */}
      <LogTouchModal
        provider={logTouchFor}
        onClose={() => setLogTouchFor(null)}
        onLogged={() => { setLogTouchFor(null); load(); }}
        actedByName={(user as any)?.firstName ? `${(user as any).firstName} ${(user as any).lastName || ''}`.trim() : (user as any)?.email || 'Admin'}
      />
    </div>
  );
};

const FunnelTile: React.FC<{ label: string; value: number; emphasize?: boolean }> = ({ label, value, emphasize }) => (
  <div className={`rounded-lg p-3 ${emphasize ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'}`}>
    <div className={`text-[10px] font-semibold uppercase tracking-wider ${emphasize ? 'text-emerald-800' : 'text-gray-500'}`}>{label}</div>
    <div className={`text-2xl font-bold mt-0.5 ${emphasize ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</div>
  </div>
);

interface DetailProps {
  row: ReferringProvider;
  onSetEmail: (id: string, email: string) => void;
  onFireNow: (id: string) => void;
  onPause: (id: string, paused: boolean) => void;
  onMark: (id: string, status: Status) => void;
  onCopyClaim: (token: string | null) => void;
  onLogTouch: () => void;
}

const ProviderDetailPanel: React.FC<DetailProps> = ({ row, onSetEmail, onFireNow, onPause, onMark, onCopyClaim, onLogTouch }) => {
  const [emailDraft, setEmailDraft] = useState(row.practice_email || '');
  const [sends, setSends] = useState<any[]>([]);
  // Manual outreach log entries (calls, voicemails, manual emails, etc.)
  // — separate from the automated provider_outreach_sends ledger.
  const [outreachLog, setOutreachLog] = useState<OutreachLogEntry[]>([]);

  useEffect(() => {
    setEmailDraft(row.practice_email || '');
    (async () => {
      const [sendsRes, logRes] = await Promise.all([
        supabase.from('provider_outreach_sends').select('*').eq('referring_provider_id', row.id).order('sent_at', { ascending: false }),
        supabase.from('provider_outreach_log' as any).select('*').eq('referring_provider_id', row.id).order('created_at', { ascending: false }),
      ]);
      setSends((sendsRes.data as any[]) || []);
      setOutreachLog((logRes.data as any) || []);
    })();
  }, [row.id, row.practice_email, row.last_outreach_at]);

  const practiceSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${row.practice_name || row.provider_name || ''} ${row.practice_city || ''} email`)}`;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#B91C1C]" />
          {row.practice_name || row.provider_name || '—'}
        </CardTitle>
        {row.practice_city && <p className="text-xs text-gray-500">{row.practice_city}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Patient context */}
        <div className="bg-gray-50 rounded-lg p-3 text-xs">
          <p className="font-semibold text-gray-900 mb-1">Referred by patient</p>
          <p className="text-gray-700">{row.patient_name || '—'} · {row.patient_email || ''}</p>
          <p className="text-gray-500 mt-1">Consent to notify provider: {row.patient_consent ? '✓ yes' : '— no (emails 1 & 2 skipped)'}</p>
        </div>

        {/* Email research */}
        <div>
          <Label className="text-xs">Practice email</Label>
          <div className="flex gap-2">
            <Input value={emailDraft} onChange={e => setEmailDraft(e.target.value)} placeholder="office@practice.com" className="flex-1" />
            <Button size="sm" onClick={() => onSetEmail(row.id, emailDraft)} disabled={!emailDraft.trim() || emailDraft === row.practice_email} className="bg-[#B91C1C] hover:bg-[#991B1B]">
              Save & start drip
            </Button>
          </div>
          <a href={practiceSearchUrl} target="_blank" rel="noopener" className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1 mt-1">
            <Search className="h-3 w-3" /> Search Google for this practice <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {row.practice_phone && (
          <div className="text-xs">
            <Label className="text-xs">Phone</Label>
            <a href={`tel:${row.practice_phone}`} className="text-gray-900 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {row.practice_phone}</a>
          </div>
        )}

        {/* Manual outreach log (calls / voicemails / manual emails / texts /
            in-person / research) — Hormozi ledger 2026-05-13. Surfaces
            whether admin (Naquala) actually picked up the phone, not just
            whether the automated drip fired. */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-gray-700">Manual touches</p>
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onLogTouch}>
              <ClipboardList className="h-3 w-3" /> Log a touch
            </Button>
          </div>
          {outreachLog.length === 0 ? (
            <p className="text-xs text-gray-500 italic bg-amber-50 border border-amber-200 rounded p-2">
              No human touches logged yet. Click "Log a touch" after each call, voicemail, or manual email so the owner sees the work being done.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {outreachLog.map(t => (
                <li key={t.id} className="text-xs border border-gray-200 rounded-md p-2 bg-white">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{ACTION_LABEL[t.action_type] || t.action_type}</Badge>
                    {t.outcome && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">{OUTCOME_LABEL[t.outcome] || t.outcome}</Badge>}
                    <span className="text-gray-500">{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</span>
                    {t.acted_by_name && <span className="text-gray-700">· {t.acted_by_name}</span>}
                    {t.follow_up_at && (
                      <span className="text-blue-700 inline-flex items-center gap-0.5">
                        <Clock className="h-3 w-3" /> callback {new Date(t.follow_up_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {t.notes && <p className="text-gray-700 mt-1 italic">"{t.notes}"</p>}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Automated send history */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Automated drip timeline</p>
          {sends.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No emails sent yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {sends.map(s => (
                <li key={s.id} className="text-xs border border-gray-200 rounded-md p-2 bg-white">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">Step {s.sequence_step}</Badge>
                    <span className="text-gray-500">{formatDistanceToNow(new Date(s.sent_at), { addSuffix: true })}</span>
                    {s.opened_at && <span className="text-emerald-700 inline-flex items-center gap-0.5"><Eye className="h-3 w-3" /> opened</span>}
                    {s.clicked_at && <span className="text-emerald-700 inline-flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> clicked</span>}
                    {s.replied_at && <span className="text-purple-700">✉ replied</span>}
                    {s.bounced_at && <span className="text-red-600">bounced</span>}
                  </div>
                  <p className="text-gray-700 mt-0.5 truncate">{s.subject}</p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t">
          {row.practice_email && row.sequence_step !== null && row.sequence_step < 5 && (
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => onFireNow(row.id)}>
              <Send className="h-3 w-3" /> Fire step {(row.sequence_step || 0) + 1} now
            </Button>
          )}
          {row.claim_token && (
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => onCopyClaim(row.claim_token)}>
              <Copy className="h-3 w-3" /> Copy claim URL
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => onPause(row.id, !row.paused_at)}>
            <PauseCircle className="h-3 w-3" /> {row.paused_at ? 'Resume' : 'Pause'}
          </Button>
          {row.status !== 'converted' && (
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => onMark(row.id, 'declined')}>
              <XCircle className="h-3 w-3" /> Decline
            </Button>
          )}
          {row.status !== 'converted' && (
            <Button size="sm" className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => onMark(row.id, 'converted')}>
              <Sparkles className="h-3 w-3" /> Mark converted
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────
// LOG-A-TOUCH MODAL
// One source of truth for "what did you actually do for this provider?"
// Every entry stamps last_outreach_at + last_outreach_by on the parent
// row via the trg_outreach_log_stamp_parent trigger, so SLA badges +
// today's queue update without any client work.
// ─────────────────────────────────────────────────────────────────────
const LogTouchModal: React.FC<{
  provider: ReferringProvider | null;
  onClose: () => void;
  onLogged: () => void;
  actedByName: string;
}> = ({ provider, onClose, onLogged, actedByName }) => {
  const { user } = useAuth();
  const [actionType, setActionType] = useState<OutreachLogEntry['action_type']>('call');
  const [outcome, setOutcome] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (provider) {
      setActionType('call');
      setOutcome('');
      setNotes('');
      setFollowUpAt('');
    }
  }, [provider?.id]);

  if (!provider) return null;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('provider_outreach_log' as any).insert({
        referring_provider_id: provider.id,
        acted_by: user?.id || null,
        acted_by_name: actedByName,
        action_type: actionType,
        outcome: outcome || null,
        notes: notes.trim() || null,
        follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null,
      });
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success('Touch logged');
      onLogged();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!provider} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#B91C1C]" /> Log a touch</DialogTitle>
          <DialogDescription>
            Record what you just did for <strong>{provider.practice_name || provider.provider_name}</strong>. Owner sees this on the dashboard so calls + voicemails don't go invisible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Action</Label>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {(['call','voicemail','email_manual','text','fax','visit_in_person','research','note'] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setActionType(a)}
                  className={`text-[11px] px-2 py-2 rounded-md border text-left ${actionType === a ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C] font-semibold' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </div>

          {(actionType === 'call' || actionType === 'voicemail' || actionType === 'email_manual' || actionType === 'text' || actionType === 'visit_in_person') && (
            <div>
              <Label className="text-xs">Outcome</Label>
              <select
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mt-1"
              >
                <option value="">— select —</option>
                <option value="reached">Reached someone</option>
                <option value="voicemail_left">Left voicemail</option>
                <option value="no_answer">No answer</option>
                <option value="busy">Busy</option>
                <option value="wrong_number">Wrong number</option>
                <option value="gave_email">They gave me an email</option>
                <option value="gave_callback">Asked for callback</option>
                <option value="declined">Declined</option>
                <option value="unsubscribed">Unsubscribed</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder='e.g. "Spoke with receptionist Linda. Office manager Sarah is out til Mon, will email me Tuesday."'
              rows={3}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Follow up by (optional)</Label>
            <Input
              type="date"
              value={followUpAt}
              onChange={e => setFollowUpAt(e.target.value)}
              className="mt-1"
            />
            <p className="text-[10px] text-gray-500 mt-1">If set, this provider lands in tomorrow's queue on that date even if otherwise quiet.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
            Log it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProviderAcquisitionTab;
