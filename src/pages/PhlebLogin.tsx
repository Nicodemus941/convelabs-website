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

  // Approved mockup gradient — warm crimson radial falling to deep crimson.
  const brandGradient = 'radial-gradient(140% 90% at 50% 0%, #D23B2E 0%, #B91C1C 42%, #7F1010 100%)';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: brandGradient }}>
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

      <div className="min-h-screen flex flex-col items-center justify-center px-6 pt-safe pb-safe" style={{ background: brandGradient }}>
        <div className="w-full max-w-sm animate-conve-rise">
          {/* Brand mark — white blood-drop with crimson core (approved mockup) */}
          <div className="text-center mb-8">
            <svg viewBox="0 0 48 60" className="h-16 w-16 mx-auto mb-4 drop-shadow-lg" aria-hidden="true">
              <path d="M24 2C24 2 6 24 6 38a18 18 0 0 0 36 0C42 24 24 2 24 2Z" fill="#fff" />
              <path d="M24 12c0 0-11 13-11 22a11 11 0 0 0 22 0C35 25 24 12 24 12Z" fill="#B91C1C" />
            </svg>
            <h1 className="text-white text-2xl font-extrabold tracking-tight">ConveLabs Pro</h1>
            <p className="text-white/70 text-[11px] font-bold uppercase tracking-[0.2em] mt-1.5">Phlebotomist Portal</p>
          </div>

          {/* Login sheet */}
          <div className="bg-background rounded-3xl px-6 pt-7 pb-7 shadow-2xl">
            <h2 className="text-lg font-bold mb-1">Welcome back</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Sign in with the account issued by your lab coordinator.
            </p>
            <LoginForm handleSuperAdminLogin={handleSuperAdminLogin} redirectPath={redirectPath} />
            <p className="text-xs text-muted-foreground text-center mt-6">
              Need access? Ask your ConveLabs administrator to add you.
            </p>
            <p className="text-[10px] text-muted-foreground/60 text-center mt-4">
              Convenient Laboratories · v1.0
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PhlebLogin;
