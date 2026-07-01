import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { useSuperAdminLogin } from '@/utils/auth/superAdminLogin';
import { Loader2 } from 'lucide-react';

/**
 * PHLEB LOGIN — the direct, in-app sign-in for the ConveLabs Pro field app
 * (com.convelabs.phleb). Deliberately stripped of all marketing chrome (no
 * "Back to ConveLabs" link, no sign-up CTA — field staff are provisioned by
 * an admin) and it lands the user straight on the field dashboard.
 *
 * It reuses the shared LoginForm (Supabase email/password + forgot-password +
 * migrated-user handling), so there is one source of truth for auth logic.
 * The route is public; the /phleb-app route itself is role-gated, so a
 * successful login is re-checked there before any patient data loads.
 */
const PhlebLogin: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { handleSuperAdminLogin } = useSuperAdminLogin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirectPath = searchParams.get('redirect') || '/phleb-app';

  // Already signed in → go straight to the field dashboard (role re-checked there).
  useEffect(() => {
    if (user) {
      const target = redirectPath.includes('/login') ? '/phleb-app' : redirectPath;
      navigate(target, { replace: true });
    }
  }, [user, navigate, redirectPath]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-conve-red">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>ConveLabs Pro — Sign In</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </Helmet>

      <div className="min-h-screen flex flex-col items-center justify-center bg-conve-red px-6 pt-safe pb-safe">
        <div className="w-full max-w-sm animate-conve-rise">
          {/* Brand mark */}
          <div className="text-center mb-8">
            <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-conve-red text-3xl font-black">C</span>
            </div>
            <h1 className="text-white text-2xl font-bold">ConveLabs Pro</h1>
            <p className="text-white/80 text-sm mt-1">Field team sign‑in</p>
          </div>

          {/* Login card */}
          <div className="bg-background rounded-3xl px-6 pt-7 pb-8 shadow-2xl">
            <h2 className="text-lg font-semibold mb-1">Welcome back</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Sign in with your ConveLabs staff account to see today's route.
            </p>
            <LoginForm handleSuperAdminLogin={handleSuperAdminLogin} redirectPath={redirectPath} />
            <p className="text-xs text-muted-foreground text-center mt-6">
              Need access? Ask your ConveLabs administrator to add you.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PhlebLogin;
