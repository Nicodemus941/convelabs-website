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
import { Loader2, Send, CheckCircle2, Copy, ExternalLink, Zap, Upload, FileText, Building2, X, ShieldCheck, Users, UserPlus } from 'lucide-react';
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
  onSent?: () => void;
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
  { value: 'senior', label: 'Senior (65+)', priceLabel: '$110', category: 'common' },
  { value: 'specialty-kit', label: 'Specialty Kit', priceLabel: '$185', category: 'specialty' },
  { value: 'specialty-kit-genova', label: 'Genova Kit', priceLabel: '$200', category: 'specialty' },
  { value: 'therapeutic', label: 'Therapeutic', priceLabel: '$200', category: 'specialty' },
  { value: 'partner-nd-wellness', label: 'ND Wellness', priceLabel: '$85', category: 'partner' },
  { value: 'partner-naturamed', label: 'NaturaMed', priceLabel: '$85', category: 'partner' },
  { value: 'partner-restoration-place', label: 'Restoration Place', priceLabel: '$125', category: 'partner' },
];

interface OrgOption { id: string; name: string }
interface HouseholdMember {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  household_relation?: string | null;
}
interface CompanionDraft {
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth: string;
}

interface BookingPrefillAudit {
  missingFields: string[];
}

const SendBookingLinkModal: React.FC<Props> = ({
  open, onClose, patient, onSent,
  presetOrganizationId, presetOrganizationName, presetLabOrderPath, presetServiceType,
}) => {
  const [busy, setBusy] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [manualOrgName, setManualOrgName] = useState<string>('');
  const [householdLoading, setHouseholdLoading] = useState(false);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [selectedHouseholdIds, setSelectedHouseholdIds] = useState<string[]>([]);
  const [manualCompanions, setManualCompanions] = useState<CompanionDraft[]>([]);
  const [prefillAudit, setPrefillAudit] = useState<BookingPrefillAudit>({ missingFields: [] });
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
    householdCount: number;
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
        setOrgs(data || []);
      } catch {/* non-fatal */}
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !patient?.id) {
      setHouseholdMembers([]);
      setSelectedHouseholdIds([]);
      setPrefillAudit({ missingFields: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      setHouseholdLoading(true);
      try {
        const { data: primary } = await supabase
          .from('tenant_patients')
          .select('id, household_id, email, phone, date_of_birth, address, city, state, zipcode')
          .eq('id', patient.id)
          .maybeSingle();
        if (!cancelled) {
          const missingFields: string[] = [];
          if (!primary?.date_of_birth) missingFields.push('DOB');
          if (!primary?.address || !primary?.zipcode) missingFields.push('address');
          if (!primary?.email) missingFields.push('email');
          if (!primary?.phone) missingFields.push('phone');
          setPrefillAudit({ missingFields });
        }
        if (cancelled || !primary?.household_id) {
          if (!cancelled) setHouseholdMembers([]);
          return;
        }
        const { data: members } = await supabase
          .from('tenant_patients')
          .select('id, first_name, last_name, email, phone, date_of_birth, household_relation')
          .eq('household_id', primary.household_id)
          .is('deleted_at', null)
          .neq('id', primary.id)
          .order('first_name', { ascending: true });
        if (!cancelled) setHouseholdMembers((members || []) as HouseholdMember[]);
      } catch {
        if (!cancelled) {
          setHouseholdMembers([]);
          setPrefillAudit({ missingFields: [] });
        }
      } finally {
        if (!cancelled) setHouseholdLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, patient?.id]);

  // Pre-fill org + lab-order path when launched from a context that already
  // has them (e.g. Lab Orders tab clicking "Send Booking Link" on a row).
  // Re-runs whenever the modal opens for a different patient/order.
  useEffect(() => {
    if (!open) return;
    setSelectedHouseholdIds([]);
    setManualCompanions([]);
    if (presetOrganizationId) setSelectedOrgId(presetOrganizationId);
    else if (presetOrganizationName) setManualOrgName(presetOrganizationName);
    if (presetLabOrderPath) setUploadedPath(presetLabOrderPath);
  }, [open, presetOrganizationId, presetOrganizationName, presetLabOrderPath]);

  const handleClose = () => {
    if (busy) return;
    setSentResult(null);
    setSelectedOrgId('');
    setManualOrgName('');
    setSelectedHouseholdIds([]);
    setManualCompanions([]);
    setLabOrderFile(null);
    setUploadedPath(null);
    onClose();
  };

  const toggleHouseholdMember = (memberId: string) => {
    setSelectedHouseholdIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    );
  };

  const updateManualCompanion = (index: number, key: keyof CompanionDraft, value: string) => {
    setManualCompanions((current) =>
      current.map((entry, entryIndex) => (
        entryIndex === index ? { ...entry, [key]: value } : entry
      ))
    );
  };

  const removeManualCompanion = (index: number) => {
    setManualCompanions((current) => current.filter((_, entryIndex) => entryIndex !== index));
  };

  const addManualCompanion = () => {
    setManualCompanions((current) => [
      ...current,
      {
        firstName: '',
        lastName: patient?.lastName || '',
        relationship: 'Companion',
        dateOfBirth: '',
      },
    ]);
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`Lab order upload failed: ${message}`);
      return null;
    } finally {
      setLabOrderUploading(false);
    }
  };

  const handleSend = async (svc: ServiceOption) => {
    if (!patient) return;
    setBusy(true);
    try {
      const selectedLinkedMembers = householdMembers.filter((member) => selectedHouseholdIds.includes(member.id));
      const trimmedManualCompanions = manualCompanions
        .map((entry) => ({
          firstName: entry.firstName.trim(),
          lastName: entry.lastName.trim(),
          relationship: entry.relationship.trim(),
          dateOfBirth: entry.dateOfBirth,
        }))
        .filter((entry) => entry.firstName || entry.lastName || entry.dateOfBirth || entry.relationship);
      const incompleteManual = trimmedManualCompanions.find((entry) => !entry.firstName || !entry.lastName);
      if (incompleteManual) {
        toast.error('Each added companion needs at least a first and last name before you send the link.');
        return;
      }
      const labOrderPath = await uploadLabOrderIfNeeded();
      const orgRow = orgs.find(o => o.id === selectedOrgId) || null;
      const organizationName = orgRow?.name || manualOrgName.trim() || null;
      const additionalPatients = [
        ...selectedLinkedMembers.map((member) => ({
          firstName: member.first_name || '',
          lastName: member.last_name || '',
          email: member.email || '',
          phone: member.phone || '',
          dateOfBirth: member.date_of_birth || '',
          relationship: member.household_relation || 'Family member',
          source: 'prefill_household',
        })),
        ...trimmedManualCompanions.map((entry) => ({
          firstName: entry.firstName,
          lastName: entry.lastName,
          dateOfBirth: entry.dateOfBirth || '',
          relationship: entry.relationship || 'Companion',
          source: 'prefill_household',
        })),
      ];

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
          additionalPatients,
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
        householdCount: additionalPatients.length,
      });
      const channels: string[] = [];
      if (data.sms_sent) channels.push('SMS');
      if (data.email_sent) channels.push('email');
      if (channels.length > 0) {
        toast.success(`Sent ${svc.label} link via ${channels.join(' + ')}`);
      } else {
        toast.warning('No channel succeeded — copy the URL below to send manually.');
      }
      onSent?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
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
  const selectedLinkedMembers = householdMembers.filter((member) => selectedHouseholdIds.includes(member.id));
  const householdCount = selectedLinkedMembers.length + manualCompanions.length;
  const householdSummary = [
    ...selectedLinkedMembers.map((member) => `${member.first_name || ''} ${member.last_name || ''}`.trim()),
    ...manualCompanions
      .map((entry) => `${entry.firstName || ''} ${entry.lastName || ''}`.trim())
      .filter(Boolean),
  ];
  const prefillReady = prefillAudit.missingFields.length === 0;

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
              {sentResult.householdCount > 0 && (
                <p className="text-[11px] text-emerald-700 mt-1 flex items-center justify-center gap-1">
                  <Users className="h-3 w-3" /> {sentResult.householdCount} additional patient{sentResult.householdCount === 1 ? '' : 's'} ride on the same booking link
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
              <p className="text-[10px] text-gray-500 mt-1.5">
                Link expires in 7 days. Patient lands on /book-now with their identity pre-loaded
                {sentResult.householdCount > 0 ? ` and ${sentResult.householdCount} same-visit companion${sentResult.householdCount === 1 ? '' : 's'} already attached` : ''}.
              </p>
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

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-blue-900">What the patient sees</p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Their booking link opens with their information already filled in.
                {householdCount > 0 ? ` The same visit will also include ${householdCount} additional patient${householdCount === 1 ? '' : 's'}.` : ''}
                {prefillReady
                  ? ' They just upload the lab order if needed, choose a date and time, and pay.'
                  : ` They will still need to confirm ${prefillAudit.missingFields.join(', ')} before checkout.`}
              </p>
              {householdSummary.length > 0 && (
                <p className="text-[10px] text-blue-700">
                  Included household: {householdSummary.join(', ')}
                </p>
              )}
            </div>

            {!prefillReady && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-900">This chart is not fully prefilled yet</p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Missing on file: {prefillAudit.missingFields.join(', ')}. The booking link will still work,
                  but the patient will need to complete those details instead of going straight to date, upload, and payment.
                </p>
              </div>
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

            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Same-visit family / companion <span className="text-gray-400 normal-case">(optional)</span>
                </p>
                {householdCount > 0 && (
                  <span className="text-[10px] rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 font-semibold">
                    {householdCount} included
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-600">
                Add anyone getting drawn at the same address and time. Their details ride on the same booking link so the patient does not have to re-enter the whole household manually.
              </p>

              {householdLoading ? (
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading linked household members…
                </div>
              ) : householdMembers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-gray-700">Linked household members</p>
                  <div className="grid grid-cols-1 gap-2">
                    {householdMembers.map((member) => {
                      const selected = selectedHouseholdIds.includes(member.id);
                      const displayName = `${member.first_name || ''} ${member.last_name || ''}`.trim();
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleHouseholdMember(member.id)}
                          className={`text-left rounded-lg border px-3 py-2 transition ${
                            selected
                              ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{displayName || 'Unnamed family member'}</p>
                              <p className="text-[11px] text-gray-600 truncate">
                                {member.household_relation || 'Family member'}
                                {member.date_of_birth ? ` · DOB ${member.date_of_birth}` : ''}
                              </p>
                            </div>
                            {selected && <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500">
                  No linked household members yet. You can still add a manual companion below.
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-gray-700">Manual companions</p>
                  <button
                    type="button"
                    onClick={addManualCompanion}
                    className="text-[11px] text-[#B91C1C] font-semibold inline-flex items-center gap-1"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Add companion
                  </button>
                </div>
                {manualCompanions.length === 0 ? (
                  <p className="text-[11px] text-gray-500">
                    Use this when the extra person is not linked on the chart yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {manualCompanions.map((entry, index) => (
                      <div key={index} className="rounded-lg border border-gray-200 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-medium text-gray-700">Companion {index + 1}</p>
                          <button
                            type="button"
                            onClick={() => removeManualCompanion(index)}
                            className="text-gray-400 hover:text-red-600"
                            title="Remove companion"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="First name"
                            value={entry.firstName}
                            onChange={(e) => updateManualCompanion(index, 'firstName', e.target.value)}
                            className="h-9 text-sm"
                          />
                          <Input
                            placeholder="Last name"
                            value={entry.lastName}
                            onChange={(e) => updateManualCompanion(index, 'lastName', e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Relationship"
                            value={entry.relationship}
                            onChange={(e) => updateManualCompanion(index, 'relationship', e.target.value)}
                            className="h-9 text-sm"
                          />
                          <Input
                            type="date"
                            value={entry.dateOfBirth}
                            onChange={(e) => updateManualCompanion(index, 'dateOfBirth', e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
