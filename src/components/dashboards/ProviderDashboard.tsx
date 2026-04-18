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
  TrendingUp, UserPlus, Download, CheckCircle2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';

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
}

const ProviderDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

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

  const { org, liveOps, thisMonth, upcoming, patients, invoices, team } = data;
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

  return (
    <div className="min-h-screen bg-gray-50">
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
          <Button asChild className="bg-[#B91C1C] hover:bg-[#991B1B] text-white h-12 px-6 gap-2 text-[15px] w-full sm:w-auto">
            <Link to={`/book-now?orgId=${org.id}`}>
              <Calendar className="h-4 w-4" /> Schedule a new visit
            </Link>
          </Button>
        </div>

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
      </main>

      {/* INVITE MODAL */}
      <InviteTeamMemberDialog open={showInvite} onClose={() => setShowInvite(false)} orgId={org.id} orgName={org.name} onInvited={() => { setShowInvite(false); loadData(); }} />
    </div>
  );
};

// ─── Subcomponents ────────────────────────────────────────────────────────

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
