import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Camera, EyeOff, Loader2, ShieldCheck, ChevronLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import SignaturePad, { type SignaturePadHandle } from '@/components/phleb-dashboard/schedule/SignaturePad';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

/**
 * PROMOTIONAL RECORDING CONSENT — asked once at checkout.
 *
 *   ask      → "Help other patients see what a visit looks like?"  Yes / No thanks
 *   release  → the release (served by submit-recording-consent, so the text we
 *              store with the signature is exactly the text shown here), what may
 *              be recorded, typed name, adult-patient attestation, signature
 *   thanks   → "Thank you, your preference has been noted." / "...consent is saved."
 *
 * Yes and No are the same size and there is no close button: the patient
 * answers either way, and saying no never blocks or changes the booking.
 * Minors are never shown this (CheckoutStep decides that before opening).
 */

export type RecordingScope = 'arm_hands_only' | 'face_and_testimonial';

export interface RecordingChoice {
  decision: 'accepted' | 'declined';
  scope?: RecordingScope;
  /** Absent only if saving a decline failed — the booking still goes ahead. */
  consentId?: string;
}

interface ReleaseSection { heading: string; body: string[] }
interface Release { version: string; title: string; sections: ReleaseSection[]; scopes: Record<RecordingScope, string> }

interface Props {
  open: boolean;
  patientName: string;
  patientEmail: string;
  patientDob?: string | null;
  appointmentDate?: Date | string | null;
  /** Start on the release step (patient tapped "Change" after saying no). */
  startAtRelease?: boolean;
  onDone: (choice: RecordingChoice) => void;
}

type Step = 'ask' | 'release' | 'thanks-declined' | 'thanks-accepted';

