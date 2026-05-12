/**
 * PatientCommsTimeline — unified comms history per patient.
 *
 * Hormozi: "if you can't see what was sent, you can't trust the relationship."
 * Today admin has to look in 4 different places to answer "did Susan get
 * the link?" This card aggregates every touchpoint into one chronological feed.
 *
 * Sources (all read-only, no outbound traffic fires):
 *   1. notification_logs            — every system SMS (transactional)
 *   2. sms_messages + sms_conversations — inbound + outbound conversation
 *   3. email_send_log               — every Mailgun-routed email + status
 *   4. booking_prefill_tokens       — sent → opened → consumed funnel
 *   5. patient_lab_requests         — provider-initiated draws
 *
 * Each row shows: timestamp, direction, channel, subject/body preview,
 * status (sent / opened / clicked / bounced / consumed). One-click "Copy URL"
 * for tokenized invites so admin can re-share manually if a patient says
 * they never got it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  Mail, MessageSquare, FileText, Link2, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, ExternalLink, Copy, Building2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  patientId: string;
  patientEmail: string | null;
  patientPhone: string | null;
}

interface TimelineEvent {
  id: string;
  at: string;                                  // ISO timestamp
  channel: 'sms' | 'email' | 'token' | 'lab_request';
  direction: 'outbound' | 'inbound' | 'system';
  title: string;                               // subject or first 60 chars of body
  detail?: string;                             // longer description
  status?: string;                             // sent / opened / clicked / bounced / consumed / expired
  statusKind?: 'good' | 'warn' | 'bad' | 'neutral';
  url?: string | null;                         // tokenized link if applicable
  rawBody?: string | null;                     // for expanded preview
}

const normPhoneLast10 = (raw: string | null | undefined): string => (raw || '').replace(/\D/g, '').slice(-10);

const PatientCommsTimeline: React.FC<Props> = ({ patientId, patientEmail, patientPhone }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const emailLower = (patientEmail || '').trim().toLowerCase();
        const phoneLast10 = normPhoneLast10(patientPhone);

        // 1) notification_logs (outbound SMS)
        const logsQuery = phoneLast10
          ? supabase.from('notification_logs' as any)
              .select('id, notification_type, recipient_phone, message, sent_at, created_at, status')
              .ilike('notification_type', '%sms%')
              .ilike('recipient_phone', `%${phoneLast10}%`)
              .order('created_at', { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [] as any[] });

        // 2) sms_messages via sms_conversations (in + out)
        const convoQuery = phoneLast10
          ? supabase.from('sms_conversations' as any)
              .select('id, patient_phone')
              .ilike('patient_phone', `%${phoneLast10}%`)
          : Promise.resolve({ data: [] as any[] });

        // 3) email_send_log
        const emailQuery = emailLower
          ? supabase.from('email_send_log' as any)
              .select('id, to_email, email_type, subject, status, mailgun_id, sent_at, last_error')
              .ilike('to_email', emailLower)
              .order('sent_at', { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [] as any[] });

        // 4) booking_prefill_tokens
        const tokenQuery = supabase.from('booking_prefill_tokens')
          .select('id, token, service_name, service_type, organization_name, provider_office_label, lab_order_path, sms_sent, email_sent, sent_at, opened_at, open_count, consumed_at, expires_at, send_error, appointment_id')
          .or(`patient_id.eq.${patientId}${emailLower ? `,patient_email.ilike.${emailLower}` : ''}`)
          .order('created_at', { ascending: false })
          .limit(50);

        // 5) patient_lab_requests — table has no patient_id FK; identify by email
        const labReqQuery = emailLower
          ? supabase.from('patient_lab_requests' as any)
              .select('id, access_token, patient_name, status, created_at, patient_notified_at, patient_viewed_at, patient_scheduled_at, draw_by_date, organization_id')
              .ilike('patient_email', emailLower)
              .order('created_at', { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] as any[] });

        const [logsRes, convoRes, emailRes, tokenRes, labReqRes] = await Promise.all([
          logsQuery, convoQuery, emailQuery, tokenQuery, labReqQuery,
        ]);

        if (cancelled) return;
        const all: TimelineEvent[] = [];

        // notification_logs → outbound SMS events
        ((logsRes.data as any[]) || []).forEach((m) => {
          const body = typeof m.message === 'string' ? m.message : JSON.stringify(m.message || '');
          all.push({
            id: `nl-${m.id}`,
            at: m.sent_at || m.created_at,
            channel: 'sms',
            direction: 'outbound',
            title: body.slice(0, 80) || '(SMS sent)',
            rawBody: body,
            status: m.status || 'sent',
            statusKind: m.status === 'failed' ? 'bad' : 'good',
          });
        });

        // sms_messages (resolved via conversation ids)
        const convoIds = ((convoRes.data as any[]) || []).map((c: any) => c.id);
        if (convoIds.length > 0) {
          const { data: msgs } = await supabase.from('sms_messages' as any)
            .select('id, conversation_id, direction, body, status, created_at')
            .in('conversation_id', convoIds)
            .order('created_at', { ascending: false })
            .limit(200);
          ((msgs as any[]) || []).forEach((m) => {
            const body = typeof m.body === 'string' ? m.body : JSON.stringify(m.body || '');
            all.push({
              id: `sm-${m.id}`,
              at: m.created_at,
              channel: 'sms',
              direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
              title: body.slice(0, 80) || (m.direction === 'inbound' ? '(reply)' : '(SMS)'),
              rawBody: body,
              status: m.status || (m.direction === 'inbound' ? 'received' : 'sent'),
              statusKind: 'good',
            });
          });
        }

        // email_send_log
        ((emailRes.data as any[]) || []).forEach((e) => {
          let kind: TimelineEvent['statusKind'] = 'neutral';
          if (e.status === 'opened' || e.status === 'clicked') kind = 'good';
          else if (e.status === 'sent') kind = 'neutral';
          else if (e.status === 'bounced' || e.status === 'failed' || e.status === 'complained') kind = 'bad';
          all.push({
            id: `el-${e.id}`,
            at: e.sent_at,
            channel: 'email',
            direction: 'outbound',
            title: e.subject || e.email_type || '(email)',
            detail: e.email_type ? `Type: ${e.email_type}` : undefined,
            status: e.status,
            statusKind: kind,
          });
        });

        // booking_prefill_tokens — one event per token (most important: opened + consumed)
        ((tokenRes.data as any[]) || []).forEach((t) => {
          const url = `${window.location.origin}/book-now?prefill=${t.token}`;
          let status = 'sent';
          let kind: TimelineEvent['statusKind'] = 'neutral';
          if (t.consumed_at) { status = 'booked'; kind = 'good'; }
          else if (new Date(t.expires_at).getTime() < Date.now()) { status = 'expired'; kind = 'warn'; }
          else if (t.opened_at) { status = `opened ×${t.open_count || 1}`; kind = 'good'; }
          else if (t.send_error) { status = 'send_failed'; kind = 'bad'; }
          const channels: string[] = [];
          if (t.sms_sent) channels.push('SMS');
          if (t.email_sent) channels.push('email');
          const orgLabel = t.organization_name || t.provider_office_label;
          all.push({
            id: `bpt-${t.id}`,
            at: t.sent_at || t.opened_at || new Date().toISOString(),
            channel: 'token',
            direction: 'outbound',
            title: `${t.service_name || t.service_type} booking link${orgLabel ? ` (${orgLabel})` : ''}`,
            detail: [
              channels.length > 0 ? `Sent via ${channels.join(' + ')}` : 'No channel succeeded',
              t.lab_order_path ? '📄 Lab order attached' : null,
              t.appointment_id ? '✓ Resulted in appointment' : null,
            ].filter(Boolean).join(' · '),
            status,
            statusKind: kind,
            url,
          });
        });

        // patient_lab_requests
        ((labReqRes.data as any[]) || []).forEach((r) => {
          const url = `${window.location.origin}/lab-request/${r.access_token}`;
          let status = r.status || 'pending';
          let kind: TimelineEvent['statusKind'] = 'neutral';
          if (status === 'scheduled' || status === 'completed') kind = 'good';
          else if (status === 'cancelled' || status === 'expired') kind = 'warn';
          all.push({
            id: `lr-${r.id}`,
            at: r.patient_notified_at || r.created_at,
            channel: 'lab_request',
            direction: 'outbound',
            title: `Lab request${r.draw_by_date ? ` (deadline ${r.draw_by_date.slice(0, 10)})` : ''}`,
            detail: r.patient_viewed_at ? `Patient last opened ${formatDistanceToNow(new Date(r.patient_viewed_at), { addSuffix: true })}` : 'Patient hasn\'t opened yet',
            status,
            statusKind: kind,
            url,
          });
        });

        // Sort newest first
        all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        setEvents(all);
      } catch (err) {
        console.warn('[PatientCommsTimeline] load failed:', err);
        setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, patientEmail, patientPhone]);

  const visible = useMemo(() => showAll ? events : events.slice(0, 12), [events, showAll]);

  const counts = useMemo(() => {
    const c = { sms: 0, email: 0, token: 0, lab: 0, inbound: 0, bounced: 0 };
    for (const e of events) {
      if (e.channel === 'sms') c.sms++;
      if (e.channel === 'email') c.email++;
      if (e.channel === 'token') c.token++;
      if (e.channel === 'lab_request') c.lab++;
      if (e.direction === 'inbound') c.inbound++;
      if (e.statusKind === 'bad') c.bounced++;
    }
    return c;
  }, [events]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const copyUrl = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { toast.error('Copy failed'); }
  };

  const iconFor = (e: TimelineEvent) => {
    if (e.channel === 'email') return <Mail className="h-3.5 w-3.5" />;
    if (e.channel === 'token') return <Link2 className="h-3.5 w-3.5" />;
    if (e.channel === 'lab_request') return <FileText className="h-3.5 w-3.5" />;
    return <MessageSquare className="h-3.5 w-3.5" />;
  };

  const statusBadge = (e: TimelineEvent) => {
    if (!e.status) return null;
    const cls = e.statusKind === 'good' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : e.statusKind === 'warn' ? 'bg-amber-50 text-amber-700 border-amber-200'
      : e.statusKind === 'bad' ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-gray-50 text-gray-600 border-gray-200';
    return <Badge variant="outline" className={`text-[10px] font-medium ${cls}`}>{e.status}</Badge>;
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-[#B91C1C]" />
              Communications timeline
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Every SMS, email, and tokenized link for this patient — newest first.</p>
          </div>
          {!loading && events.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span>{counts.sms} SMS</span>·<span>{counts.email} email</span>·<span>{counts.token} link</span>
              {counts.inbound > 0 && <span className="text-emerald-700">· {counts.inbound} replied</span>}
              {counts.bounced > 0 && <span className="text-red-700">· {counts.bounced} failed</span>}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-3 text-center">No comms on file yet. Use ⚡ Send Booking Link to start the relationship.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {visible.map((e) => {
                const isOpen = expanded.has(e.id);
                const when = new Date(e.at);
                const ago = formatDistanceToNow(when, { addSuffix: true });
                return (
                  <div key={e.id} className="border border-gray-200 rounded-md text-xs">
                    <button
                      type="button"
                      onClick={() => toggle(e.id)}
                      className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-gray-50 transition text-left"
                    >
                      <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                        e.direction === 'inbound' ? 'bg-emerald-50 text-emerald-700'
                          : e.channel === 'email' ? 'bg-blue-50 text-blue-700'
                          : e.channel === 'token' ? 'bg-purple-50 text-purple-700'
                          : e.channel === 'lab_request' ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {iconFor(e)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-gray-900 truncate">
                            {e.direction === 'inbound' ? '↩ ' : ''}{e.title}
                          </span>
                          {statusBadge(e)}
                        </span>
                        <span className="text-[10px] text-gray-500">{ago} · {format(when, 'MMM d, yyyy h:mm a')}{e.detail ? ` · ${e.detail}` : ''}</span>
                      </span>
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-2.5 pb-2 pt-1 border-t border-gray-100 text-[11px] text-gray-700 space-y-1.5">
                        {e.rawBody && (
                          <p className="whitespace-pre-wrap break-words bg-gray-50 rounded p-2">{e.rawBody}</p>
                        )}
                        {e.url && (
                          <div className="flex items-center gap-1.5">
                            <code className="flex-1 text-[10px] truncate bg-gray-50 rounded px-1.5 py-1 font-mono">{e.url}</code>
                            <button type="button" onClick={() => copyUrl(e.url!)} className="text-gray-600 hover:text-gray-900" title="Copy"><Copy className="h-3 w-3" /></button>
                            <a href={e.url} target="_blank" rel="noopener" className="text-gray-600 hover:text-gray-900" title="Preview"><ExternalLink className="h-3 w-3" /></a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {events.length > 12 && (
              <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setShowAll(s => !s)}>
                {showAll ? 'Show recent only' : `Show all ${events.length} events`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PatientCommsTimeline;
