import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, UserPlus, Building2 } from 'lucide-react';

/**
 * Post-booking referring-provider capture.
 *
 * Fires on the /welcome success page after an appointment / lab-request
 * booking is confirmed paid. Two value props in one:
 *
 *   1. Patient: "We'll let your doctor know" (concierge feel, free)
 *   2. ConveLabs: captures referring provider into our acquisition loop
 *      (feeds the 5-email drip → free warm intro)
 *
 * Hormozi frame: asking for the doctor's info AFTER payment is the highest-
 * trust moment — patient just said yes. Capture rate here 3-4x cold asks.
 *
 * HIPAA: patient consent (checkbox) gates whether emails 1 & 2 of the drip
 * fire (patient-specific). If unchecked, provider still goes into our loop
 * but first contact is the generic "teach" email with no patient PII.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  patientEmail: string;
  patientName: string;
}

const ReferringProviderCapture: React.FC<Props> = ({ open, onClose, appointmentId, patientEmail, patientName }) => {
  const [providerName, setProviderName] = useState('');
  const [practiceName, setPracticeName] = useState('');
  const [practicePhone, setPracticePhone] = useState('');
  const [practiceEmail, setPracticeEmail] = useState('');
  const [practiceCity, setPracticeCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const hasMinInfo = providerName.trim() || practiceName.trim();
  const firstName = patientName.split(' ')[0];

  const submit = async () => {
    if (!hasMinInfo) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('capture_referring_provider' as any, {
        p_appointment_id: appointmentId,
        p_patient_email: patientEmail.toLowerCase(),
        p_patient_name: patientName,
        p_provider_name: providerName.trim() || null,
        p_practice_name: practiceName.trim() || null,
        p_practice_phone: practicePhone.trim() || null,
        p_practice_email: practiceEmail.trim().toLowerCase() || null,
        p_practice_city: practiceCity.trim() || null,
        p_consent: consent,
      });
      if (error) throw new Error(error.message);
      setDone(true);
      toast.success('Got it — thanks for the intro');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSubmitting(false);
    }
  };

  const skip = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        {done ? (
          <div className="py-5 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold">Thanks, {firstName}</p>
              <p className="text-sm text-gray-600 mt-1">
                {consent
                  ? `We'll send ${practiceName || 'your doctor'} a heads-up about your appointment and a delivery receipt when your specimen lands at the lab.`
                  : `We've noted ${practiceName || 'your doctor'} for future reference. Your appointment details stay private.`}
              </p>
            </div>
            <Button onClick={onClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[#B91C1C]" />
                One last thing — which doctor ordered these labs?
              </DialogTitle>
              <p className="text-sm text-gray-600 mt-1">
                If you'd like, we'll send your doctor's office a delivery receipt when your specimen reaches the lab. Saves them from chasing results. <strong>Totally optional.</strong>
              </p>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-xs flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Practice name</Label>
                <Input value={practiceName} onChange={e => setPracticeName(e.target.value)} placeholder="e.g. Winter Park Family Medicine" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Doctor's name</Label>
                  <Input value={providerName} onChange={e => setProviderName(e.target.value)} placeholder="Dr. Jane Smith" />
                </div>
                <div>
                  <Label className="text-xs">City</Label>
                  <Input value={practiceCity} onChange={e => setPracticeCity(e.target.value)} placeholder="Winter Park" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Practice email <span className="text-gray-400">(optional)</span></Label>
                  <Input type="email" value={practiceEmail} onChange={e => setPracticeEmail(e.target.value)} placeholder="office@practice.com" />
                </div>
                <div>
                  <Label className="text-xs">Practice phone <span className="text-gray-400">(optional)</span></Label>
                  <Input value={practicePhone} onChange={e => setPracticePhone(e.target.value)} placeholder="(407) 555-1234" />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} className="mt-0.5" />
                  <span className="text-xs text-blue-900 leading-relaxed">
                    <strong>Yes, keep my doctor in the loop.</strong> I authorize ConveLabs to share my first name, appointment date, and delivery receipt with my referring provider's office. (Clinical results still go through their usual channel.)
                  </span>
                </label>
              </div>

              <div className="flex justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={skip} disabled={submitting}>Skip for now</Button>
                <Button onClick={submit} disabled={!hasMinInfo || submitting} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save doctor info'}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReferringProviderCapture;