const NEVER_RECORDED = ['Your lab order', 'Your name', 'Your date of birth', 'Your address'];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function isoDay(d?: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

const RecordingConsentModal: React.FC<Props> = ({
  open, patientName, patientEmail, patientDob, appointmentDate, startAtRelease, onDone,
}) => {
  const [step, setStep] = useState<Step>(startAtRelease ? 'release' : 'ask');
  const [release, setRelease] = useState<Release | null>(null);
  const [releaseError, setReleaseError] = useState(false);
  const [scope, setScope] = useState<RecordingScope>('arm_hands_only');
  const [signerName, setSignerName] = useState(patientName);
  const [attested, setAttested] = useState(false);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [saving, setSaving] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (open) setStep(startAtRelease ? 'release' : 'ask');
  }, [open, startAtRelease]);

  useEffect(() => { setSignerName(patientName); }, [patientName]);

  // Fetched when the modal first opens, so the release is ready by the time
  // the patient taps Yes.
  useEffect(() => {
    if (!open || release) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke('submit-recording-consent', { method: 'GET' });
      if (cancelled) return;
      if (error || !data?.version) setReleaseError(true);
      else setRelease(data as Release);
    })();
    return () => { cancelled = true; };
  }, [open, release]);

  const finish = (choice: RecordingChoice, thanks: Step) => {
    setStep(thanks);
    window.setTimeout(() => onDone(choice), thanks === 'thanks-accepted' ? 2200 : 1500);
  };

  const decline = async () => {
    setSaving(true);
    let consentId: string | undefined;
    try {
      const { data } = await supabase.functions.invoke('submit-recording-consent', {
        body: {
          decision: 'declined',
          patientEmail,
          patientName,
          patientDob: patientDob || null,
          appointmentDate: isoDay(appointmentDate),
        },
      });
      consentId = data?.consentId;
    } catch {
      // A decline that fails to save still ends as "do not record": the
      // appointment stays 'not_asked', which the phleb treats the same way.
    } finally {
      setSaving(false);
    }
    finish({ decision: 'declined', consentId }, 'thanks-declined');
  };

  const canSign = !!release && signerName.trim().length >= 3 && attested && !sigEmpty && !saving;

  const accept = async () => {
    if (!release || !sigRef.current || sigRef.current.isEmpty()) return;
    setSaving(true);
    try {
      const blob = await sigRef.current.toBlob();
      if (!blob) throw new Error('signature');
      const signaturePng = await blobToDataUrl(blob);
      const { data, error } = await supabase.functions.invoke('submit-recording-consent', {
        body: {
          decision: 'accepted',
          releaseVersion: release.version,
          scope,
          signerName: signerName.trim(),
          attestAdultPatient: attested,
          signaturePng,
          patientEmail,
          patientName,
          patientDob: patientDob || null,
          appointmentDate: isoDay(appointmentDate),
        },
      });
      const code = (data as any)?.error;
      if (error || code || !data?.consentId) {
        if (code === 'release_changed') {
          setRelease(null);
          toast.error('The release was just updated. Please review it once more.');
        } else if (code === 'minor_not_eligible') {
          toast.error('We only record patients who are 18 or older.');
          finish({ decision: 'declined' }, 'thanks-declined');
        } else {
          toast.error("We couldn't save your signature. Please try again, or choose No thanks.");
        }
        return;
      }
      finish({ decision: 'accepted', scope, consentId: data.consentId }, 'thanks-accepted');
    } catch {
      toast.error("We couldn't save your signature. Please try again, or choose No thanks.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        hideCloseButton
        className="max-w-lg max-h-[92vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {step === 'ask' && (
          <div className="space-y-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
              <Camera className="h-5 w-5 text-[#B91C1C]" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-xl leading-snug">
                Help other patients see what a ConveLabs visit looks like?
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                With your permission, your phlebotomist may record the setup and your blood draw for our
                website and social media. Arm and hands only, unless you choose otherwise.
              </DialogDescription>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <EyeOff className="h-3.5 w-3.5" /> Never recorded
              </p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {NEVER_RECORDED.map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Saying no doesn't change your visit, your care or your price in any way.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" className="h-12" onClick={decline} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'No thanks'}
              </Button>
              <Button size="lg" className="h-12" onClick={() => setStep('release')} disabled={saving}>
                Yes, happy to help
              </Button>
            </div>
          </div>
        )}

        {step === 'release' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <DialogTitle className="text-lg">{release?.title || 'Authorization for Promotional Recording'}</DialogTitle>
              <DialogDescription className="text-xs">Please read, choose what may be recorded, and sign.</DialogDescription>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed" tabIndex={0}>
              {!release && !releaseError && (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              )}
              {releaseError && (
                <p className="text-muted-foreground">We couldn't load the release right now. You can choose No thanks and continue booking.</p>
              )}
              {release?.sections.map((s) => (
                <div key={s.heading} className="mb-3 last:mb-0">
                  <p className="font-semibold">{s.heading}</p>
                  {s.body.map((p, i) => <p key={i} className="mt-1 text-muted-foreground">{p}</p>)}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">What may be recorded</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as RecordingScope)} className="gap-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${scope === 'arm_hands_only' ? 'border-primary bg-primary/5' : ''}`}>
                  <RadioGroupItem value="arm_hands_only" className="mt-0.5" />
                  <span className="text-sm"><span className="font-medium">Arm and hands only</span><br />
                    <span className="text-muted-foreground">Your face isn't shown and your voice isn't used.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${scope === 'face_and_testimonial' ? 'border-primary bg-primary/5' : ''}`}>
                  <RadioGroupItem value="face_and_testimonial" className="mt-0.5" />
                  <span className="text-sm"><span className="font-medium">My face may appear, and I'm happy to give a short testimonial</span><br />
                    <span className="text-muted-foreground">You can still skip the testimonial on the day.</span></span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rc-name" className="text-sm font-medium">Your full legal name</Label>
              <Input id="rc-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} autoComplete="name" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Signature</Label>
              <SignaturePad ref={sigRef} height={140} placeholder="Sign here with your finger or mouse" onChange={(empty) => setSigEmpty(empty)} />
            </div>

            {/* Not a wrapping <label>: a Radix checkbox inside one toggles twice
                per tap (button click + label click) and appears not to work. */}
            <div className="flex items-start gap-2.5 text-sm">
              <Checkbox id="rc-attest" checked={attested} onCheckedChange={(v) => setAttested(v === true)} className="mt-0.5" />
              <Label htmlFor="rc-attest" className="cursor-pointer text-sm font-normal leading-snug">
                I am the patient being seen at this appointment, I am 18 or older, and I have read and agree to this authorization.
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Booking for someone else? Only the patient can agree, so please choose No thanks.
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <div className="flex gap-2">
                {!startAtRelease && (
                  <Button variant="ghost" size="sm" onClick={() => setStep('ask')} disabled={saving}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={decline} disabled={saving}>No thanks</Button>
              </div>
              <Button onClick={accept} disabled={!canSign}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Sign & continue'}
              </Button>
            </div>
          </div>
        )}

        {(step === 'thanks-declined' || step === 'thanks-accepted') && (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="status" aria-live="polite">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <DialogTitle className="text-xl">
              {step === 'thanks-declined' ? 'Thank you, your preference has been noted.' : 'Thank you, your consent is saved.'}
            </DialogTitle>
            <DialogDescription className="max-w-sm text-sm">
              {step === 'thanks-declined'
                ? "Nothing will be recorded at your visit."
                : "We'll email you a copy. You can withdraw it any time before your visit — just tell your phlebotomist or reply to that email."}
            </DialogDescription>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RecordingConsentModal;
