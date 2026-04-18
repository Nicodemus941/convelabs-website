import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Shield, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';

/**
 * PROVIDER PORTAL LOGIN (`/provider`)
 *
 * Entry page for partner organizations. Two paths:
 *
 *   1. Has an account → logs in with email + password → redirected to
 *      /dashboard (provider role gated on the other side)
 *   2. Never set a password → we send a password-reset email directly to
 *      their inbox using the `send-password-reset` edge fn (the one we
 *      hardened in the earlier fix). One click, 30 seconds, back in.
 *
 * Email is pre-filled from `?email=xxx` query param — the announcement
 * emails we send include this so the partner doesn't even have to type.
 */

const ProviderLogin: React.FC = () => {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [orgName, setOrgName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Look up org name from email (for personalized header) — no auth required,
  // public organizations query filtered to portal_enabled + is_active
  useEffect(() => {
    if (!email || !email.includes('@')) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('organizations')
          .select('name')
          .eq('billing_email', email.trim())
          .eq('portal_enabled', true)
          .eq('is_active', true)
          .maybeSingle();
        if (data?.name) setOrgName(data.name);
      } catch { /* non-blocking */ }
    })();
  }, [email]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message || 'Login failed. Please check your password.');
        setLoading(false);
        return;
      }
      // Landing — provider role gate handles redirect
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
      setLoading(false);
    }
  };

  const handleSendReset = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.functions.invoke('send-password-reset', {
        body: { email: email.trim() },
      });
      if (err) throw err;
      setResetSent(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email. Please try again or call (941) 527-9169.');
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
              {orgName
                ? `Sign in to manage your patients, schedule visits, and view every result.`
                : `Log in to your organization's portal.`}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {resetSent ? (
              <div className="space-y-4 py-4 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
                <div>
                  <h3 className="font-semibold text-lg">Check your inbox</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    We sent a password-setup link to <strong>{email}</strong>. It expires in 1 hour.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setResetSent(false); setMode('login'); }}>
                  Back to login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 p-3 text-sm bg-red-50 text-red-700 rounded-lg border border-red-200">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setOrgName(null); }}
                    placeholder="your@organization.com"
                    required
                    autoComplete="email"
                    readOnly={!!params.get('email') && !error}
                    className={params.get('email') && !error ? 'bg-gray-50' : ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    required
                    minLength={8}
                    autoFocus={!!params.get('email')}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 gap-1.5"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                  ) : (
                    <>Sign in <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>

                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs text-center text-gray-500">
                    First time here, or forgot your password?
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={loading || !email || !email.includes('@')}
                    onClick={handleSendReset}
                  >
                    Send me a password setup link
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Need help? Call <a href="tel:+19415279169" className="text-[#B91C1C] hover:underline">(941) 527-9169</a>
          {' · '}
          <Link to="/" className="text-gray-500 hover:underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
};

export default ProviderLogin;
