import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Shield, ArrowRight, AlertCircle, CheckCircle, MessageSquare, Mail } from 'lucide-react';

/**
 * PROVIDER PORTAL LOGIN (`/provider`)
 *
 * Three paths, in order of friction (least → most):
 *
 *   1. SMS SIGN-IN (primary, passwordless): "Text me a code" → Supabase's
 *      native phone OTP (configured Twilio provider) sends a 6-digit code to
 *      the phone on file (organizations.contact_phone). Enter code → session
 *      created directly by Supabase. No password needed, ever. Same tab
 *      start-to-finish.
 *
 *   2. EMAIL + PASSWORD: traditional login for partners who prefer it or
 *      have set one.
 *
 *   3. EMAIL LINK FALLBACK: "Email me a reset link" for partners with no
 *      phone on file, or as a secondary path.
 *
 * Email is pre-filled from `?email=xxx` in announcement emails.
 *
 * IMPLEMENTATION NOTE: we don't expose phone numbers to the client. Two
 * edge functions (provider-otp-send / provider-otp-verify) wrap Supabase's
 * native phone auth so the email → phone mapping stays server-side. The
 * client then calls supabase.auth.setSession(...) with the tokens returned
 * by verify, identical to any other Supabase sign-in.
 */

type View = 'login' | 'method-choice' | 'sms-code-entry' | 'email-sent';

