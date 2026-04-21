import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Collapsible "I'm already a member — text me a code" button for
 * the tier-unlock modal. Two-step: email → OTP code. On verify, calls
 * parent's onVerified(tier, email) so the booking flow can unlock
 * slots without a full login round-trip.
 *
 * Rate-limited + attempt-capped server-side (see issue_member_verification_code
 * and verify_member_code RPCs). Email enumeration protected — backend
 * returns a success-looking shape even if the email isn't a member.
 */
interface Props {
  tierName: string;
  onVerified: (tier: 'member' | 'vip' | 'concierge', email: string) => void;
}

const MemberOtpUnlockButton: React.FC<Props> = ({ tierName, onVerified }) => {
  const [step, setStep] = useState<'idle' | 'email' | 'code'>('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phoneLast4, setPhoneLast4] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!email || !/@/.test(email)) { toast.error('Enter your email'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('member-otp-send', {
        body: { email: email.trim() },
      });
      if (error) throw error;
      const r = data as any;
      if (r?.reason === 'rate_limited') {
        toast.error('Too many codes requested. Wait 15 minutes and try again.');
        return;
      }
      if (r?.sent === false) {
        toast.info('If that email is on a ConveLabs membership, a code is on its way. Check your SMS.');
        // Still advance to code step — keeps email enumeration impossible
      } else if (r?.sent) {
        toast.success(`Code sent to ••••${r?.phone_last4 || '????'}`);
      }
      setPhoneLast4(r?.phone_last4 || null);
      setStep('code');
    } catch (e: any) {
      toast.error(e?.message || 'Could not send code');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) { toast.error('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('member-otp-verify', {
        body: { email: email.trim(), code: code.trim() },
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.ok) {
        if (r?.reason === 'wrong_code') {
          toast.error(`Wrong code. ${r?.attempts_remaining || 0} tries left.`);
        } else if (r?.reason === 'no_pending_code') {
          toast.error('No pending code. Request a new one.');
          setStep('email');
        } else if (r?.reason === 'too_many_attempts') {
          toast.error('Too many attempts. Request a new code.');
          setStep('email');
          setCode('');
        } else {
          toast.error('Verify failed');
        }
        return;
      }
      // Success
      onVerified(r.tier, email.trim().toLowerCase());
    } catch (e: any) {
      toast.error(e?.message || 'Verify failed');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setStep('email')}
        className="w-full block text-center text-sm font-semibold text-gray-800 hover:text-gray-900 border-2 border-gray-300 rounded-lg py-2.5 transition hover:bg-gray-50 flex items-center justify-center gap-2"
      >
        <MessageSquare className="h-4 w-4" />
        I'm already a {tierName} — text me a code
      </button>
    );
  }

  if (step === 'email') {
    return (
      <div className="border-2 border-gray-200 rounded-lg p-3 space-y-2 bg-white">
        <p className="text-xs font-semibold text-gray-700">Enter the email on your membership</p>
        <Input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="h-9"
          autoFocus
        />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-9 text-xs" onClick={() => setStep('idle')}>Cancel</Button>
          <Button className="flex-1 h-9 text-xs bg-gray-900 text-white hover:bg-gray-800" onClick={sendCode} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Text me a code'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-gray-200 rounded-lg p-3 space-y-2 bg-white">
      <p className="text-xs font-semibold text-gray-700">
        {phoneLast4 ? <>Code sent to ••••{phoneLast4}</> : <>Enter the 6-digit code</>}
      </p>
      <Input
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        inputMode="numeric"
        maxLength={6}
        className="h-10 text-center text-lg tracking-widest font-mono"
        autoFocus
      />
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-9 text-xs" onClick={() => { setStep('email'); setCode(''); }}>← Back</Button>
        <Button className="flex-1 h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={verifyCode} disabled={loading || code.length !== 6}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Verify</>}
        </Button>
      </div>
      <button type="button" onClick={sendCode} className="w-full text-[11px] text-gray-500 hover:text-gray-700" disabled={loading}>
        Didn't get it? Send again
      </button>
    </div>
  );
};

export default MemberOtpUnlockButton;
