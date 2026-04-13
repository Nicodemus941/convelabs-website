
import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const emailParam = params.get('email');
        const hash = window.location.hash;

        // METHOD 1: Token in query params (new flow — no lock contention)
        if (token && emailParam) {
          console.log('Using token-based verification...');
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery',
          });

          if (mounted) {
            if (!error && data?.session?.user?.email) {
              console.log('Session verified for:', data.session.user.email);
              setEmail(data.session.user.email);
              setSessionReady(true);
            } else if (error) {
              console.error('Token verification failed:', error.message);
              // Try as email OTP
              const { data: d2, error: e2 } = await supabase.auth.verifyOtp({
                email: emailParam,
                token: token,
                type: 'recovery',
              });
              if (!e2 && d2?.session?.user?.email) {
                setEmail(d2.session.user.email);
                setSessionReady(true);
              } else {
                setFormError("Your reset link has expired or is invalid. Please request a new one.");
              }
            }
            window.history.replaceState({}, '', '/reset-password');
            setLoading(false);
            return;
          }
        }

        // METHOD 2: Hash tokens (legacy flow — Supabase redirect)
        if (hash && hash.includes('access_token')) {
          console.log('Using hash token flow...');
          // Wait for Supabase client to auto-process the hash
          for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 500));
            const { data } = await supabase.auth.getSession();
            if (data?.session?.user?.email && mounted) {
              setEmail(data.session.user.email);
              setSessionReady(true);
              window.history.replaceState({}, '', '/reset-password');
              setLoading(false);
              return;
            }
          }
        }

        // METHOD 3: PKCE code
        const code = params.get('code');
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data?.session?.user?.email && mounted) {
            setEmail(data.session.user.email);
            setSessionReady(true);
            window.history.replaceState({}, '', '/reset-password');
            setLoading(false);
            return;
          }
        }

        // METHOD 4: Session already exists
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user?.email && mounted) {
          setEmail(data.session.user.email);
          setSessionReady(true);
          setLoading(false);
          return;
        }

        if (mounted) {
          setFormError("Your reset link has expired. Please request a new one.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Session init error:", err);
        if (mounted) {
          setFormError("Something went wrong. Please request a new reset link.");
          setLoading(false);
        }
      }
    };

    initSession();
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
      // Get the access token directly (avoid lock contention with the client)
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setFormError("Session expired. Please request a new reset link.");
        setIsSubmitting(false);
        return;
      }

      // Call Supabase Auth REST API directly to avoid client lock issues
      const res = await fetch(`https://yluyonhrxxtyuiyrdixl.supabase.co/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdXlvbmhyeHh0eXVpeXJkaXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1MDExODgsImV4cCI6MjA2MzA3NzE4OH0.ZKP-k5fizUtKZsekV9RFL1wYcVfIHEeQWArs-4l5Q-Y',
        },
        body: JSON.stringify({ password }),
      });

      const result = await res.json();

      if (!res.ok) {
        console.error('Password update failed:', result);
        setFormError(result.msg || result.message || "Failed to update password.");
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      toast.success("Password updated successfully!");

      setTimeout(() => {
        supabase.auth.signOut().catch(() => {});
        window.location.href = '/login';
      }, 2000);

    } catch (err: any) {
      console.error('Password reset error:', err);
      setFormError(err.message || "An unexpected error occurred");
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
              <p className="text-sm text-muted-foreground">Verifying your reset link...</p>
            </CardContent>
          ) : isSuccess ? (
            <CardContent className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-green-800">Password Updated!</h3>
                <p className="text-green-700 text-sm mt-2">Redirecting to login...</p>
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
                  <Input id="password" type="password" placeholder="Minimum 8 characters"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    required minLength={8} disabled={!sessionReady} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input id="confirmPassword" type="password" placeholder="Re-enter your password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    required minLength={8} disabled={!sessionReady} />
                </div>
              </CardContent>

              <CardFooter className="flex-col space-y-3">
                <Button type="submit" disabled={isSubmitting || !sessionReady}
                  className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11">
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating Password...</>
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