const ProviderLogin: React.FC = () => {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [orgName, setOrgName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [view, setView] = useState<View>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phoneHint, setPhoneHint] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  // Pre-fill org name from email (public lookup, portal-enabled orgs only)
  useEffect(() => {
    if (!email || !email.includes('@')) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('organizations')
          .select('name')
          .or(`billing_email.eq.${email.trim()},contact_email.eq.${email.trim()}`)
          .eq('portal_enabled', true)
          .eq('is_active', true)
          .maybeSingle();
        if (data?.name) setOrgName(data.name);
      } catch { /* non-blocking */ }
    })();
  }, [email]);

  // Resend countdown tick
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) { setError(err.message || 'Login failed. Please check your password.'); setLoading(false); return; }
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err?.message || 'Login failed.'); setLoading(false);
    }
  };

  // STEP 1 — ask server to trigger SMS via Supabase native phone auth
  const handleSendSmsCode = async () => {
    setError(null); setLoading(true);
    try {
      const { data, error: err } = await supabase.functions.invoke('provider-otp-send', { body: { email: email.trim() } });
      if (err) throw err;
      if (data?.delivery === 'sms' && data?.phone_hint) {
        setPhoneHint(data.phone_hint);
        setView('sms-code-entry');
        setResendCountdown(30);
      } else if (data?.delivery === 'rate_limited') {
        setError('Too many code requests. Please try again in an hour, or use email sign-in instead.');
      } else {
        setView('method-choice');
        setError('No phone number on file for this account. Please use email + password, or email link instead.');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not send code.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2 — verify code through server wrapper, set session with returned tokens
  const handleVerifyCode = async (codeOverride?: string) => {
    const codeToVerify = codeOverride ?? otpCode;
    if (!/^\d{6}$/.test(codeToVerify)) { setError('Enter the 6-digit code'); return; }
    setError(null); setLoading(true);
    try {
      const { data, error: err } = await supabase.functions.invoke('provider-otp-verify', {
        body: { email: email.trim(), code: codeToVerify },
      });
      if (err) throw err;
      if (!data?.access_token || !data?.refresh_token) {
        throw new Error(data?.error || 'Invalid or expired code');
      }
      // Hand the tokens to supabase-js — this populates auth state + persists session
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) throw setErr;
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err?.message || 'Incorrect or expired code.');
      setLoading(false);
    }
  };

  // Auto-verify when 6 digits entered (iOS/Android SMS auto-fill works)
  useEffect(() => {
    if (view === 'sms-code-entry' && otpCode.length === 6 && /^\d{6}$/.test(otpCode)) {
      handleVerifyCode(otpCode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode, view]);

  const handleEmailReset = async () => {
    setError(null); setLoading(true);
    try {
      const { error: err } = await supabase.functions.invoke('send-password-reset', { body: { email: email.trim() } });
      if (err) throw err;
      setView('email-sent');
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email. Please email info@convelabs.com.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">
            ConveLabs<span className="text-[#B91C1C]">.</span>
          </h1>
          <p className="mt-1 text-xs text-gray-500 uppercase tracking-wider font-semibold">Provider Portal</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#B91C1C]" />
              {orgName ? `Welcome, ${orgName}` : 'Provider sign in'}
            </CardTitle>
            <CardDescription>
              {view === 'login' && (orgName ? `Sign in to manage your patients, schedule visits, and view every result.` : `Log in to your organization's portal.`)}
              {view === 'method-choice' && `How would you like to verify it's you?`}
              {view === 'sms-code-entry' && `Enter the 6-digit code we texted to ${phoneHint ?? 'your phone'}.`}
              {view === 'email-sent' && `We sent a reset link to your inbox.`}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="flex items-start gap-2 p-3 text-sm bg-red-50 text-red-700 rounded-lg border border-red-200 mb-4">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {view === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email" type="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); setOrgName(null); setError(null); }}
                    placeholder="your@organization.com" required autoComplete="email"
                    readOnly={!!params.get('email') && !error}
                    className={params.get('email') && !error ? 'bg-gray-50' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password" type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password" required minLength={8}
                    autoFocus={!!params.get('email')}
                  />
                </div>
                <Button type="submit" disabled={loading || !email || !password}
                  className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 gap-1.5">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
                </Button>
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs text-center text-gray-500">First time here, or forgot your password?</p>
                  <Button type="button" variant="outline" className="w-full"
                    disabled={loading || !email || !email.includes('@')}
                    onClick={() => { setError(null); setView('method-choice'); }}>
                    Reset my password
                  </Button>
                </div>
              </form>
            )}

            {view === 'method-choice' && (
              <div className="space-y-3">
                <Button onClick={handleSendSmsCode} disabled={loading}
                  className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-12 gap-2 text-[15px]">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                  Text me a 6-digit code
                </Button>
                <p className="text-[11px] text-center text-gray-400">Fastest — stays in this tab, usually under 10 seconds</p>
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[11px] text-gray-400 uppercase">or</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <Button onClick={handleEmailReset} disabled={loading} variant="outline" className="w-full h-11 gap-2">
                  <Mail className="h-4 w-4" />
                  Email me a reset link instead
                </Button>
                <Button onClick={() => { setError(null); setView('login'); }} variant="ghost" size="sm" className="w-full">
                  ← Back to sign in
                </Button>
              </div>
            )}

            {view === 'sms-code-entry' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">Verification code</Label>
                  <Input
                    id="otp" type="text" inputMode="numeric" autoComplete="one-time-code"
                    maxLength={6} value={otpCode}
                    onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                    placeholder="123456" autoFocus
                    className="text-center text-2xl font-mono tracking-[0.5em] h-14"
                  />
                  <p className="text-[11px] text-center text-gray-500">
                    Code expires in 5 minutes · max 5 attempts
                  </p>
                </div>
                <Button onClick={() => handleVerifyCode()} disabled={loading || otpCode.length !== 6}
                  className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 gap-1.5">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</> : <>Verify <ArrowRight className="h-4 w-4" /></>}
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={() => { setError(null); setView('method-choice'); setOtpCode(''); }}
                    className="text-gray-500 hover:underline">← Try a different way</button>
                  <button type="button" onClick={handleSendSmsCode}
                    disabled={loading || resendCountdown > 0}
                    className="text-[#B91C1C] hover:underline disabled:text-gray-400 disabled:no-underline">
                    {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}

            {view === 'email-sent' && (
              <div className="space-y-4 py-4 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
                <div>
                  <h3 className="font-semibold text-lg">Check your inbox</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    We sent a password-setup link to <strong>{email}</strong>. It expires in 1 hour.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setError(null); setView('login'); }}>
                  Back to login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Need help? Email <a href="mailto:info@convelabs.com" className="text-[#B91C1C] hover:underline">info@convelabs.com</a>
          {' · '}
          <a href="tel:+19415279169" className="text-[#B91C1C] hover:underline">(941) 527-9169</a>
          {' · '}
          <Link to="/" className="text-gray-500 hover:underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
};

export default ProviderLogin;
