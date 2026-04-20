import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Mail, Shield, CheckCircle2, XCircle } from 'lucide-react';

/**
 * Post-booking consent: ask the patient whether ConveLabs may notify their
 * referring provider's office with appointment details + specimen tracking ID.
 *
 * HIPAA-compliant: captures typed-name electronic signature + timestamp + IP
 * (via backend). Stores in patient_notification_consents as legal proof.
 *
 * Hormozi framing: the question itself markets the value. "Want me to tell
 * your doctor your labs are on the way?" makes ConveLabs feel concierge-level
 * without us doing anything else.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  labRequestId?: string | null;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  providerPracticeName?: string | null;
  providerEmail?: string | null;
  accessToken?: string;
  onConsentComplete?: (consented: boolean) => void;
}

const CONSENT_TEXT = `I authorize ConveLabs to share the following with my referring provider's office:
(1) my appointment date + time,
(2) the date and destination lab where my specimen was delivered,
(3) the specimen tracking ID issued by ConveLabs.

I understand this is a one-time notification tied to this appointment, and that clinical results still flow through my provider's standard result delivery (fax/portal) — ConveLabs does not transmit lab results themselves.

I understand this authorization does not extend to any other use or disclosure of my Protected Health Information (PHI).`;

const NotifyProviderConsentModal: React.FC<Props> = ({
  open, onClose, appointmentId, labRequestId, patientName, patientEmail, patientPhone,
  providerPracticeName, providerEmail, accessToken, onConsentComplete,
}) => {
  const [consented, setConsented] = useState<boolean | null>(null);
  const [typedName, setTypedName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (did_consent: boolean) => {
    setSubmitting(true);
    try {
      // Route through edge fn so IP is captured server-side (ESIGN/HIPAA audit).
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/save-notification-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: appointmentId,
          lab_request_id: labRequestId || null,
          access_token: accessToken || null,
          patient_name: patientName,
          patient_email: patientEmail || null,
          patient_phone: patientPhone || null,
          provider_practice_name: providerPracticeName || null,
          provider_email: providerEmail || null,
          consented: did_consent,
          typed_name: did_consent ? typedName.trim() : null,
          scope: 'appointment_and_delivery',
          consent_text: CONSENT_TEXT,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Could not save your choice');
      toast.success(did_consent
        ? `Got it — we'll let ${providerPracticeName || 'your provider'} know about your visit.`
        : 'No problem — we won\'t notify your provider.');
      onConsentComplete?.(did_consent);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save your choice');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitYes = consented === true && typedName.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="p-5 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#B91C1C]" />
            <DialogTitle className="text-base">One quick question</DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm text-gray-800 leading-relaxed">
              {providerPracticeName ? (
                <>Would it be okay if we let <strong>{providerPracticeName}</strong> know you've booked and when your specimen is delivered? That way their staff isn't chasing results.</>
              ) : (
                <>Would it be okay if we notified your referring provider's office with a short update when you book and when your specimen is delivered?</>
              )}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">They'd get only: appointment date, delivery lab, specimen tracking ID. No results.</p>
          </div>

          {/* Two big buttons — binary choice first */}
          {consented === null && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConsented(true)}
                className="flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-emerald-500 bg-emerald-50 hover:bg-emerald-100 transition"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="text-sm font-bold text-emerald-900">Yes, notify them</span>
                <span className="text-[10px] text-emerald-700 text-center">Helps your doctor</span>
              </button>
              <button
                onClick={() => setConsented(false)}
                className="flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-gray-300 bg-white hover:bg-gray-50 transition"
              >
                <XCircle className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-bold text-gray-700">No thanks</span>
                <span className="text-[10px] text-gray-500 text-center">Keep it private</span>
              </button>
            </div>
          )}

          {/* Yes path: typed signature */}
          {consented === true && (
            <div className="space-y-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] text-gray-700 leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto">
                {CONSENT_TEXT}
              </div>
              <div>
                <Label className="text-xs">Type your full name to authorize</Label>
                <Input
                  value={typedName}
                  onChange={e => setTypedName(e.target.value)}
                  placeholder="Your full legal name"
                  autoFocus
                />
                <p className="text-[10px] text-gray-500 mt-1">Electronic signature (ESIGN Act / Florida UETA)</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConsented(null)} disabled={submitting}>Back</Button>
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={!canSubmitYes || submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="h-4 w-4" /> Authorize notification</>}
                </Button>
              </div>
            </div>
          )}

          {/* No path: record + close */}
          {consented === false && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">No problem — we won't contact your provider. You can always change this later.</p>
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConsented(null)} disabled={submitting}>Back</Button>
                <Button onClick={() => handleSubmit(false)} disabled={submitting} className="bg-gray-700 hover:bg-gray-800 text-white">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Confirm — do not notify'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotifyProviderConsentModal;
