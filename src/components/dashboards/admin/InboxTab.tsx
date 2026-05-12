/**
 * InboxTab — single canvas for everything the OCR pipeline drops in
 * the admin's lap and needs a human touch:
 *
 *   1. Pending insurance changes (patients with mismatch detected on
 *      a lab order, hasn't confirmed via dashboard yet) — admin can
 *      nudge the patient, force-accept the proposed, or keep existing.
 *
 *   2. Auto-discovered organizations missing manager_email / contact_email
 *      (the OCR-flywheel found a new practice but admin hasn't filled
 *      comms metadata, so system notifications can't route there yet).
 *
 * Hormozi rule: "the dashboard's job is to point at the fire." This
 * tab counts the open items in its title so the sidebar Inbox badge
 * mirrors what the admin actually has to do.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Inbox, RefreshCw, ShieldCheck, Building2, Mail, Phone, Loader2,
  CheckCircle2, Send, AlertTriangle, ArrowRight, Search, X,
  Clock, Flame, MoreVertical,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';

// Hormozi: aging signal lets stale fires surface BEFORE they become a
// complaint. Mirror of LabOrdersTab semantics.
type AgingTier = 'fresh' | 'aging' | 'stale';
function ageTier(iso: string): AgingTier {
  const d = differenceInDays(new Date(), new Date(iso));
  if (d >= 5) return 'stale';
  if (d >= 3) return 'aging';
  return 'fresh';
}
const AGING_BORDER: Record<AgingTier, string> = {
  fresh: '',
  aging: 'border-l-4 border-l-orange-500',
  stale: 'border-l-4 border-l-red-500',
};

interface PendingChange {
  id: string;
  appointment_id: string | null;
  appointment_lab_order_id: string | null;
  tenant_patient_id: string | null;
  current_provider: string | null;
  current_member_id: string | null;
  current_group_number: string | null;
  proposed_provider: string | null;
  proposed_member_id: string | null;
  proposed_group_number: string | null;
  status: string;
  created_at: string;
  // joined
  patient_name?: string;
  patient_email?: string | null;
}

interface DiscoveredOrg {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  manager_email: string | null;
  npi: string | null;
  ordering_physician: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  office_phone: string | null;
  outreach_status: string | null;
  outreach_note: string | null;
  referral_count: number | null;
  first_discovered_at: string | null;
  last_referral_at: string | null;
  // Joined: most recent appointment for this org (the patient who triggered the discovery)
  last_patient_name?: string | null;
  last_appointment_date?: string | null;
}

const InboxTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [insuranceQ, setInsuranceQ] = useState<PendingChange[]>([]);
  const [orgsQ, setOrgsQ] = useState<DiscoveredOrg[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Inline edit state per org row
  const [orgEdit, setOrgEdit] = useState<Record<string, { manager_email: string; contact_email: string; contact_phone: string }>>({});

  // Search per section + confirm/reason-picker UI state
  const [insSearch, setInsSearch] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);
  const [unreachableOrgId, setUnreachableOrgId] = useState<string | null>(null);
  const [unreachableReason, setUnreachableReason] = useState<string>('Refused to share email');
  const [unreachableNote, setUnreachableNote] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Pending insurance — admin sees ALL open rows
      const { data: insurance } = await supabase
        .from('pending_insurance_changes' as any)
        .select(`
          id, appointment_id, appointment_lab_order_id, tenant_patient_id,
          current_provider, current_member_id, current_group_number,
          proposed_provider, proposed_member_id, proposed_group_number,
          status, created_at,
          tenant_patients!inner(first_name, last_name, email)
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      const ins = (insurance as any[] || []).map(r => ({
        ...r,
        patient_name: [r.tenant_patients?.first_name, r.tenant_patients?.last_name].filter(Boolean).join(' ') || 'Patient',
        patient_email: r.tenant_patients?.email || null,
      }));
      setInsuranceQ(ins);

      // Discovered orgs awaiting admin action.
      //   - Live org row (is_active=true)
      //   - Missing email (so we can welcome them)
      //   - NOT yet marked unreachable (those drop out of the inbox)
      //   - NOT yet welcomed (welcomed orgs don't need admin touch)
      const { data: orgs } = await supabase
        .from('organizations')
        .select(`
          id, name, contact_email, contact_phone, manager_email, npi,
          ordering_physician, address_street, address_city, address_state,
          address_zip, office_phone, outreach_status, outreach_note,
          referral_count, first_discovered_at, last_referral_at
        `)
        .eq('discovered_from_lab_order', true as any)
        .eq('is_active', true)
        .or('outreach_status.is.null,outreach_status.in.(pending,untouched,contacted)')
        .or('manager_email.is.null,contact_email.is.null')
        .order('referral_count', { ascending: false, nullsFirst: false })
        .order('first_discovered_at', { ascending: false })
        .limit(50);

      // Enrich each org with the most-recent patient who referred them
      // (so admin sees "Discovered from Sarah Lee's lab order"). One query
      // for all orgs, then map back.
      const orgIds = ((orgs as any[]) || []).map(o => o.id);
      const lastPatientByOrg = new Map<string, { name: string; date: string }>();
      if (orgIds.length > 0) {
        const { data: lastAppts } = await supabase
          .from('appointments')
          .select('organization_id, patient_name, appointment_date, created_at')
          .in('organization_id', orgIds)
          .order('created_at', { ascending: false });
        for (const a of (lastAppts as any[] || [])) {
          if (!lastPatientByOrg.has(a.organization_id)) {
            lastPatientByOrg.set(a.organization_id, {
              name: a.patient_name || 'Unknown',
              date: a.appointment_date,
            });
          }
        }
      }
      const enriched = ((orgs as any[]) || []).map(o => ({
        ...o,
        last_patient_name: lastPatientByOrg.get(o.id)?.name || null,
        last_appointment_date: lastPatientByOrg.get(o.id)?.date || null,
      }));
      setOrgsQ(enriched as any);

      // Pre-seed inline edit state
      const seed: typeof orgEdit = {};
      for (const o of (orgs as any[] || [])) {
        seed[o.id] = {
          manager_email: o.manager_email || '',
          contact_email: o.contact_email || '',
          contact_phone: o.contact_phone || '',
        };
      }
      setOrgEdit(seed);
    } catch (e) {
      console.warn('[inbox] refresh failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime — both queues update without a refresh
  useEffect(() => {
    const ch = supabase
      .channel('admin-inbox-realtime')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'pending_insurance_changes' }, () => refresh())
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'organizations' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  /* ─── Insurance actions ───────────────────────────────────────── */

  const adminResolveInsurance = async (row: PendingChange, action: 'accepted_new' | 'kept_existing' | 'dismissed') => {
    // Confirm-gate the destructive action. The accept flips the patient
    // chart's insurance — a one-click miss could write a wrong carrier
    // onto an active patient. Two-step now.
    if (action === 'accepted_new' && confirmAcceptId !== row.id) {
      setConfirmAcceptId(row.id);
      return;
    }
    setConfirmAcceptId(null);
    setBusy(row.id);
    try {
      // For accepted_new, also UPDATE tenant_patients
      if (action === 'accepted_new' && row.tenant_patient_id) {
        await supabase.from('tenant_patients').update({
          insurance_provider: row.proposed_provider,
          insurance_member_id: row.proposed_member_id,
          insurance_group_number: row.proposed_group_number,
          updated_at: new Date().toISOString(),
        }).eq('id', row.tenant_patient_id);
      }
      await supabase.from('pending_insurance_changes' as any)
        .update({ status: action, resolved_at: new Date().toISOString() })
        .eq('id', row.id);
      toast.success(action === 'accepted_new' ? 'Patient chart updated' : action === 'kept_existing' ? 'Existing kept' : 'Dismissed');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const nudgePatient = async (row: PendingChange) => {
    if (!row.patient_email) {
      toast.error('No patient email on file');
      return;
    }
    setBusy(row.id);
    try {
      // Send a friendly reminder email so they confirm via the dashboard modal
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
      const { error } = await supabase.from('organizations').update({
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

  const sendOrgInvite = async (org: DiscoveredOrg) => {
    const edit = orgEdit[org.id];
    const targetEmail = (edit?.manager_email || org.manager_email || edit?.contact_email || org.contact_email || '').trim();
    if (!targetEmail) {
      toast.error('Save a manager / contact email first');
      return;
    }
    setBusy(org.id);
    try {
      // Save changes first (in case admin typed without saving)
      if (edit) await saveOrgComms(org);
      // Fire the org-manager invite flow
      const { data, error } = await supabase.functions.invoke('invite-org-manager', {
        body: {
          email: targetEmail,
          organizationId: org.id,
          fullName: null,
          redirectTo: '/dashboard/provider',
        },
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || error?.message || 'invite failed');
      toast.success(`Invite sent to ${targetEmail}`);
    } catch (e: any) {
      toast.error(e?.message || 'Invite failed');
    } finally {
      setBusy(null);
    }
  };

  // Hormozi flow: admin obtained the org's email → save it + auto-fire
  // welcome email → org disappears from inbox.
  const saveEmailAndWelcome = async (org: DiscoveredOrg) => {
    const edit = orgEdit[org.id];
    const targetEmail = (edit?.contact_email || edit?.manager_email || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      toast.error('Enter a valid email first');
      return;
    }
    setBusy(org.id);
    try {
      const { data, error } = await supabase.functions.invoke('org-outreach-action', {
        body: {
          organizationId: org.id,
          action: 'save_email_send_welcome',
          email: targetEmail,
          samplePatientName: org.last_patient_name || null,
        },
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || error?.message || 'save failed');
      if ((data as any).welcome_sent) {
        toast.success(`Saved + welcome email sent to ${org.name}`);
      } else {
        toast.warning((data as any).warning || `Email saved but welcome failed`);
      }
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Save+welcome failed');
    } finally {
      setBusy(null);
    }
  };

  // Hormozi: admin tried to reach the org, they refused or unavailable.
  // Opens inline reason picker (no jarring window.prompt). On confirm,
  // marks unreachable; org stays in Organizations tab with a note but
  // disappears from the inbox.
  const confirmUnreachable = async (orgId: string) => {
    const reason = (unreachableNote.trim() || unreachableReason).trim();
    setBusy(orgId);
    try {
      const { data, error } = await supabase.functions.invoke('org-outreach-action', {
        body: {
          organizationId: orgId,
          action: 'mark_unreachable',
          note: reason || 'Marked unreachable from inbox',
        },
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || error?.message || 'mark failed');
      toast.success(`Marked unreachable — moved to Organizations tab`);
      setUnreachableOrgId(null);
      setUnreachableNote('');
      setUnreachableReason('Refused to share email');
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Mark failed');
    } finally {
      setBusy(null);
    }
  };

  const totalOpen = insuranceQ.length + orgsQ.length;

  // KPI counts — aging tiers across both queues
  const staleCount = useMemo(() => {
    let n = 0;
    for (const r of insuranceQ) if (ageTier(r.created_at) === 'stale') n++;
    for (const o of orgsQ) if (o.first_discovered_at && ageTier(o.first_discovered_at) === 'stale') n++;
    return n;
  }, [insuranceQ, orgsQ]);

  // Filtered slices (search applied per section)
  const filteredInsurance = useMemo(() => {
    const q = insSearch.trim().toLowerCase();
    if (!q) return insuranceQ;
    return insuranceQ.filter(r =>
      (r.patient_name || '').toLowerCase().includes(q) ||
      (r.patient_email || '').toLowerCase().includes(q) ||
      (r.proposed_provider || '').toLowerCase().includes(q) ||
      (r.current_provider || '').toLowerCase().includes(q)
    );
  }, [insuranceQ, insSearch]);
  const filteredOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return orgsQ;
    return orgsQ.filter(o =>
      (o.name || '').toLowerCase().includes(q) ||
      (o.ordering_physician || '').toLowerCase().includes(q) ||
      (o.last_patient_name || '').toLowerCase().includes(q) ||
      (o.address_city || '').toLowerCase().includes(q)
    );
  }, [orgsQ, orgSearch]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* HORMOZI HERO — dream outcome + KPI strip at the top */}
      <Card className="border-2 border-[#B91C1C]/20 bg-gradient-to-br from-red-50/40 to-white shadow-sm">
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold flex items-center gap-2 text-gray-900">
                <Inbox className="h-5 w-5 sm:h-6 sm:w-6 text-[#B91C1C]" />
                Action Items
              </h1>
              <p className="hidden sm:block text-sm text-gray-600 mt-0.5">
                Patient confirmations + new-practice metadata waiting on a human touch.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5 text-xs h-9 sm:h-8 min-w-9" disabled={loading} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          {/* KPI strip — counters Hormozi style: name the fire */}
          <div className="-mx-3 sm:mx-0 px-3 sm:px-0 mt-3 sm:mt-4 overflow-x-auto sm:overflow-visible scroll-smooth snap-x snap-mandatory">
            <div className="grid grid-flow-col auto-cols-[42%] sm:auto-cols-auto sm:grid-cols-3 sm:grid-flow-row gap-2 pb-1 sm:pb-0">
              <div className="text-left rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 snap-start">
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 text-amber-800 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Awaiting patient
                </p>
                <p className="text-3xl sm:text-2xl font-bold leading-tight mt-0.5 text-amber-900">{insuranceQ.length}</p>
              </div>
              <div className="text-left rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 snap-start">
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 text-blue-800 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Orgs to call
                </p>
                <p className="text-3xl sm:text-2xl font-bold leading-tight mt-0.5 text-blue-900">{orgsQ.length}</p>
              </div>
              <div className={`text-left rounded-lg border px-3 py-2 snap-start ${staleCount > 0 ? 'border-red-300 bg-red-50/60' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-[10px] uppercase tracking-wider font-semibold opacity-70 flex items-center gap-1 ${staleCount > 0 ? 'text-red-800' : 'text-gray-700'}`}>
                  <Flame className="h-3 w-3" /> Stale (5+ days)
                </p>
                <p className={`text-3xl sm:text-2xl font-bold leading-tight mt-0.5 ${staleCount > 0 ? 'text-red-900' : 'text-gray-700'}`}>{staleCount}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Pending Insurance Changes ─── */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#B91C1C]" />
            Pending insurance confirmations
            {insuranceQ.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                {insuranceQ.length}
              </Badge>
            )}
          </h2>
          {insuranceQ.length > 2 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input value={insSearch} onChange={e => setInsSearch(e.target.value)} placeholder="Search patient, carrier…" className="h-8 text-xs pl-8 w-56" />
            </div>
          )}
        </div>

        {loading ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
          </CardContent></Card>
        ) : insuranceQ.length === 0 ? (
          <Card><CardContent className="p-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium">No pending insurance changes</p>
            <p className="text-xs text-muted-foreground mt-1">Patients confirm or dismiss insurance updates from their dashboard automatically.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filteredInsurance.map(row => {
              const tier = ageTier(row.created_at);
              const days = differenceInDays(new Date(), new Date(row.created_at));
              const isConfirming = confirmAcceptId === row.id;
              return (
              <Card key={row.id} className={`border-amber-200 ${AGING_BORDER[tier]}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{row.patient_name}</p>
                      <p className="text-[11px] text-gray-500">{row.patient_email || 'no email'} · queued {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}</p>
                    </div>
                    {tier === 'stale' ? (
                      <Badge className="bg-red-100 text-red-700 text-[10px] animate-pulse">🚨 Stale {days}d</Badge>
                    ) : tier === 'aging' ? (
                      <Badge className="bg-orange-100 text-orange-800 text-[10px]">⏰ Aging {days}d</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">awaiting patient</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">On file</div>
                      <div className="text-xs text-gray-800"><strong>{row.current_provider || '—'}</strong></div>
                      <div className="text-[11px] text-gray-600">Member: {row.current_member_id || '—'}</div>
                      <div className="text-[11px] text-gray-600">Group: {row.current_group_number || '—'}</div>
                    </div>
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-amber-800 font-bold mb-1">From lab order</div>
                      <div className="text-xs text-gray-800"><strong>{row.proposed_provider || '—'}</strong></div>
                      <div className="text-[11px] text-gray-600">Member: {row.proposed_member_id || '—'}</div>
                      <div className="text-[11px] text-gray-600">Group: {row.proposed_group_number || '—'}</div>
                    </div>
                  </div>

                  {isConfirming ? (
                    <div className="rounded-md border-2 border-red-300 bg-red-50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-red-900">
                        ⚠ This will overwrite {row.patient_name}'s insurance on file:
                      </p>
                      <p className="text-[11px] text-red-800">
                        <strong>{row.current_provider || '—'}</strong> ({row.current_member_id || '—'}) → <strong>{row.proposed_provider || '—'}</strong> ({row.proposed_member_id || '—'})
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                          onClick={() => setConfirmAcceptId(null)} disabled={busy === row.id}>
                          Cancel
                        </Button>
                        <Button size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white gap-1"
                          onClick={() => adminResolveInsurance(row, 'accepted_new')} disabled={busy === row.id}>
                          {busy === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Yes, overwrite chart
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 justify-end pt-1">
                      <Button size="sm" variant="ghost" className="text-xs h-8 text-gray-500"
                        onClick={() => adminResolveInsurance(row, 'kept_existing')} disabled={busy === row.id}>
                        Keep existing
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1"
                        onClick={() => nudgePatient(row)} disabled={busy === row.id || !row.patient_email}>
                        <Send className="h-3 w-3" /> Email reminder
                      </Button>
                      <Button size="sm" className="text-xs h-8 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1"
                        onClick={() => adminResolveInsurance(row, 'accepted_new')} disabled={busy === row.id}>
                        <CheckCircle2 className="h-3 w-3" />
                        Update chart
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              );
            })}
            {filteredInsurance.length === 0 && insuranceQ.length > 0 && (
              <Card className="border-dashed">
                <CardContent className="p-4 text-center text-xs text-gray-500">
                  No matches for "{insSearch}". <button onClick={() => setInsSearch('')} className="text-[#B91C1C] hover:underline">Clear search</button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </section>

      {/* ─── Auto-discovered orgs missing comms ─── */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#B91C1C]" />
            New practices — fill comms to enable notifications
            {orgsQ.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                {orgsQ.length}
              </Badge>
            )}
          </h2>
          {orgsQ.length > 2 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Search org, doctor, city…" className="h-8 text-xs pl-8 w-56" />
            </div>
          )}
        </div>

        {loading ? null : orgsQ.length === 0 ? (
          <Card><CardContent className="p-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium">Every discovered practice has comms metadata</p>
            <p className="text-xs text-muted-foreground mt-1">When a new practice is auto-registered from a lab order, you'll see it here.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filteredOrgs.map(org => {
              const edit = orgEdit[org.id] || { manager_email: '', contact_email: '', contact_phone: '' };
              const refsMissing: string[] = [];
              if (!org.manager_email) refsMissing.push('manager_email');
              if (!org.contact_email) refsMissing.push('contact_email');
              const tier = org.first_discovered_at ? ageTier(org.first_discovered_at) : 'fresh';
              const days = org.first_discovered_at ? differenceInDays(new Date(), new Date(org.first_discovered_at)) : 0;
              const showUnreachableForm = unreachableOrgId === org.id;
              return (
                <Card key={org.id} className={`border-blue-200 ${AGING_BORDER[tier]}`}>
                  <CardContent className="p-4 space-y-3">
                    {tier !== 'fresh' && (
                      <div className={`text-[10px] font-semibold flex items-center gap-1 ${tier === 'stale' ? 'text-red-700' : 'text-orange-700'}`}>
                        {tier === 'stale' ? '🚨' : '⏰'} {tier === 'stale' ? `Stale ${days}d — call this office today` : `Aging ${days}d`}
                      </div>
                    )}
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          🆕 {org.name || <span className="text-amber-700 italic">Unnamed organization · review</span>}
                        </p>
                        {org.ordering_physician && (
                          <p className="text-xs text-gray-700 mt-0.5">
                            Dr. {org.ordering_physician.replace(/^Dr\.?\s*/i, '')}
                          </p>
                        )}
                        {org.last_patient_name && (
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Discovered from <strong className="text-gray-700">{org.last_patient_name}</strong>'s lab order
                            {org.last_appointment_date && (
                              <span> · appt {format(new Date(org.last_appointment_date), 'MMM d')}</span>
                            )}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-gray-600">
                          {(org.address_street || org.address_city) && (
                            <span className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                              📍 {[org.address_street, org.address_city, org.address_state, org.address_zip].filter(Boolean).join(', ')}
                            </span>
                          )}
                          {(org.office_phone || org.contact_phone) && (
                            <span className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                              📞 <a href={`tel:${(org.office_phone || org.contact_phone || '').replace(/\D/g, '')}`} className="underline">{org.office_phone || org.contact_phone}</a>
                            </span>
                          )}
                          {org.npi && <span className="bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">NPI {org.npi}</span>}
                          {org.referral_count != null && org.referral_count > 0 && (
                            <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">{org.referral_count} referral{org.referral_count === 1 ? '' : 's'}</span>
                          )}
                          {org.first_discovered_at && (
                            <span className="text-gray-400">discovered {formatDistanceToNow(new Date(org.first_discovered_at), { addSuffix: true })}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <Label className="text-[11px] flex items-center gap-1"><Mail className="h-3 w-3" /> Manager email</Label>
                        <Input className="h-9 text-sm" value={edit.manager_email}
                          placeholder="manager@practice.com"
                          onChange={(e) => setOrgEdit(s => ({ ...s, [org.id]: { ...edit, manager_email: e.target.value } }))} />
                      </div>
                      <div>
                        <Label className="text-[11px] flex items-center gap-1"><Mail className="h-3 w-3" /> Practice email</Label>
                        <Input className="h-9 text-sm" value={edit.contact_email}
                          placeholder="info@practice.com"
                          onChange={(e) => setOrgEdit(s => ({ ...s, [org.id]: { ...edit, contact_email: e.target.value } }))} />
                      </div>
                      <div>
                        <Label className="text-[11px] flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
                        <Input className="h-9 text-sm" value={edit.contact_phone}
                          placeholder="(407) 555-1234"
                          onChange={(e) => setOrgEdit(s => ({ ...s, [org.id]: { ...edit, contact_phone: e.target.value } }))} />
                      </div>
                    </div>

                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-1">
                      <strong>No email on file yet.</strong> Call the office to retrieve it, then save below.
                      If they refuse to provide one, click <em>Mark unreachable</em> — they'll move to the Organizations tab with a note.
                    </p>

                    {showUnreachableForm ? (
                      <div className="rounded-md border-2 border-red-200 bg-red-50 p-3 space-y-2">
                        <p className="text-xs font-semibold text-red-900">Why is {org.name} unreachable?</p>
                        <select
                          value={unreachableReason}
                          onChange={(e) => setUnreachableReason(e.target.value)}
                          className="w-full h-9 text-xs border border-gray-200 rounded-md px-2 bg-white"
                        >
                          <option>Refused to share email</option>
                          <option>No response after 3 calls</option>
                          <option>Front desk said send fax instead</option>
                          <option>Number disconnected / wrong</option>
                          <option>Practice closed / merged</option>
                          <option>Other</option>
                        </select>
                        <Input
                          placeholder="Additional note (optional)"
                          value={unreachableNote}
                          onChange={(e) => setUnreachableNote(e.target.value)}
                          className="h-9 text-xs"
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => { setUnreachableOrgId(null); setUnreachableNote(''); }}
                            disabled={busy === org.id}>
                            Cancel
                          </Button>
                          <Button size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white gap-1"
                            onClick={() => confirmUnreachable(org.id)}
                            disabled={busy === org.id}>
                            {busy === org.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                            Confirm unreachable
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 justify-end pt-1">
                        <Button size="sm" variant="ghost" className="text-xs h-8 text-gray-500 hover:text-red-700"
                          onClick={() => { setUnreachableOrgId(org.id); setUnreachableReason('Refused to share email'); setUnreachableNote(''); }}
                          disabled={busy === org.id}>
                          Mark unreachable
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-8"
                          onClick={() => saveOrgComms(org)} disabled={busy === org.id}>
                          Save (no email yet)
                        </Button>
                        <Button size="sm" className="text-xs h-8 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1"
                          onClick={() => saveEmailAndWelcome(org)}
                          disabled={busy === org.id || !((edit.contact_email || edit.manager_email || '').trim().includes('@'))}>
                          {busy === org.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Save email + send welcome
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {filteredOrgs.length === 0 && orgsQ.length > 0 && (
              <Card className="border-dashed">
                <CardContent className="p-4 text-center text-xs text-gray-500">
                  No matches for "{orgSearch}". <button onClick={() => setOrgSearch('')} className="text-[#B91C1C] hover:underline">Clear search</button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default InboxTab;
