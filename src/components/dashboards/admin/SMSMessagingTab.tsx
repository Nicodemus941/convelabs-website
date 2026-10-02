/**
 * SMSMessagingTab — the admin SMS inbox (route inbox/sms).
 *
 * Conversation-centric: one thread per patient phone, built from EVERY
 * place a ConveLabs text is recorded today (2026-10-02 audit):
 *
 *   sms_notifications   every automated/outbound send (reminders, invoices,
 *                       post-visit, lab-request nudges, staff replies) with
 *                       the REAL carrier outcome from twilio-status-callback
 *   sms_messages        two-way thread rows (inbound + outbound mirror). Only
 *                       populated once the sms_conversations.patient_id
 *                       NOT NULL constraint is relaxed — see migration DRAFT
 *                       20261002210000_sms_pipeline_fixes.sql.DRAFT
 *   chatbot_messages    inbound patient texts + AI-concierge replies routed
 *                       by twilio-inbound-sms → sms-concierge (visitor_id
 *                       'sms-<last10>')
 *
 * Rows are merged per phone (last 10 digits), deduped by Twilio SID, and
 * joined to tenant_patients for the name/chart link and to appointments for
 * the visit link. Unread is tracked per browser (localStorage) until the
 * `sms_thread_reads` table in the same migration draft lands.
 *
 * Sending goes through `send-sms-notification` (HIPAA recipient guard,
 * anti-abuse gate, logging). The edge function treats staff replies as
 * always-send, so THIS screen enforces quiet hours (9 PM–8 AM ET) with an
 * explicit confirm, and blocks sends to numbers Twilio has reported as
 * opted out (error 21610).
 *
 * Visual language follows LabOrdersTab / SpecimenTrackingTab: #B91C1C
 * accents, header + stat tiles + filter chips, red-gradient drawer header,
 * md:hidden cards, sticky composer.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { formatAppointmentDate } from '@/lib/appointmentDate';
import { isQuietHoursET, nextAllowedLabelET, nowInETLabel } from '@/lib/quietHours';
import { QUICK_REPLIES, renderQuickReply, smsSegments } from '@/lib/smsQuickReplies';
import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';
import {
  MessageSquare, Send, Loader2, Search, Plus, Calendar, ChevronRight, Inbox, ArrowLeft, X,
  RefreshCw, AlertTriangle, Ban, Bot, Zap, Check, CheckCheck, Clock, User, Phone, Mail,
  ExternalLink, Sparkles, MoonStar, Stethoscope,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';

// Untyped handle — sms_* / chatbot_* tables aren't all in the generated types.
const db = supabase as any;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type Direction = 'inbound' | 'outbound';
type MsgKind = 'patient' | 'staff' | 'automated' | 'ai';
type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'received' | 'unknown';

interface ThreadMessage {
  id: string;
  direction: Direction;
  kind: MsgKind;
  body: string;
  at: string;
  status: DeliveryStatus;
  errorCode?: string | null;
  notificationType?: string | null;
  appointmentId?: string | null;
  sid?: string | null;
}

interface PatientRef { id: string; name: string; email: string | null; }

interface Thread {
  key: string;            // last-10 digits
  phone: string;          // best display/E.164 form
  patient: PatientRef | null;
  messages: ThreadMessage[];
  lastAt: string;
  lastDirection: Direction;
  lastBody: string;
  unread: number;
  awaitingReply: boolean;
  failed24h: number;
  optedOut: boolean;
  aiHandling: boolean;
}

interface PatientAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  status: string;
  service_name: string | null;
  service_type: string | null;
  total_amount: number | null;
  payment_status: string | null;
  invoice_status: string | null;
  address: string | null;
  fasting_required: boolean | null;
}

type Filter = 'all' | 'needs_reply' | 'unread' | 'failed' | 'opted_out';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const phoneKey = (p: string | null | undefined) => (p || '').replace(/\D/g, '').slice(-10);
const toE164 = (p: string) => { const d = p.replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith('1') ? `+${d}` : p.startsWith('+') ? p : `+${d}`; };
const prettyPhone = (p: string) => { const d = phoneKey(p); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

/** Internal/ops texts that should never show in a patient thread. */
const INTERNAL_TYPES = new Set(['owner_alert', 'phleb_manual', 'phleb_tip_received']);
const INTERNAL_BODY = /^(New Booking!|💰|\[Patient SMS|\[Patient replied|⚠️|🔥|📞|💬|\[Phleb|\[Admin)/;

const TYPE_LABEL: Record<string, string> = {
  custom: 'Staff message',
  manual_reply: 'Staff reply',
  appointment_reminder: 'Appointment reminder',
  fasting_reminder: 'Fasting reminder',
  confirmation_request: 'Confirm request',
  booking_confirmed: 'Booking confirmation',
  reschedule_confirmation: 'Reschedule confirmation',
  reschedule_link: 'Reschedule link',
  invoice_sent: 'Invoice',
  invoice_reminder: 'Invoice reminder',
  on_the_way: 'On the way',
  on_the_way_custom: 'On the way',
  sample_delivered: 'Specimen delivered',
  specimen_delivered: 'Specimen delivered',
  completed: 'Visit complete',
  provider_portal_lab_invite: 'Lab request invite',
  lab_request_reminder_1: 'Lab request reminder 1',
  lab_request_reminder_2: 'Lab request reminder 2',
  lab_request_reminder_3: 'Lab request reminder 3',
  lab_order_reminder_2: 'Lab order nudge',
  lab_order_reminder_3: 'Lab order last call',
  post_visit_sequence: 'Post-visit follow-up',
  post_visit_specimen_confirm: 'Specimens en route',
  post_visit_google_review: 'Review request',
  post_visit_referral_prompt: 'Referral nudge',
};
const typeLabel = (t: string | null | undefined) => (t && TYPE_LABEL[t]) || (t ? t.replace(/_/g, ' ') : 'Message');
const MANUAL_TYPES = new Set(['custom', 'manual_reply', 'on_the_way_custom']);

const normStatus = (s: string | null | undefined): DeliveryStatus => {
  const v = String(s || '').toLowerCase();
  if (['delivered', 'sent', 'failed', 'undelivered', 'received', 'queued'].includes(v)) return v as DeliveryStatus;
  if (v === 'accepted' || v === 'sending') return 'queued';
  return 'unknown';
};

const LAST_READ_KEY = 'convelabs_sms_last_viewed_v2';
const readLastRead = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(LAST_READ_KEY) || '{}'); } catch { return {}; } };
const writeLastRead = (key: string) => { try { const m = readLastRead(); m[key] = new Date().toISOString(); localStorage.setItem(LAST_READ_KEY, JSON.stringify(m)); } catch { /* unavailable */ } };

const initials = (name: string) => {
  const parts = name.split(' ').filter(Boolean);
  return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : (parts[0]?.[0] || '#').toUpperCase();
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d, yyyy');
};

const apptTimeLabel = (t: string | null | undefined) => {
  if (!t) return '';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  let h = parseInt(m[1], 10); const p = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m[2]} ${p}`;
};

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

const SMSMessagingTab: React.FC = () => {
  const { user } = useAuth();
  const basePath = `/dashboard/${(user as any)?.role === 'office_manager' ? 'office_manager' : 'super_admin'}`;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [patients, setPatients] = useState<Array<PatientRef & { phone: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [contextOpen, setContextOpen] = useState(false);

  // Composer
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmQuiet, setConfirmQuiet] = useState(false);
  const [compose, setCompose] = useState<{ open: boolean; name: string; phone: string }>({ open: false, name: '', phone: '' });

  // Per-thread context
  const [appts, setAppts] = useState<PatientAppointment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reloadTimer = useRef<number | null>(null);

  // ── Load + merge ───────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const [ptsRes, notifRes, msgRes, convRes] = await Promise.all([
        db.from('tenant_patients').select('id, first_name, last_name, phone, email').not('phone', 'is', null).limit(5000),
        db.from('sms_notifications')
          .select('id, appointment_id, notification_type, phone_number, message_content, sent_at, delivery_status, twilio_message_sid, metadata')
          .order('sent_at', { ascending: false }).limit(2500),
        db.from('sms_messages')
          .select('id, direction, body, status, created_at, twilio_message_sid, sms_conversations!inner(patient_phone, patient_id)')
          .order('created_at', { ascending: false }).limit(1500),
        db.from('chatbot_conversations')
          .select('id, captured_phone, captured_name, handoff_state, status, last_message_at')
          .like('visitor_id', 'sms-%')
          .order('last_message_at', { ascending: false }).limit(300),
      ]);
      const firstErr = [ptsRes, notifRes, msgRes, convRes].find((r: any) => r?.error)?.error;
      if (firstErr) throw new Error(firstErr.message || String(firstErr));

      // Patients by phone key
      const patientByKey = new Map<string, PatientRef & { phone: string }>();
      const list: Array<PatientRef & { phone: string }> = [];
      for (const p of (ptsRes.data || []) as any[]) {
        const k = phoneKey(p.phone); if (k.length < 10) continue;
        const ref = { id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown', email: p.email || null, phone: p.phone };
        if (!patientByKey.has(k)) patientByKey.set(k, ref);
        list.push(ref);
      }
      setPatients(list);

      // Chatbot (SMS concierge) messages for the SMS-origin conversations
      const convs = (convRes.data || []) as any[];
      const convByKey = new Map<string, any>();
      for (const c of convs) { const k = phoneKey(c.captured_phone); if (k.length === 10 && !convByKey.has(k)) convByKey.set(k, c); }
      let chatMsgs: any[] = [];
      if (convs.length > 0) {
        const { data } = await db.from('chatbot_messages')
          .select('id, conversation_id, role, content, created_at, delivery_status, twilio_message_sid')
          .in('conversation_id', convs.map(c => c.id))
          .order('created_at', { ascending: false }).limit(2000);
        chatMsgs = data || [];
      }
      const convPhone = new Map<string, string>(convs.map(c => [c.id, c.captured_phone]));

      // Merge into threads
      const byKey = new Map<string, { phone: string; msgs: ThreadMessage[] }>();
      const seenSid = new Set<string>();
      const push = (phoneRaw: string, m: ThreadMessage) => {
        const k = phoneKey(phoneRaw); if (k.length < 10) return;
        if (m.sid) { if (seenSid.has(m.sid)) return; seenSid.add(m.sid); }
        let t = byKey.get(k); if (!t) { t = { phone: toE164(phoneRaw), msgs: [] }; byKey.set(k, t); }
        t.msgs.push(m);
      };

      // 1) Threaded rows first (they carry inbound)
      for (const m of (msgRes.data || []) as any[]) {
        const conv = m.sms_conversations || {};
        push(conv.patient_phone, {
          id: `m:${m.id}`, direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
          kind: m.direction === 'inbound' ? 'patient' : 'staff',
          body: typeof m.body === 'string' ? m.body : JSON.stringify(m.body ?? ''),
          at: m.created_at, status: normStatus(m.status), sid: m.twilio_message_sid || null,
        });
      }
      // 2) Outbound log (carrier status from the status callback)
      for (const n of (notifRes.data || []) as any[]) {
        const type = n.notification_type || 'custom';
        const body = String(n.message_content || '');
        if (INTERNAL_TYPES.has(type) || (MANUAL_TYPES.has(type) && INTERNAL_BODY.test(body))) continue;
        const meta = n.metadata || {};
        push(n.phone_number, {
          id: `n:${n.id}`, direction: 'outbound',
          kind: MANUAL_TYPES.has(type) ? 'staff' : 'automated',
          body, at: n.sent_at, status: normStatus(n.delivery_status),
          errorCode: meta.error_code || (String(meta.error || '').match(/\b(2\d{4}|3\d{4})\b/)?.[1] ?? null),
          notificationType: type, appointmentId: n.appointment_id || null, sid: n.twilio_message_sid || null,
        });
      }
      // 3) Concierge thread (inbound + AI replies)
      for (const c of chatMsgs) {
        const phone = convPhone.get(c.conversation_id); if (!phone) continue;
        if (!['user', 'assistant', 'human'].includes(c.role)) continue;
        push(phone, {
          id: `c:${c.id}`, direction: c.role === 'user' ? 'inbound' : 'outbound',
          kind: c.role === 'user' ? 'patient' : c.role === 'human' ? 'staff' : 'ai',
          body: String(c.content || ''), at: c.created_at,
          status: c.role === 'user' ? 'received' : normStatus(c.delivery_status) === 'unknown' ? 'sent' : normStatus(c.delivery_status),
          sid: c.twilio_message_sid || null,
        });
      }

      const lastRead = readLastRead();
      const dayAgo = Date.now() - 86_400_000;
      const built: Thread[] = [];
      for (const [k, t] of byKey) {
        t.msgs.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
        const last = t.msgs[t.msgs.length - 1];
        const readAt = lastRead[k] ? new Date(lastRead[k]).getTime() : 0;
        const unread = t.msgs.filter(m => m.direction === 'inbound' && new Date(m.at).getTime() > readAt).length;
        const lastOutIdx = [...t.msgs].reverse().findIndex(m => m.direction === 'outbound' && m.kind !== 'automated');
        const awaitingReply = last.direction === 'inbound' && (lastOutIdx === -1 || true);
        const failed24h = t.msgs.filter(m => (m.status === 'failed' || m.status === 'undelivered') && new Date(m.at).getTime() > dayAgo).length;
        const optedOut = t.msgs.some(m => m.errorCode === '21610');
        const conv = convByKey.get(k);
        const p = patientByKey.get(k);
        built.push({
          key: k, phone: p?.phone ? toE164(p.phone) : t.phone, patient: p ? { id: p.id, name: p.name, email: p.email } : (conv?.captured_name ? { id: '', name: conv.captured_name, email: null } : null),
          messages: t.msgs, lastAt: last.at, lastDirection: last.direction, lastBody: last.body,
          unread, awaitingReply, failed24h, optedOut,
          aiHandling: !!conv && conv.handoff_state === 'ai' && conv.status !== 'closed',
        });
      }
      built.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
      setThreads(built);
    } catch (e: any) {
      console.error('[sms-inbox] load failed', e);
      setLoadError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: inbound rows land in sms_messages / chatbot_messages (both in
  // the realtime publication). Debounce a silent reload.
  useEffect(() => {
    const bump = () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => load(true), 800);
    };
    const ch = supabase.channel('admin-sms-inbox-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, bump)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chatbot_messages' }, bump)
      .subscribe();
    return () => { supabase.removeChannel(ch); if (reloadTimer.current) window.clearTimeout(reloadTimer.current); };
  }, [load]);

  // ── Active thread + context ────────────────────────────────────────────
  const active = useMemo(() => threads.find(t => t.key === activeKey) || null, [threads, activeKey]);

  useEffect(() => {
    if (!active) { setAppts([]); return; }
    let cancelled = false;
    (async () => {
      let q = db.from('appointments')
        .select('id, appointment_date, appointment_time, status, service_name, service_type, total_amount, payment_status, invoice_status, address, fasting_required')
        .order('appointment_date', { ascending: false }).limit(40);
      q = active.patient?.id ? q.or(`patient_id.eq.${active.patient.id},patient_phone.ilike.%${active.key}%`) : q.ilike('patient_phone', `%${active.key}%`);
      const { data } = await q;
      if (!cancelled) setAppts((data || []) as PatientAppointment[]);
    })();
    return () => { cancelled = true; };
  }, [active?.key, active?.patient?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [active?.messages.length, activeKey]);

  const openThread = (key: string) => {
    setActiveKey(key); setMobileView('thread'); setContextOpen(false); setCompose({ open: false, name: '', phone: '' });
    writeLastRead(key);
    setThreads(prev => prev.map(t => t.key === key ? { ...t, unread: 0 } : t));
  };

  // ── Derived lists ──────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    all: threads.length,
    needs_reply: threads.filter(t => t.awaitingReply).length,
    unread: threads.filter(t => t.unread > 0).length,
    failed: threads.filter(t => t.failed24h > 0).length,
    opted_out: threads.filter(t => t.optedOut).length,
    sent_today: threads.reduce((n, t) => n + t.messages.filter(m => m.direction === 'outbound' && isToday(new Date(m.at))).length, 0),
  }), [threads]);

  const visible = useMemo(() => {
    let list = threads;
    if (filter === 'needs_reply') list = list.filter(t => t.awaitingReply);
    else if (filter === 'unread') list = list.filter(t => t.unread > 0);
    else if (filter === 'failed') list = list.filter(t => t.failed24h > 0);
    else if (filter === 'opted_out') list = list.filter(t => t.optedOut);
    const q = search.trim().toLowerCase();
    if (q) {
      const qd = q.replace(/\D/g, '');
      list = list.filter(t => (t.patient?.name || '').toLowerCase().includes(q) || (qd && t.key.includes(qd)) || (t.patient?.email || '').toLowerCase().includes(q) || t.lastBody.toLowerCase().includes(q));
    }
    return list;
  }, [threads, filter, search]);

  // Patients without a thread yet — only surfaced by search so staff can start one.
  const patientMatches = useMemo(() => {
    const q = search.trim().toLowerCase(); if (q.length < 2) return [];
    const qd = q.replace(/\D/g, '');
    const have = new Set(threads.map(t => t.key));
    return patients.filter(p => !have.has(phoneKey(p.phone)) && (p.name.toLowerCase().includes(q) || (qd && phoneKey(p.phone).includes(qd)))).slice(0, 8);
  }, [patients, threads, search]);

  const lanes = useMemo(() => {
    if (filter !== 'all' || search.trim()) return null;
    const action = visible.filter(t => t.awaitingReply || t.failed24h > 0);
    const rest = visible.filter(t => !(t.awaitingReply || t.failed24h > 0));
    return action.length > 0 ? { action, rest } : null;
  }, [visible, filter, search]);

  // ── Sending ────────────────────────────────────────────────────────────
  const nextAppt = useMemo(() => appts.filter(a => ['scheduled', 'confirmed'].includes(a.status)).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))[0] || null, [appts]);
  const quickCtx = useMemo(() => ({
    firstName: active?.patient?.name || compose.name || null,
    date: nextAppt ? formatAppointmentDate(nextAppt.appointment_date, { weekday: 'short', month: 'short', day: 'numeric' }) : null,
    time: nextAppt ? apptTimeLabel(nextAppt.appointment_time) : null,
    address: nextAppt?.address || null,
  }), [active, nextAppt, compose.name]);

  const segs = smsSegments(draft);
  const targetPhone = compose.open ? compose.phone : active?.phone || '';
  const targetName = compose.open ? compose.name : active?.patient?.name || '';
  const canSend = !!draft.trim() && !!phoneKey(targetPhone) && phoneKey(targetPhone).length === 10 && !sending && !(active?.optedOut && !compose.open);

  const doSend = async () => {
    const to = toE164(targetPhone);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-sms-notification', {
        body: {
          to, message: draft.trim(), notificationType: 'manual_reply', category: 'admin_alert',
          patientName: targetName || undefined, appointmentId: nextAppt?.id || undefined,
        },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || data.reason || data.message || 'Send blocked');
      const key = phoneKey(to);
      const msg: ThreadMessage = { id: `local:${crypto.randomUUID()}`, direction: 'outbound', kind: 'staff', body: draft.trim(), at: new Date().toISOString(), status: 'sent', notificationType: 'manual_reply', sid: data?.messageSid || null };
      setThreads(prev => {
        const idx = prev.findIndex(t => t.key === key);
        if (idx === -1) {
          const p = patients.find(x => phoneKey(x.phone) === key);
          const t: Thread = { key, phone: to, patient: p ? { id: p.id, name: p.name, email: p.email } : (compose.name ? { id: '', name: compose.name, email: null } : null), messages: [msg], lastAt: msg.at, lastDirection: 'outbound', lastBody: msg.body, unread: 0, awaitingReply: false, failed24h: 0, optedOut: false, aiHandling: false };
          return [t, ...prev];
        }
        const t = prev[idx];
        const nt = { ...t, messages: [...t.messages, msg], lastAt: msg.at, lastDirection: 'outbound' as Direction, lastBody: msg.body, awaitingReply: false };
        return [nt, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setDraft('');
      toast.success(`Sent to ${targetName || prettyPhone(to)}`);
      if (compose.open) { setCompose({ open: false, name: '', phone: '' }); setActiveKey(key); setMobileView('thread'); writeLastRead(key); }
      window.setTimeout(() => load(true), 2500);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send');
    } finally {
      setSending(false); setConfirmQuiet(false);
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    if (isQuietHoursET()) { setConfirmQuiet(true); return; }
    doSend();
  };

  const insertQuickReply = (body: string) => setDraft(renderQuickReply(body, quickCtx));

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────
  const quiet = isQuietHoursET();
  const upcoming = appts.filter(a => ['scheduled', 'confirmed'].includes(a.status));
  const past = appts.filter(a => ['completed', 'specimen_delivered'].includes(a.status));
  const paid = past.filter(a => a.payment_status === 'completed');
  const totalSpent = paid.reduce((s, a) => s + (a.total_amount || 0), 0);
  const automatedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of active?.messages || []) if (x.kind === 'automated') m.set(typeLabel(x.notificationType), (m.get(typeLabel(x.notificationType)) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [active]);

  const TILES: Array<{ key: Filter | 'sent_today'; label: string; desc: string; tone: string }> = [
    { key: 'needs_reply', label: 'Needs reply', desc: 'Last message is from the patient', tone: 'border-red-300 bg-red-50 text-red-800' },
    { key: 'unread', label: 'Unread', desc: 'New patient texts since you last opened the thread', tone: 'border-amber-300 bg-amber-50 text-amber-800' },
    { key: 'failed', label: 'Failed 24h', desc: 'Carrier reported undelivered / failed', tone: 'border-orange-300 bg-orange-50 text-orange-800' },
    { key: 'opted_out', label: 'Opted out', desc: 'Twilio 21610 — patient replied STOP', tone: 'border-gray-300 bg-gray-100 text-gray-800' },
    { key: 'sent_today', label: 'Sent today', desc: 'Outbound texts today (all senders)', tone: 'border-blue-300 bg-blue-50 text-blue-800' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900">
            <MessageSquare className="h-6 w-6 text-[#B91C1C]" aria-hidden="true" />
            Text messages
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every patient text — automated and staff — in one thread per phone.
            {counts.needs_reply > 0 && <span className="ml-1 font-medium text-red-700">{counts.needs_reply} waiting on a reply.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {quiet && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 h-10 sm:h-9 text-xs font-medium text-indigo-800" title="Patient texts are held 9 PM – 8 AM ET. Staff sends ask for confirmation.">
              <MoonStar className="h-3.5 w-3.5" aria-hidden="true" /> Quiet hours · {nowInETLabel()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => { setCompose({ open: true, name: '', phone: '' }); setActiveKey(null); setDraft(''); setMobileView('thread'); }} className="gap-1.5 text-xs h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">New message</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Stat tiles — click to filter */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
        <div className="grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-cols-5 sm:grid-flow-row gap-2" role="group" aria-label="Message counts">
          {TILES.map(t => {
            const isFilter = t.key !== 'sent_today';
            const activeTile = isFilter && filter === t.key;
            const n = counts[t.key as keyof typeof counts];
            return (
              <button key={t.key} type="button" title={t.desc} aria-pressed={activeTile}
                onClick={() => { if (isFilter) setFilter(activeTile ? 'all' : (t.key as Filter)); }}
                className={cn('text-left rounded-lg border px-3 py-2.5 min-h-[64px] snap-start transition shadow-sm',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  activeTile ? cn('ring-2 ring-[#B91C1C]/30', t.tone) : 'bg-white border-gray-200 hover:border-[#B91C1C]/40',
                  !isFilter && 'cursor-default')}>
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{t.label}</p>
                <p className={cn('text-2xl font-bold leading-tight mt-0.5', t.key === 'needs_reply' && n > 0 && !activeTile && 'text-red-700')}>{loading ? '–' : n}</p>
              </button>
            );
          })}
        </div>
      </div>

      {loadError && (
        <Card className="border-red-300 bg-red-50" role="alert">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs flex-1">
              <p className="font-semibold text-red-800">Couldn't load messages</p>
              <p className="text-red-700 mt-0.5 font-mono break-all">{loadError}</p>
            </div>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => load()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Inbox body */}
      <div className="flex border rounded-lg overflow-hidden bg-white h-[calc(100vh-290px)] min-h-[520px]">

        {/* ── Column 1: threads ── */}
        <div className={cn('w-full md:w-80 lg:w-96 border-r flex flex-col bg-white flex-shrink-0', mobileView === 'thread' ? 'hidden md:flex' : 'flex')}>
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email, text…" aria-label="Search messages" className="h-10 sm:h-9 pl-8 text-sm" />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-0.5" role="group" aria-label="Thread filter">
              {([['all', 'All'], ['needs_reply', 'Needs reply'], ['unread', 'Unread'], ['failed', 'Failed'], ['opted_out', 'Opted out']] as Array<[Filter, string]>).map(([k, label]) => {
                const on = filter === k; const n = counts[k];
                return (
                  <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={on}
                    className={cn('flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 h-8 text-xs font-medium transition',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                      on ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400')}>
                    {label}{k !== 'all' && n > 0 && <span className={cn('rounded-full px-1.5 text-[10px] leading-4', on ? 'bg-white/20' : 'bg-gray-100')}>{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : lanes ? (
              <>
                <LaneHeader title="Needs action" count={lanes.action.length} tone="red" />
                {lanes.action.map(t => <ThreadRow key={t.key} t={t} active={t.key === activeKey && !compose.open} onOpen={openThread} />)}
                {lanes.rest.length > 0 && <LaneHeader title="Everything else" count={lanes.rest.length} tone="gray" />}
                {lanes.rest.map(t => <ThreadRow key={t.key} t={t} active={t.key === activeKey && !compose.open} onOpen={openThread} />)}
              </>
            ) : (
              <>
                {visible.map(t => <ThreadRow key={t.key} t={t} active={t.key === activeKey && !compose.open} onOpen={openThread} />)}
                {patientMatches.length > 0 && (
                  <>
                    <LaneHeader title="Start a conversation" count={patientMatches.length} tone="gray" />
                    {patientMatches.map(p => (
                      <button key={p.id} type="button" onClick={() => { setCompose({ open: true, name: p.name, phone: p.phone }); setActiveKey(null); setMobileView('thread'); }}
                        className="w-full text-left flex items-center gap-3 px-4 py-3 border-b hover:bg-gray-50 focus:outline-none focus-visible:bg-red-50/60">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-gray-600">{initials(p.name)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">{prettyPhone(p.phone)} · no texts yet</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300" aria-hidden="true" />
                      </button>
                    ))}
                  </>
                )}
                {visible.length === 0 && patientMatches.length === 0 && (
                  <div className="py-12 text-center px-4">
                    <Inbox className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm text-gray-500">{search ? 'No matches' : filter === 'all' ? 'No conversations yet' : 'Nothing here right now'}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Column 2: thread / compose ── */}
        <div className={cn('flex-1 flex flex-col min-w-0 bg-white', mobileView === 'thread' ? 'flex' : 'hidden md:flex')}>
          {compose.open ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 px-4 py-3 border-b">
                <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={() => { setCompose({ open: false, name: '', phone: '' }); setMobileView('list'); }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 hidden md:flex" onClick={() => setCompose({ open: false, name: '', phone: '' })} aria-label="Close"><X className="h-4 w-4" /></Button>
                <h2 className="font-semibold">New message</h2>
              </div>
              <div className="p-4 border-b grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-gray-600">Name
                  <Input value={compose.name} onChange={e => setCompose(c => ({ ...c, name: e.target.value }))} placeholder="Patient name" className="h-10 sm:h-9 text-sm mt-1" />
                </label>
                <label className="text-xs font-medium text-gray-600">Mobile number
                  <Input value={compose.phone} onChange={e => setCompose(c => ({ ...c, phone: e.target.value }))} placeholder="(407) 555-0100" type="tel" className="h-10 sm:h-9 text-sm mt-1" />
                </label>
                <p className="sm:col-span-2 text-[11px] text-gray-500">Texts go out from the ConveLabs number. Numbers outside the patient registry are allowed for signed-in staff and are HIPAA-checked by name.</p>
              </div>
              <div className="flex-1" />
              <Composer draft={draft} setDraft={setDraft} segs={segs} canSend={canSend} sending={sending} onSend={handleSend} onQuick={insertQuickReply} quiet={quiet} optedOut={false} />
            </div>
          ) : active ? (
            <div className="flex flex-col h-full">
              {/* Thread header */}
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b bg-white">
                <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden flex-shrink-0" onClick={() => { setMobileView('list'); setActiveKey(null); }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
                <div className="w-9 h-9 rounded-full bg-red-50 text-[#B91C1C] flex items-center justify-center flex-shrink-0 text-xs font-bold">{initials(active.patient?.name || '#')}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm sm:text-base truncate">{active.patient?.name || prettyPhone(active.phone)}</p>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-gray-500">
                    <span>{prettyPhone(active.phone)}</span>
                    {active.optedOut && <Chip tone="gray"><Ban className="h-3 w-3" /> Opted out</Chip>}
                    {active.aiHandling && <Chip tone="indigo"><Bot className="h-3 w-3" /> AI concierge replying</Chip>}
                    {active.failed24h > 0 && <Chip tone="orange"><AlertTriangle className="h-3 w-3" /> {active.failed24h} failed</Chip>}
                    {!active.patient && <Chip tone="amber">Not in patient list</Chip>}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5">
                  {active.patient?.id && (
                    <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" asChild>
                      <Link to={`${basePath}/patients`} state={{ patientId: active.patient.id }}><Stethoscope className="h-3.5 w-3.5" aria-hidden="true" /> Chart</Link>
                    </Button>
                  )}
                  {nextAppt && (
                    <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" asChild>
                      <Link to={`${basePath}/schedule/calendar?appointment=${nextAppt.id}`}><Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Next visit</Link>
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="lg:hidden h-9 w-9 p-0" onClick={() => setContextOpen(true)} aria-label="Patient details"><User className="h-4 w-4" /></Button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 bg-gray-50/60">
                {active.messages.map((m, i) => {
                  const prev = active.messages[i - 1];
                  const showDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
                  return (
                    <React.Fragment key={m.id}>
                      {showDay && <div className="text-center my-3"><span className="text-[11px] font-medium text-gray-500 bg-white border rounded-full px-2.5 py-0.5">{dayLabel(m.at)}</span></div>}
                      <Bubble m={m} basePath={basePath} />
                    </React.Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <Composer draft={draft} setDraft={setDraft} segs={segs} canSend={canSend} sending={sending} onSend={handleSend} onQuick={insertQuickReply} quiet={quiet} optedOut={active.optedOut} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4"><MessageSquare className="h-8 w-8 text-[#B91C1C]/60" aria-hidden="true" /></div>
              <h3 className="font-semibold text-gray-800 mb-1">Pick a conversation</h3>
              <p className="text-sm text-gray-500 max-w-xs">Threads waiting on a reply are at the top. Automated reminders, invoices and follow-ups show in the same thread as your replies.</p>
            </div>
          )}
        </div>

        {/* ── Column 3: patient context (desktop) ── */}
        {active && !compose.open && (
          <div className="hidden lg:flex w-72 xl:w-80 border-l flex-col bg-white flex-shrink-0 overflow-y-auto">
            <ContextPanel active={active} appts={appts} upcoming={upcoming} past={past} paid={paid.length} totalSpent={totalSpent} automatedCounts={automatedCounts} basePath={basePath} />
          </div>
        )}
      </div>

      {/* Mobile/tablet context drawer */}
      {active && contextOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex lg:hidden" onClick={() => setContextOpen(false)}>
          <Card role="dialog" aria-modal="true" aria-label="Patient details" className="w-full mt-auto max-h-[85vh] overflow-y-auto rounded-b-none rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <CardContent className="p-0">
              <div className="flex justify-center pt-2 pb-1" aria-hidden="true"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-4 sticky top-0 z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider opacity-90">Patient</p>
                    <h2 className="text-lg font-bold mt-0.5 truncate">{active.patient?.name || prettyPhone(active.phone)}</h2>
                    <p className="text-sm opacity-95">{prettyPhone(active.phone)}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setContextOpen(false)} className="text-white hover:bg-white/10 h-10 w-10 p-0 flex-shrink-0" aria-label="Close"><X className="h-5 w-5" /></Button>
                </div>
              </div>
              <ContextPanel active={active} appts={appts} upcoming={upcoming} past={past} paid={paid.length} totalSpent={totalSpent} automatedCounts={automatedCounts} basePath={basePath} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quiet-hours confirm */}
      <AlertDialog open={confirmQuiet} onOpenChange={setConfirmQuiet}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><MoonStar className="h-5 w-5 text-indigo-600" aria-hidden="true" /> It's quiet hours ({nowInETLabel()})</AlertDialogTitle>
            <AlertDialogDescription>
              Patients aren't texted between 9 PM and 8 AM Eastern. Automated messages are held until {nextAllowedLabelET()}.
              Send this one now only if the patient is expecting it (for example, they just texted you).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Hold it</AlertDialogCancel>
            <AlertDialogAction className="h-10 bg-[#B91C1C] hover:bg-[#991B1B]" onClick={doSend}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SMSMessagingTab;

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

const LaneHeader: React.FC<{ title: string; count: number; tone: 'red' | 'gray' }> = ({ title, count, tone }) => (
  <div className={cn('sticky top-0 z-[1] flex items-center gap-2 px-4 py-1.5 text-[11px] uppercase tracking-wider font-semibold border-b', tone === 'red' ? 'bg-red-50 text-red-800 border-red-100' : 'bg-gray-50 text-gray-600 border-gray-100')}>
    {title}<span className={cn('rounded-full px-1.5 text-[10px]', tone === 'red' ? 'bg-red-100' : 'bg-gray-200')}>{count}</span>
  </div>
);

const Chip: React.FC<{ tone: 'gray' | 'indigo' | 'orange' | 'amber' | 'green' | 'red'; children: React.ReactNode; className?: string }> = ({ tone, children, className }) => {
  const map = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200', indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200', orange: 'bg-orange-50 text-orange-800 border-orange-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200', green: 'bg-emerald-50 text-emerald-800 border-emerald-200', red: 'bg-red-50 text-red-800 border-red-200',
  } as const;
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium leading-4', map[tone], className)}>{children}</span>;
};

const ThreadRow: React.FC<{ t: Thread; active: boolean; onOpen: (k: string) => void }> = ({ t, active, onOpen }) => (
  <button type="button" onClick={() => onOpen(t.key)}
    className={cn('w-full text-left flex items-start gap-3 px-4 py-3 border-b transition-colors focus:outline-none focus-visible:bg-red-50/60',
      active ? 'bg-red-50/70' : 'hover:bg-gray-50')}>
    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold', t.awaitingReply ? 'bg-red-50 text-[#B91C1C]' : 'bg-gray-100 text-gray-600')}>
      {initials(t.patient?.name || '#')}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-sm truncate', t.unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800')}>{t.patient?.name || prettyPhone(t.phone)}</p>
        <span className="text-[10px] text-gray-500 flex-shrink-0">{formatDistanceToNowStrict(new Date(t.lastAt), { addSuffix: false })}</span>
      </div>
      <p className={cn('text-xs truncate mt-0.5', t.unread > 0 ? 'text-gray-800' : 'text-gray-500')}>
        {t.lastDirection === 'outbound' ? <span className="text-gray-400">You: </span> : null}{t.lastBody}
      </p>
      <div className="flex items-center gap-1 mt-1 flex-wrap">
        {t.awaitingReply && <Chip tone="red">Needs reply</Chip>}
        {t.failed24h > 0 && <Chip tone="orange">{t.failed24h} failed</Chip>}
        {t.optedOut && <Chip tone="gray"><Ban className="h-3 w-3" /> Opted out</Chip>}
        {t.aiHandling && <Chip tone="indigo"><Bot className="h-3 w-3" /> AI</Chip>}
      </div>
    </div>
    {t.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#B91C1C] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-1">{t.unread}</span>}
  </button>
);

const StatusLine: React.FC<{ m: ThreadMessage }> = ({ m }) => {
  const time = format(new Date(m.at), 'h:mm a');
  if (m.direction === 'inbound') return <span className="text-[10px] text-gray-400">{time}</span>;
  const icon = m.status === 'delivered' ? <CheckCheck className="h-3 w-3" /> : m.status === 'sent' || m.status === 'queued' ? <Check className="h-3 w-3" /> : m.status === 'failed' || m.status === 'undelivered' ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />;
  const label = m.status === 'delivered' ? 'Delivered' : m.status === 'sent' ? 'Sent' : m.status === 'queued' ? 'Queued' : m.status === 'failed' ? 'Failed' : m.status === 'undelivered' ? 'Undelivered' : '';
  const bad = m.status === 'failed' || m.status === 'undelivered';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px]', bad ? 'text-red-600 font-medium' : 'text-gray-400')}>
      {icon}{label}{m.errorCode ? ` · ${m.errorCode === '21610' ? 'opted out' : m.errorCode === '30034' ? 'A2P not registered' : m.errorCode === '30006' ? 'landline/unreachable' : `Twilio ${m.errorCode}`}` : ''} · {time}
    </span>
  );
};

const Bubble: React.FC<{ m: ThreadMessage; basePath: string }> = ({ m, basePath }) => {
  const out = m.direction === 'outbound';
  const bad = m.status === 'failed' || m.status === 'undelivered';
  return (
    <div className={cn('flex mb-2', out ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[82%] sm:max-w-[72%]')}>
        {out && m.kind !== 'staff' && (
          <div className="flex items-center justify-end gap-1 mb-0.5">
            <Chip tone={m.kind === 'ai' ? 'indigo' : 'gray'}>
              {m.kind === 'ai' ? <><Bot className="h-3 w-3" /> AI concierge</> : <><Zap className="h-3 w-3" /> {typeLabel(m.notificationType)}</>}
            </Chip>
            {m.appointmentId && (
              <Link to={`${basePath}/schedule/calendar?appointment=${m.appointmentId}`} className="text-[10px] text-[#B91C1C] hover:underline inline-flex items-center gap-0.5">
                visit <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
        <div className={cn('rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words border',
          !out ? 'bg-white text-gray-800 border-gray-200 rounded-bl-md'
            : m.kind === 'staff' ? 'bg-[#B91C1C] text-white border-[#B91C1C] rounded-br-md'
            : m.kind === 'ai' ? 'bg-indigo-50 text-indigo-950 border-indigo-100 rounded-br-md'
            : 'bg-slate-100 text-slate-800 border-slate-200 rounded-br-md',
          bad && 'ring-2 ring-red-300')}>
          {m.body}
        </div>
        <div className={cn('mt-0.5 px-1', out ? 'text-right' : 'text-left')}><StatusLine m={m} /></div>
      </div>
    </div>
  );
};

const Composer: React.FC<{
  draft: string; setDraft: (v: string) => void; segs: { chars: number; segments: number; unicode: boolean };
  canSend: boolean; sending: boolean; onSend: () => void; onQuick: (body: string) => void; quiet: boolean; optedOut: boolean;
}> = ({ draft, setDraft, segs, canSend, sending, onSend, onQuick, quiet, optedOut }) => (
  <div className="border-t bg-white p-2.5 sm:p-3 sticky bottom-0">
    {optedOut && (
      <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 flex items-start gap-2">
        <Ban className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p>This number replied STOP. Twilio blocks texts to it until the patient texts START. Call them instead, or email.</p>
      </div>
    )}
    {quiet && !optedOut && (
      <div className="mb-2 rounded-md border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900 flex items-start gap-2">
        <MoonStar className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p>Quiet hours (9 PM – 8 AM ET). You'll be asked to confirm before this sends.</p>
      </div>
    )}
    <div className="flex items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-10 w-10 p-0 flex-shrink-0" aria-label="Quick replies" title="Quick replies"><Sparkles className="h-4 w-4 text-[#B91C1C]" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-h-[60vh] overflow-y-auto">
          {(['Visit', 'Prep', 'Billing', 'Follow-up'] as const).map((g, gi) => (
            <React.Fragment key={g}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-gray-500">{g}</DropdownMenuLabel>
              {QUICK_REPLIES.filter(q => q.group === g).map(q => (
                <DropdownMenuItem key={q.id} onSelect={() => onQuick(q.body)} className="text-sm cursor-pointer">{q.label}</DropdownMenuItem>
              ))}
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1 min-w-0">
        <Textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={optedOut ? 'Texting is blocked for this number' : 'Write a text… (Enter to send, Shift+Enter for a new line)'}
          disabled={optedOut} rows={2} className="min-h-[44px] max-h-40 text-sm resize-y"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} />
        <div className="flex items-center justify-between mt-1 px-0.5">
          <span className={cn('text-[10px]', segs.segments > 2 ? 'text-orange-600 font-medium' : 'text-gray-400')}>
            {segs.chars} chars · {segs.segments} segment{segs.segments === 1 ? '' : 's'}{segs.unicode ? ' · unicode' : ''}
          </span>
          <span className="text-[10px] text-gray-400 hidden sm:inline">From the ConveLabs number</span>
        </div>
      </div>
      <Button onClick={onSend} disabled={!canSend} size="icon" className="h-10 w-10 bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-lg flex-shrink-0" aria-label="Send">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  </div>
);

const ContextPanel: React.FC<{
  active: Thread; appts: PatientAppointment[]; upcoming: PatientAppointment[]; past: PatientAppointment[];
  paid: number; totalSpent: number; automatedCounts: Array<[string, number]>; basePath: string;
}> = ({ active, upcoming, past, paid, totalSpent, automatedCounts, basePath }) => {
  const ApptRow: React.FC<{ a: PatientAppointment; muted?: boolean }> = ({ a, muted }) => (
    <Link to={`${basePath}/schedule/calendar?appointment=${a.id}`} className="flex items-start gap-2 mb-2.5 last:mb-0 group">
      <Calendar className={cn('h-4 w-4 mt-0.5 flex-shrink-0', muted ? 'text-gray-400' : 'text-[#B91C1C]')} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight truncate group-hover:underline">{(a.service_name || a.service_type || 'Blood draw').replace(/_|-/g, ' ')}</p>
        <p className="text-xs text-gray-500">
          {formatAppointmentDate(a.appointment_date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}{a.appointment_time ? ` · ${apptTimeLabel(a.appointment_time)}` : ''}
        </p>
        <div className="flex gap-1 mt-0.5 flex-wrap">
          <Chip tone={a.status === 'confirmed' ? 'green' : a.status === 'completed' || a.status === 'specimen_delivered' ? 'gray' : 'amber'}>{a.status.replace(/_/g, ' ')}</Chip>
          {a.invoice_status && !['paid', 'voided', 'cancelled'].includes(a.invoice_status) && a.payment_status !== 'completed' && <Chip tone="orange">invoice {a.invoice_status.replace(/_/g, ' ')}</Chip>}
          {a.fasting_required && <Chip tone="amber">fasting</Chip>}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
    </Link>
  );
  return (
    <div>
      <div className="p-4 border-b space-y-1.5">
        {active.patient?.email && <a href={`mailto:${active.patient.email}`} className="text-sm text-[#B91C1C] hover:underline flex items-center gap-1.5 min-w-0"><Mail className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /><span className="truncate">{active.patient.email}</span></a>}
        <a href={`tel:${active.phone}`} className="text-sm text-gray-700 hover:underline flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{prettyPhone(active.phone)}</a>
        {active.patient?.id ? (
          <Link to={`${basePath}/patients`} state={{ patientId: active.patient.id }} className="text-xs text-[#B91C1C] hover:underline inline-flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" aria-hidden="true" /> Open patient chart</Link>
        ) : (
          <p className="text-xs text-amber-700">Number isn't on a patient record yet.</p>
        )}
      </div>
      <div className="px-4 py-3 border-b text-sm">
        <span className="font-semibold text-gray-800">{paid} paid visit{paid === 1 ? '' : 's'}</span>
        <span className="text-gray-400 mx-2">|</span>
        <span className="font-semibold text-emerald-700">${totalSpent.toFixed(2)}</span>
      </div>
      {upcoming.length > 0 && (
        <div className="p-4 border-b">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-2">Upcoming</p>
          {upcoming.map(a => <ApptRow key={a.id} a={a} />)}
        </div>
      )}
      <div className="p-4 border-b">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-2">Previous visits</p>
        {past.length === 0 ? <p className="text-xs text-gray-500">No previous visits</p> : past.slice(0, 5).map(a => <ApptRow key={a.id} a={a} muted />)}
      </div>
      <div className="p-4">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-2">Automated texts in this thread</p>
        {automatedCounts.length === 0 ? <p className="text-xs text-gray-500">None yet</p> : (
          <ul className="space-y-1">
            {automatedCounts.map(([label, n]) => <li key={label} className="flex items-center justify-between text-xs text-gray-700"><span className="inline-flex items-center gap-1.5"><Zap className="h-3 w-3 text-gray-400" aria-hidden="true" />{label}</span><span className="font-semibold">{n}</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
};
