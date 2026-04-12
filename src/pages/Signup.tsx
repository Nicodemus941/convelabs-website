
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/SignupForm";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Loader2, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Signup = () => {
  const { resetError, error: authError, user, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

  // Redirect logged in users
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Listen for auth state changes (email verification)
  useEffect(() => {
    if (!verificationPending) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // User verified and signed in — redirect to dashboard
        navigate('/dashboard', { replace: true });
      }
    });

    // Also poll every 5 seconds as fallback
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        navigate('/dashboard', { replace: true });
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [verificationPending, navigate]);

  const handleSignupComplete = (email: string) => {
    setVerificationEmail(email);
    setVerificationPending(true);
  };

  // Handle auth context errors
  useEffect(() => {
    if (authError) {
      // Show toast for auth errors
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: authError,
      });
      
      // Clear error after displaying toast
      setTimeout(() => resetError(), 100);
    }
  }, [authError, toast, resetError]);

  // Reset errors when component unmounts
  useEffect(() => {
    return () => {
      resetError();
    };
  }, [resetError]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-t-conve-red border-r-conve-red border-b-gray-200 border-l-gray-200 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600">Checking authentication status...</p>
          </div>
        </div>
      </div>
    );
  }

  // Verification pending screen
  if (verificationPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="text-3xl font-bold text-conve-red mb-2">ConveLabs<span className="text-foreground">.</span></div>

          <Card className="mt-8">
            <CardContent className="py-10 space-y-4">
              <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <Mail className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold">Check Your Email</h2>
              <p className="text-muted-foreground">
                We sent a verification link to{' '}
                <span className="font-semibold text-foreground">{verificationEmail}</span>.
                Click the link to verify your account.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for verification...
              </div>
              <p className="text-xs text-muted-foreground">
                This page will automatically redirect once verified.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Back to home */}
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to ConveLabs
          </Link>
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="text-3xl font-bold text-conve-red">
            ConveLabs<span className="text-foreground">.</span>
          </Link>
          <p className="text-muted-foreground text-sm mt-1">Luxury mobile phlebotomy services</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Create Your Account</CardTitle>
            <CardDescription>
              Join ConveLabs to book appointments and manage your health
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignupForm onSignupComplete={handleSignupComplete} />

            <div className="mt-6 space-y-3 text-center text-sm">
              <p className="text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-conve-red font-medium hover:underline">Sign in</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
