import React, { useState } from 'react';
import { Camera, CameraOff, FileText, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

/**
 * "ALLOW RECORDING FOR PROMOTIONAL USE" on the phleb's appointment card.
 *
 * The answer comes from checkout (appointments.recording_preference), written
 * by the server from the patient's signed release -- never typed by staff.
 *
 *   accepted      green  YES, with what may be shown, the signed release, and
 *                        the rules for keeping PHI out of frame
 *   declined      grey   NO
 *   not_eligible  grey   NO -- minor
 *   not_asked     amber  NOT ASKED -- treat as no
 *
 * "Patient changed their mind" withdraws it on the spot (recording-consent
 * edge function), and the card flips to NO.
 */

export type RecordingPreference = 'accepted' | 'declined' | 'not_asked' | 'not_eligible';

interface Props {
  appointmentId: string;
  preference?: RecordingPreference | null;
  scope?: 'arm_hands_only' | 'face_and_testimonial' | null;
  hasSignedRelease: boolean;
  /** Primary patient's name, so the phleb knows whom it covers on group visits. */
  patientName?: string | null;
  hasCompanions?: boolean;
}

export function RecordingConsentChip({ preference }: { preference?: RecordingPreference | null }) {
  if (preference !== 'accepted') return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
      <Camera className="h-3 w-3" /> OK to record
    </span>
  );
}

function callConsentFn(body: Record<string, unknown>) {
  return supabase.functions.invoke('recording-consent', { body });
}

const RecordingConsentSection: React.FC<Props> = ({
  appointmentId, preference, scope, hasSignedRelease, patientName, hasCompanions,
}) => {
  const [localPref, setLocalPref] = useState<RecordingPreference>((preference as RecordingPreference) || 'not_asked');
  const [opening, setOpening] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  React.useEffect(() => { setLocalPref((preference as RecordingPreference) || 'not_asked'); }, [preference]);

  const viewRelease = async () => {
    // Opened synchronously so mobile Safari treats it as a user action, then
    // pointed at the PDF once it arrives.
    const w = window.open('', '_blank');
    setOpening(true);
    try {
      const { data, error } = await callConsentFn({ action: 'view', appointmentId });
      if (error || !data?.pdfBase64) throw new Error(data?.error || error?.message || 'no pdf');
      const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (w) w.location.href = url;
      else window.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (w) w.close();
      toast.error("Couldn't open the signed release. Treat this visit as do-not-record and tell the office.");
    } finally {
      setOpening(false);
    }
  };

  const revoke = async () => {
    setRevoking(true);
    try {
      const { data, error } = await callConsentFn({ action: 'revoke', appointmentId, reason: 'Patient changed their mind at the visit' });
      if (error || !data?.ok) throw new Error();
      setLocalPref('declined');
      toast.success('Recording permission withdrawn. Do not record this visit.');
    } catch {
      toast.error("Couldn't save that. Don't record this visit, and tell the office.");
    } finally {
      setRevoking(false);
      setConfirmRevoke(false);
    }
  };

  const yes = localPref === 'accepted';
  const tone = yes
    ? 'border-emerald-300 bg-emerald-50'
    : localPref === 'not_asked'
      ? 'border-amber-200 bg-amber-50'
      : 'border-gray-200 bg-gray-50';

  const answer = yes
    ? 'YES'
    : localPref === 'not_eligible'
      ? 'NO · minor'
      : localPref === 'not_asked'
        ? 'NOT ASKED'
        : 'NO';

  return (
    <div className="border-b px-4 py-3">
      <div className={`rounded-lg border-2 p-3 ${tone}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Allow recording for promotional use
          </p>
          <span
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-extrabold ${
              yes ? 'bg-emerald-600 text-white' : localPref === 'not_asked' ? 'bg-amber-500 text-white' : 'bg-gray-700 text-white'
            }`}
            data-testid="recording-answer"
          >
            {yes ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            {answer}
          </span>
        </div>

        {yes && (
          <div className="mt-2 space-y-2">
            <p className="text-sm font-semibold text-emerald-900">
              {scope === 'face_and_testimonial' ? 'Face may appear + short testimonial at the end' : 'Arm and hands only — no face, no voice'}
            </p>
            <ul className="space-y-0.5 text-xs text-emerald-900">
              <li>• Ask again before you start, and stop if they say so.</li>
              <li>• Label tubes off camera. Keep the lab order, ID, insurance card and any screen out of frame.</li>
              <li>• No house number, street or outside of the home.</li>
              {hasCompanions && <li>• Covers {patientName || 'the primary patient'} only — do not record anyone else.</li>}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              {hasSignedRelease && (
                <Button size="sm" variant="outline" className="h-8 bg-white" onClick={viewRelease} disabled={opening}>
                  {opening ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                  View signed release
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8 text-red-700 hover:bg-red-50" onClick={() => setConfirmRevoke(true)}>
                Patient changed their mind
              </Button>
            </div>
          </div>
        )}

        {localPref === 'not_asked' && (
          <p className="mt-2 text-xs text-amber-900">This patient wasn't asked at checkout. Do not record.</p>
        )}
        {(localPref === 'declined' || localPref === 'not_eligible') && (
          <p className="mt-2 text-xs text-gray-700">Do not record this visit.</p>
        )}
      </div>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600" /> Withdraw recording permission?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The patient no longer wants to be recorded. This is saved on their file, and the card will say NO.
              Delete anything already recorded at this visit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Keep permission</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void revoke(); }} disabled={revoking} className="bg-red-600 hover:bg-red-700">
              {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RecordingConsentSection;
