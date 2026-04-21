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
import { Users, FileSignature, Loader2, Upload, Repeat, AlertCircle, RotateCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

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
  last_visit_date: string;
  last_service: string | null;
  last_lab_order_file_path: string | null;
  pending_request_count: number;
}

interface Props {
  orgId: string;
  onRequestCreated?: () => void;
}

const LinkedPatientsSection: React.FC<Props> = ({ orgId, onRequestCreated }) => {
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [labFile, setLabFile] = useState<File | null>(null);
  const [drawBy, setDrawBy] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return d.toISOString().substring(0, 10);
  });
  const [notes, setNotes] = useState('');
  const [fastingRequired, setFastingRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_org_linked_patients' as any);
      if (error) throw error;
      setPatients((data as LinkedPatient[]) || []);
    } catch (e: any) {
      console.warn('[linked-patients] load failed:', e);
    } finally {
      setLoading(false);
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
  if (patients.length === 0) return null; // no linked patients yet → don't clutter UI

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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={toggleAll} className="text-xs flex-1 sm:flex-none">
              {selected.size === patients.length ? 'Deselect all' : 'Select all'}
            </Button>
            <Button
              size="sm"
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs flex-1 sm:flex-none"
              onClick={() => setBulkOpen(true)}
              disabled={selected.size === 0}
            >
              <FileSignature className="h-3.5 w-3.5 mr-1" /> Request labs{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {patients.map(p => {
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
                      {p.pending_request_count > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                          <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> {p.pending_request_count} pending
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      Last visit {formatDistanceToNow(new Date(p.last_visit_date), { addSuffix: true })}
                      {p.last_service && ` · ${p.last_service}`}
                    </p>
                    {(p.patient_email || p.patient_phone) && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">
                        {p.patient_email} {p.patient_email && p.patient_phone && '·'} {p.patient_phone}
                      </p>
                    )}
                  </div>
                  {/* Per-row "request same as last time" — zero-friction reorder.
                      Hormozi: every extra click on a repeat purchase is revenue
                      you leave with the customer. */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0 h-8 text-[11px]"
                    onClick={(e) => requestSameAsLast(p.patient_name, e)}
                    title="Request labs again for this patient (single-click reorder)"
                  >
                    <RotateCw className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">Request again</span>
                  </Button>
                </label>
              );
            })}
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
    </>
  );
};

export default LinkedPatientsSection;
