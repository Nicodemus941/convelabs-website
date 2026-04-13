
import React, { useState, useEffect, useRef } from "react";
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
  const tokensRef = useRef<{ access: string; refresh: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        // 1. Check for PKCE code
        const code = new URLSearchParams(window.location.search).get('code');
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

        // 2. Check for hash tokens (implicit flow)
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            // Store tokens for retry
            tokensRef.current = { access: accessToken, refresh: refreshToken };

            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (mounted) {
              if (!error && data?.session?.user?.email) {
                setEmail(data.session.user.email);
              } else {
                setEmail('your account');
              }
              setSessionReady(true);
              window.history.replaceState({}, '', '/reset-password');
              setLoading(false);
              return;
            }
          }
        }

        // 3. Check if session already exists (e.g., onAuthStateChange handled it)
        for (let i = 0; i < 8; i++) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user?.email && mounted) {
            setEmail(data.session.user.email);
            setSessionReady(true);
            setLoading(false);
            return;
          }
          await new Promise(r => setTimeout(r, 500));
        }

        // No session found
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
      // Attempt 1: Direct update
      let { error } = await supabase.auth.updateUser({ password });

      // Attempt 2: Re-set session from stored tokens and retry
      if (error && tokensRef.current) {
        console.log('Retrying with stored tokens...');
        await supabase.auth.setSession({
          access_token: tokensRef.current.access,
          refresh_token: tokensRef.current.refresh,
        });
        const retry = await supabase.auth.updateUser({ password });
        error = retry.error;
      }

      if (error) {
        console.error('Password update failed:', error);
        setFormError(
          error.message?.includes('session') || error.message?.includes('JWT')
            ? "Your session has expired. Please request a new reset link."
            : error.message || "Failed to update password"
        );
        setIsSubmitting(false);
        return;
      }

      // Success!
      setIsSuccess(true);
      toast.success("Password updated successfully!");

      // Sign out and redirect to login
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
      }, 2000);

    } catch (err: any) {
      console.error("Password reset error:", err);
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
                    <span>{formError}</span>
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
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating Password...</>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
                {!sessionReady && !loading && (
                  <a href="/forgot-password" className="text-sm text-[#B91C1C] hover:underline text-center">
                    Request a new reset link
                  </a>
                )}
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
