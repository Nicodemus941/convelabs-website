
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from '@/integrations/supabase/client';
import { loginRouteForTarget } from '@/lib/appTarget';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

/**
 * Guards a role-restricted route.
 *
 * IMPORTANT — loop safety. The app derives the routing role from the JWT's
 * `user_metadata.role` (see useAuthSession). If a signed-in user's token has no
 * role (a stale token issued before the role was stamped, or a brand-new staff
 * account not yet stamped), the old code bounced them to `/dashboard`, which
 * bounced elsewhere, producing an infinite `replaceState` loop that tripped the
 * root error boundary and bricked the app ("history.replaceState() more than 100
 * times per 10 seconds").
 *
 * Instead of bouncing, we now SELF-HEAL: refresh the session once to pull the
 * updated metadata (roles are stamped server-side), then re-render. Only if the
 * refreshed token still lacks an allowed role do we show a dead-end
 * "not authorized" screen — a screen, never an auto-redirect, so a loop is
 * impossible.
 */
const AccessDenied: React.FC<{ loginRoute: string }> = ({ loginRoute }) => {
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    setSigningOut(true);
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    // Full reload to the login route clears any in-memory routing state.
    window.location.replace(loginRoute);
  };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-conve-red text-white p-6 text-center pt-safe pb-safe">
      <h1 className="text-2xl font-bold mb-1">ConveLabs Pro</h1>
      <p className="text-white/85 text-sm mb-5 max-w-xs">
        This account isn’t set up for the field app. Sign in with a ConveLabs
        staff account, or ask your administrator for access.
      </p>
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="bg-white text-conve-red px-5 py-2.5 rounded-xl font-semibold disabled:opacity-60"
      >
        {signingOut ? 'Signing out…' : 'Sign in with a different account'}
      </button>
    </div>
  );
};

export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({
  children,
  allowedRoles
}) => {
  // Shared AuthContext, NOT a fresh useAuthSession instance — see
  // ProtectedRoute for the 2026-07-14 login-loop rationale.
  const { session, isLoading, user } = useAuth();
  const userRole = user?.role ?? null;
  // Target-aware login route: the phleb field app sends unauthenticated users
  // to its own /phleb-login (no marketing chrome); web/patient is unchanged.
  const loginRoute = loginRouteForTarget();

  const authed = !!session;
  const roleOk = !!userRole && allowedRoles.includes(userRole);

  // 'idle' → not attempted, 'healing' → refreshing token, 'failed' → refreshed
  // and still not authorized (genuine no-access).
  const [heal, setHeal] = useState<'idle' | 'healing' | 'failed'>('idle');

  useEffect(() => {
    if (isLoading || !authed || roleOk || heal !== 'idle') return;
    let cancelled = false;
    setHeal('healing');
    supabase.auth
      .refreshSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        const newRole = data?.session?.user?.user_metadata?.role as string | undefined;
        if (error || !newRole || !allowedRoles.includes(newRole)) {
          setHeal('failed');
        }
        // On success the TOKEN_REFRESHED auth event re-renders us with the new
        // role → roleOk becomes true → children render. Leave heal as 'healing'
        // so the effect doesn't re-fire in the brief gap before that lands.
      })
      .catch(() => { if (!cancelled) setHeal('failed'); });
    return () => { cancelled = true; };
    // allowedRoles is a literal from the parent; intentionally excluded so the
    // effect is driven only by auth state. Re-entry is guarded by `heal`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, authed, roleOk, heal]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
      </div>
    );
  }

  // Not signed in → the login screen (target-aware). This is the only redirect,
  // and it only fires when there is no session, so it can't ping-pong with an
  // authenticated route.
  if (!authed) {
    return <Navigate to={loginRoute} replace />;
  }

  if (roleOk) {
    return <>{children}</>;
  }

  // Authenticated but role not (yet) allowed: keep showing the skeleton while we
  // refresh the token to pick up a freshly-stamped role.
  if (heal !== 'failed') {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
      </div>
    );
  }

  // Refreshed and still unauthorized — dead-end screen (no redirect → no loop).
  return <AccessDenied loginRoute={loginRoute} />;
};

export default RoleProtectedRoute;
