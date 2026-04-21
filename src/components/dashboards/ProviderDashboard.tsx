import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Loader2, Building2, Calendar, FileText, DollarSign, Users, LogOut,
  Phone, Mail, ShieldCheck, Plus, ExternalLink, Clock, AlertCircle,
  TrendingUp, UserPlus, Download, CheckCircle2, KeyRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import ProviderOnboardingModal from '@/components/provider/ProviderOnboardingModal';
import CreateLabRequestModal from '@/components/provider/CreateLabRequestModal';
import LabRequestTimeline from '@/components/provider/LabRequestTimeline';
import LinkedPatientsSection from '@/components/provider/LinkedPatientsSection';
import BAASigningModal from '@/components/provider/BAASigningModal';
import { Activity } from 'lucide-react';
import { FileHeart, Send, Copy, BellRing, FileSignature, Download } from 'lucide-react';

/**
 * PROVIDER PORTAL DASHBOARD — Phase 1
 *
 * Structure (built backward from promises in docs/plans/provider-dashboard-hormozi.md):
 *   1. Header (org name + role badge + signout)
 *   2. Welcome + Primary CTA (Schedule a visit)
 *   3. Live Ops (today's visits, specimens in transit, needs attention)
 *   4. This Month (MTD visits, MTD spend, avg turnaround, usage predictor)
 *   5. Upcoming 7 days (table)
 *   6. Partnership rules (enhanced)
 *   7. Patients section
 *   8. Invoices / billing history
 *   9. Team section + invite
 *   10. Recollection guarantee (always visible)
 *   11. Help footer
 *
 * All data fetched from provider-dashboard-data edge fn which server-side
 * scopes to the caller's org_id. Client never requests other orgs' data.
 */

interface DashboardData {
  org: any;
  liveOps: { todayCount: number; todayInProgress: number; todayCompleted: number; specimensInTransit: number; needsAttention: number };
  thisMonth: { mtdVisits: number; mtdSpend: number; avgTurnaroundHrs: number | null; predictedEomVisits: number };
  upcoming: any[];
  patients: any[];
  invoices: any[];
  team: any[];
  labRequests: any[];
}

const ProviderDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showLabRequest, setShowLabRequest] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [showPwPrompt, setShowPwPrompt] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  // BAA signing gate — blocks the portal until the provider has signed.
  const [baaLoaded, setBaaLoaded] = useState(false);
  const [baaSignature, setBaaSignature] = useState<{ id: string; signed_at: string; baa_version: string; signer_full_name: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: sig } = await supabase
          .from('baa_signatures')
          .select('id, signed_at, baa_version, signer_full_name')
          .is('revoked_at', null)
          .order('signed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setBaaSignature(sig as any);
      } finally {
        setBaaLoaded(true);
      }
    })();
  }, []);

  // Onboarding gate + password-status check. Reads fresh metadata from
  // Supabase (not the cached useAuth user) so it reflects the latest state.
  //   - onboarded_at missing → show blocking onboarding modal
  //   - onboarded_at set but password_set flag missing → show dismissible
  //     yellow banner "Set a password to skip SMS next time"
  useEffect(() => {
    (async () => {
      try {
        const { data: { user: supaUser } } = await supabase.auth.getUser();
        const meta = supaUser?.user_metadata || {};
        if (meta.role !== 'provider') return;
        if (!meta.onboarded_at) setShowOnboarding(true);
        else if (!meta.password_set) setNeedsPasswordSetup(true);
      } catch { /* non-blocking */ }
    })();
  }, []);

  const handleInlinePasswordSet = async () => {
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPw !== newPwConfirm) { toast.error('Passwords do not match'); return; }
    try {
      // Route through edge fn (admin API) to bypass 'Secure password change'
      // reauth on SMS-only sessions — same reason as the onboarding modal.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('No active session');
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/complete-provider-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ password: newPw }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Failed to save');

      await supabase.auth.refreshSession().catch(() => {});
      toast.success('Password saved. You can now sign in with email + password.');
      setShowPwPrompt(false);
      setNeedsPasswordSetup(false);
      setNewPw(''); setNewPwConfirm('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save password');
    }
  };

  const loadData = async (attempt = 1): Promise<void> => {
    try {
      // Force-refresh the session so we always use the freshest JWT. This
      // matters right after verifyOtp / password reset, where the locally
      // cached token may lag a moment before user_metadata.role is present.
      let token: string | undefined;
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed?.session?.access_token;
      } catch { /* fall through to cached session */ }
      if (!token) {
        const { data: session } = await supabase.auth.getSession();
        token = session?.session?.access_token;
      }
      if (!token) {
        // No session at all — send them back to /provider to log in fresh.
        navigate('/provider');
        return;
      }
      const resp = await fetch(`https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/provider-dashboard-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      const j = await resp.json();
      if (!resp.ok) {
        // Transient auth race after password reset / verifyOtp — retry once
        // after a short delay so supabase-js has a chance to settle.
        if (attempt === 1 && (resp.status === 401 || (j?.error || '').toLowerCase().includes('session'))) {
          await new Promise(r => setTimeout(r, 800));
          return loadData(2);
        }
        throw new Error(j.error || 'Failed to load');
      }
      setData(j);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Realtime: when any lab_request or appointment belonging to this org
  // changes, refetch the dashboard. Keeps Lab Requests + Upcoming live.
  useEffect(() => {
    const orgId = data?.org?.id;
    if (!orgId) return;
    const channel = supabase
      .channel(`provider-dashboard-${orgId}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'patient_lab_requests', filter: `organization_id=eq.${orgId}` }, () => {
        loadData();
      })
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'appointments', filter: `organization_id=eq.${orgId}` }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.org?.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/provider');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-700">We couldn't open your portal</CardTitle>
            <CardDescription>{err || 'No data returned'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              If this keeps happening, email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] underline">info@convelabs.com</a> or call (941) 527-9169.
            </p>
            <Button variant="outline" onClick={handleSignOut} className="w-full">Sign out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { org, liveOps, thisMonth, upcoming, patients, invoices, team, labRequests = [] } = data;
  const billingLabel = org.default_billed_to === 'org' ? 'Organization pays' : org.default_billed_to === 'patient' ? 'Patient pays' : 'Mixed';
  const patientPrice = org.locked_price_cents != null ? `$${(org.locked_price_cents / 100).toFixed(2)}` : '—';
  const orgInvoicePrice = org.org_invoice_price_cents != null ? `$${(org.org_invoice_price_cents / 100).toFixed(2)}` : '—';

  // Compute scheduling window inline — no useMemo (it was sitting AFTER early
  // returns earlier which violated the Rules of Hooks and crashed React #310)
  const schedulingWindow = (() => {
    const r = org.time_window_rules;
    if (!r || !Array.isArray(r) || r.length === 0) return null;
    const w = r[0];
    const daysMap: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
    const days = (w.dayOfWeek || []).map((d: number) => daysMap[d]).join('/');
    const fmtHr = (h: number) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${hr}${period.toLowerCase()}`;
    };
    return `${days} ${fmtHr(w.startHour)}–${fmtHr(w.endHour)}`;
  })();

  const fmtDateTime = (iso: string, time: string | null) => {
    const d = iso.substring(0, 10);
    const [y, m, day] = d.split('-').map(Number);
    const date = new Date(y, m - 1, day);
    return `${format(date, 'EEE, MMM d')}${time ? ` · ${time}` : ''}`;
  };

  const prettyPatient = (a: any) => a.patient_name_masked ? (a.org_reference_id || 'Confidential') : (a.patient_name || 'Patient');

  // BAA gate — blocks the entire portal until the provider has signed the BAA.
  // Must come AFTER loading + error early returns so we don't flash the modal
  // before knowing if they've signed.
  const needsBaa = baaLoaded && !baaSignature;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* BAA SIGNING MODAL — mandatory, non-dismissable until signed */}
      <BAASigningModal
        open={needsBaa && !showOnboarding /* let onboarding finish first */}
        onSigned={(id) => {
          setBaaSignature({
            id,
            signed_at: new Date().toISOString(),
            baa_version: 'v1.0-2026-04-20',
            signer_full_name: user?.user_metadata?.full_name || user?.email || '',
          });
        }}
        currentUserFullName={user?.user_metadata?.full_name || ''}
      />
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">ConveLabs<span className="text-[#B91C1C]">.</span></span>
            <Badge className="bg-[#B91C1C]/10 text-[#B91C1C] hover:bg-[#B91C1C]/10 text-[10px] uppercase tracking-wider">Provider</Badge>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* WELCOME + PRIMARY CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-7 w-7 text-[#B91C1C]" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Welcome back</p>
              <h1 className="text-2xl sm:text-3xl font-bold">{org.name}</h1>
              <p className="text-sm text-gray-600 mt-0.5">
                {org.contact_name && <>{org.contact_name} · </>}
                {org.contact_email} {org.contact_phone && <>· {org.contact_phone}</>}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button onClick={() => setShowLabRequest(true)}
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white h-12 px-5 gap-2 text-[15px]">
              <FileHeart className="h-4 w-4" /> Request labs for a patient
            </Button>
            <Button asChild variant="outline" className="h-12 px-5 gap-2 text-[15px]">
              <Link to={`/book-now?orgId=${org.id}`}>
                <Calendar className="h-4 w-4" /> Schedule a visit
              </Link>
            </Button>
          </div>
        </div>

        {/* ACCOUNT-STATUS NUDGE — only shows if provider has no password yet */}
        {needsPasswordSetup && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <KeyRound className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-900">You're signed in with SMS only</p>
                <p className="text-xs text-amber-700">Set a password and you can sign in without the phone next time.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" className="border-amber-300" onClick={() => setNeedsPasswordSetup(false)}>
                Dismiss
              </Button>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1" onClick={() => setShowPwPrompt(true)}>
                <KeyRound className="h-3.5 w-3.5" /> Set password
              </Button>
            </div>
          </div>
        )}

        {/* LIVE OPS */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">What's happening now</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <LiveOpCard label="Today" value={liveOps.todayCount} detail={`${liveOps.todayInProgress} in progress · ${liveOps.todayCompleted} done`} icon={<Clock className="h-5 w-5 text-blue-600" />} />
            <LiveOpCard label="Specimens in transit" value={liveOps.specimensInTransit} detail="Awaiting results" icon={<TrendingUp className="h-5 w-5 text-amber-600" />} />
            <LiveOpCard label="Needs attention" value={liveOps.needsAttention} detail="Missing lab order, destination, or address" icon={<AlertCircle className="h-5 w-5 text-red-600" />} urgent={liveOps.needsAttention > 0} />
            <LiveOpCard label="Total patients" value={patients.length} detail={`${team.length} team ${team.length === 1 ? 'member' : 'members'}`} icon={<Users className="h-5 w-5 text-emerald-600" />} />
          </div>
        </div>

        {/* LINKED PATIENTS + BULK RE-REQUEST */}
        <LinkedPatientsSection orgId={org.id} onRequestCreated={loadData} />

        {/* LAB REQUESTS */}
        <LabRequestsSection
          labRequests={data.labRequests || []}
          onCreate={() => setShowLabRequest(true)}
          onRefresh={loadData}
        />

        {/* THIS MONTH */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-600" /> This month</CardTitle>
            <CardDescription className="text-xs">Live data — as of {format(new Date(), 'MMM d, h:mm a')}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="MTD visits" value={String(thisMonth.mtdVisits)} hint={thisMonth.predictedEomVisits > thisMonth.mtdVisits ? `On pace for ~${thisMonth.predictedEomVisits}` : 'At full pace'} />
            <Stat label="MTD spend" value={`$${thisMonth.mtdSpend.toFixed(2)}`} hint="Completed + paid visits only" />
            <Stat label="Avg turnaround" value={thisMonth.avgTurnaroundHrs != null ? `${thisMonth.avgTurnaroundHrs.toFixed(0)} hrs` : '—'} hint="Collection → results" />
            <Stat label="EOM estimate" value={`${thisMonth.predictedEomVisits} visits`} hint="At current pace" />
          </CardContent>
        </Card>

        {/* UPCOMING 7 DAYS */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Upcoming · next 7 days</CardTitle>
              <CardDescription className="text-xs">{upcoming.length} {upcoming.length === 1 ? 'visit' : 'visits'} scheduled</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to={`/book-now?orgId=${org.id}`}><Plus className="h-3.5 w-3.5" /> Add</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {upcoming.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                No upcoming visits. <Link to={`/book-now?orgId=${org.id}`} className="text-[#B91C1C] underline">Schedule one →</Link>
              </div>
            ) : (
              <div className="divide-y">
                {upcoming.map((a: any) => (
                  <div key={a.id} className="p-4 flex items-center justify-between gap-3 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{prettyPatient(a)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fmtDateTime(a.appointment_date, a.appointment_time)}
                        {a.service_name && <> · {a.service_name}</>}
                        {a.lab_destination && <> · → {a.lab_destination}</>}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* PARTNERSHIP RULES */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Your partnership rules</CardTitle>
            <CardDescription className="text-xs">Locked in for your org — invoices + pricing route according to these.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div><p className="text-xs text-gray-500 uppercase tracking-wider">Default bill-payer</p><p className="font-semibold mt-1">{billingLabel}</p></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wider">Patient price</p><p className="font-semibold mt-1">{patientPrice}</p></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wider">Org invoice price</p><p className="font-semibold mt-1">{orgInvoicePrice}</p></div>
            <div><p className="text-xs text-gray-500 uppercase tracking-wider">Scheduling window</p><p className="font-semibold mt-1">{schedulingWindow || 'Anytime'}</p></div>
          </CardContent>
        </Card>

        {/* PATIENTS */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">My patients</CardTitle>
              <CardDescription className="text-xs">{patients.length} {patients.length === 1 ? 'patient' : 'patients'} from recent visits</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to={`/book-now?orgId=${org.id}`}><Plus className="h-3.5 w-3.5" /> Add patient</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {patients.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">No patients yet.</div>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {patients.map((p: any, i: number) => (
                  <div key={i} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate text-sm">{p.name || 'Unnamed'}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {p.email && <>{p.email} · </>}
                        {p.phone}
                      </p>
                    </div>
                    <p className="text-[11px] text-gray-400 flex-shrink-0">
                      Last: {p.last_visit ? format(new Date(p.last_visit), 'MMM d') : '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* INVOICES / BILLING */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-[#B91C1C]" /> Billing history</CardTitle>
            <CardDescription className="text-xs">Your billing — scoped to {org.name} only. Never mixes with any other org or patient.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {invoices.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">No invoices yet.</div>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate text-sm">{inv.patient_label || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {inv.date ? format(new Date(inv.date), 'MMM d, yyyy') : '—'} · ${Number(inv.amount || 0).toFixed(2)}
                        {inv.billed_to === 'org' && <> · <span className="text-[#B91C1C]">Org-billed</span></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {inv.status && <Badge variant="outline" className="text-[10px] capitalize">{inv.status}</Badge>}
                      {inv.stripe_url && (
                        <a href={inv.stripe_url} target="_blank" rel="noreferrer" className="text-[#B91C1C]" title="Open in Stripe">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* TEAM */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /> Team</CardTitle>
              <CardDescription className="text-xs">{team.length} {team.length === 1 ? 'member' : 'members'} can log in to this portal</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowInvite(true)} className="gap-1">
              <UserPlus className="h-3.5 w-3.5" /> Invite
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {team.map((m: any) => (
                <div key={m.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate text-sm">
                      {m.name || m.email}
                      {m.is_self && <Badge className="ml-2 text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">You</Badge>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {m.email} {m.phone && <>· {m.phone}</>}
                    </p>
                  </div>
                  <p className="text-[11px] text-gray-400 flex-shrink-0">
                    {m.last_sign_in ? `Active ${formatDistanceToNow(new Date(m.last_sign_in), { addSuffix: true })}` : 'Never signed in'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* RECOLLECTION GUARANTEE (promise made — must be visible) */}
        <Card className="shadow-sm bg-emerald-50 border-emerald-200">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900">ConveLabs Recollection Guarantee — in writing</p>
                <ul className="mt-2 space-y-1 text-sm text-emerald-800">
                  <li>• If <strong>ConveLabs</strong> caused the error, recollection is <strong>100% free</strong>.</li>
                  <li>• If the <strong>reference lab</strong> caused the error, recollection is <strong>50% off</strong>.</li>
                </ul>
                <p className="mt-2 text-xs text-emerald-700">To report a recollection, email <a href="mailto:info@convelabs.com" className="underline">info@convelabs.com</a> with the patient name and date.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* HELP FOOTER */}
        <Card className="shadow-sm bg-gradient-to-br from-gray-50 to-white border-dashed">
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold">Need something we haven't built yet?</p>
              <p className="text-sm text-gray-600 mt-1">Email me directly and I'll get it done.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="gap-1">
                <a href="mailto:info@convelabs.com"><Mail className="h-4 w-4" /> info@convelabs.com</a>
              </Button>
              <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" asChild>
                <a href="tel:+19415279169"><Phone className="h-4 w-4" /> (941) 527-9169</a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* MY DOCUMENTS — signed BAA + audit trail */}
        {baaSignature && (
          <Card className="shadow-sm mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-[#B91C1C]" /> My Documents
              </CardTitle>
              <CardDescription className="text-xs">Signed agreements and compliance records for your practice.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 border border-emerald-200 bg-emerald-50 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Business Associate Agreement · {baaSignature.baa_version}</p>
                    <p className="text-[11px] text-gray-600">
                      Signed by <strong>{baaSignature.signer_full_name}</strong> · {format(new Date(baaSignature.signed_at), 'PPp')}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 flex-shrink-0"
                  onClick={() => window.open(`/api/baa-pdf/${baaSignature.id}`, '_blank')}
                  title="Download signed copy"
                >
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* INVITE MODAL */}
      <InviteTeamMemberDialog open={showInvite} onClose={() => setShowInvite(false)} orgId={org.id} orgName={org.name} onInvited={() => { setShowInvite(false); loadData(); }} />

      {/* CREATE LAB REQUEST MODAL */}
      <CreateLabRequestModal
        open={showLabRequest}
        onClose={() => setShowLabRequest(false)}
        orgId={org.id}
        orgName={org.name}
        orgDefaultBilledTo={org.default_billed_to as 'org' | 'patient' | null}
        orgInvoicePriceCents={org.org_invoice_price_cents ?? null}
        onCreated={loadData}
      />

      {/* INLINE "SET A PASSWORD" DIALOG (from the yellow status banner) */}
      <Dialog open={showPwPrompt} onOpenChange={setShowPwPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#B91C1C]" /> Set a password</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-gray-600">Once set, you can sign in with email + password instead of waiting for an SMS code.</p>
            <div><Label>New password</Label><Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" minLength={8} autoFocus /></div>
            <div><Label>Confirm</Label><Input type="password" value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} placeholder="Type it again" minLength={8} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPwPrompt(false)}>Cancel</Button>
            <Button onClick={handleInlinePasswordSet} disabled={newPw.length < 8 || newPw !== newPwConfirm} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">Save password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FIRST-LOGIN ONBOARDING (blocks dashboard until complete) */}
      <ProviderOnboardingModal
        open={showOnboarding}
        orgName={org.name}
        phoneHint={org.contact_phone ? `***-***-${String(org.contact_phone).replace(/\D/g, '').slice(-4)}` : null}
        defaultName={org.contact_name || user?.firstName || ''}
        onComplete={() => {
          setShowOnboarding(false);
          // Refresh session so the new metadata (full_name, onboarded_at) is in the JWT
          supabase.auth.refreshSession().catch(() => {});
          loadData();
        }}
      />
    </div>
  );
};

// ─── Subcomponents ────────────────────────────────────────────────────────

// ─── LAB REQUESTS SECTION ────────────────────────────────────────────
const LabRequestsSection: React.FC<{ labRequests: any[]; onCreate: () => void; onRefresh: () => void }> = ({ labRequests, onCreate, onRefresh }) => {
  const [tab, setTab] = useState<'pending' | 'scheduled' | 'completed'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groups = {
    pending: labRequests.filter(r => r.status === 'pending_schedule'),
    scheduled: labRequests.filter(r => r.status === 'scheduled'),
    completed: labRequests.filter(r => r.status === 'completed' || r.status === 'cancelled' || r.status === 'expired'),
  };

  const handleCopyLink = async (accessToken: string) => {
    const url = `${window.location.origin}/lab-request/${accessToken}`;
    await navigator.clipboard.writeText(url);
    toast.success('Link copied — paste to patient');
  };

  const handleResend = async (requestId: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('No session');
      // For Phase 1, 'resend' is the same as re-triggering notifications by simply
      // asking the user to copy the link manually — full reminder edge fn is Phase 2.
      toast.info('Use "Copy link" to share directly, or the nightly reminder will fire tomorrow.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const handleCancelRequest = async (requestId: string, patientName: string) => {
    const reason = window.prompt(`Cancel ${patientName}'s lab request? We'll notify them. Reason (optional):`);
    if (reason === null) return; // cancelled the prompt
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('No session');
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/cancel-lab-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ request_id: requestId, reason: reason || undefined }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Cancel failed');
      toast.success('Lab request cancelled — patient notified');
      onRefresh();
    } catch (e: any) {
      toast.error(e?.message || 'Cancel failed');
    }
  };

  const rows = groups[tab];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><FileHeart className="h-4 w-4 text-[#B91C1C]" /> Lab requests</CardTitle>
          <CardDescription className="text-xs">Patients you've asked to book. Status updates live as they schedule and complete.</CardDescription>
        </div>
        <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" /> New request
        </Button>
      </CardHeader>

      {/* Tabs */}
      <div className="px-6 border-b flex gap-1 text-sm">
        {(['pending', 'scheduled', 'completed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`py-2 px-3 border-b-2 transition capitalize ${tab === t ? 'border-[#B91C1C] text-[#B91C1C] font-semibold' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
            {t} <span className="text-xs text-gray-400">({groups[t].length})</span>
          </button>
        ))}
      </div>

      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="text-center py-10 px-4">
            <FileHeart className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600">
              {tab === 'pending' && 'No pending requests'}
              {tab === 'scheduled' && 'Nothing scheduled yet'}
              {tab === 'completed' && 'No completed requests'}
            </p>
            {tab === 'pending' && (
              <p className="text-xs text-gray-500 mt-1">Click "New request" to send a patient their booking link.</p>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((r: any) => {
              const daysLeft = Math.ceil((new Date(r.draw_by_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const urgencyColor = daysLeft <= 2 ? 'text-red-700' : daysLeft <= 7 ? 'text-amber-700' : 'text-emerald-700';
              const expanded = expandedId === r.id;
              return (
                <div key={r.id}>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.patient_name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {r.patient_email && <>{r.patient_email} · </>}
                      {r.patient_phone && <>{r.patient_phone} · </>}
                      Draw by {format(new Date(r.draw_by_date + 'T12:00:00'), 'EEE MMM d')}
                      {r.next_doctor_appt_date && <> · Consult {format(new Date(r.next_doctor_appt_date + 'T12:00:00'), 'MMM d')}</>}
                    </p>
                    {r.status === 'pending_schedule' && (
                      <p className={`text-[11px] font-semibold mt-1 ${urgencyColor}`}>
                        {daysLeft <= 0 ? 'Deadline passed' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                        {' · '}
                        {r.patient_notified_at ? `Notified ${formatDistanceToNow(new Date(r.patient_notified_at), { addSuffix: true })}` : 'Not notified yet'}
                      </p>
                    )}
                    {r.status === 'scheduled' && r.patient_scheduled_at && (
                      <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                        ✓ Booked {formatDistanceToNow(new Date(r.patient_scheduled_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant="outline" className="text-[10px] capitalize">{r.status.replace(/_/g, ' ')}</Badge>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1"
                      title="Live tracking" onClick={() => setExpandedId(expanded ? null : r.id)}>
                      <Activity className={`h-3.5 w-3.5 ${expanded ? 'text-[#B91C1C]' : 'text-gray-500'}`} />
                      {expanded ? 'Hide' : 'Track'}
                    </Button>
                    {r.status === 'pending_schedule' && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Copy link" onClick={() => handleCopyLink(r.access_token)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-xs"
                          title="Cancel this request" onClick={() => handleCancelRequest(r.id, r.patient_name)}>
                          Cancel
                        </Button>
                      </>
                    )}
                    {r.status === 'scheduled' && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-xs"
                        title="Cancel this request + appointment" onClick={() => handleCancelRequest(r.id, r.patient_name)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="px-4 pb-4 bg-gray-50/50 border-t">
                    <div className="pt-3">
                      <LabRequestTimeline requestId={r.id} />
                    </div>
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const LiveOpCard: React.FC<{ label: string; value: number; detail: string; icon: React.ReactNode; urgent?: boolean }> = ({ label, value, detail, icon, urgent }) => (
  <Card className={`shadow-sm ${urgent ? 'border-red-300 bg-red-50' : ''}`}>
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl font-bold ${urgent ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-1">{detail}</p>
    </CardContent>
  </Card>
);

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div>
    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
    <p className="text-xl font-bold mt-1">{value}</p>
    {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
  </div>
);

const InviteTeamMemberDialog: React.FC<{ open: boolean; onClose: () => void; orgId: string; orgName: string; onInvited: () => void }> = ({ open, onClose, orgId, orgName, onInvited }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) { toast.error('Email required'); return; }
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch(`https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/invite-team-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null, phone: phone.trim() || null, org_id: orgId }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Invite failed');
      toast.success(`${email} invited to ${orgName} · welcome email sent`);
      setEmail(''); setName(''); setPhone('');
      onInvited();
    } catch (e: any) {
      toast.error(e?.message || 'Invite failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Invite a team member to {orgName}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coworker@yourorg.com" autoFocus /></div>
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="First Last" /></div>
          <div><Label>Phone (for SMS sign-in)</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="407-555-1234" /></div>
          <p className="text-xs text-gray-500">They'll receive a welcome email with a magic-link login. If you enter a phone, they'll also get an SMS.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={handleInvite} disabled={saving || !email}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProviderDashboard;
