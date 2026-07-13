
import React, { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { useSuperAdminLogin } from "@/utils/auth/superAdminLogin";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Login = () => {
  const { resetError, error: authError, user, isLoading } = useAuth();
  const { toast } = useToast();
  const { handleSuperAdminLogin } = useSuperAdminLogin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Extract redirect path from query params if exists
  const redirectPath = searchParams.get('redirect') || '/dashboard';
  
  // ── THE SINGLE POST-LOGIN NAVIGATOR (2026-07-14 lockout fix) ──────────────
  // Every other navigate() on the login path was removed (LoginForm,
  // AuthContext.login, useSuperAdminAuth). Four navigators used to fire at
  // once, thrashing the router into remount cycles that multiplied auth calls
  // and — with multi-device refresh-token rotation — stormed /token into a 429
  // that locked out the whole office. This effect is now the ONLY place a
  // successful login (or an already-signed-in visit to /login) navigates, and
  // a ref guards it to fire at most once per mount.
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (!user || navigatedRef.current) return;
    navigatedRef.current = true;
    let cancelled = false;
    (async () => {
      let target: string;
      try {
        const { data } = await supabase.auth.getUser();
        const meta = (data?.user?.user_metadata || {}) as Record<string, any>;
        if (meta.hasPaid && !meta.onboarding_completed) {
          target = '/onboarding/post-payment';
        } else {
          const role = meta.role || user.role || 'patient';
          const honorRedirect = redirectPath && redirectPath !== '/dashboard'
            && !redirectPath.includes('/login') && !redirectPath.includes('/auth');
          target = honorRedirect ? redirectPath : `/dashboard/${role}`;
        }
      } catch {
        target = (redirectPath.includes('/login') || redirectPath.includes('/auth'))
          ? '/dashboard' : redirectPath;
      }
      if (!cancelled) navigate(target, { replace: true });
    })();
    return () => { cancelled = true; };
  }, [user, navigate, redirectPath]);

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
        <Loader2 className="h-8 w-8 animate-spin text-conve-red" />
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
            <CardTitle className="text-xl font-semibold">Welcome Back</CardTitle>
            <CardDescription>Sign in to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            {searchParams.get('reset') === 'success' && (
              <div className="mb-4 p-3 text-sm bg-green-50 text-green-800 rounded-lg border border-green-200">
                Password updated. Sign in with your new password to continue.
              </div>
            )}
            <LoginForm handleSuperAdminLogin={handleSuperAdminLogin} redirectPath={redirectPath} />

            <div className="mt-6 space-y-3 text-center text-sm">
              <p className="text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/signup" className="text-conve-red font-medium hover:underline">Sign up</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
