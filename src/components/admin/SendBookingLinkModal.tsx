/**
 * SendBookingLinkModal — Hormozi "provider → patient → booked" zero-friction handoff
 *
 * Owner clicks ⚡ next to a patient's name → modal opens →
 *   1. (Optional) pick the provider's office that sent the order
 *   2. (Optional) upload the lab-order PDF the provider faxed/emailed in
 *   3. Pick the service (Mobile / In-office / Partner / Specialty)
 *   → SMS + email fly with a tokenized URL.
 *
 * Patient lands on /book-now?prefill=... with their service + identity
 * already populated AND, if a lab order was attached, it auto-attaches to
 * the new appointment on payment (via stripe-webhook prefill-consume block).
 *
 * HIPAA: when a provider's office is selected, the SMS body NEVER mentions
 * the patient's name OR specific tests — only the provider's office name.
 * Email is TLS-encrypted and the patient owns the inbox, so it can use the
 * patient's first name.
 */

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, CheckCircle2, Copy, ExternalLink, Zap, Upload, FileText, Building2, X, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PatientPrefill {
  id?: string | null;
  firstName: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  patient: PatientPrefill | null;
  // Optional pre-fills. When opened from the Lab Orders tab, we already
  // know the org + the lab order PDF + the likely service type. Pre-fill
  // those so the user doesn't have to re-select. (Kandace Bennett case
  // 2026-05-12 — admin had to manually pick Elite Medical even though
  // the order already came from Elite.)
  presetOrganizationId?: string | null;
  presetOrganizationName?: string | null;
  presetLabOrderPath?: string | null;
  presetServiceType?: string | null; // e.g. 'partner-elite-medical-concierge'
}

interface ServiceOption {
  value: string;
  label: string;
  priceLabel: string;
  category: 'common' | 'partner' | 'specialty';
}

const SERVICES: ServiceOption[] = [
  { value: 'mobile', label: 'Mobile Blood Draw', priceLabel: '$150', category: 'common' },
  { value: 'in-office', label: 'Office Visit', priceLabel: '$55', category: 'common' },
  { value: 'senior', label: 'Senior (65+)', priceLabel: '$100', category: 'common' },
  { value: 'specialty-kit', label: 'Specialty Kit', priceLabel: '$185', category: 'specialty' },
  { value: 'specialty-kit-genova', label: 'Genova Kit', priceLabel: '$200', category: 'specialty' },
  { value: 'therapeutic', label: 'Therapeutic', priceLabel: '$200', category: 'specialty' },
  { value: 'partner-nd-wellness', label: 'ND Wellness', priceLabel: '$85', category: 'partner' },
  { value: 'partner-naturamed', label: 'NaturaMed', priceLabel: '$85', category: 'partner' },
  { value: 'partner-restoration-place', label: 'Restoration Place', priceLabel: '$125', category: 'partner' },
];

interface OrgOption { id: string; name: string }

