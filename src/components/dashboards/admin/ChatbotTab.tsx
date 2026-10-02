/**
 * ChatbotTab — "Website chat": every Ask-Nico conversation as a thread the
 * team can work, not just read.
 *
 * Pipeline this screen sits in:
 *   visitor opens widget → chatbot fn answers / reads zip, timing, contact
 *   from the chat → escalation or contact card flips staff_unread + texts the
 *   owner a /c/<token> link → the thread appears here under "Needs reply" →
 *   a staff reply (chat-thread fn) reaches the visitor live + SMS + email and
 *   pauses the AI (handoff_state='human') → from the thread the team can
 *   create a task (owner, due date), add the lead as a patient, send a
 *   booking link that carries ?cid= so the booking is attributed back, hand
 *   the chat back to the bot, or close it.
 *
 * Layout follows LabOrdersTab: title row → count tiles → search + chips →
 * master list (Needs-reply lane first) + thread pane + lead panel; single
 * column on phones with a Back control. Frequent questions and analytics stay
 * as secondary tabs.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '@/lib/tenantConstants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MessageCircle, AlertTriangle, CheckCircle2, User, Bot, Search, Sparkles, TrendingUp, DollarSign, Users,
  ChevronLeft, Loader2, Phone, Mail, MapPin, ClipboardPlus, UserPlus, Link2, Copy, Bot as BotIcon,
  Archive, RotateCcw, MailOpen, X, ExternalLink, Info,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { InboxHero, ChipRow, LaneHeader } from './inbox/InboxHero';
import CreateTaskSheet, { type TaskDefaults } from './inbox/CreateTaskSheet';
import { adminBasePath } from './inbox/inboxQueries';

const db = supabase as any;
const PUBLIC_SITE = 'https://www.convelabs.com';

interface Conversation {
  id: string;
  visitor_id: string | null;
  lead_path: string | null;
  captured_email: string | null;
  captured_phone: string | null;
  captured_zip: string | null;
  captured_name: string | null;
  has_lab_order: boolean | null;
  timing: string | null;
  started_at: string;
  qualified_at: string | null;
  captured_contact_at: string | null;
  escalated_at: string | null;
  booked_at: string | null;
  closed_at: string | null;
  escalation_reason: string | null;
  status: string;
  message_count: number;
  utm_source: string | null;
  utm_campaign: string | null;
  landing_url: string | null;
  referrer: string | null;
  staff_unread: boolean | null;
  handoff_state: string | null;
  last_message_at: string | null;
  last_message_role: string | null;
  sms_conversation_id: string | null;
  is_stumped: boolean | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'human';
  content: string;
  escalation_triggered: boolean;
  guardrail_triggered: string | null;
  delivered_via: string | null;
  created_at: string;
}

interface FrequentQuestion { question_preview: string; occurrences: number; last_asked: string; sample_convo_id: string }

interface Stats {
  window_days: number; total_conversations: number; today_conversations: number; qualified: number;
  captured_contact: number; booked: number; escalated: number; stumped: number; total_messages: number;
  avg_messages_per_conv: number; estimated_cost_usd: number;
  lead_paths: Array<{ path: string; n: number }> | null; top_sources: Array<{ source: string; n: number }> | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  closed: 'bg-gray-50 text-gray-600 border-gray-200',
  escalated: 'bg-red-50 text-red-700 border-red-200',
  rate_limited: 'bg-amber-50 text-amber-700 border-amber-200',
};
const LEAD_PATH_LABEL: Record<string, string> = { patient: 'Patient', provider: 'Provider', lab_request: 'Doctor link', vip: 'VIP', unknown: 'Unknown' };
const TIMING_LABEL: Record<string, string> = { this_week: 'This week', later: 'Later', researching: 'Researching' };

type FilterKey = 'all' | 'needs_reply' | 'human' | 'leads' | 'escalated' | 'today' | 'closed';

const hasContact = (c: Conversation) => !!(c.captured_email || c.captured_phone);
const isHuman = (c: Conversation) => c.handoff_state === 'human' && c.status !== 'closed';
const displayName = (c: Conversation) => c.captured_name || c.captured_email || c.captured_phone || `Visitor ${(c.visitor_id || '').slice(0, 6) || '—'}`;

const ChatbotTab: React.FC = () => {
  const { user } = useAuth();
  const basePath = adminBasePath(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [frequentQs, setFrequentQs] = useState<FrequentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('c'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [adminReply, setAdminReply] = useState('');
  const [adminSending, setAdminSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showLead, setShowLead] = useState(false);
  const [matchedPatient, setMatchedPatient] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskDefaults, setTaskDefaults] = useState<TaskDefaults | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => conversations.find(c => c.id === selectedId) || null, [conversations, selectedId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [convRes, statsRes, qsRes] = await Promise.all([
      db.from('chatbot_conversations').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).order('started_at', { ascending: false }).limit(200),
      db.rpc('get_chatbot_stats', { p_days: 30 }),
      db.rpc('get_chatbot_frequent_questions', { p_days: 30, p_limit: 15 }),
    ]);
    setConversations((convRes.data as Conversation[]) || []);
    setStats((statsRes.data as any) || null);
    setFrequentQs((qsRes.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime — new chat, escalation, visitor reply → refetch (debounced).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => loadAll(), 600); };
    const ch = supabase
      .channel('admin-chatbot-inbox-live')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'chatbot_conversations' }, bump)
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'chatbot_messages' }, (payload: any) => {
        bump();
        const m = payload.new as Message & { conversation_id: string };
        if (m?.conversation_id && m.conversation_id === selectedId) {
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        }
      })
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [loadAll, selectedId]);

  // Load the thread for the selected conversation; opening marks it read.
  useEffect(() => {
    if (!selectedId) { setMessages([]); setMatchedPatient(undefined); return; }
    let cancelled = false;
    (async () => {
      setLoadingMessages(true);
      const { data } = await db.from('chatbot_messages').select('*').eq('conversation_id', selectedId).order('created_at', { ascending: true });
      if (cancelled) return;
      setMessages((data as Message[]) || []);
      setLoadingMessages(false);
      const conv = conversations.find(c => c.id === selectedId);
      if (conv?.staff_unread) {
        await db.from('chatbot_conversations').update({ staff_unread: false }).eq('id', selectedId);
        setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, staff_unread: false } : c));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Existing patient? Match the captured email / phone against the chart.
  useEffect(() => {
    if (!selected || !hasContact(selected)) { setMatchedPatient(undefined); return; }
    let cancelled = false;
    (async () => {
      const ors: string[] = [];
      if (selected.captured_email) ors.push(`email.ilike.${selected.captured_email.trim()}`);
      const digits = (selected.captured_phone || '').replace(/\D/g, '').slice(-10);
      if (digits.length === 10) ors.push(`phone.ilike.%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6)}%`);
      if (ors.length === 0) { setMatchedPatient(null); return; }
      const { data } = await db.from('tenant_patients').select('id, first_name, last_name').or(ors.join(',')).is('deleted_at', null).limit(1);
      if (cancelled) return;
      const p = (data || [])[0];
      setMatchedPatient(p ? { id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() } : null);
    })();
    return () => { cancelled = true; };
  }, [selected?.id, selected?.captured_email, selected?.captured_phone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, loadingMessages]);

  const select = (id: string | null) => {
    setSelectedId(id);
    setShowLead(false);
    const next = new URLSearchParams(searchParams);
    if (id) next.set('c', id); else next.delete('c');
    setSearchParams(next, { replace: true });
  };

  /* ─── Actions ─────────────────────────────────────────────────── */

  const sendAdminReply = async () => {
    const body = adminReply.trim();
    if (!body || !selected || adminSending) return;
    setAdminSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('chat-thread', { body: { conversationId: selected.id, body } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || 'failed');
      setAdminReply('');
      const via = ((data as any)?.delivered_via as string[] | undefined) || [];
      toast.success(`Sent${via.length ? ` via ${via.join(', ')}` : ''}`);
    } catch (e: any) {
      toast.error(`Could not send: ${e?.message || e}`);
    } finally {
      setAdminSending(false);
    }
  };

  const patchConversation = async (patch: Record<string, unknown>, okMsg: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const { error } = await db.from('chatbot_conversations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', selected.id);
      if (error) throw error;
      setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, ...patch } as Conversation : c));
      toast.success(okMsg);
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const handBackToBot = () => patchConversation({ handoff_state: 'ai', status: 'active' }, 'Bot is answering this chat again');
  const closeConversation = () => patchConversation({ status: 'closed', closed_at: new Date().toISOString(), staff_unread: false }, 'Conversation closed');
  const reopenConversation = () => patchConversation({ status: selected?.handoff_state === 'human' ? 'escalated' : 'active', closed_at: null }, 'Reopened');
  const markUnread = () => patchConversation({ staff_unread: true }, 'Marked as needs reply');

  const bookingLink = (c: Conversation) => `${PUBLIC_SITE}/book-now?cid=${c.id}`;
  const copyBookingLink = async (c: Conversation) => {
    try { await navigator.clipboard.writeText(bookingLink(c)); toast.success('Booking link copied — it carries this chat\'s id so the booking is attributed'); }
    catch { toast.error('Could not copy'); }
  };

  const createPatient = async (c: Conversation) => {
    const name = (c.captured_name || '').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0] || 'Website';
    const last = parts.slice(1).join(' ') || 'Lead';
    setBusy(true);
    try {
      const { data, error } = await db.from('tenant_patients').insert({
        tenant_id: DEFAULT_TENANT_ID,
        first_name: first, last_name: last,
        email: c.captured_email || null, phone: c.captured_phone || null, zipcode: c.captured_zip || null,
        utm_source: c.utm_source || 'website_chat', utm_campaign: c.utm_campaign || null,
        referrer_url: c.referrer || null, first_landing_page: c.landing_url || null,
        patient_notes: `Created from website chat on ${format(new Date(), 'MMM d, yyyy')} (chat ${c.id.slice(0, 8)}).`,
      }).select('id').single();
      if (error) throw error;
      setMatchedPatient({ id: data.id, name: `${first} ${last}` });
      // Optional back-link; the column ships in the DRAFT migration. Ignored if absent.
      await db.from('chatbot_conversations').update({ tenant_patient_id: data.id }).eq('id', c.id).then(() => {}, () => {});
      toast.success(`${first} ${last} added to Patients`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not create patient');
    } finally {
      setBusy(false);
    }
  };

  const openTaskFor = (c: Conversation) => {
    const who = displayName(c);
    const reach = [c.captured_phone, c.captured_email].filter(Boolean).join(' · ');
    setTaskDefaults({
      description: `Follow up with website chat lead ${who}${reach ? ` (${reach})` : ''}${c.captured_zip ? `, zip ${c.captured_zip}` : ''}${c.escalation_reason ? `. Escalated: ${c.escalation_reason}` : ''}.`,
      activityType: 'inquiry',
      priority: c.status === 'escalated' ? 'urgent' : 'normal',
      patientId: matchedPatient?.id || null,
      patientLabel: matchedPatient?.name || null,
      source: { type: 'chat', id: c.id, label: `Chat · ${who}`, url: `${basePath}/inbox/chat?c=${c.id}` },
    });
    setTaskOpen(true);
  };

  const queueAsContentTopic = async (question: string) => {
    const { error } = await db.from('social_topic_queue').insert({
      topic: `Answer: ${question.substring(0, 140)}`, category: 'patient_ed', priority: 3,
      target_platforms: ['linkedin', 'instagram'],
      notes: 'Auto-seeded from chatbot frequent question. Write content that definitively answers this so future visitors get the answer from both the bot AND organic content.',
      suggested_by: 'chatbot_stumped',
    });
    if (error) toast.error(`Failed to queue: ${error.message}`); else toast.success('Queued for content factory');
  };

  /* ─── Derived ─────────────────────────────────────────────────── */

  const counts = useMemo(() => ({
    all: conversations.length,
    needs_reply: conversations.filter(c => c.staff_unread).length,
    human: conversations.filter(isHuman).length,
    leads: conversations.filter(c => hasContact(c) && !c.booked_at && c.status !== 'closed').length,
    escalated: conversations.filter(c => c.status === 'escalated').length,
    today: conversations.filter(c => new Date(c.started_at).toDateString() === new Date().toDateString()).length,
    closed: conversations.filter(c => c.status === 'closed').length,
    booked: conversations.filter(c => !!c.booked_at).length,
  }), [conversations]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return conversations.filter(c => {
      if (filter === 'needs_reply' && !c.staff_unread) return false;
      if (filter === 'human' && !isHuman(c)) return false;
      if (filter === 'leads' && !(hasContact(c) && !c.booked_at && c.status !== 'closed')) return false;
      if (filter === 'escalated' && c.status !== 'escalated') return false;
      if (filter === 'today' && new Date(c.started_at).toDateString() !== new Date().toDateString()) return false;
      if (filter === 'closed' && c.status !== 'closed') return false;
      if (!s) return true;
      return [c.captured_name, c.captured_email, c.captured_phone, c.captured_zip, c.lead_path, c.escalation_reason, c.visitor_id, c.utm_source]
        .some(v => (v || '').toLowerCase().includes(s));
    });
  }, [conversations, filter, search]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(c => c.staff_unread || isHuman(c));
    const rest = filtered.filter(c => !(c.staff_unread || isHuman(c)));
    return { action, rest };
  }, [filtered, filter]);

  const CHIPS: Array<{ key: FilterKey; label: string; count: number; dot?: string; desc: string }> = [
    { key: 'all', label: 'All', count: counts.all, desc: 'Every conversation (newest 200)' },
    { key: 'needs_reply', label: 'Needs reply', count: counts.needs_reply, dot: 'bg-red-500', desc: 'Escalated or visitor replied while Nico was in the thread' },
    { key: 'human', label: 'With Nico', count: counts.human, dot: 'bg-rose-500', desc: 'AI paused — a human is answering' },
    { key: 'leads', label: 'Leads', count: counts.leads, dot: 'bg-emerald-500', desc: 'Left a phone or email, not booked yet' },
    { key: 'escalated', label: 'Escalated', count: counts.escalated, dot: 'bg-amber-500', desc: 'Bot asked for a human' },
    { key: 'today', label: 'Today', count: counts.today, dot: 'bg-blue-500', desc: 'Started today' },
    { key: 'closed', label: 'Closed', count: counts.closed, dot: 'bg-gray-300', desc: 'Done — no further action' },
  ];

  /* ─── Render helpers ──────────────────────────────────────────── */

  const ConvoRow: React.FC<{ c: Conversation }> = ({ c }) => {
    const isSel = selectedId === c.id;
    return (
      <button type="button" onClick={() => select(c.id)} aria-current={isSel ? 'true' : undefined}
        className={cn('w-full text-left px-3 py-2.5 border-b transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40',
          isSel ? 'bg-[#B91C1C]/10 border-l-2 border-l-[#B91C1C]' : c.staff_unread ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-white')}>
        <div className="flex items-center gap-2 mb-0.5">
          {c.staff_unread && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-label="Needs reply" />}
          <span className={cn('text-sm truncate flex-1', c.staff_unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800')}>{displayName(c)}</span>
          <span className="text-[10px] text-gray-500 flex-shrink-0">{formatDistanceToNow(new Date(c.last_message_at || c.started_at))}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isHuman(c) && <Badge variant="outline" className="text-[9px] py-0 bg-rose-50 text-rose-700 border-rose-200">With Nico</Badge>}
          <Badge variant="outline" className={cn('text-[9px] py-0', STATUS_STYLES[c.status] || STATUS_STYLES.active)}>{c.status}</Badge>
          {c.lead_path && <span className="text-[10px] text-gray-500">{LEAD_PATH_LABEL[c.lead_path] || c.lead_path}</span>}
          {hasContact(c) && <Phone className="h-3 w-3 text-emerald-600" aria-label="Contact captured" />}
          {c.booked_at && <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-label="Booked" />}
          <span className="text-[10px] text-gray-400 ml-auto">{c.message_count} msgs</span>
        </div>
      </button>
    );
  };

  const LeadPanel: React.FC<{ c: Conversation }> = ({ c }) => (
    <div className="space-y-3 text-xs">
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Lead</p>
        <p className="text-sm font-semibold text-gray-900">{displayName(c)}</p>
        <div className="mt-1 space-y-1">
          {c.captured_phone ? <a href={`tel:${c.captured_phone}`} className="flex items-center gap-1.5 text-blue-700 hover:underline"><Phone className="h-3 w-3" /> {c.captured_phone}</a> : <p className="text-gray-400 flex items-center gap-1.5"><Phone className="h-3 w-3" /> no phone</p>}
          {c.captured_email ? <a href={`mailto:${c.captured_email}`} className="flex items-center gap-1.5 text-blue-700 hover:underline break-all"><Mail className="h-3 w-3" /> {c.captured_email}</a> : <p className="text-gray-400 flex items-center gap-1.5"><Mail className="h-3 w-3" /> no email</p>}
          <p className="flex items-center gap-1.5 text-gray-700"><MapPin className="h-3 w-3" /> {c.captured_zip || <span className="text-gray-400">zip unknown</span>}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {c.lead_path && <Badge variant="outline" className="text-[10px]">{LEAD_PATH_LABEL[c.lead_path] || c.lead_path}</Badge>}
        {c.timing && <Badge variant="outline" className="text-[10px]">{TIMING_LABEL[c.timing] || c.timing}</Badge>}
        {c.has_lab_order != null && <Badge variant="outline" className="text-[10px]">{c.has_lab_order ? 'Has lab order' : 'No lab order'}</Badge>}
        {c.qualified_at && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Qualified</Badge>}
        {c.booked_at && <Badge variant="outline" className="text-[10px] bg-emerald-600 text-white border-emerald-600">Booked {format(new Date(c.booked_at), 'MMM d')}</Badge>}
      </div>
      <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Patient chart</p>
        {!hasContact(c) ? <p className="text-gray-500">No contact captured yet — ask for a phone or email in your reply.</p>
          : matchedPatient === undefined ? <p className="text-gray-400">Checking…</p>
          : matchedPatient ? <p className="text-emerald-800 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Existing patient: <strong>{matchedPatient.name}</strong></p>
          : <div className="flex items-center justify-between gap-2"><span className="text-gray-700">Not in Patients yet.</span>
              <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1" disabled={busy} onClick={() => createPatient(c)}><UserPlus className="h-3 w-3" /> Add as patient</Button></div>}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Source</p>
        <p className="text-gray-700 break-all">{c.landing_url || '/'}{c.utm_source ? ` · ${c.utm_source}` : ''}{c.utm_campaign ? ` / ${c.utm_campaign}` : ''}</p>
        <p className="text-gray-500 mt-0.5">Started {format(new Date(c.started_at), 'MMM d, h:mm a')}{c.escalated_at ? ` · escalated ${format(new Date(c.escalated_at), 'MMM d, h:mm a')}` : ''}{c.closed_at ? ` · closed ${format(new Date(c.closed_at), 'MMM d')}` : ''}</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Next step</p>
        <Button size="sm" className="w-full h-9 text-xs justify-start gap-1.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={() => openTaskFor(c)}><ClipboardPlus className="h-3.5 w-3.5" /> Create task (owner + due)</Button>
        <Button size="sm" variant="outline" className="w-full h-9 text-xs justify-start gap-1.5" onClick={() => copyBookingLink(c)}><Copy className="h-3.5 w-3.5" /> Copy attributed booking link</Button>
        {c.sms_conversation_id && <Button size="sm" variant="outline" className="w-full h-9 text-xs justify-start gap-1.5" asChild><a href={`${basePath}/inbox/sms`}><ExternalLink className="h-3.5 w-3.5" /> Open SMS thread</a></Button>}
        {c.status !== 'closed' ? (
          <>
            {isHuman(c) && <Button size="sm" variant="outline" className="w-full h-9 text-xs justify-start gap-1.5" disabled={busy} onClick={handBackToBot}><BotIcon className="h-3.5 w-3.5" /> Hand back to the bot</Button>}
            {!c.staff_unread && <Button size="sm" variant="ghost" className="w-full h-9 text-xs justify-start gap-1.5 text-gray-600" disabled={busy} onClick={markUnread}><MailOpen className="h-3.5 w-3.5" /> Mark needs reply</Button>}
            <Button size="sm" variant="ghost" className="w-full h-9 text-xs justify-start gap-1.5 text-gray-600" disabled={busy} onClick={closeConversation}><Archive className="h-3.5 w-3.5" /> Close conversation</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="w-full h-9 text-xs justify-start gap-1.5" disabled={busy} onClick={reopenConversation}><RotateCcw className="h-3.5 w-3.5" /> Reopen</Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <InboxHero
        icon={MessageCircle}
        title="Website chat"
        subtitle={<>Ask-Nico conversations from convelabs.com — reply here and it reaches them live, by text and by email. {counts.needs_reply > 0 && <span className="font-medium text-red-700">{counts.needs_reply} need a reply.</span>}</>}
        loading={loading}
        onRefresh={loadAll}
        activeKey={['needs_reply', 'human', 'leads', 'today'].includes(filter) ? filter : null}
        onTile={(k) => setFilter(filter === k ? 'all' : (k as FilterKey))}
        tiles={[
          { key: 'needs_reply', label: 'Needs reply', value: counts.needs_reply, tone: 'red', hot: true, desc: 'Escalated or waiting on a human' },
          { key: 'human', label: 'With Nico', value: counts.human, tone: 'purple', desc: 'AI paused — human is answering' },
          { key: 'leads', label: 'Leads · not booked', value: counts.leads, tone: 'emerald', desc: 'Left contact info, no booking yet' },
          { key: 'today', label: 'Today', value: counts.today, tone: 'blue', desc: 'Started today' },
        ]}
      />

      <Tabs defaultValue="conversations">
        <TabsList className="h-9">
          <TabsTrigger value="conversations" className="text-xs">Conversations</TabsTrigger>
          <TabsTrigger value="frequent-questions" className="text-xs">Frequent questions {frequentQs.length > 0 && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">{frequentQs.length}</span>}</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs">Analytics</TabsTrigger>
        </TabsList>

        {/* ── CONVERSATIONS ─────────────────────────────────────── */}
        <TabsContent value="conversations" className="space-y-3 mt-3">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, zip, reason…" aria-label="Search conversations" className="h-10 sm:h-9 pl-8 text-sm" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>}
            </div>
            <ChipRow chips={CHIPS} active={filter} onChange={k => setFilter(k as FilterKey)} ariaLabel="Conversation filter" />
          </div>

          <div className="flex flex-col md:flex-row border rounded-xl overflow-hidden bg-white h-[74vh] min-h-[480px]">
            {/* List */}
            <div className={cn(selected ? 'hidden md:flex' : 'flex', 'md:w-80 lg:w-[22rem] flex-col border-r bg-gray-50/60 min-h-0')}>
              <div className="px-3 py-2 border-b bg-white text-[11px] font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                <span>Threads</span><span className="text-gray-400 tabular-nums">{filtered.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {loading && conversations.length === 0 ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    <MessageCircle className="h-7 w-7 text-gray-300 mx-auto mb-2" aria-hidden="true" />
                    {conversations.length === 0 ? 'No conversations yet. The widget on convelabs.com creates them.' : 'Nothing matches this filter.'}
                  </div>
                ) : lanes ? (
                  <>
                    {lanes.action.length > 0 && (
                      <div className="px-3 pt-2 pb-1 bg-red-50/40 border-b"><LaneHeader id="lane-chat-action" title="Needs action" count={lanes.action.length} tone="red" /></div>
                    )}
                    {lanes.action.map(c => <ConvoRow key={c.id} c={c} />)}
                    {lanes.rest.length > 0 && (
                      <div className="px-3 pt-2 pb-1 border-b"><LaneHeader id="lane-chat-rest" title="Everything else" count={lanes.rest.length} tone="gray" /></div>
                    )}
                    {lanes.rest.map(c => <ConvoRow key={c.id} c={c} />)}
                  </>
                ) : filtered.map(c => <ConvoRow key={c.id} c={c} />)}
              </div>
            </div>

            {/* Thread */}
            <div className={cn(selected ? 'flex' : 'hidden md:flex', 'flex-1 flex-col min-h-0 min-w-0')}>
              {!selected ? (
                <div className="flex-1 flex flex-col items-center justify-center text-sm text-gray-500 p-8 text-center">
                  <MessageCircle className="h-8 w-8 text-gray-300 mb-2" aria-hidden="true" />
                  Pick a thread to read it, reply, and turn the lead into a task, a patient or a booking.
                </div>
              ) : (
                <>
                  <div className="px-3 sm:px-4 py-2.5 border-b bg-white flex items-center gap-2">
                    <button type="button" className="md:hidden h-9 w-9 -ml-1 flex items-center justify-center text-gray-500 hover:text-gray-900" onClick={() => select(null)} aria-label="Back to threads">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{displayName(selected)}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {isHuman(selected) ? 'AI paused — you are answering' : selected.status === 'closed' ? 'Closed' : 'Bot is answering'}
                        {selected.captured_phone ? ` · ${selected.captured_phone}` : ''}{selected.captured_email ? ` · ${selected.captured_email}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn('hidden sm:inline-flex', STATUS_STYLES[selected.status] || '')}>{selected.status}</Badge>
                    <Button size="sm" variant="outline" className="h-9 text-xs gap-1 lg:hidden" onClick={() => setShowLead(v => !v)} aria-expanded={showLead}>
                      <Info className="h-3.5 w-3.5" /> Lead
                    </Button>
                    <Button size="sm" className="h-9 text-xs gap-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white hidden sm:inline-flex" onClick={() => openTaskFor(selected)}>
                      <ClipboardPlus className="h-3.5 w-3.5" /> Task
                    </Button>
                  </div>
                  {selected.escalation_reason && (
                    <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-800 flex items-start gap-2" role="status">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span><strong>Escalated:</strong> {selected.escalation_reason}</span>
                    </div>
                  )}
                  {showLead && (
                    <div className="lg:hidden border-b bg-gray-50 p-3 max-h-[45%] overflow-y-auto"><LeadPanel c={selected} /></div>
                  )}

                  <div className="flex-1 flex min-h-0">
                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                      <div className="flex-1 overflow-y-auto bg-gray-50 p-3 space-y-2 min-h-0" aria-live="polite">
                        {loadingMessages ? (
                          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                        ) : messages.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center py-8">No messages yet.</p>
                        ) : messages.map(m => {
                          const mine = m.role === 'human';
                          const theirs = m.role === 'user';
                          return (
                            <div key={m.id} className={cn('flex', theirs ? 'justify-end' : 'justify-start')}>
                              <div className="max-w-[88%]">
                                <div className={cn('flex items-center gap-1 text-[10px] mb-0.5 text-gray-500', theirs ? 'justify-end' : 'justify-start')}>
                                  {theirs ? <User className="h-3 w-3" aria-hidden="true" /> : mine ? <Sparkles className="h-3 w-3 text-[#B91C1C]" aria-hidden="true" /> : <Bot className="h-3 w-3" aria-hidden="true" />}
                                  <span>{theirs ? 'Visitor' : mine ? 'Nico (staff)' : m.role === 'system' ? 'System' : 'Bot'}</span>
                                  <span>· {format(new Date(m.created_at), 'MMM d, h:mm a')}</span>
                                  {mine && m.delivered_via && <span className="text-gray-400">· via {m.delivered_via.replace(/\+/g, ', ')}</span>}
                                  {m.guardrail_triggered && <span className="text-amber-700">· guardrail: {m.guardrail_triggered}</span>}
                                  {m.escalation_triggered && <span className="text-red-700">· escalated</span>}
                                </div>
                                <div className={cn('px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words',
                                  theirs ? 'bg-[#B91C1C] text-white rounded-tr-sm' : mine ? 'bg-rose-50 border border-[#B91C1C]/30 rounded-tl-sm' : 'bg-white border border-gray-200 rounded-tl-sm')}>
                                  {m.content}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={endRef} />
                      </div>

                      <div className="border-t p-3 bg-white">
                        {selected.status === 'closed' ? (
                          <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                            <span>This conversation is closed.</span>
                            <Button size="sm" variant="outline" className="h-9 text-xs" disabled={busy} onClick={reopenConversation}>Reopen to reply</Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <label htmlFor="admin-reply" className="sr-only">Reply to visitor</label>
                              <input id="admin-reply" value={adminReply} onChange={(e) => setAdminReply(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdminReply(); } }}
                                placeholder={`Reply to ${displayName(selected)}…`}
                                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40" />
                              <Button onClick={sendAdminReply} disabled={adminSending || !adminReply.trim()} className="h-10 bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                                {adminSending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                              </Button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">
                              Reaches them live in the widget{selected.captured_phone ? ', by text' : ''}{selected.captured_email ? ' and by email' : ''}.
                              {!isHuman(selected) && ' Sending pauses the AI for this chat.'}
                              {!hasContact(selected) && ' No phone or email yet — they only see this if the widget is still open.'}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Lead panel — desktop column */}
                    <aside className="hidden lg:block w-72 border-l bg-white p-3 overflow-y-auto" aria-label="Lead details">
                      <LeadPanel c={selected} />
                    </aside>
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Link2 className="h-3 w-3" aria-hidden="true" /> Booking links copied from a thread carry <code className="font-mono">?cid=</code> so a booking is attributed to its chat.</p>
        </TabsContent>

        {/* ── FREQUENT QUESTIONS ────────────────────────────────── */}
        <TabsContent value="frequent-questions" className="space-y-3 mt-3">
          <Card className="bg-gradient-to-br from-amber-50 to-rose-50 border-amber-200">
            <CardContent className="p-4 flex gap-3">
              <Sparkles className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900">Content factory feedback loop</p>
                <p className="text-xs text-amber-800 mt-0.5">Questions visitors keep asking. Queue one and it becomes a social post, so the bot and organic content both answer it.</p>
              </div>
            </CardContent>
          </Card>
          {frequentQs.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-gray-500">No frequent questions yet. Come back once the bot has handled a few dozen chats.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {frequentQs.map((q, i) => (
                <Card key={i}>
                  <CardContent className="p-3 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                    <div className="h-8 w-8 rounded-full bg-[#B91C1C]/10 flex items-center justify-center text-xs font-bold text-[#B91C1C] flex-shrink-0">{q.occurrences}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 leading-snug">{q.question_preview}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Last asked {formatDistanceToNow(new Date(q.last_asked), { addSuffix: true })}
                        {q.sample_convo_id && <> · <button type="button" className="text-blue-700 hover:underline" onClick={() => select(q.sample_convo_id)}>open a sample chat</button></>}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => queueAsContentTopic(q.question_preview)}>Queue as content topic</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ANALYTICS ─────────────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-4 mt-3">
          {!stats ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatTile label="Today" value={stats.today_conversations} icon={MessageCircle} />
                <StatTile label="30-day total" value={stats.total_conversations} icon={TrendingUp} />
                <StatTile label="Qualified" value={stats.qualified} icon={CheckCircle2} color="emerald" />
                <StatTile label="Booked" value={stats.booked} icon={CheckCircle2} color="emerald" />
                <StatTile label="Escalated" value={stats.escalated} icon={AlertTriangle} color="red" />
                <StatTile label="30-day cost" value={`$${stats.estimated_cost_usd.toFixed(2)}`} icon={DollarSign} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card><CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">30-day funnel</p>
                  <FunnelBar label="Chats started" value={stats.total_conversations} max={stats.total_conversations} />
                  <FunnelBar label="Qualified (zip + timing + order)" value={stats.qualified} max={stats.total_conversations} />
                  <FunnelBar label="Contact captured" value={stats.captured_contact} max={stats.total_conversations} />
                  <FunnelBar label="Booked (paid checkout with ?cid=)" value={stats.booked} max={stats.total_conversations} />
                  <FunnelBar label="Escalated to a human" value={stats.escalated} max={stats.total_conversations} color="red" />
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Lead paths</p>
                  {(stats.lead_paths || []).map((p) => <FunnelBar key={p.path} label={LEAD_PATH_LABEL[p.path] || p.path} value={p.n} max={stats.total_conversations} />)}
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Top UTM sources</p>
                  {(stats.top_sources || []).map((s) => <FunnelBar key={s.source} label={s.source} value={s.n} max={stats.total_conversations} />)}
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Token usage + cost (30d)</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Total messages</span><strong>{stats.total_messages.toLocaleString()}</strong></div>
                    <div className="flex justify-between"><span className="text-gray-500">Input tokens</span><strong>{(stats as any).total_input_tokens?.toLocaleString()}</strong></div>
                    <div className="flex justify-between"><span className="text-gray-500">Output tokens</span><strong>{(stats as any).total_output_tokens?.toLocaleString()}</strong></div>
                    <div className="flex justify-between border-t pt-2 mt-2"><span className="font-semibold">Estimated cost</span><strong className="text-emerald-700">${stats.estimated_cost_usd.toFixed(2)}</strong></div>
                    <p className="text-[10px] text-gray-500 italic mt-1">$3/M input + $15/M output (claude-sonnet-4-5)</p>
                  </div>
                </CardContent></Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <CreateTaskSheet open={taskOpen} onOpenChange={setTaskOpen} defaults={taskDefaults} />
    </div>
  );
};

// ── Small sub-components ──────────────────────────────────────

const StatTile: React.FC<{ label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; color?: 'red' | 'emerald' }> = ({ label, value, icon: Icon, color }) => {
  const accent = color === 'red' ? 'text-red-600' : color === 'emerald' ? 'text-emerald-600' : 'text-gray-900';
  return (
    <Card><CardContent className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500"><Icon className="h-3 w-3" aria-hidden="true" /> {label}</div>
      <div className={cn('text-xl font-bold mt-1', accent)}>{value}</div>
    </CardContent></Card>
  );
};

const FunnelBar: React.FC<{ label: string; value: number; max: number; color?: 'red' }> = ({ label, value, max, color }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-semibold">{value} <span className="text-gray-500">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={cn('h-full transition-all', color === 'red' ? 'bg-red-500' : 'bg-[#B91C1C]')} style={{ width: `${pct}%` }} /></div>
    </div>
  );
};

export default ChatbotTab;
