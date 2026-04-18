import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

/**
 * RESET PASSWORD — single-path, bulletproof recovery flow.
 *
 * Supported link formats (in priority):
 *   1. Direct token (preferred, what send-password-reset now emits):
 *        /reset-password?token=<hashed_token>&email=<email>&type=recovery
 *      → supabase.auth.verifyOtp({ token_hash, type: 'recovery' })  — atomic,
 *      no polling, no race. This is the default path.
 *
 *   2. Hash fragment (legacy — Supabase verify-redirect output):
 *        /reset-password#access_token=...&refresh_token=...&type=recovery
 *      → supabase.auth.setSession({ access_token, refresh_token }) — explicit
 *      session creation (no more relying on flaky auto-detect).
 *
 *   3. PKCE code (if ever used): /reset-password?code=<code>
 *      → supabase.auth.exchangeCodeForSession(code)
 *
 *   4. Already-logged-in session (e.g., patient already had a valid recovery
 *      session from a prior page load)
 *
 * If none of the above yield a session, we show "expired" with a link to
 * request a new reset. No polling, no guessing — every path is synchronous.
 */

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const clearUrl = () => window.history.replaceState({}, '', '/reset-password');

    const markReady = (resolvedEmail: string, token: string) => {
      if (!mounted) return;
      setEmail(resolvedEmail);
      setAccessToken(token);
      setSessionReady(true);
      setFormError("");
      setLoading(false);
      clearUrl();
    };

    const markExpired = (msg?: string) => {
      if (!mounted) return;
      setFormError(msg || "Your reset link has expired or is invalid. Please request a new one.");
      setLoading(false);
    };

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const emailParam = params.get('email');
        const code = params.get('code');
        const hash = window.location.hash || '';

        // ── METHOD 1: direct token (the preferred, primary path) ──────
        if (token) {
          // Prefer verifyOtp({ token_hash }) — requires token only, atomic.
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery',
          });
          if (!error && data?.session?.user?.email) {
            markReady(data.session.user.email, data.session.access_token);
            return;
          }
          // Fallback: try verifyOtp with email + token (for backward-compat
          // with older Supabase clients that used this signature)
          if (emailParam) {
            const { data: d2, error: e2 } = await supabase.auth.verifyOtp({
              email: emailParam,
              token,
              type: 'recovery',
            });
            if (!e2 && d2?.session?.user?.email) {
              markReady(d2.session.user.email, d2.session.access_token);
              return;
            }
            console.error('[reset-password] verifyOtp failed:', e2?.message || error?.message);
          }
          markExpired();
          return;
        }

        // ── METHOD 2: hash fragment (legacy — still supported for links that
        // went through Supabase's /auth/v1/verify redirect) ──
        if (hash.includes('access_token')) {
          const h = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
          const at = h.get('access_token');
          const rt = h.get('refresh_token');
          if (at && rt) {
            const { data, error } = await supabase.auth.setSession({
              access_token: at,
              refresh_token: rt,
            });
            if (!error && data?.session?.user?.email) {
              markReady(data.session.user.email, data.session.access_token);
              return;
            }
            console.error('[reset-password] setSession failed:', error?.message);
          }
          markExpired();
          return;
        }

        // ── METHOD 3: PKCE code ──
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data?.session?.user?.email) {
            markReady(data.session.user.email, data.session.access_token);
            return;
          }
          markExpired();
          return;
        }

        // ── METHOD 4: existing session from a prior load ──
        const { data: existing } = await supabase.auth.getSession();
        if (existing?.session?.user?.email) {
          markReady(existing.session.user.email, existing.session.access_token);
          return;
        }

        markExpired();
      } catch (err) {
        console.error('[reset-password] init failed:', err);
        markExpired("Something went wrong. Please request a new reset link.");
      }
    })();

    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!accessToken) {
        setFormError("Session expired. Please request a new reset link.");
        setIsSubmitting(false);
        return;
      }

      // Use the edge function (admin API — no client-side session lock issues)
      const { data, error } = await supabase.functions.invoke('update-user-password', {
        body: { password, accessToken },
      });

      if (error) {
        console.error('[reset-password] update error:', error);
        setFormError("Failed to update password. Please try again.");
        setIsSubmitting(false);
        return;
      }
      if (data?.error) {
        console.error('[reset-password] server error:', data.error);
        setFormError(data.error);
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      toast.success("Password updated — signing you in…");

      // Their session is still valid after the password change. Skip the
      // unnecessary sign-out + /login bounce. Route straight to the
      // role-appropriate dashboard so they never see a login form twice.
      setTimeout(async () => {
        try {
          const { data: refreshed } = await supabase.auth.refreshSession();
          const role = refreshed?.session?.user?.user_metadata?.role
            || refreshed?.user?.user_metadata?.role;
          if (role === 'provider') {
            window.location.href = '/dashboard/provider';
            return;
          }
          if (role) {
            window.location.href = `/dashboard/${role}`;
            return;
          }
          // No role in metadata — let Dashboard.tsx derive it from org membership
          window.location.href = '/dashboard';
        } catch {
          window.location.href = '/dashboard';
        }
      }, 1200);
    } catch (err: any) {
      console.error('[reset-password] submit failed:', err);
      setFormError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold">
            ConveLabs<span className="text-[#B91C1C]">.</span>
          </h2>
          <p className="mt-2 text-sm text-gray-600">Luxury mobile phlebotomy services</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Reset Password</CardTitle>
            <CardDescription>
              {email ? `Create a new password for ${email}` : 'Create a new password for your account'}
            </CardDescription>
          </CardHeader>

          {loading ? (
            <CardContent className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#B91C1C] mb-3" />
              <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
            </CardContent>
          ) : isSuccess ? (
            <CardContent className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-green-800">Password Updated!</h3>
                <p className="text-green-700 text-sm mt-2">Redirecting to login…</p>
              </div>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-5">
                {formError && (
                  <div className="flex items-start gap-2 p-3 text-sm bg-red-50 text-red-700 rounded-lg border border-red-200">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <span>{formError}</span>
                      {formError.includes('expired') && (
                        <a href="/forgot-password" className="block mt-2 text-[#B91C1C] font-medium hover:underline">
                          Request a new reset link →
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={!sessionReady}
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={!sessionReady}
                  />
                </div>
              </CardContent>

              <CardFooter className="flex-col space-y-3">
                <Button
                  type="submit"
                  disabled={isSubmitting || !sessionReady}
                  className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11"
                >
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating Password…</>
                  ) : 'Reset Password'}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
