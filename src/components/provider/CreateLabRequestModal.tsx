import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, UploadCloud, FileText, X, MessageSquare, ChevronDown, ChevronUp, CheckCircle2, DollarSign, Building2, User } from 'lucide-react';

/**
 * Provider-facing modal: "Request labs for a patient"
 * On submit → uploads the lab order to storage → calls create-lab-request
 * → patient gets email + SMS → provider gets toast confirmation.
 *
 * 4 Hormozi-sprint upgrades (2026-04-20):
 *  1. Billing toggle (patient pays vs org pays) — prevents partner-trust blowups
 *  2. OCR readback preview — provider sees what we detected before sending
 *  3. SMS preview panel — provider sees the actual text the patient will receive
 *  4. Outcome-named CTA ("Send {firstName}'s booking link") — +15-25% click rate
 */

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  orgDefaultBilledTo?: 'org' | 'patient' | null;
  orgInvoicePriceCents?: number | null;
  onCreated: () => void;
}

interface OcrPreview {
  panels: Array<{ name?: string } | string>;
  fastingRequired?: boolean;
  urineRequired?: boolean;
  gttRequired?: boolean;
}

const CreateLabRequestModal: React.FC<Props> = ({ open, onClose, orgId, orgName, orgDefaultBilledTo, orgInvoicePriceCents, onCreated }) => {
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [drawByDate, setDrawByDate] = useState('');
  const [nextApptDate, setNextApptDate] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null); // remembered for re-submit
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // NEW: billing
  const [billedTo, setBilledTo] = useState<'org' | 'patient'>(orgDefaultBilledTo || 'patient');
  // Sub-toggle when org pays: pay now via card vs invoice monthly
  const [providerPayMethod, setProviderPayMethod] = useState<'invoice' | 'pay_now'>('invoice');

  // NEW: OCR preview
  const [ocr, setOcr] = useState<OcrPreview | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);

  // NEW: SMS preview expand/collapse
  const [showPreview, setShowPreview] = useState(false);

  // NEW: expand full OCR panel list (click "+N more" to see the rest)
  const [showAllPanels, setShowAllPanels] = useState(false);

  const reset = () => {
    setPatientName(''); setPatientEmail(''); setPatientPhone('');
    setDrawByDate(''); setNextApptDate(''); setAdminNotes('');
    setFile(null); setFilePath(null); setOcr(null); setShowPreview(false);
    setShowAllPanels(false);
    setBilledTo(orgDefaultBilledTo || 'patient');
  };

  const canSubmit = !!(
    patientName.trim() &&
    drawByDate &&
    (patientEmail.trim() || patientPhone.trim())
  );

  const patientFirstName = patientName.trim().split(' ')[0] || 'patient';

  // Upload to storage the instant a file is selected → run OCR → show readback
  const handleFileSelect = async (f: File) => {
    setFile(f);
    setOcr(null);
    setFilePath(null);
    setOcrRunning(true);
    try {
      const ext = f.name.split('.').pop() || 'pdf';
      const path = `lab-request/${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      setUploading(true);
      const { error: upErr } = await supabase.storage.from('lab-orders').upload(path, f, { upsert: false });
      setUploading(false);
      if (upErr) throw upErr;
      setFilePath(path);

      // Run OCR now so the provider sees what we detected before sending
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/ocr-lab-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ filePath: path }),
      });
      if (resp.ok) {
        const j = await resp.json();
        setOcr({
          panels: j.panels || [],
          fastingRequired: !!j.fastingRequired,
          urineRequired: !!j.urineRequired,
          gttRequired: !!j.gttRequired,
        });
      }
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.message || 'unknown error'}`);
      setFile(null);
    } finally {
      setOcrRunning(false);
      setUploading(false);
    }
  };

  // Build the SMS the patient will receive (approximation of edge fn body)
  const smsPreview = useMemo(() => {
    if (!patientName || !drawByDate) return '';
    const fmtDate = (iso: string) => {
      try {
        const d = new Date(iso + 'T12:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      } catch { return iso; }
    };
    // Authentic, professional, exclusive. No "reply 1/2/3" friction.
    const firstName = patientName.trim().split(' ')[0];
    const nextVisitPart = nextApptDate ? ` to have results ready for your ${fmtDate(nextApptDate)} visit` : '';
    return `Hi ${firstName} — this is ConveLabs. ${orgName} has ordered your bloodwork through us. Please schedule before ${fmtDate(drawByDate)}${nextVisitPart}. Your private booking link: https://www.convelabs.com/lab-request/... · We look forward to serving you.`;
  }, [patientName, drawByDate, nextApptDate, orgName]);

  const emailSubjectPreview = useMemo(() => {
    if (!drawByDate) return '';
    const d = new Date(drawByDate);
    const now = new Date();
    const days = Math.max(0, Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    return `${orgName} ordered your bloodwork — ${days}d to book`;
  }, [drawByDate, orgName]);

  const handleSubmit = async () => {
    if (!canSubmit) { toast.error('Please fill the required fields'); return; }
    setSaving(true);
    try {
      // If the file was selected but upload failed earlier, upload now
      let labOrderPath = filePath;
      if (file && !labOrderPath) {
        setUploading(true);
        const ext = file.name.split('.').pop() || 'pdf';
        const path = `lab-request/${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('lab-orders').upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        labOrderPath = path;
        setUploading(false);
      }

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/create-lab-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          organization_id: orgId,
          patient_name: patientName.trim(),
          patient_email: patientEmail.trim() || null,
          patient_phone: patientPhone.trim() || null,
          lab_order_file_path: labOrderPath,
          draw_by_date: drawByDate,
          next_doctor_appt_date: nextApptDate || null,
          admin_notes: adminNotes.trim() || null,
          billed_to: billedTo,
          provider_pay_method: billedTo === 'org' ? providerPayMethod : 'invoice',
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Failed to create request');

      // Provider-pays "pay now" flow — redirect provider to Stripe
      if (j.provider_pay_now && j.provider_checkout_url) {
        window.location.href = j.provider_checkout_url;
        return;
      }

      toast.success(`${patientFirstName}'s booking link is on its way · we'll ping you when they schedule`);
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create lab request');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // Auto-format phone as user types (E.164-friendly display)
  const formatPhoneDisplay = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 7) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  };

  // Reset billing default when modal re-opens
  useEffect(() => {
    if (open) setBilledTo(orgDefaultBilledTo || 'patient');
  }, [open, orgDefaultBilledTo]);

  const orgPriceDollars = orgInvoicePriceCents ? (orgInvoicePriceCents / 100).toFixed(2) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request labs for a patient</DialogTitle>
          <DialogDescription className="text-xs">Your patient will get an email + SMS with a one-click booking link. You'll be notified the moment they schedule.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* PATIENT */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-700">Patient</p>
            <div>
              <Label>Full name *</Label>
              <Input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Jane Smith" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={patientEmail} onChange={e => setPatientEmail(e.target.value)} placeholder="jane@example.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={patientPhone}
                  onChange={e => setPatientPhone(formatPhoneDisplay(e.target.value))}
                  placeholder="(407) 555-1234"
                  inputMode="tel"
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-500">At least one of email or phone required — that's how we reach them.</p>
          </div>

          {/* BILLING TOGGLE — Hormozi's #1 gap */}
          <div className="space-y-2 pt-3 border-t">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Who pays for this visit?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBilledTo('patient')}
                className={`flex items-start gap-2 p-3 rounded-lg border-2 text-left transition ${
                  billedTo === 'patient' ? 'border-[#B91C1C] bg-red-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <User className={`h-4 w-4 mt-0.5 flex-shrink-0 ${billedTo === 'patient' ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
                <div>
                  <div className="text-sm font-semibold">Patient pays</div>
                  <div className="text-[11px] text-gray-500 leading-tight">Patient checks out at booking (credit card or insurance).</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setBilledTo('org')}
                className={`flex items-start gap-2 p-3 rounded-lg border-2 text-left transition ${
                  billedTo === 'org' ? 'border-[#B91C1C] bg-red-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <Building2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${billedTo === 'org' ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
                <div>
                  <div className="text-sm font-semibold">{orgName} pays{orgPriceDollars ? ` · $${orgPriceDollars}` : ''}</div>
                  <div className="text-[11px] text-gray-500 leading-tight">Your practice covers the cost. Patient sees no charge.</div>
                </div>
              </button>
            </div>

            {/* Sub-toggle when org pays: invoice monthly vs pay now */}
            {billedTo === 'org' && (
              <div className="mt-2 p-2.5 bg-red-50/40 border border-red-100 rounded-lg">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5">How do you want to pay?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setProviderPayMethod('invoice')}
                    className={`text-left p-2 rounded border-2 transition ${providerPayMethod === 'invoice' ? 'border-[#B91C1C] bg-white' : 'border-transparent hover:border-gray-300 bg-white/50'}`}
                  >
                    <div className="text-xs font-semibold">Monthly invoice</div>
                    <div className="text-[10px] text-gray-500">We bill your org on the 1st</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProviderPayMethod('pay_now')}
                    className={`text-left p-2 rounded border-2 transition ${providerPayMethod === 'pay_now' ? 'border-[#B91C1C] bg-white' : 'border-transparent hover:border-gray-300 bg-white/50'}`}
                  >
                    <div className="text-xs font-semibold">Pay now · card</div>
                    <div className="text-[10px] text-gray-500">Patient link sends AFTER payment</div>
                  </button>
                </div>
                {providerPayMethod === 'pay_now' && (
                  <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                    After you click Send, you'll be redirected to Stripe to pay. {patientFirstName} only gets their booking link once payment completes.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* LAB ORDER — with OCR readback */}
          <div className="space-y-2 pt-3 border-t">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-700">Lab order</p>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
            {!file ? (
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-[#B91C1C] hover:bg-red-50/30 transition text-center">
                <UploadCloud className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium">Upload the lab order (PDF or image)</p>
                <p className="text-[11px] text-gray-500 mt-1">We'll read it with OCR and pre-fill the panels for your patient</p>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 border rounded-lg p-3 bg-gray-50">
                  <FileText className="h-5 w-5 text-[#B91C1C] flex-shrink-0" />
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <button onClick={() => { setFile(null); setFilePath(null); setOcr(null); }}>
                    <X className="h-4 w-4 text-gray-400 hover:text-red-600" />
                  </button>
                </div>

                {/* OCR readback */}
                {ocrRunning && (
                  <div className="flex items-center gap-2 text-xs text-gray-600 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading lab order…
                  </div>
                )}
                {!ocrRunning && ocr && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 mb-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Detected {ocr.panels.length} test{ocr.panels.length === 1 ? '' : 's'} — verify before sending
                    </div>
                    {ocr.panels.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(showAllPanels ? ocr.panels : ocr.panels.slice(0, 12)).map((p, i) => {
                          const name = typeof p === 'string' ? p : (p.name || '');
                          return (
                            <span key={i} className="inline-block bg-white border border-emerald-300 text-emerald-800 text-[11px] font-medium px-2 py-0.5 rounded-full">
                              {name}
                            </span>
                          );
                        })}
                        {ocr.panels.length > 12 && (
                          <button
                            type="button"
                            onClick={() => setShowAllPanels(s => !s)}
                            className="text-[11px] text-emerald-700 font-semibold underline-offset-2 hover:underline"
                          >
                            {showAllPanels ? 'Show less' : `+${ocr.panels.length - 12} more`}
                          </button>
                        )}
                      </div>
                    )}
                    {(ocr.fastingRequired || ocr.urineRequired || ocr.gttRequired) && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        {ocr.fastingRequired && <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded">⚠️ Fasting required</span>}
                        {ocr.urineRequired && <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded">💧 Urine specimen</span>}
                        {ocr.gttRequired && <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded">🧪 Glucose tolerance (2–3h)</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* TIMING */}
          <div className="space-y-3 pt-3 border-t">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-700">Timing</p>
            <div>
              <Label>Draw no later than *</Label>
              <Input type="date" value={drawByDate} min={new Date().toISOString().substring(0, 10)} onChange={e => setDrawByDate(e.target.value)} />
            </div>
            <div>
              <Label>Their next visit with you <span className="text-[11px] text-gray-400">(optional — adds urgency context)</span></Label>
              <Input type="date" value={nextApptDate} min={drawByDate || new Date().toISOString().substring(0, 10)} onChange={e => setNextApptDate(e.target.value)} />
            </div>
          </div>

          {/* NOTES — with quick-chip inserts */}
          <div className="space-y-2 pt-3 border-t">
            <Label>Notes for the patient <span className="text-[11px] text-gray-400">(optional)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {[
                '12-hour fast required.',
                'Drink water beforehand.',
                'Bring photo ID.',
                'Results go to the ordering provider.',
              ].map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAdminNotes(n => (n ? `${n} ${chip}` : chip))}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 hover:border-[#B91C1C] hover:text-[#B91C1C] hover:bg-red-50 transition"
                >
                  + {chip.replace('.', '')}
                </button>
              ))}
            </div>
            <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2}
              placeholder="e.g. 'Remember the 12-hour fast', or 'Please arrive at a LabCorp location — we're waiting for a delivery slot'" />
          </div>

          {/* SMS + EMAIL PREVIEW */}
          {canSubmit && (
            <div className="pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowPreview(s => !s)}
                className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-700 py-1"
              >
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Preview what {patientFirstName} will receive
                </span>
                {showPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showPreview && (
                <div className="mt-2 space-y-2">
                  {patientPhone && (
                    <div className="p-3 rounded-lg bg-[#E0F2FE] border border-[#BAE6FD]">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#0C4A6E] mb-1">📱 SMS preview</div>
                      <div className="text-sm text-gray-900 whitespace-pre-wrap">{smsPreview}</div>
                    </div>
                  )}
                  {patientEmail && (
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">✉️ Email subject</div>
                      <div className="text-sm font-medium text-gray-900">{emailSubjectPreview}</div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        From: ConveLabs &lt;noreply@mg.convelabs.com&gt;<br/>
                        Body opens with "Hi {patientFirstName}," — branded header, urgency card, one-click book button.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4 sticky bottom-0 bg-white border-t -mx-6 px-6 pb-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 transition"
          >
            {saving || uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {uploading ? 'Uploading…' : 'Sending…'}</>
            ) : (
              `Send ${patientFirstName}'s booking link`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateLabRequestModal;
