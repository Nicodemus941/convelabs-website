/**
 * InboxTab — "Needs attention": everything the system dropped in a human's
 * lap. Three queues, one screen, one set of rules:
 *
 *   1. Insurance confirmations — OCR found a different carrier on a lab
 *      order than the chart has. Nudge the patient, accept the new card, or
 *      keep the existing one.
 *   2. Practices to call — a lab order auto-registered a practice we have no
 *      email for. Call, collect the email, send the welcome.
 *   3. Partner inquiries — a practice asked to partner through the website
 *      (status='new'). Highest-value lead the business gets; counted on the
 *      Inbox badge since 2026-09 but never listed anywhere in the inbox
 *      until now.
 *
 * Every queue reads from inbox/inboxQueries.ts, which the sidebar badge also
 * reads, so the number on the nav equals the rows on this screen.
 *
 * Layout follows LabOrdersTab: title row → count tiles → search + chips →
 * "Needs action" lane (stale / aging / new partner asks) on top of
 * "Everything else" → cards with sticky-style action rows. Any card can be
 * turned into an owned, dated task via CreateTaskSheet (source link kept in
 * activity_log.metadata).
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Inbox, ShieldCheck, Building2, Mail, Phone, Loader2, CheckCircle2, Send,
  AlertTriangle, Search, X, Handshake, ClipboardPlus, ExternalLink, Flame,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ageTier, fetchPendingInsurance, fetchDiscoveredOrgs, fetchPartnerInquiries, adminBasePath,
  type PendingChange, type DiscoveredOrg, type PartnerInquiry, type AgingTier,
} from './inbox/inboxQueries';
import { InboxHero, ChipRow, LaneHeader, AgingPill } from './inbox/InboxHero';
import CreateTaskSheet, { type TaskDefaults } from './inbox/CreateTaskSheet';

const db = supabase as any;

const AGING_BORDER: Record<AgingTier, string> = {
  fresh: '',
  aging: 'border-l-4 border-l-orange-500',
  stale: 'border-l-4 border-l-red-500',
};

type Queue = 'insurance' | 'org' | 'partner';
type FilterKey = 'all' | 'needs_action' | Queue | 'stale';

const InboxTab: React.FC = () => {
  const { user } = useAuth();
  const basePath = adminBasePath(user?.role);

  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [insuranceQ, setInsuranceQ] = useState<PendingChange[]>([]);
  const [orgsQ, setOrgsQ] = useState<DiscoveredOrg[]>([]);
  const [partnersQ, setPartnersQ] = useState<PartnerInquiry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  // Inline edit state per org row
  const [orgEdit, setOrgEdit] = useState<Record<string, { manager_email: string; contact_email: string; contact_phone: string }>>({});
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);
  const [unreachableOrgId, setUnreachableOrgId] = useState<string | null>(null);
  const [unreachableReason, setUnreachableReason] = useState<string>('Refused to share email');
  const [unreachableNote, setUnreachableNote] = useState<string>('');

  // Task composer
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskDefaults, setTaskDefaults] = useState<TaskDefaults | null>(null);
  const openTask = (d: TaskDefaults) => { setTaskDefaults(d); setTaskOpen(true); };

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const [ins, orgs, partners] = await Promise.all([
        fetchPendingInsurance(), fetchDiscoveredOrgs(), fetchPartnerInquiries(),
      ]);
      setInsuranceQ(ins);
      setOrgsQ(orgs);
      setPartnersQ(partners);
      const seed: typeof orgEdit = {};
      for (const o of orgs) {
        seed[o.id] = { manager_email: o.manager_email || '', contact_email: o.contact_email || '', contact_phone: o.contact_phone || '' };
      }
      setOrgEdit(prev => ({ ...seed, ...Object.fromEntries(Object.entries(prev).filter(([k]) => seed[k])) }));
    } catch (e: any) {
      console.warn('[inbox] refresh failed:', e);
      setLastError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime — all three queues update without a refresh (debounced).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => refresh(), 500); };
    const ch = supabase
      .channel('admin-inbox-realtime')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'pending_insurance_changes' }, bump)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'organizations' }, bump)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'provider_partnership_inquiries' }, bump)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [refresh]);

  /* ─── Insurance actions ───────────────────────────────────────── */

  const adminResolveInsurance = async (row: PendingChange, action: 'accepted_new' | 'kept_existing' | 'dismissed') => {
    if (action === 'accepted_new' && confirmAcceptId !== row.id) { setConfirmAcceptId(row.id); return; }
    setConfirmAcceptId(null);
    setBusy(row.id);
    try {
      if (action === 'accepted_new' && row.tenant_patient_id) {
        const { error } = await db.from('tenant_patients').update({
          insurance_provider: row.proposed_provider,
          insurance_member_id: row.proposed_member_id,
          insurance_group_number: row.proposed_group_number,
          updated_at: new Date().toISOString(),
        }).eq('id', row.tenant_patient_id);
        if (error) throw error;
      }
      const { error } = await db.from('pending_insurance_changes')
        .update({ status: action, resolved_at: new Date().toISOString(), resolved_by: user?.id || null })
        .eq('id', row.id);
      if (error) throw error;
      toast.success(action === 'accepted_new' ? 'Patient chart updated' : action === 'kept_existing' ? 'Existing kept' : 'Dismissed');
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const nudgePatient = async (row: PendingChange) => {
    if (!row.patient_email) { toast.error('No patient email on file'); return; }
    setBusy(row.id);
    try {
      await supabase.functions.invoke('send-email', {
        body: {
          to: row.patient_email,
          from: 'Nicodemme Jean-Baptiste <info@convelabs.com>',
          subject: 'Quick check on your insurance (30-second confirmation)',
          html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#111827;line-height:1.6;">
            <p>Hi ${row.patient_name || 'there'},</p>
            <p>Your most recent lab order shows different insurance than what we have on file. Please log in to your dashboard for a 30-second confirmation:</p>
            <p style="text-align:center;margin:18px 0;"><a href="https://www.convelabs.com/dashboard" style="display:inline-block;background:#B91C1C;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;">Confirm my insurance →</a></p>
            <p style="font-size:13px;color:#374151;">If you've recently switched insurance, tap "Use new" and we'll update your chart. If the lab order has stale info, tap "Keep existing" and nothing changes.</p>
            <p style="margin-top:16px;color:#374151;">Thanks,<br><strong>Nicodemme "Nico" Jean-Baptiste</strong><br><span style="font-size:12px;color:#6b7280;">Founder &amp; Owner, ConveLabs</span></p>
          </div>`,
        },
      });
      toast.success(`Reminder sent to ${row.patient_email}`);
    } catch (e: any) {
      toast.error(e?.message || 'Email failed');
    } finally {
      setBusy(null);
    }
  };

  /* ─── Org actions ─────────────────────────────────────────────── */

  const saveOrgComms = async (org: DiscoveredOrg) => {
    const edit = orgEdit[org.id];
    if (!edit) return;
    setBusy(org.id);
    try {
      const { error } = await db.from('organizations').update({
        manager_email: edit.manager_email || null,
        contact_email: edit.contact_email || null,
        contact_phone: edit.contact_phone || null,
        outreach_status: org.outreach_status === 'untouched' ? 'contacted' : org.outreach_status,
        updated_at: new Date().toISOString(),
      }).eq('id', org.id);
      if (error) throw error;
      toast.success(`${org.name} updated`);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const saveEmailAndWelcome = async (org: DiscoveredOrg) => {
    const edit = orgEdit[org.id];
    const targetEmail = (edit?.contact_email || edit?.manager_email || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) { toast.error('Enter a valid email first'); return; }
    setBusy(org.id);
    try {
      const { data, error } = await supabase.functions.invoke('org-outreach-action', {
        body: { organizationId: org.id, action: 'save_email_send_welcome', email: targetEmail, samplePatientName: org.last_patient_name || null },
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || error?.message || 'save failed');
      if ((data as any).welcome_sent) toast.success(`Saved + welcome email sent to ${org.name}`);
      else toast.warning((data as any).warning || 'Email saved but welcome failed');
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Save+welcome failed');
    } finally {
      setBusy(null);
    }
  };

  const logCallAttempt = async (orgId: string, outcome: 'left_voicemail' | 'no_answer' | 'busy') => {
    setBusy(orgId);
    try {
      const { data, error } = await supabase.functions.invoke('org-outreach-action', {
        body: { organizationId: orgId, action: 'log_attempt', outcome, note: null, snooze_days: 1 },
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || error?.message || 'log failed');
      toast.success(`${outcome === 'left_voicemail' ? 'Left voicemail' : outcome === 'no_answer' ? 'No answer' : 'Line busy'} — will re-surface tomorrow`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Could not log attempt');
    } finally {
      setBusy(null);
    }
  };

  const confirmUnreachable = async (orgId: string) => {
    const reason = (unreachableNote.trim() || unreachableReason).trim();
    setBusy(orgId);
    try {
      const { data, error } = await supabase.functions.invoke('org-outreach-action', {
        body: { organizationId: orgId, action: 'mark_unreachable', note: reason || 'Marked unreachable from inbox' },
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || error?.message || 'mark failed');
      toast.success('Marked unreachable — moved to Organizations tab');
      setUnreachableOrgId(null); setUnreachableNote(''); setUnreachableReason('Refused to share email');
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Mark failed');
    } finally {
      setBusy(null);
    }
  };

  /* ─── Partner inquiry actions ─────────────────────────────────── */

  const setInquiryStatus = async (row: PartnerInquiry, status: 'contacted' | 'closed') => {
    setBusy(row.id);
    try {
      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === 'contacted') { patch.contacted_at = new Date().toISOString(); patch.assigned_to = row.assigned_to || user?.id || null; }
      const { error } = await db.from('provider_partnership_inquiries').update(patch).eq('id', row.id);
      if (error) throw error;
      toast.success(status === 'contacted' ? 'Marked contacted — moved to Partners › Organizations › Outreach' : 'Closed');
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setBusy(null);
    }
  };

  /* ─── Derived ─────────────────────────────────────────────────── */

  type Item =
    | { kind: 'insurance'; id: string; at: string; tier: AgingTier; row: PendingChange }
    | { kind: 'org'; id: string; at: string; tier: AgingTier; row: DiscoveredOrg }
    | { kind: 'partner'; id: string; at: string; tier: AgingTier; row: PartnerInquiry };

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const r of insuranceQ) out.push({ kind: 'insurance', id: r.id, at: r.created_at, tier: ageTier(r.created_at), row: r });
    for (const o of orgsQ) out.push({ kind: 'org', id: o.id, at: o.first_discovered_at || o.last_referral_at || new Date().toISOString(), tier: ageTier(o.first_discovered_at), row: o });
    for (const p of partnersQ) out.push({ kind: 'partner', id: p.id, at: p.created_at, tier: ageTier(p.created_at), row: p });
    return out;
  }, [insuranceQ, orgsQ, partnersQ]);

  // "Needs action now" = anything stale/aging, plus every untouched partner ask.
  const needsAction = (it: Item) => it.tier !== 'fresh' || it.kind === 'partner';

  const matchesSearch = (it: Item, q: string) => {
    if (!q) return true;
    if (it.kind === 'insurance') {
      const r = it.row;
      return [r.patient_name, r.patient_email, r.proposed_provider, r.current_provider].some(v => (v || '').toLowerCase().includes(q));
    }
    if (it.kind === 'org') {
      const o = it.row;
      return [o.name, o.ordering_physician, o.last_patient_name, o.address_city, o.npi].some(v => (v || '').toLowerCase().includes(q));
    }
    const p = it.row;
    return [p.practice_name, p.contact_name, p.contact_email, p.contact_phone, p.practice_type].some(v => (v || '').toLowerCase().includes(q));
  };

  const counts = useMemo(() => ({
    all: items.length,
    needs_action: items.filter(needsAction).length,
    insurance: insuranceQ.length,
    org: orgsQ.length,
    partner: partnersQ.length,
    stale: items.filter(i => i.tier === 'stale').length,
  }), [items, insuranceQ.length, orgsQ.length, partnersQ.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      if (filter === 'needs_action' && !needsAction(it)) return false;
      if (filter === 'stale' && it.tier !== 'stale') return false;
      if ((filter === 'insurance' || filter === 'org' || filter === 'partner') && it.kind !== filter) return false;
      return matchesSearch(it, q);
    });
  }, [items, filter, search]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(needsAction);
    const rest = filtered.filter(i => !needsAction(i));
    return { action, rest };
  }, [filtered, filter]);

  const CHIPS: Array<{ key: FilterKey; label: string; count: number; dot?: string; desc: string }> = [
    { key: 'all', label: 'All', count: counts.all, desc: 'Every open item' },
    { key: 'needs_action', label: 'Needs action', count: counts.needs_action, desc: 'Stale or aging items, plus every new partner ask' },
    { key: 'insurance', label: 'Insurance', count: counts.insurance, dot: 'bg-amber-500', desc: 'Patients to confirm insurance with' },
    { key: 'org', label: 'Practices to call', count: counts.org, dot: 'bg-blue-500', desc: 'Auto-discovered practices missing an email' },
    { key: 'partner', label: 'Partner inquiries', count: counts.partner, dot: 'bg-purple-500', desc: 'Practices that asked to partner' },
    { key: 'stale', label: 'Stale 5+ d', count: counts.stale, dot: 'bg-red-500', desc: 'Untouched for five or more days' },
  ];

  /* ─── Cards ───────────────────────────────────────────────────── */

  const renderInsurance = (row: PendingChange, tier: AgingTier) => {
    const isConfirming = confirmAcceptId === row.id;
    return (
      <Card key={row.id} className={cn('border-amber-200 shadow-sm', AGING_BORDER[tier])}>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200 gap-1"><ShieldCheck className="h-3 w-3" /> Insurance</Badge>
                <AgingPill iso={row.created_at} label="awaiting patient" />
              </div>
              <p className="text-sm font-semibold mt-1">{row.patient_name}</p>
              <p className="text-[11px] text-gray-500">{row.patient_email || 'no email'} · queued {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}</p>
            </div>
            <div className="flex items-center gap-1">
              {row.patient_phone && (
                <Button variant="outline" size="sm" className="h-9 w-9 p-0" asChild><a href={`tel:${row.patient_phone}`} aria-label="Call patient"><Phone className="h-4 w-4" /></a></Button>
              )}
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1" title="Hand this to someone with a due date"
                onClick={() => openTask({
                  description: `Confirm insurance with ${row.patient_name}: lab order shows ${row.proposed_provider || '—'} (${row.proposed_member_id || '—'}), chart has ${row.current_provider || '—'}.`,
                  activityType: 'contact_attempt', patientId: row.tenant_patient_id, patientLabel: row.patient_name,
                  source: { type: 'insurance_change', id: row.id, label: `Insurance · ${row.patient_name}`, url: `${basePath}/inbox/action-items` },
                })}>
                <ClipboardPlus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Make task</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">On file</div>
              <div className="text-xs text-gray-800"><strong>{row.current_provider || '—'}</strong></div>
              <div className="text-[11px] text-gray-600">Member: {row.current_member_id || '—'} · Group: {row.current_group_number || '—'}</div>
            </div>
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-amber-800 font-bold mb-1">From lab order</div>
              <div className="text-xs text-gray-800"><strong>{row.proposed_provider || '—'}</strong></div>
              <div className="text-[11px] text-gray-600">Member: {row.proposed_member_id || '—'} · Group: {row.proposed_group_number || '—'}</div>
            </div>
          </div>

          {isConfirming ? (
            <div className="rounded-md border-2 border-red-300 bg-red-50 p-3 space-y-2" role="alertdialog" aria-label="Confirm chart overwrite">
              <p className="text-xs font-semibold text-red-900">This will overwrite {row.patient_name}'s insurance on file:</p>
              <p className="text-[11px] text-red-800"><strong>{row.current_provider || '—'}</strong> ({row.current_member_id || '—'}) → <strong>{row.proposed_provider || '—'}</strong> ({row.proposed_member_id || '—'})</p>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => setConfirmAcceptId(null)} disabled={busy === row.id}>Cancel</Button>
                <Button size="sm" className="h-9 text-xs bg-red-600 hover:bg-red-700 text-white gap-1" onClick={() => adminResolveInsurance(row, 'accepted_new')} disabled={busy === row.id}>
                  {busy === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Yes, overwrite chart
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-end -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5">
              <Button size="sm" variant="ghost" className="text-xs h-9 text-gray-500 flex-shrink-0" onClick={() => adminResolveInsurance(row, 'kept_existing')} disabled={busy === row.id}>Keep existing</Button>
              <Button size="sm" variant="outline" className="text-xs h-9 gap-1 flex-shrink-0" onClick={() => nudgePatient(row)} disabled={busy === row.id || !row.patient_email}><Send className="h-3 w-3" /> Email reminder</Button>
              <Button size="sm" className="text-xs h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1 flex-shrink-0" onClick={() => adminResolveInsurance(row, 'accepted_new')} disabled={busy === row.id}><CheckCircle2 className="h-3 w-3" /> Update chart</Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderOrg = (org: DiscoveredOrg, tier: AgingTier) => {
    const edit = orgEdit[org.id] || { manager_email: '', contact_email: '', contact_phone: '' };
    const showUnreachableForm = unreachableOrgId === org.id;
    const phone = org.office_phone || org.contact_phone || '';
    return (
      <Card key={org.id} className={cn('border-blue-200 shadow-sm', AGING_BORDER[tier])}>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-800 border-blue-200 gap-1"><Building2 className="h-3 w-3" /> Practice to call</Badge>
                <AgingPill iso={org.first_discovered_at} label={org.last_attempt_outcome ? `last: ${org.last_attempt_outcome.replace(/_/g, ' ')}` : 'new'} />
              </div>
              <p className="text-sm font-bold text-gray-900 mt-1 truncate">{org.name || <span className="text-amber-700 italic">Unnamed organization · review</span>}</p>
              {org.ordering_physician && <p className="text-xs text-gray-700">Dr. {org.ordering_physician.replace(/^Dr\.?\s*/i, '')}</p>}
              {org.last_patient_name && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Discovered from <strong className="text-gray-700">{org.last_patient_name}</strong>'s lab order
                  {org.last_appointment_date && <span> · appt {format(new Date(org.last_appointment_date), 'MMM d')}</span>}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-gray-600">
                {(org.address_street || org.address_city) && (
                  <span className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">{[org.address_street, org.address_city, org.address_state, org.address_zip].filter(Boolean).join(', ')}</span>
                )}
                {org.npi && <span className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">NPI {org.npi}</span>}
                {org.referral_count != null && org.referral_count > 0 && (
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">{org.referral_count} referral{org.referral_count === 1 ? '' : 's'}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {phone && <Button variant="outline" size="sm" className="h-9 text-xs gap-1" asChild><a href={`tel:${phone.replace(/\D/g, '')}`}><Phone className="h-3.5 w-3.5" /> {phone}</a></Button>}
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1" title="Hand this to someone with a due date"
                onClick={() => openTask({
                  description: `Call ${org.name || 'practice'}${phone ? ` at ${phone}` : ''} to get a practice email so notifications can route there.`,
                  activityType: 'call',
                  source: { type: 'discovered_org', id: org.id, label: `Practice · ${org.name || 'unnamed'}`, url: `${basePath}/partners/organizations` },
                })}>
                <ClipboardPlus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Make task</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <Label htmlFor={`mgr-${org.id}`} className="text-[11px] flex items-center gap-1"><Mail className="h-3 w-3" /> Manager email</Label>
              <Input id={`mgr-${org.id}`} className="h-10 sm:h-9 text-sm" value={edit.manager_email} placeholder="manager@practice.com" inputMode="email"
                onChange={(e) => setOrgEdit(s => ({ ...s, [org.id]: { ...edit, manager_email: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor={`ctc-${org.id}`} className="text-[11px] flex items-center gap-1"><Mail className="h-3 w-3" /> Practice email</Label>
              <Input id={`ctc-${org.id}`} className="h-10 sm:h-9 text-sm" value={edit.contact_email} placeholder="info@practice.com" inputMode="email"
                onChange={(e) => setOrgEdit(s => ({ ...s, [org.id]: { ...edit, contact_email: e.target.value } }))} />
            </div>
            <div>
              <Label htmlFor={`ph-${org.id}`} className="text-[11px] flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
              <Input id={`ph-${org.id}`} className="h-10 sm:h-9 text-sm" value={edit.contact_phone} placeholder="(407) 555-1234" inputMode="tel"
                onChange={(e) => setOrgEdit(s => ({ ...s, [org.id]: { ...edit, contact_phone: e.target.value } }))} />
            </div>
          </div>

          {showUnreachableForm ? (
            <div className="rounded-md border-2 border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-red-900">Why is {org.name} unreachable?</p>
              <select value={unreachableReason} onChange={(e) => setUnreachableReason(e.target.value)} aria-label="Reason"
                className="w-full h-10 sm:h-9 text-xs border border-gray-200 rounded-md px-2 bg-white">
                <option>Refused to share email</option>
                <option>No response after 3 calls</option>
                <option>Front desk said send fax instead</option>
                <option>Number disconnected / wrong</option>
                <option>Practice closed / merged</option>
                <option>Other</option>
              </select>
              <Input placeholder="Additional note (optional)" value={unreachableNote} onChange={(e) => setUnreachableNote(e.target.value)} className="h-10 sm:h-9 text-xs" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => { setUnreachableOrgId(null); setUnreachableNote(''); }} disabled={busy === org.id}>Cancel</Button>
                <Button size="sm" className="h-9 text-xs bg-red-600 hover:bg-red-700 text-white gap-1" onClick={() => confirmUnreachable(org.id)} disabled={busy === org.id}>
                  {busy === org.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />} Confirm unreachable
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-end -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5">
              <Button size="sm" variant="ghost" className="text-xs h-9 text-gray-500 hover:text-amber-700 flex-shrink-0" onClick={() => logCallAttempt(org.id, 'left_voicemail')} disabled={busy === org.id} title="Logs voicemail and re-surfaces tomorrow">Voicemail · retry tomorrow</Button>
              <Button size="sm" variant="ghost" className="text-xs h-9 text-gray-500 hover:text-amber-700 flex-shrink-0" onClick={() => logCallAttempt(org.id, 'no_answer')} disabled={busy === org.id} title="Logs no answer and re-surfaces tomorrow">No answer · retry tomorrow</Button>
              <Button size="sm" variant="ghost" className="text-xs h-9 text-gray-500 hover:text-red-700 flex-shrink-0" onClick={() => { setUnreachableOrgId(org.id); setUnreachableReason('Refused to share email'); setUnreachableNote(''); }} disabled={busy === org.id}>Mark unreachable</Button>
              <Button size="sm" variant="outline" className="text-xs h-9 flex-shrink-0" onClick={() => saveOrgComms(org)} disabled={busy === org.id}>Save (no email yet)</Button>
              <Button size="sm" className="text-xs h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1 flex-shrink-0" onClick={() => saveEmailAndWelcome(org)}
                disabled={busy === org.id || !((edit.contact_email || edit.manager_email || '').trim().includes('@'))}>
                {busy === org.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Save email + send welcome
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderPartner = (p: PartnerInquiry, tier: AgingTier) => (
    <Card key={p.id} className={cn('border-purple-200 shadow-sm', AGING_BORDER[tier])}>
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-800 border-purple-200 gap-1"><Handshake className="h-3 w-3" /> Partner inquiry</Badge>
              <AgingPill iso={p.created_at} label="new" />
              <span className="text-[11px] text-gray-500">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</span>
            </div>
            <p className="text-sm font-bold text-gray-900 mt-1 truncate">{p.practice_name || 'Practice (unnamed)'}</p>
            <p className="text-xs text-gray-700">{[p.contact_name, p.contact_role].filter(Boolean).join(' · ') || 'No contact name'}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-gray-600">
              {p.practice_type && <span className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">{p.practice_type}</span>}
              {p.monthly_patient_volume && <span className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">{p.monthly_patient_volume} pts/mo</span>}
              {p.referral_source && <span className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">via {p.referral_source}</span>}
            </div>
            {p.notes && <p className="text-xs text-gray-700 mt-2 bg-purple-50/50 border border-purple-100 rounded-md px-2.5 py-1.5 whitespace-pre-wrap">{p.notes}</p>}
          </div>
          <div className="flex items-center gap-1">
            {p.contact_phone && <Button variant="outline" size="sm" className="h-9 w-9 p-0" asChild><a href={`tel:${p.contact_phone.replace(/\D/g, '')}`} aria-label="Call"><Phone className="h-4 w-4" /></a></Button>}
            {p.contact_email && <Button variant="outline" size="sm" className="h-9 w-9 p-0" asChild><a href={`mailto:${p.contact_email}`} aria-label="Email"><Mail className="h-4 w-4" /></a></Button>}
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1"
              onClick={() => openTask({
                description: `Reply to partner inquiry from ${p.practice_name || 'practice'} (${p.contact_name || 'contact'}${p.contact_email ? `, ${p.contact_email}` : ''}${p.contact_phone ? `, ${p.contact_phone}` : ''}).`,
                activityType: 'inquiry', priority: 'urgent',
                source: { type: 'partner_inquiry', id: p.id, label: `Partner · ${p.practice_name || 'practice'}`, url: `${basePath}/partners/organizations` },
              })}>
              <ClipboardPlus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Make task</span>
            </Button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-end -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5">
          <Button size="sm" variant="ghost" className="text-xs h-9 text-gray-500 flex-shrink-0" onClick={() => setInquiryStatus(p, 'closed')} disabled={busy === p.id}>Not a fit · close</Button>
          <Button size="sm" variant="outline" className="text-xs h-9 gap-1 flex-shrink-0" asChild>
            <Link to={`${basePath}/partners/organizations`}><ExternalLink className="h-3 w-3" /> Open in Partners</Link>
          </Button>
          <Button size="sm" className="text-xs h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1 flex-shrink-0" onClick={() => setInquiryStatus(p, 'contacted')} disabled={busy === p.id}>
            {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} I reached out
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderItem = (it: Item) =>
    it.kind === 'insurance' ? renderInsurance(it.row, it.tier)
    : it.kind === 'org' ? renderOrg(it.row, it.tier)
    : renderPartner(it.row, it.tier);

  const activeChip = CHIPS.find(c => c.key === filter) || CHIPS[0];

  return (
    <div className="space-y-4 sm:space-y-5">
      <InboxHero
        icon={Inbox}
        title="Needs attention"
        subtitle={<>Patient confirmations, practices to call and partner asks waiting on a human. {counts.needs_action > 0 && <span className="font-medium text-red-700">{counts.needs_action} need action now.</span>}</>}
        loading={loading}
        onRefresh={refresh}
        activeKey={filter === 'all' || filter === 'needs_action' ? null : filter}
        onTile={(k) => setFilter(filter === k ? 'all' : (k as FilterKey))}
        tiles={[
          { key: 'insurance', label: 'Insurance', value: counts.insurance, tone: 'amber', desc: 'Patients to confirm insurance with' },
          { key: 'org', label: 'Practices to call', value: counts.org, tone: 'blue', desc: 'Practices missing an email' },
          { key: 'partner', label: 'Partner asks', value: counts.partner, tone: 'purple', hot: true, desc: 'New partnership inquiries' },
          { key: 'stale', label: 'Stale 5+ days', value: counts.stale, tone: 'red', hot: true, desc: 'Untouched for five or more days' },
        ]}
        actions={
          <Button size="sm" className="h-10 sm:h-9 text-xs bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5" onClick={() => openTask({ source: { type: 'manual' } })}>
            <ClipboardPlus className="h-4 w-4" /> <span className="hidden sm:inline">New task</span><span className="sm:hidden">Task</span>
          </Button>
        }
      />

      {lastError && (
        <Card className="border-red-300 bg-red-50" role="alert">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs flex-1">
              <p className="font-semibold text-red-800">Couldn't load the inbox</p>
              <p className="text-red-700 mt-0.5 font-mono break-all">{lastError}</p>
            </div>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={refresh}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Search + chips */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient, practice, doctor, email, phone…" aria-label="Search inbox" className="h-10 sm:h-9 pl-8 text-sm" />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
          )}
        </div>
        <ChipRow chips={CHIPS} active={filter} onChange={(k) => setFilter(k as FilterKey)} ariaLabel="Queue filter" />
      </div>

      {/* Body */}
      {loading && items.length === 0 ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold">{items.length === 0 ? 'Nothing needs attention' : `No ${activeChip.label.toLowerCase()} items${search ? ` matching "${search}"` : ''}`}</p>
          <p className="text-xs text-gray-500 mt-1">
            {items.length === 0
              ? 'Insurance mismatches, new practices and partner asks land here the moment they happen.'
              : <button type="button" onClick={() => { setFilter('all'); setSearch(''); }} className="text-[#B91C1C] hover:underline">Show everything</button>}
          </p>
        </CardContent></Card>
      ) : lanes ? (
        <div className="space-y-5">
          {lanes.action.length > 0 && (
            <section aria-labelledby="lane-action" className="space-y-2.5">
              <LaneHeader id="lane-action" title="Needs action" count={lanes.action.length} tone="red" hint="stale, aging, or a new partner ask" />
              {lanes.action.map(renderItem)}
            </section>
          )}
          {lanes.rest.length > 0 && (
            <section aria-labelledby="lane-rest" className="space-y-2.5">
              <LaneHeader id="lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" hint="fresh — under three days old" />
              {lanes.rest.map(renderItem)}
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">{filtered.map(renderItem)}</div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Flame className="h-3 w-3" aria-hidden="true" /> Showing {filtered.length} of {items.length} open item{items.length === 1 ? '' : 's'} · the Inbox badge counts these same rows.
      </p>

      <CreateTaskSheet open={taskOpen} onOpenChange={setTaskOpen} defaults={taskDefaults} />
    </div>
  );
};

export default InboxTab;
