import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowRight, CheckCircle2, ShieldCheck, KeyRound, Sparkles, Phone, Calendar, UserPlus } from 'lucide-react';

/**
 * PROVIDER FIRST-LOGIN ONBOARDING (Hormozi-structured)
 *
 * Three steps, bounded progress bar, cannot be dismissed until complete.
 * Fires once when user_metadata.onboarded_at is null. After save, the
 * timestamp is stamped so the modal never appears again.
 *
 *   Step 1 — "Confirm who you are"  (name required, title optional)
 *   Step 2 — "Set a password"       (optional, framed as convenience)
 *   Step 3 — "✓ You're in"          (confirmation + two action anchors)
 *
 * Why three steps not one: small commitments create larger ones. Typing
 * your name is a 2-second commitment that creates psychological ownership
 * of the account. Password is framed as a benefit ("skip the phone next
 * time"), not a requirement.
 */

interface Props {
  open: boolean;
  orgName: string;
  phoneHint: string | null;
  defaultName?: string;
  onComplete: () => void;
}

type Step = 1 | 2 | 3;

const ProviderOnboardingModal: React.FC<Props> = ({ open, orgName, phoneHint, defaultName, onComplete }) => {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(defaultName || '');
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);

  const handleStep1 = () => {
    if (!name.trim()) { toast.error('Please enter your name'); return; }
    setStep(2);
  };

  const handleStep2Skip = async () => {
    await persist({ setPassword: false });
  };

  const handleStep2Set = async () => {
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    await persist({ setPassword: true });
  };

  const persist = async (opts: { setPassword: boolean }) => {
    setSaving(true);
    try {
      const updatePayload: any = {
        data: {
          full_name: name.trim(),
          title: title.trim() || null,
          onboarded_at: new Date().toISOString(),
          password_set: !!opts.setPassword,
        },
      };
      if (opts.setPassword) updatePayload.password = password;

      const { error } = await supabase.auth.updateUser(updatePayload);
      if (error) throw error;

      setHasPassword(opts.setPassword);
      setStep(3);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={() => { /* cannot be dismissed */ }}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100 relative">
          <div className="h-full bg-[#B91C1C] transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        {/* Header */}
        <div className="px-6 pt-5 pb-2">
          <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Step {step} of 3 · About 60 seconds total</p>
        </div>

        {/* STEP 1 — CONFIRM IDENTITY */}
        {step === 1 && (
          <div className="px-6 pb-6 space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Welcome to {orgName}'s portal</h2>
              <p className="text-sm text-gray-600 mt-1">Let's get you set up. First — who are you?</p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="onb-name">Your full name *</Label>
                <Input id="onb-name" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Sharlene Dean" autoFocus autoComplete="name" />
              </div>
              <div>
                <Label htmlFor="onb-title">Your title at {orgName} <span className="text-gray-400 text-xs">(optional)</span></Label>
                <Input id="onb-title" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Office Manager, ARNP, Director" />
              </div>
            </div>

            <Button onClick={handleStep1} disabled={!name.trim()}
              className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 gap-1.5">
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* STEP 2 — OPTIONAL PASSWORD */}
        {step === 2 && (
          <div className="px-6 pb-6 space-y-5">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <KeyRound className="h-6 w-6 text-[#B91C1C]" /> Set a password <span className="text-base font-normal text-gray-400">(optional)</span>
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                You can always sign in with SMS — a code goes to your phone in under 10 seconds. But a password lets you skip that step when you're in a hurry.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="onb-pw">Password</Label>
                <Input id="onb-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters" minLength={8} autoComplete="new-password" autoFocus />
              </div>
              <div>
                <Label htmlFor="onb-cpw">Confirm password</Label>
                <Input id="onb-cpw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Type it again" minLength={8} autoComplete="new-password" />
              </div>
            </div>

            <div className="space-y-2">
              <Button onClick={handleStep2Set} disabled={saving || password.length < 8 || password !== confirm}
                className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 gap-1.5">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Set password &amp; continue <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <Button onClick={handleStep2Skip} disabled={saving} variant="outline" className="w-full">
                Skip — I'll use SMS sign-in
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3 — YOU'RE IN */}
        {step === 3 && (
          <div className="px-6 pb-6 space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold">You're in, {name.split(' ')[0] || 'there'}.</h2>
              <p className="text-sm text-gray-600 mt-1">
                Welcome to {orgName}'s ConveLabs portal.
              </p>
            </div>

            {/* Proof of setup */}
            <div className="space-y-2 bg-gray-50 rounded-xl p-4 border border-gray-200">
              <Row icon={<Phone className="h-4 w-4 text-emerald-600" />}
                label="Phone verified" value={phoneHint || '✓'} />
              <Row icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
                label="Account" value={hasPassword ? 'Password + SMS' : 'SMS sign-in'} />
              <Row icon={<Sparkles className="h-4 w-4 text-emerald-600" />}
                label="Organization" value={orgName} />
            </div>

            {/* Action anchors (what to do next) */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Start here</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={onComplete}
                  className="text-left border border-gray-200 rounded-lg p-3 hover:border-[#B91C1C] hover:bg-red-50/40 transition">
                  <Calendar className="h-5 w-5 text-[#B91C1C] mb-1.5" />
                  <p className="font-semibold text-sm">Schedule a visit</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Book your first patient</p>
                </button>
                <button onClick={onComplete}
                  className="text-left border border-gray-200 rounded-lg p-3 hover:border-[#B91C1C] hover:bg-red-50/40 transition">
                  <UserPlus className="h-5 w-5 text-[#B91C1C] mb-1.5" />
                  <p className="font-semibold text-sm">Invite your team</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Add coworkers</p>
                </button>
              </div>
            </div>

            <Button onClick={onComplete}
              className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 gap-1.5">
              Open my dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 text-sm">
    {icon}
    <span className="text-gray-500 flex-1">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);

export default ProviderOnboardingModal;
