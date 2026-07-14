import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, UploadCloud, FileText, X, MessageSquare, ChevronDown, ChevronUp, CheckCircle2, DollarSign, Building2, User, Users, Search } from 'lucide-react';

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
  // DOB is required for the HIPAA gate on /lab-request. Without it the
  // patient gets a "no DOB on file" error and is blocked from booking.
  // (2026-05-07: Michael Percopo case.)
  const [patientDob, setPatientDob] = useState('');
  // Optional inline address — for business-owner patients whose draw should
  // happen at their office instead of home (e.g. Michael Percopo). The
  // create-lab-request edge fn writes this into patient_addresses on the
  // chart so the next visit auto-suggests the right place.
  const [addrLabel, setAddrLabel] = useState<'home' | 'office' | 'other'>('home');
  const [addrLine1, setAddrLine1] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrZip, setAddrZip] = useState('');
  const [addrAccessNotes, setAddrAccessNotes] = useState('');
  const [showAddrSection, setShowAddrSection] = useState(false);
  const [drawByDate, setDrawByDate] = useState('');
  const [nextApptDate, setNextApptDate] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  // Provider-asserted fasting flag. Independent of OCR (which sets it when
  // a PDF is uploaded). Toggled by the "12-hour fast required" notes chip so
  // a single click both inserts the patient-facing copy AND stamps the
  // boolean that the patient lab-request page reads to surface the amber
  // "Fasting required" banner + the fasting reminder SMS the night before.
  const [fastingRequired, setFastingRequired] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null); // remembered for re-submit
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // NEW: billing
  const [billedTo, setBilledTo] = useState<'org' | 'patient'>(orgDefaultBilledTo || 'patient');
  // Sub-toggle when org pays: pay now via card vs invoice monthly
  const [providerPayMethod, setProviderPayMethod] = useState<'invoice' | 'pay_now'>('pay_now');
  // After org payment: send the patient their booking link, or hold for the
  // provider to schedule the slot themselves.
  const [postPaymentAction, setPostPaymentAction] = useState<'send_link' | 'provider_schedule'>('send_link');
  // Household members ordered in the same visit (combined into one payment).
  const [householdMembers, setHouseholdMembers] = useState<{ name: string; email: string; phone: string; dob: string }[]>([]);

  // NEW: OCR preview
  const [ocr, setOcr] = useState<OcrPreview | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);

  // NEW: SMS preview expand/collapse
  const [showPreview, setShowPreview] = useState(false);

  // NEW: expand full OCR panel list (click "+N more" to see the rest)
  const [showAllPanels, setShowAllPanels] = useState(false);

  // Roster picker — saved tenant_patients for this org, one-click auto-fill.
  // (User's "easy selections" ask: stop re-typing names every lab request.)
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterQ, setRosterQ] = useState('');
  const [roster, setRoster] = useState<Array<{ name: string; email: string | null; phone: string | null; visits: number }>>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);

  const loadRoster = async () => {
    if (rosterLoaded) return;
    try {
      const { data, error } = await supabase.rpc('get_org_linked_patients' as any);
      if (error) throw error;
      const rows = (data as any[] | null) || [];
      setRoster(rows.map(r => ({
        name: r.patient_name,
        email: r.patient_email,
        phone: r.patient_phone,
        visits: Number(r.visit_count) || 0,
      })));
      setRosterLoaded(true);
    } catch (e) {
      console.warn('[create-lab-request] roster load failed:', e);
      setRosterLoaded(true);
    }
  };

  const pickFromRoster = (p: { name: string; email: string | null; phone: string | null }) => {
    setPatientName(p.name);
    setPatientEmail(p.email || '');
    setPatientPhone(p.phone ? formatPhoneDisplay(p.phone) : '');
    setRosterOpen(false);
    setRosterQ('');
  };

  const filteredRoster = useMemo(() => {
    const q = rosterQ.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
  }, [roster, rosterQ]);

  const reset = () => {
    setPatientName(''); setPatientEmail(''); setPatientPhone(''); setPatientDob('');
    setDrawByDate(''); setNextApptDate(''); setAdminNotes(''); setFastingRequired(false);
    setAddrLabel('home'); setAddrLine1(''); setAddrCity(''); setAddrZip('');
    setAddrAccessNotes(''); setShowAddrSection(false);
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
          patient_dob: patientDob || null,
          // Inline address — only sent if provider explicitly opened the
          // optional address section AND filled the street line. Edge fn
          // writes it into patient_addresses + stamps the patient row.
          patient_address: addrLine1.trim() ? {
            label: addrLabel,
            line1: addrLine1.trim(),
            city: addrCity.trim() || null,
            zipcode: addrZip.trim() || null,
            access_notes: addrAccessNotes.trim() || null,
          } : null,
          lab_order_file_path: labOrderPath,
          draw_by_date: drawByDate,
          next_doctor_appt_date: nextApptDate || null,
          admin_notes: adminNotes.trim() || null,
          fasting_required: fastingRequired || null,
          billed_to: billedTo,
          provider_pay_method: billedTo === 'org' ? 'pay_now' : 'invoice',
          // After payment: send the patient their booking link, or hold for the
          // provider to schedule. Only meaningful when the org pays.
          post_payment_action: billedTo === 'org' ? postPaymentAction : 'send_link',
          // Additional household members ordered together (one combined charge).
          household_members: billedTo === 'org'
            ? householdMembers.filter(m => m.name.trim()).map(m => ({
                patient_name: m.name.trim(),
                patient_email: m.email.trim() || null,
                patient_phone: m.phone.trim() || null,
                patient_dob: m.dob || null,
              }))
            : [],
        }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        // Surface auth/permission errors distinctly so clinic staff know
        // to contact ConveLabs vs. a transient retry.
        if (resp.status === 403) {
          throw new Error(`Permission denied: ${j.error || 'your account needs to be linked to this clinic'}. Contact ConveLabs support.`);
        }
        throw new Error(j.error || 'Failed to create request');
      }

      // Provider-pays "pay now" flow — redirect provider to Stripe
      if (j.provider_pay_now && j.provider_checkout_url) {
        window.location.href = j.provider_checkout_url;
        return;
      }

      // Detailed delivery report — use the server's per-channel result so
      // a Mailgun/Twilio failure isn't silently reported as success
      // (2026-05-27, Littleton case where the only signal was a generic
      // success toast and clinic staff couldn't tell if the SMS/email
      // actually fired).
      const delivery = j.delivery || {};
      const delivered: string[] = [];
      const failed: string[] = [];
      if (delivery.email_attempted) {
        (delivery.email_sent ? delivered : failed).push(`email (${patientEmail.trim()})`);
      }
      if (delivery.sms_attempted) {
        (delivery.sms_sent ? delivered : failed).push(`SMS (${patientPhone.trim()})`);
      }
      if (delivered.length > 0 && failed.length === 0) {
        toast.success(`✓ Booking invitation sent to ${patientFirstName}`, {
          description: `Delivered to ${delivered.join(' + ')}. We'll notify you when they schedule.`,
          duration: 8000,
        });
      } else if (delivered.length > 0 && failed.length > 0) {
        toast.warning(`Partial delivery for ${patientFirstName}`, {
          description: `Sent: ${delivered.join(', ')} · Failed: ${failed.join(', ')}. Verify contact info or contact ConveLabs support.`,
          duration: 12000,
        });
      } else {
        toast.error(`Delivery failed for ${patientFirstName}`, {
          description: `Neither email nor SMS could be sent (${failed.join(', ')}). Patient will NOT receive a booking link. Check contact details and try again.`,
          duration: 14000,
        });
      }
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
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-700">Patient</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1.5"
                onClick={() => { setRosterOpen(v => !v); if (!rosterLoaded) loadRoster(); }}
              >
                <Users className="h-3 w-3" /> Pick from roster
              </Button>
            </div>
            {rosterOpen && (
              <div className="rounded-lg border bg-gray-50 p-2 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    value={rosterQ}
                    onChange={e => setRosterQ(e.target.value)}
                    placeholder="Search your roster…"
                    className="pl-8 h-8 text-xs bg-white"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto divide-y bg-white rounded border">
                  {!rosterLoaded ? (
                    <div className="p-3 text-center text-xs text-gray-500"><Loader2 className="h-3 w-3 animate-spin inline mr-1" /> Loading roster…</div>
                  ) : filteredRoster.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-500">
                      {roster.length === 0 ? 'No patients on your roster yet. Add some from the dashboard.' : 'No matches.'}
                    </div>
                  ) : (
                    filteredRoster.slice(0, 50).map(p => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => pickFromRoster(p)}
                        className="w-full text-left p-2 hover:bg-red-50 transition flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{p.name}</div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {p.email || '—'}{p.email && p.phone && ' · '}{p.phone || ''}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{p.visits} visit{p.visits === 1 ? '' : 's'}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
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
            <div>
              <Label>Date of Birth <span className="text-red-600">*</span></Label>
              <Input
                type="date"
                value={patientDob}
                onChange={e => setPatientDob(e.target.value)}
                max={new Date().toISOString().substring(0, 10)}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Required — patient is asked to verify DOB to unlock their booking link (HIPAA).
                Without it they'll be blocked from scheduling.
              </p>
            </div>
            <p className="text-[11px] text-gray-500">At least one of email or phone required — that's how we reach them.</p>

            {/* OPTIONAL ADDRESS — for business-owner patients (Michael Percopo
                case 2026-05-07: business owner, draws should happen at his
                OFFICE not home). Provider can label it home / office / other
                so the chart knows. Edge fn syncs to patient_addresses. */}
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAddrSection(s => !s)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left"
              >
                <span className="text-xs font-semibold text-gray-700">
                  Address for this draw <span className="text-gray-400 font-normal">(optional · home or office)</span>
                </span>
                {showAddrSection ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
              {showAddrSection && (
                <div className="p-3 space-y-2 bg-white">
                  <div className="flex gap-1.5">
                    {(['home','office','other'] as const).map(lab => (
                      <button
                        key={lab}
                        type="button"
                        onClick={() => setAddrLabel(lab)}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs border transition ${
                          addrLabel === lab
                            ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {lab === 'home' ? '🏠 Home' : lab === 'office' ? '💼 Office' : '📍 Other'}
                      </button>
                    ))}
                  </div>
                  <Input value={addrLine1} onChange={e => setAddrLine1(e.target.value)} placeholder="Street address" className="h-8 text-xs" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={addrCity} onChange={e => setAddrCity(e.target.value)} placeholder="City" className="h-8 text-xs" />
                    <Input value={addrZip} onChange={e => setAddrZip(e.target.value)} placeholder="ZIP" className="h-8 text-xs" />
                  </div>
                  <Input value={addrAccessNotes} onChange={e => setAddrAccessNotes(e.target.value)} placeholder="Access notes (gate code, suite #, parking) — optional" className="h-8 text-xs" />
                  <p className="text-[10px] text-gray-500">Saved to the patient's chart. Future visits can switch between home / office in one tap.</p>
                </div>
              )}
            </div>
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

            {/* Org pays → upfront via Stripe (net-30 invoicing retired 2026-06-15) */}
            {billedTo === 'org' && (
              <div className="mt-2 p-2.5 bg-red-50/40 border border-red-100 rounded-lg space-y-2.5">
                <p className="text-xs font-semibold text-gray-900">Save a card now — charged only when the patient books</p>
                <p className="text-[11px] text-gray-600 -mt-1.5">If they never schedule, your card is never charged.</p>

                {/* After the card is saved: who schedules? */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1">After your card is saved</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => setPostPaymentAction('send_link')}
                      className={`text-left p-2 rounded border-2 transition ${postPaymentAction === 'send_link' ? 'border-[#B91C1C] bg-white' : 'border-transparent hover:border-gray-300 bg-white/50'}`}>
                      <div className="text-xs font-semibold">Text/email them the link</div>
                      <div className="text-[10px] text-gray-500">Patient picks their own time</div>
                    </button>
                    <button type="button" onClick={() => setPostPaymentAction('provider_schedule')}
                      className={`text-left p-2 rounded border-2 transition ${postPaymentAction === 'provider_schedule' ? 'border-[#B91C1C] bg-white' : 'border-transparent hover:border-gray-300 bg-white/50'}`}>
                      <div className="text-xs font-semibold">I'll schedule them</div>
                      <div className="text-[10px] text-gray-500">Book the slot yourself</div>
                    </button>
                  </div>
                </div>

                {/* Household members → combined into one visit + one payment */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-700 mb-1">Household members <span className="font-normal normal-case text-gray-400">(same address, one visit)</span></p>
                  {householdMembers.map((m, i) => (
                    <div key={i} className="flex gap-1.5 mb-1.5">
                      <input value={m.name} onChange={e => setHouseholdMembers(hm => hm.map((x, ix) => ix === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs" />
                      <input value={m.phone} onChange={e => setHouseholdMembers(hm => hm.map((x, ix) => ix === i ? { ...x, phone: e.target.value } : x))} placeholder="Mobile" inputMode="tel" className="w-24 border border-gray-200 rounded px-2 py-1 text-xs" />
                      <input value={m.dob} onChange={e => setHouseholdMembers(hm => hm.map((x, ix) => ix === i ? { ...x, dob: e.target.value } : x))} type="date" className="w-32 border border-gray-200 rounded px-1 py-1 text-xs" />
                      <button type="button" onClick={() => setHouseholdMembers(hm => hm.filter((_, ix) => ix !== i))} className="text-gray-400 hover:text-red-600 px-1 text-sm">×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setHouseholdMembers(hm => [...hm, { name: '', email: '', phone: '', dob: '' }])}
                    className="text-[11px] text-[#B91C1C] font-medium">+ Add household member</button>
                </div>

                <p className="text-[11px] text-gray-600">
                  You'll save a card on Stripe covering {householdMembers.filter(m => m.name.trim()).length + 1} draw{householdMembers.filter(m => m.name.trim()).length ? 's' : ''} — charged only when the patient books.
                  {postPaymentAction === 'send_link' ? ' Booking link sends the moment your card is saved.' : ' You schedule once your card is saved.'}
                </p>
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
              ].map(chip => {
                const isFastingChip = chip.startsWith('12-hour fast');
                const isActive = isFastingChip && fastingRequired;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setAdminNotes(n => (n ? `${n} ${chip}` : chip));
                      // Fasting chip is dual-purpose: drops the note copy AND
                      // sets the boolean flag the patient page + fasting-reminder
                      // SMS cron both read.
                      if (isFastingChip) setFastingRequired(true);
                    }}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                      isActive
                        ? 'border-amber-500 text-amber-900 bg-amber-50'
                        : 'border-gray-200 text-gray-600 hover:border-[#B91C1C] hover:text-[#B91C1C] hover:bg-red-50'
                    }`}
                  >
                    {isActive ? '✓ ' : '+ '}{chip.replace('.', '')}
                  </button>
                );
              })}
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
