import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, Lock, AlertTriangle } from 'lucide-react';

/**
 * HIPAA second-factor gate on the patient lab-request page.
 *
 * Before letting the patient view their lab order or book an appointment,
 * require DOB that matches the record. Rate-limited: 5 attempts → 15-min
 * lockout, server-enforced by verify_lab_request_dob RPC.
 *
 * Hormozi framing: trust-first, not friction-first. We tell the patient
 * WHY we're asking ("to confirm it's really you") and how short it is
 * ("one field, one click"), so the gate feels like protection, not obstacle.
 */

interface Props {
  token: string;
  onVerified: () => void;
}

const DOBVerifyGate: React.FC<Props> = ({ token, onVerified }) => {
  const [dob, setDob] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dob) { setErr('Please enter your date of birth'); return; }
    setSubmitting(true); setErr(null); setLockedUntil(null);
    try {
      const { data, error } = await supabase.rpc('verify_lab_request_dob' as any, {
        p_token: token,
        p_dob: dob,
      });
      if (error) throw new Error(error.message);
      const res = data as any;
      if (res?.ok) {
        onVerified();
        return;
      }
      // Human-friendly messages per reason
      if (res?.reason === 'locked') {
        setLockedUntil(res.locked_until);
        setErr('Too many attempts. Try again in 15 minutes.');
      } else if (res?.reason === 'mismatch') {
        const left = res?.attempts_remaining ?? 0;
        setErr(left > 0
          ? `That doesn't match our records. ${left} ${left === 1 ? 'attempt' : 'attempts'} remaining.`
          : 'Too many attempts. Try again in 15 minutes.');
      } else if (res?.reason === 'expired') {
        setErr('This link has expired. Please contact your provider for a new one.');
      } else if (res?.reason === 'no_dob_on_file') {
        setErr("We don't have your date of birth on file yet. Please call (941) 527-9169 and we'll help you book.");
      } else if (res?.reason === 'not_found') {
        setErr('This link is not valid. Please check the URL or contact your provider.');
      } else {
        setErr('Verification failed. Please try again.');
      }
    } catch (e: any) {
      setErr(e?.message || 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 md:p-7">
          <div className="text-center mb-5">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="h-7 w-7 text-blue-600" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Let's confirm it's you</h1>
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
              Your doctor shared a private link to schedule your lab draw. To protect your health information, we ask for your date of birth before unlocking access.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs text-gray-700 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Date of birth
              </Label>
              <Input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                max={new Date().toISOString().substring(0, 10)}
                required
                autoFocus
                className="text-base"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Must match what your doctor's office has on file.
              </p>
            </div>

            {err && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800">{err}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !dob || !!lockedUntil}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 text-sm font-semibold gap-2"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
              ) : (
                <>Unlock my appointment →</>
              )}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <p className="text-[11px] text-gray-500">
              HIPAA-protected · Your DOB is only used for this verification.
              <br/>
              Need help? Call <a href="tel:+19415279169" className="text-blue-600 hover:underline">(941) 527-9169</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DOBVerifyGate;
