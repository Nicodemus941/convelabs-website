import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, FileSignature, Loader2, Upload, Repeat, AlertCircle, RotateCw, Search, UserPlus, History } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import AddPatientModal from '@/components/shared/AddPatientModal';
import BulkAddPatientsModal from '@/components/shared/BulkAddPatientsModal';
import PatientCsvImportModal from '@/components/shared/PatientCsvImportModal';
import PatientDetailDrawer from '@/components/shared/PatientDetailDrawer';

/**
 * LinkedPatientsSection — Phase 1 of the org patient-list feature.
 *
 * Shows the provider all patients who have had appointments linked to
 * their org. Enables bulk re-request of labs — partner uploads ONE lab
 * order file, selects N patients, and we create N patient_lab_requests
 * rows in one click.
 *
 * Hormozi: every repeat customer is easier to monetize than a new one.
 * "Request labs again" on an existing relationship converts at 40%+ vs
 * cold outreach. This widget surfaces that exact upsell to the partner.
 */

interface LinkedPatient {
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  visit_count: number;
  // v3: NULL unless the patient has REAL appointments — imported/added
  // patients no longer masquerade their import time as a "visit".
  last_visit_date: string | null;
  last_service: string | null;
  last_lab_order_file_path: string | null;
  pending_request_count: number;
  // v2 chart fields (get_org_linked_patients v2) — power the "needs info"
  // sort/filter + missing-field badges.
  tenant_patient_id: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  zipcode: string | null;
  // v3: when the patient was added to the roster (CSV import / manual add).
  added_at: string | null;
}

/** Most recent activity of any kind — real visit, else roster-added date. */
function lastActivity(p: LinkedPatient): number {
  return new Date(p.last_visit_date || p.added_at || 0).getTime();
}

type SortKey = 'recent' | 'name' | 'needs_info' | 'visits';

/** Which schedulable fields are missing on a patient row. */
function missingFields(p: LinkedPatient): string[] {
  const m: string[] = [];
  if (!p.patient_phone) m.push('Phone');
  if (!p.date_of_birth) m.push('DOB');
  if (!p.address) m.push('Address');
  return m;
}

interface EnrollmentRow {
  id: string;
  patient_name: string;
  draws_per_month_allowance: number;
  draws_this_month: number;
}

interface Props {
  orgId: string;
  onRequestCreated?: () => void;
}