const SendBookingLinkModal: React.FC<Props> = ({
  open, onClose, patient,
  presetOrganizationId, presetOrganizationName, presetLabOrderPath, presetServiceType,
}) => {
  const [busy, setBusy] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [manualOrgName, setManualOrgName] = useState<string>('');
  const [labOrderFile, setLabOrderFile] = useState<File | null>(null);
  const [labOrderUploading, setLabOrderUploading] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{
    url: string;
    sms: boolean;
    email: boolean;
    serviceLabel: string;
    orgName: string | null;
    labOrderAttached: boolean;
  } | null>(null);

  // Load provider orgs once the modal opens — short list so a flat dropdown
  // is fine. Falls back to a manual "type-in" field if the office isn't in
  // the system yet.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('organizations')
          .select('id, name')
          .order('name', { ascending: true });
        if (cancelled) return;
        setOrgs((data || []) as any);
      } catch {/* non-fatal */}
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Pre-fill org + lab-order path when launched from a context that already
  // has them (e.g. Lab Orders tab clicking "Send Booking Link" on a row).
  // Re-runs whenever the modal opens for a different patient/order.
  useEffect(() => {
    if (!open) return;
    if (presetOrganizationId) setSelectedOrgId(presetOrganizationId);
    else if (presetOrganizationName) setManualOrgName(presetOrganizationName);
    if (presetLabOrderPath) setUploadedPath(presetLabOrderPath);
  }, [open, presetOrganizationId, presetOrganizationName, presetLabOrderPath]);

  const handleClose = () => {
    if (busy) return;
    setSentResult(null);
    setSelectedOrgId('');
    setManualOrgName('');
    setLabOrderFile(null);
    setUploadedPath(null);
    onClose();
  };

  const uploadLabOrderIfNeeded = async (): Promise<string | null> => {
    if (uploadedPath) return uploadedPath;
    if (!labOrderFile) return null;
    setLabOrderUploading(true);
    try {
      const safeName = `prefill_${(patient?.id || 'unknown').slice(0, 8)}_${Date.now()}_${labOrderFile.name.replace(/\s+/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('lab-orders').upload(safeName, labOrderFile, {
        contentType: labOrderFile.type || 'application/pdf',
        upsert: false,
      });
      if (upErr) throw upErr;
      setUploadedPath(safeName);
      return safeName;
    } catch (e: any) {
      toast.error(`Lab order upload failed: ${e?.message || e}`);
      return null;
    } finally {
      setLabOrderUploading(false);
    }
  };

  const handleSend = async (svc: ServiceOption) => {
    if (!patient) return;
    setBusy(true);
    try {
      const labOrderPath = await uploadLabOrderIfNeeded();
      const orgRow = orgs.find(o => o.id === selectedOrgId) || null;
      const organizationName = orgRow?.name || manualOrgName.trim() || null;

      const { data, error } = await supabase.functions.invoke('create-booking-prefill-link', {
        body: {
          patientId: patient.id || undefined,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email || undefined,
          phone: patient.phone || undefined,
          serviceType: svc.value,
          serviceName: svc.label,
          organizationId: orgRow?.id || undefined,
          organizationName: organizationName || undefined,
          providerOfficeLabel: organizationName || undefined,
          labOrderPath: labOrderPath || undefined,
        },
      });
      if (error) throw error;
      if (data?.error === 'no_contact') {
        toast.error('Patient has no phone or email — add one before sending.');
        return;
      }
      if (!data?.ok) {
        toast.error(data?.message || 'Couldn\'t send link');
        return;
      }
      setSentResult({
        url: data.url,
        sms: !!data.sms_sent,
        email: !!data.email_sent,
        serviceLabel: svc.label,
        orgName: organizationName,
        labOrderAttached: !!labOrderPath,
      });
      const channels: string[] = [];
      if (data.sms_sent) channels.push('SMS');
      if (data.email_sent) channels.push('email');
      if (channels.length > 0) {
        toast.success(`Sent ${svc.label} link via ${channels.join(' + ')}`);
      } else {
        toast.warning('No channel succeeded — copy the URL below to send manually.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied to clipboard'); }
    catch { toast.error('Copy failed — long-press to select manually'); }
  };

  const grouped = {
    common: SERVICES.filter(s => s.category === 'common'),
    specialty: SERVICES.filter(s => s.category === 'specialty'),
    partner: SERVICES.filter(s => s.category === 'partner'),
  };

  const hipaaMode = !!(orgs.find(o => o.id === selectedOrgId) || manualOrgName.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-[#B91C1C]" />
            Send {patient?.firstName || 'patient'} a booking link
          </DialogTitle>
        </DialogHeader>

        {sentResult ? (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-emerald-900">{sentResult.serviceLabel} link sent</p>
              <p className="text-xs text-emerald-700 mt-1">
                {sentResult.sms && sentResult.email ? 'Via SMS + email'
                  : sentResult.sms ? 'Via SMS'
                  : sentResult.email ? 'Via email'
                  : 'No channel succeeded — copy below to send manually'}
              </p>
              {sentResult.orgName && (
                <p className="text-[11px] text-emerald-700 mt-2 flex items-center justify-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> HIPAA-safe SMS · provider "{sentResult.orgName}" named, patient name omitted
                </p>
              )}
              {sentResult.labOrderAttached && (
                <p className="text-[11px] text-emerald-700 mt-1 flex items-center justify-center gap-1">
                  <FileText className="h-3 w-3" /> Lab order will auto-attach to the appointment after booking
                </p>
              )}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Booking URL</p>
              <div className="flex items-stretch gap-2">
                <div className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 truncate">
                  {sentResult.url}
                </div>
                <button type="button" onClick={() => copy(sentResult.url)} className="px-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600" title="Copy URL"><Copy className="h-4 w-4" /></button>
                <a href={sentResult.url} target="_blank" rel="noopener" className="px-3 flex items-center border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600" title="Preview link"><ExternalLink className="h-4 w-4" /></a>
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5">Link expires in 7 days. Patient lands on /book-now with the service + identity pre-loaded.</p>
            </div>

            <Button variant="outline" className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {(presetOrganizationName || presetLabOrderPath) ? (
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Context pre-filled from this lab order
                </p>
                {presetOrganizationName && (
                  <p className="text-[11px] text-emerald-800 flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" /> Provider: <strong>{presetOrganizationName}</strong>
                  </p>
                )}
                {presetLabOrderPath && (
                  <p className="text-[11px] text-emerald-800 flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Lab order PDF already attached — will auto-link to the appointment after payment
                  </p>
                )}
                <p className="text-[10px] text-emerald-700 italic mt-1">
                  {presetServiceType
                    ? `Just tap "${SERVICES.find(s => s.value === presetServiceType)?.label || 'the matching service'}" below to send.`
                    : 'Pick the service to send.'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-600">
                Pick the provider's office (optional), attach the lab order (optional), then choose the service. We handle the rest.
              </p>
            )}

            {/* Step 1 — Provider's office */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Provider's office <span className="text-gray-400 normal-case">(optional · HIPAA-safe SMS)</span>
              </p>
              <select
                value={selectedOrgId}
                onChange={(e) => { setSelectedOrgId(e.target.value); if (e.target.value) setManualOrgName(''); }}
                className="w-full border border-gray-200 rounded-md text-sm h-9 px-2 bg-white"
              >
                <option value="">— None / direct admin send —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {!selectedOrgId && (
                <Input
                  placeholder="…or type the office name (e.g. Dr. Smith's office)"
                  value={manualOrgName}
                  onChange={(e) => setManualOrgName(e.target.value)}
                  className="h-9 text-sm"
                />
              )}
              {hipaaMode && (
                <p className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> SMS will name the office but never the patient — HIPAA minimum-necessary.
                </p>
              )}
            </div>

            {/* Step 2 — Lab order upload (hidden when already attached via preset) */}
            {!presetLabOrderPath && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> Lab order <span className="text-gray-400 normal-case">(optional · auto-attaches to appointment)</span>
              </p>
              {labOrderFile ? (
                <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 text-xs">
                  <span className="flex items-center gap-1.5 truncate text-blue-900">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{labOrderFile.name}</span>
                    {uploadedPath && <span className="text-[10px] text-emerald-700 flex-shrink-0">✓ uploaded</span>}
                  </span>
                  <button type="button" onClick={() => { setLabOrderFile(null); setUploadedPath(null); }} className="text-blue-700 hover:text-blue-900 flex-shrink-0" disabled={labOrderUploading || busy} title="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-md h-9 text-xs text-gray-600 cursor-pointer hover:border-[#B91C1C]/40 hover:bg-red-50/30">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose PDF or image</span>
                  <input
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/heic"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setLabOrderFile(f); }}
                  />
                </label>
              )}
              {labOrderUploading && (
                <p className="text-[10px] text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</p>
              )}
            </div>
            )}

            {/* Step 3 — Service. Recommended service (if any) gets a glow ring. */}
            <ServiceGroup title="Common" services={grouped.common} onPick={handleSend} disabled={busy || labOrderUploading} recommendedValue={presetServiceType || null} />
            <ServiceGroup title="Specialty" services={grouped.specialty} onPick={handleSend} disabled={busy || labOrderUploading} recommendedValue={presetServiceType || null} />
            <ServiceGroup title="Partner" services={grouped.partner} onPick={handleSend} disabled={busy || labOrderUploading} recommendedValue={presetServiceType || null} />

            {busy && (
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </div>
            )}

            <div className="text-[10px] text-gray-400 border-t pt-2">
              Patient: {patient?.firstName} {patient?.lastName || ''}
              {patient?.phone && <span> · 📱 {patient.phone}</span>}
              {patient?.email && <span> · 📧 {patient.email}</span>}
              {!patient?.phone && !patient?.email && (
                <span className="text-amber-700"> · ⚠ no contact on file — add phone or email first</span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ServiceGroup: React.FC<{
  title: string;
  services: ServiceOption[];
  onPick: (s: ServiceOption) => void;
  disabled?: boolean;
  recommendedValue?: string | null;
}> = ({ title, services, onPick, disabled, recommendedValue }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">{title}</p>
    <div className="grid grid-cols-1 gap-1.5">
      {services.map(s => {
        const isRecommended = recommendedValue === s.value;
        return (
          <button
            key={s.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className={`flex items-center justify-between gap-2 border transition rounded-lg px-3 py-2 text-left disabled:opacity-50 disabled:cursor-not-allowed ${
              isRecommended
                ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200 hover:bg-emerald-100'
                : 'border-gray-200 hover:border-[#B91C1C] hover:bg-red-50/40'
            }`}
          >
            <span className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
              {isRecommended && <span className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 px-1.5 py-0.5 rounded">Tap to send</span>}
              {s.label}
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-semibold text-gray-700">{s.priceLabel}</span>
              <Send className={`h-3.5 w-3.5 ${isRecommended ? 'text-emerald-600' : 'text-gray-400'}`} />
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export default SendBookingLinkModal;
