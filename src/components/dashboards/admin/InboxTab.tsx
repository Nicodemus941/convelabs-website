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
  CheckCircle2, Send, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

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
  outreach_status: string | null;
  referral_count: number | null;
  first_discovered_at: string | null;
  last_referral_at: string | null;
}

const InboxTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [insuranceQ, setInsuranceQ] = useState<PendingChange[]>([]);
  const [orgsQ, setOrgsQ] = useState<DiscoveredOrg[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Inline edit state per org row
  const [orgEdit, setOrgEdit] = useState<Record<string, { manager_email: string; contact_email: string; contact_phone: string }>>({});

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

      // Discovered orgs missing comms metadata
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, contact_email, contact_phone, manager_email, npi, outreach_status, referral_count, first_discovered_at, last_referral_at')
        .eq('discovered_from_lab_order', true as any)
        .or('manager_email.is.null,contact_email.is.null')
        .order('referral_count', { ascending: false })
        .order('first_discovered_at', { ascending: false })
        .limit(50);
      setOrgsQ((orgs as any[]) || []);

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

  const dismissOrg = async (org: DiscoveredOrg) => {
    setBusy(org.id);
    try {
      // Mark as dismissed/declined so it stops surfacing
      await supabase.from('organizations').update({
        outreach_status: 'declined',
        outreach_note: 'Dismissed from inbox',
        outreached_at: new Date().toISOString(),
      }).eq('id', org.id);
      toast.success(`${org.name} dismissed`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const totalOpen = insuranceQ.length + orgsQ.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6 text-[#B91C1C]" /> Inbox
            {totalOpen > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                {totalOpen} open
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            OCR-pipeline items waiting on a human touch — patient confirmations &amp; new-practice metadata.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* ─── Pending Insurance Changes ─── */}
      <section>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-[#B91C1C]" />
          Pending insurance confirmations
          {insuranceQ.length > 0 && (
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              {insuranceQ.length}
            </Badge>
          )}
        </h2>

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
            {insuranceQ.map(row => (
              <Card key={row.id} className="border-amber-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-sm font-semibold">{row.patient_name}</p>
                      <p className="text-[11px] text-gray-500">{row.patient_email || 'no email'} · queued {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}</p>
                    </div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">awaiting patient</Badge>
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

                  <div className="flex flex-wrap gap-2 justify-end pt-1">
                    <Button size="sm" variant="outline" className="text-xs h-8 gap-1"
                      onClick={() => nudgePatient(row)} disabled={busy === row.id || !row.patient_email}>
                      <Send className="h-3 w-3" /> Email reminder
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8"
                      onClick={() => adminResolveInsurance(row, 'kept_existing')} disabled={busy === row.id}>
                      Keep existing
                    </Button>
                    <Button size="sm" className="text-xs h-8 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1"
                      onClick={() => adminResolveInsurance(row, 'accepted_new')} disabled={busy === row.id}>
                      {busy === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Force-update chart
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ─── Auto-discovered orgs missing comms ─── */}
      <section>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-[#B91C1C]" />
          New practices — fill comms to enable notifications
          {orgsQ.length > 0 && (
            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
              {orgsQ.length}
            </Badge>
          )}
        </h2>

        {loading ? null : orgsQ.length === 0 ? (
          <Card><CardContent className="p-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium">Every discovered practice has comms metadata</p>
            <p className="text-xs text-muted-foreground mt-1">When a new practice is auto-registered from a lab order, you'll see it here.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {orgsQ.map(org => {
              const edit = orgEdit[org.id] || { manager_email: '', contact_email: '', contact_phone: '' };
              const refsMissing: string[] = [];
              if (!org.manager_email) refsMissing.push('manager_email');
              if (!org.contact_email) refsMissing.push('contact_email');
              return (
                <Card key={org.id} className="border-blue-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{org.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-gray-600">
                          {org.npi && <span>NPI {org.npi}</span>}
                          {org.referral_count != null && (
                            <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0.5">{org.referral_count} referral{org.referral_count === 1 ? '' : 's'}</span>
                          )}
                          {org.outreach_status && (
                            <span className="bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-1.5 py-0.5">{org.outreach_status}</span>
                          )}
                          {org.first_discovered_at && (
                            <span className="text-gray-400">discovered {formatDistanceToNow(new Date(org.first_discovered_at), { addSuffix: true })}</span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                        missing {refsMissing.length} field{refsMissing.length === 1 ? '' : 's'}
                      </Badge>
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

                    <div className="flex flex-wrap gap-2 justify-end pt-1">
                      <Button size="sm" variant="ghost" className="text-xs h-8"
                        onClick={() => dismissOrg(org)} disabled={busy === org.id}>
                        Dismiss
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-8"
                        onClick={() => saveOrgComms(org)} disabled={busy === org.id}>
                        Save
                      </Button>
                      <Button size="sm" className="text-xs h-8 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1"
                        onClick={() => sendOrgInvite(org)} disabled={busy === org.id || (!edit.manager_email && !edit.contact_email)}>
                        {busy === org.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                        Save &amp; invite manager
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default InboxTab;
