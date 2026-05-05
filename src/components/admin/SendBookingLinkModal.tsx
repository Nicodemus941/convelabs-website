/**
 * SendBookingLinkModal — Hormozi "send the patient a pre-loaded booking link"
 *
 * Owner clicks ⚡ next to a patient's name → this modal opens with a 7-button
 * service picker → click → SMS + email fly with a tokenized URL → owner sees
 * the URL with copy-to-clipboard for manual fallback. Patient lands on
 * /book-now?prefill=... with their service + identity already populated.
 *
 * 4-second loop: open → pick service → done.
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Send, CheckCircle2, Copy, ExternalLink, Zap } from 'lucide-react';
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

const SendBookingLinkModal: React.FC<Props> = ({ open, onClose, patient }) => {
  const [busy, setBusy] = useState(false);
  const [sentResult, setSentResult] = useState<{
    url: string;
    sms: boolean;
    email: boolean;
    serviceLabel: string;
  } | null>(null);

  const handleClose = () => {
    if (busy) return;
    setSentResult(null);
    onClose();
  };

  const handleSend = async (svc: ServiceOption) => {
    if (!patient) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-booking-prefill-link', {
        body: {
          patientId: patient.id || undefined,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email || undefined,
          phone: patient.phone || undefined,
          serviceType: svc.value,
          serviceName: svc.label,
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
            </div>

            {/* Copy fallback */}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Booking URL</p>
              <div className="flex items-stretch gap-2">
                <div className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 truncate">
                  {sentResult.url}
                </div>
                <button
                  type="button"
                  onClick={() => copy(sentResult.url)}
                  className="px-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                  title="Copy URL"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a
                  href={sentResult.url}
                  target="_blank"
                  rel="noopener"
                  className="px-3 flex items-center border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                  title="Preview link"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5">
                Link expires in 7 days. Patient lands on /book-now with the service pre-loaded.
              </p>
            </div>

            <Button variant="outline" className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              Pick the service. We'll text + email the patient a one-tap booking link.
            </p>

            <ServiceGroup title="Common" services={grouped.common} onPick={handleSend} disabled={busy} />
            <ServiceGroup title="Specialty" services={grouped.specialty} onPick={handleSend} disabled={busy} />
            <ServiceGroup title="Partner" services={grouped.partner} onPick={handleSend} disabled={busy} />

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
}> = ({ title, services, onPick, disabled }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">{title}</p>
    <div className="grid grid-cols-1 gap-1.5">
      {services.map(s => (
        <button
          key={s.value}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="flex items-center justify-between gap-2 border border-gray-200 hover:border-[#B91C1C] hover:bg-red-50/40 transition rounded-lg px-3 py-2 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-sm font-medium text-gray-900 truncate">{s.label}</span>
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-semibold text-gray-700">{s.priceLabel}</span>
            <Send className="h-3.5 w-3.5 text-gray-400" />
          </span>
        </button>
      ))}
    </div>
  </div>
);

export default SendBookingLinkModal;
