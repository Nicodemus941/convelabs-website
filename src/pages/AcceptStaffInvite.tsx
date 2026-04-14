import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Public page (no auth required) that accepts a staff invitation token.
// URL: /accept-invite?token=...

const AcceptStaffInvite: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const loadInvite = async () => {
      if (!token) {
        setLoadError('No invitation token in the URL. Please use the exact link from your email.');
        setLoading(false);
        return;
      }
      // Server-side preview (service role under the hood; no RLS needed on token lookup)
      const { data, error } = await supabase.functions.invoke('accept-staff-invitation', {
        body: { token, preview: true },
      });
      if (error) {
        const msg = (error as any).message || '';
        if (msg.toLowerCase().includes('already')) {
          setLoadError('This invitation has already been accepted. Try logging in.');
        } else if (msg.toLowerCase().includes('expired')) {
          setLoadError('This invitation has expired. Ask your manager to resend it.');
        } else if (msg.toLowerCase().includes('revoked')) {
          setLoadError('This invitation has been revoked.');
        } else {
          setLoadError(data?.error || 'Invitation not found or no longer valid.');
        }
      } else if (!data?.success) {
        setLoadError(data?.error || 'Invitation not found.');
      } else {
        setInvite(data.invitation);
      }
      setLoading(false);
    };
    loadInvite();
  }, [token]);

  const submit = async () => {
    if (!acceptedTerms) {
      toast.error('Please accept the terms to continue');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('accept-staff-invitation', {
        body: { token, password, acceptedTerms: true },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to accept');
      setDone(true);
      toast.success('Welcome to ConveLabs!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to accept invitation');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" /> Invitation Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link to="/login">Go to Login</Link></Button>
              <Button asChild className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                <a href="mailto:hiring@convelabs.com">Contact Us</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white p-4">
        <Card className="max-w-md w-full border-emerald-200">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Welcome to ConveLabs!</h2>
            <p className="text-muted-foreground mb-6">
              Your account is set up. Log in to access your dashboard and complete onboarding.
            </p>
            <Button
              className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white"
              onClick={() => navigate('/login')}
            >
              Continue to Login →
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const payDollars = invite.pay_rate_cents ? (invite.pay_rate_cents / 100).toFixed(2) : null;
  const bountyDollars = invite.referral_bounty_cents ? (invite.referral_bounty_cents / 100).toFixed(0) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 p-4 flex items-start justify-center">
      <div className="max-w-lg w-full space-y-4 py-8">
        {/* Offer stack */}
        <Card className="border-2 border-[#B91C1C] shadow-lg">
          <CardHeader className="bg-[#B91C1C] text-white rounded-t-lg">
            <CardTitle className="text-center">Welcome, {invite.first_name}!</CardTitle>
            <p className="text-center text-sm opacity-90">Your offer from ConveLabs</p>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Role</span>
              <span className="font-semibold">{invite.role}</span>
            </div>
            {payDollars && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Pay</span>
                <span className="font-semibold text-emerald-700">${payDollars}/hr</span>
              </div>
            )}
            {invite.start_date && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Start date</span>
                <span className="font-semibold">{invite.start_date}</span>
              </div>
            )}
            {bountyDollars && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-3">
                <p className="text-sm text-emerald-800 font-medium">
                  🎯 Referral bonus: ${bountyDollars} after your 10th billable visit
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account setup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#B91C1C]" /> Set up your account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={invite.email} readOnly className="bg-gray-50" />
            </div>
            <div>
              <Label>Create password</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={acceptedTerms}
                onCheckedChange={c => setAcceptedTerms(!!c)}
              />
              <label htmlFor="terms" className="text-xs text-muted-foreground cursor-pointer leading-snug">
                I accept ConveLabs' <a href="/terms" target="_blank" className="underline">terms of service</a> and
                <a href="/privacy" target="_blank" className="underline ml-1">privacy policy</a>, and authorize
                background check and license verification.
              </label>
            </div>
            <Button
              className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating account...</>
              ) : (
                'Accept Offer & Create Account →'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AcceptStaffInvite;