const LinkedPatientsSection: React.FC<Props> = ({ orgId, onRequestCreated }) => {
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [enrollments, setEnrollments] = useState<Map<string, EnrollmentRow>>(new Map());
  const [orgTier, setOrgTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [togglingName, setTogglingName] = useState<string | null>(null);
  const [labFile, setLabFile] = useState<File | null>(null);
  const [drawBy, setDrawBy] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return d.toISOString().substring(0, 10);
  });
  const [notes, setNotes] = useState('');
  const [fastingRequired, setFastingRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Search + add-patient — shipped alongside the admin Org drawer Patients tab
  const [searchQ, setSearchQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [needsInfoOnly, setNeedsInfoOnly] = useState(false);
  // Compact-list toolkit: paginate instead of dumping the whole roster down
  // the page, plus an A–Z jump strip for long lists.
  const [page, setPage] = useState(0);
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [focusedPatient, setFocusedPatient] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: linked, error: linkedErr }, { data: enroll }, { data: org }] = await Promise.all([
        supabase.rpc('get_org_linked_patients' as any),
        supabase.from('practice_enrollments' as any)
          .select('id, patient_name, draws_per_month_allowance, draws_this_month')
          .eq('organization_id', orgId)
          .is('unenrolled_at', null),
        supabase.from('organizations')
          .select('subscription_tier')
          .eq('id', orgId)
          .maybeSingle(),
      ]);
      if (linkedErr) throw linkedErr;
      setPatients((linked as LinkedPatient[]) || []);
      const m = new Map<string, EnrollmentRow>();
      for (const e of (enroll || []) as any[]) m.set(e.patient_name.toLowerCase(), e as EnrollmentRow);
      setEnrollments(m);
      setOrgTier((org as any)?.subscription_tier || null);
    } catch (e: any) {
      console.warn('[linked-patients] load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnrollment = async (p: LinkedPatient, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!orgTier) {
      toast.error('Your practice isn\'t on a subscription yet. Subscribe from the card above.');
      return;
    }
    setTogglingName(p.patient_name);
    try {
      const existing = enrollments.get(p.patient_name.toLowerCase());
      if (existing) {
        const { error } = await supabase.rpc('unenroll_patient_from_practice' as any, {
          p_enrollment_id: existing.id, p_reason: 'Provider unenrolled via portal',
        });
        if (error) throw error;
        toast.success(`${p.patient_name} removed from subscription`);
      } else {
        const { data, error } = await supabase.rpc('enroll_patient_in_practice' as any, {
          p_org_id: orgId,
          p_patient_name: p.patient_name,
          p_patient_email: p.patient_email,
          p_patient_phone: p.patient_phone,
        });
        if (error) throw error;
        // RPC returns structured reason codes; surface them clearly
        const result = data as any;
        if (result && result.ok === false) {
          if (result.reason === 'seats_full') {
            toast.error(
              `Seats full — ${result.active_count}/${result.seat_cap} patients enrolled. Upgrade from "Manage plan" to add more seats.`,
              { duration: 8000 }
            );
          } else if (result.reason === 'no_active_subscription') {
            toast.error('Subscribe your practice first to enroll patients.');
          } else {
            toast.error(`Could not enroll: ${result.reason || 'unknown'}`);
          }
          return;
        }
        toast.success(
          result?.seats_remaining !== undefined
            ? `${p.patient_name} enrolled — ${result.seats_remaining} seat${result.seats_remaining === 1 ? '' : 's'} left`
            : `${p.patient_name} enrolled — their next draw is covered by your subscription`
        );
      }
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Enrollment update failed');
    } finally {
      setTogglingName(null);
    }
  };

  useEffect(() => { load(); }, [orgId]);

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // Hormozi "minimize friction on reorder": one-click re-request for a
  // single patient. Pre-selects just them + opens the same bulk modal
  // so the partner gets the full knobs (fasting, draw-by, notes) without
  // a second UI surface to maintain.
  const requestSameAsLast = (name: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(new Set([name]));
    setBulkOpen(true);
  };

  const toggleAll = () => {
    if (selected.size === patients.length) setSelected(new Set());
    else setSelected(new Set(patients.map(p => p.patient_name)));
  };

  const submitBulk = async () => {
    if (selected.size === 0) { toast.error('Pick at least one patient'); return; }
    setSubmitting(true);
    try {
      // Upload lab order file (optional — some repeat requests don't need a new req)
      let filePath: string | null = null;
      if (labFile) {
        const ext = labFile.name.split('.').pop() || 'bin';
        filePath = `provider-bulk/${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('lab-orders').upload(filePath, labFile, {
          contentType: labFile.type || 'application/octet-stream',
        });
        if (upErr) throw upErr;
      }

      const rows = Array.from(selected).map(name => {
        const p = patients.find(x => x.patient_name === name)!;
        return {
          organization_id: orgId,
          patient_name: name,
          patient_email: p.patient_email || null,
          patient_phone: p.patient_phone || null,
          // Reuse the new lab order if uploaded, otherwise keep null — admin
          // will follow up with patient for upload.
          lab_order_file_path: filePath || p.last_lab_order_file_path || null,
          draw_by_date: drawBy,
          fasting_required: fastingRequired,
          admin_notes: notes || null,
          status: 'pending_schedule',
          access_token: crypto.randomUUID(),
          access_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          patient_reminder_count: 0,
          dob_verify_attempts: 0,
        };
      });

      const { error: insErr, count } = await supabase.from('patient_lab_requests').insert(rows, { count: 'exact' });
      if (insErr) throw insErr;

      // Notify owner SMS — one aggregated alert for bulk request
      try {
        await supabase.functions.invoke('send-sms-notification', {
          body: {
            to: '9415279169',
            message: `📋 BULK lab request from provider: ${rows.length} patient${rows.length === 1 ? '' : 's'}. Draw by ${drawBy}.${fastingRequired ? ' Fasting.' : ''} Check admin → Lab requests.`,
          },
        });
      } catch { /* non-blocking */ }

      // HIPAA-aware: send each patient a consent/notification SMS so the
      // request doesn't land as a surprise. Patient can reply STOP to
      // opt out of further SMS, or click the access_token link in their
      // existing reminder cron flow to schedule. Non-blocking per patient.
      // Quiet-hours gate is applied in send-sms-notification.
      try {
        for (const r of rows) {
          if (!r.patient_phone) continue;
          const firstName = r.patient_name.split(' ')[0] || 'there';
          const site = typeof window !== 'undefined' ? window.location.origin : 'https://convelabs.com';
          const link = `${site}/lab-request/${r.access_token}`;
          const body = `Hi ${firstName}, your doctor's office requested new labs through ConveLabs. Pick a time that works for you: ${link}${fastingRequired ? ' (Fasting required.)' : ''} Reply STOP to opt out.`;
          supabase.functions.invoke('send-sms-notification', {
            body: { to: r.patient_phone, message: body, category: 'reminder' },
          }).catch(() => { /* non-blocking per-patient */ });
        }
      } catch { /* non-blocking */ }

      toast.success(`Submitted ${count || rows.length} lab request${(count || rows.length) === 1 ? '' : 's'}. Patients will be notified.`);
      setSelected(new Set());
      setLabFile(null);
      setNotes('');
      setBulkOpen(false);
      onRequestCreated?.();
      load();
    } catch (e: any) {
      console.error('[linked-patients] bulk submit failed:', e);
      toast.error(e?.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  // Empty state — newly-registered orgs need a clear path to add their
  // first patient. (Previously this entire section was hidden when
  // patients.length === 0, which left brand-new orgs with no roster
  // entrypoint.)
  if (patients.length === 0) {
    return (
      <>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-[#B91C1C]" /> Your patients
            </CardTitle>
            <CardDescription className="text-xs">
              Build your roster so you can request labs in one click — no re-typing names every time.
            </CardDescription>
          </CardHeader>
          {/* Empty state — Hormozi: replace generic "no patients yet"
              with a clear value prop + concrete time cost so the
              provider knows it's a 90-second action, not an open-ended
              chore. No marketing offers we can't back up. */}
          <CardContent className="py-7 text-center">
            <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-semibold">Build your patient roster</p>
            <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto leading-relaxed">
              Add the patients you order labs for and you'll be able to <strong>bulk-request labs in 1 click</strong>, track every visit, and enroll them in subscriptions — no re-typing names every time.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              <Button
                size="sm"
                className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5"
                onClick={() => setAddOpen(true)}
              >
                <UserPlus className="h-3.5 w-3.5" /> Add your first patient
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5"
                onClick={() => setBulkAddOpen(true)}
              >
                <Users className="h-3.5 w-3.5" /> Bulk paste a list
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => setCsvImportOpen(true)}
                title="Upload your patient-export CSV — imports the whole roster at once"
              >
                <Users className="h-3.5 w-3.5" /> Import CSV
              </Button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">~30 seconds per patient · or paste 30+ at once</p>
          </CardContent>
        </Card>
        <AddPatientModal
          open={addOpen}
          onOpenChange={setAddOpen}
          organizationId={orgId}
          onCreated={() => { setAddOpen(false); load(); }}
        />
        <BulkAddPatientsModal
          open={bulkAddOpen}
          onOpenChange={setBulkAddOpen}
          organizationId={orgId}
          onCreated={load}
        />
        <PatientCsvImportModal
          open={csvImportOpen}
          onOpenChange={setCsvImportOpen}
          organizationId={orgId}
          onCreated={load}
        />
      </>
    );
  }

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-[#B91C1C]" /> Your patients</CardTitle>
            <CardDescription className="text-xs">
              Patients who've had a draw at ConveLabs through your practice. Select multiple and request labs in one click.
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="text-xs gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Add patient
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBulkAddOpen(true)} className="text-xs gap-1.5" title="Paste a list of patients to add many at once">
              <Users className="h-3.5 w-3.5" /> Bulk add
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCsvImportOpen(true)} className="text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" title="Upload your patient-export CSV — imports the whole roster at once">
              <Users className="h-3.5 w-3.5" /> Import CSV
            </Button>
            <Button size="sm" variant="outline" onClick={toggleAll} className="text-xs">
              {selected.size === patients.length ? 'Deselect all' : 'Select all'}
            </Button>
            <Button
              size="sm"
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs"
              onClick={() => setBulkOpen(true)}
              disabled={selected.size === 0}
            >
              <FileSignature className="h-3.5 w-3.5 mr-1" /> Request labs{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
          </div>
        </CardHeader>
        {/* Search + sort + needs-info filter — long-roster toolkit */}
        <div className="px-6 pb-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); setPage(0); }}
              placeholder="Search by name, email, or phone…"
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={sortKey}
              onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(0); }}
              className="h-8 text-xs border border-gray-200 rounded-md px-2 bg-white text-gray-700"
              title="Sort the patient list"
            >
              <option value="recent">Sort: Recent activity</option>
              <option value="name">Sort: Name A–Z</option>
              <option value="needs_info">Sort: Needs info first</option>
              <option value="visits">Sort: Most visits</option>
            </select>
            {(() => {
              const n = patients.filter(p => missingFields(p).length > 0).length;
              if (n === 0) return null;
              return (
                <button
                  type="button"
                  onClick={() => { setNeedsInfoOnly(v => !v); setPage(0); }}
                  className={`h-8 text-xs px-2.5 rounded-full border font-semibold transition ${needsInfoOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'}`}
                  title="Show only patients missing phone, DOB, or address — complete them so they can be scheduled"
                >
                  ⚠ Needs info ({n})
                </button>
              );
            })()}
          </div>
          {/* A–Z jump strip — appears once the roster is big enough that
              scrolling is the pain (the CSV-import complaint). One tap
              filters to that first letter; tap again (or All) to clear. */}
          {patients.length > 15 && (() => {
            const letters = new Set(patients.map(p => (p.patient_name || '').trim().charAt(0).toUpperCase()).filter(c => /[A-Z]/.test(c)));
            return (
              <div className="flex items-center gap-0.5 flex-wrap text-[11px]" role="navigation" aria-label="Jump to letter">
                <button
                  type="button"
                  onClick={() => { setLetterFilter(null); setPage(0); }}
                  className={`px-1.5 py-0.5 rounded font-semibold transition ${letterFilter === null ? 'bg-[#B91C1C] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >All</button>
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => (
                  <button
                    key={l}
                    type="button"
                    disabled={!letters.has(l)}
                    onClick={() => { setLetterFilter(f => f === l ? null : l); setPage(0); }}
                    className={`px-1.5 py-0.5 rounded font-semibold transition ${letterFilter === l ? 'bg-[#B91C1C] text-white' : letters.has(l) ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 cursor-default'}`}
                  >{l}</button>
                ))}
              </div>
            );
          })()}
        </div>
        <CardContent className="p-0">
          <div className="divide-y">
            {(() => {
              const q = searchQ.trim().toLowerCase();
              let list = patients.filter(p => {
                if (needsInfoOnly && missingFields(p).length === 0) return false;
                if (letterFilter && (p.patient_name || '').trim().charAt(0).toUpperCase() !== letterFilter) return false;
                if (!q) return true;
                return (
                  (p.patient_name || '').toLowerCase().includes(q) ||
                  (p.patient_email || '').toLowerCase().includes(q) ||
                  (p.patient_phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
                );
              });
              list = [...list].sort((a, b) => {
                if (sortKey === 'name') return (a.patient_name || '').localeCompare(b.patient_name || '');
                if (sortKey === 'visits') return (b.visit_count || 0) - (a.visit_count || 0);
                if (sortKey === 'needs_info') {
                  const d = missingFields(b).length - missingFields(a).length;
                  if (d !== 0) return d;
                  return (a.patient_name || '').localeCompare(b.patient_name || '');
                }
                // recent (default): real visits first (recency), then
                // roster-added dates — never mixes the two up (v3 fix).
                return lastActivity(b) - lastActivity(a);
              });
              // Paginate: the list stays one screen tall instead of running
              // half the page (the scroll complaint that drove this rework).
              const PAGE_SIZE = 15;
              const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
              const safePage = Math.min(page, pageCount - 1);
              const capped = list.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
              return (
                <>
                  {capped.map(p => {
              const isSelected = selected.has(p.patient_name);
              return (
                <label
                  key={p.patient_name}
                  className={`flex items-start sm:items-center gap-3 p-3 sm:p-4 cursor-pointer transition ${isSelected ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                >
                  <Checkbox checked={isSelected} onCheckedChange={() => toggle(p.patient_name)} className="mt-0.5 sm:mt-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{p.patient_name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {p.visit_count} visit{p.visit_count === 1 ? '' : 's'}
                      </Badge>
                      {missingFields(p).length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFocusedPatient(p.patient_name);
                            setDetailOpen(true);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 rounded-full px-2 py-0.5 hover:bg-amber-100 transition"
                          title={`Missing ${missingFields(p).join(', ')} — click to complete their chart so they can be scheduled`}
                        >
                          <AlertCircle className="h-2.5 w-2.5" /> Missing: {missingFields(p).join(' · ')}
                        </button>
                      )}
                      {p.pending_request_count > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                          <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> {p.pending_request_count} pending
                        </Badge>
                      )}
                      {enrollments.has(p.patient_name.toLowerCase()) && (() => {
                        const en = enrollments.get(p.patient_name.toLowerCase())!;
                        return (
                          <Badge className="text-[10px] bg-amber-500 text-white border-amber-500">
                            👑 Enrolled · {en.draws_this_month}/{en.draws_per_month_allowance === 999 ? '∞' : en.draws_per_month_allowance}
                          </Badge>
                        );
                      })()}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      {p.visit_count > 0 && p.last_visit_date ? (
                        <>Last visit {formatDistanceToNow(new Date(p.last_visit_date), { addSuffix: true })}{p.last_service && ` · ${p.last_service}`}</>
                      ) : (
                        <>No visits yet{p.added_at && ` · Added ${format(new Date(p.added_at), 'MMM d, yyyy')}`}</>
                      )}
                    </p>
                    {(p.patient_email || p.patient_phone) && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">
                        {p.patient_email} {p.patient_email && p.patient_phone && '·'} {p.patient_phone}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1 flex-shrink-0">
                    {orgTier && (
                      <Button
                        type="button"
                        size="sm"
                        variant={enrollments.has(p.patient_name.toLowerCase()) ? 'default' : 'outline'}
                        className={`h-8 text-[11px] ${enrollments.has(p.patient_name.toLowerCase()) ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                        onClick={(e) => toggleEnrollment(p, e)}
                        disabled={togglingName === p.patient_name}
                        title={enrollments.has(p.patient_name.toLowerCase()) ? 'Remove from Concierge subscription' : 'Enroll in Concierge subscription — your practice covers their draws'}
                      >
                        {togglingName === p.patient_name
                          ? '…'
                          : enrollments.has(p.patient_name.toLowerCase())
                            ? '👑 Enrolled'
                            : '+ Enroll'}
                      </Button>
                    )}
                    {/* Per-row "request same as last time" — zero-friction reorder. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px]"
                      onClick={(e) => requestSameAsLast(p.patient_name, e)}
                      title="Request labs again for this patient (single-click reorder)"
                    >
                      <RotateCw className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">Request again</span>
                    </Button>
                    {/* Full patient history + edit */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px]"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFocusedPatient(p.patient_name);
                        setDetailOpen(true);
                      }}
                      title="View full history + edit patient"
                    >
                      <History className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">History</span>
                    </Button>
                  </div>
                </label>
              );
            })}
                  {pageCount > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/60">
                      <button
                        type="button"
                        onClick={() => setPage(Math.max(0, safePage - 1))}
                        disabled={safePage === 0}
                        className="text-xs font-semibold text-[#B91C1C] disabled:text-gray-300 px-2 py-1 rounded hover:bg-red-50 disabled:hover:bg-transparent transition"
                      >
                        ← Previous
                      </button>
                      <span className="text-[11px] text-gray-500">
                        {safePage * PAGE_SIZE + 1}–{Math.min(list.length, (safePage + 1) * PAGE_SIZE)} of {list.length} patients · Page {safePage + 1}/{pageCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                        disabled={safePage >= pageCount - 1}
                        className="text-xs font-semibold text-[#B91C1C] disabled:text-gray-300 px-2 py-1 rounded hover:bg-red-50 disabled:hover:bg-transparent transition"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                  {list.length === 0 && (
                    <p className="p-6 text-center text-xs text-gray-400">
                      {needsInfoOnly ? 'No patients are missing info — everyone is complete 🎉' : 'No patients match your search.'}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Bulk request modal */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5" /> Request labs for {selected.size} patient{selected.size === 1 ? '' : 's'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs">
              <p className="font-semibold text-red-900 mb-1">Patients selected:</p>
              <p className="text-red-800 leading-relaxed">
                {Array.from(selected).slice(0, 5).join(', ')}
                {selected.size > 5 && ` +${selected.size - 5} more`}
              </p>
            </div>
            <div>
              <Label className="text-xs">Upload new lab order <span className="text-gray-400 font-normal">(optional — leave blank to reuse prior)</span></Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={e => setLabFile(e.target.files?.[0] || null)} className="text-xs" />
              {!labFile && (
                <p className="text-[11px] text-gray-500 mt-1">
                  If blank, each patient's most recent lab order file will be reused. Admin will confirm with each patient before drawing.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Draw by date *</Label>
              <Input type="date" value={drawBy} onChange={e => setDrawBy(e.target.value)} className="text-xs" />
            </div>
            <div className="flex items-start gap-2 p-2 border rounded-lg">
              <Checkbox id="fasting-bulk" checked={fastingRequired} onCheckedChange={(c) => setFastingRequired(c === true)} className="mt-0.5" />
              <label htmlFor="fasting-bulk" className="text-xs cursor-pointer flex-1">
                <span className="font-semibold">Fasting required</span>
                <span className="block text-gray-500 mt-0.5">Patients will be reminded to stop eating the night before their draw.</span>
              </label>
            </div>
            <div>
              <Label className="text-xs">Notes for admin <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-xs" placeholder="e.g. Q2 follow-up panel for all wellness patients. Same as last cycle." />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white w-full sm:w-auto"
              onClick={submitBulk}
              disabled={submitting || selected.size === 0}
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Submitting…</> : <><Upload className="h-4 w-4 mr-1" /> Submit {selected.size} request{selected.size === 1 ? '' : 's'}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Patient modal — shared with the admin Org drawer */}
      <AddPatientModal
        open={addOpen}
        onOpenChange={setAddOpen}
        organizationId={orgId}
        onCreated={() => { setAddOpen(false); load(); }}
      />

      {/* Bulk paste-list modal — Hormozi force-multiplier for clinical coordinators */}
      <BulkAddPatientsModal
        open={bulkAddOpen}
        onOpenChange={setBulkAddOpen}
        organizationId={orgId}
        onCreated={load}
      />

      {/* CSV roster import — Elite Medical Concierge request 2026-07-13 */}
      <PatientCsvImportModal
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        organizationId={orgId}
        onCreated={load}
      />

      {/* Patient detail drawer — full history + edit */}
      {focusedPatient && (
        <PatientDetailDrawer
          open={detailOpen}
          onOpenChange={(v) => { setDetailOpen(v); if (!v) setTimeout(load, 300); }}
          patientName={focusedPatient}
          organizationId={orgId}
          canEdit={true}
        />
      )}
    </>
  );
};

export default LinkedPatientsSection;
