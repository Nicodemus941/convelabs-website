/**
 * Which native app this build is for. Set at build time via VITE_APP_TARGET
 * (see the build:patient / build:phleb npm scripts). On the website build the
 * variable is unset, so it falls back to 'patient' and nothing native-specific
 * runs anyway (everything is gated behind Capacitor.isNativePlatform()).
 */
export type AppTarget = 'patient' | 'phleb';

export const APP_TARGET: AppTarget =
  (import.meta.env.VITE_APP_TARGET as string) === 'phleb' ? 'phleb' : 'patient';

export const isPhlebApp = APP_TARGET === 'phleb';
export const isPatientApp = APP_TARGET === 'patient';

function inferTargetFromPathname(pathname?: string): AppTarget | null {
  if (!pathname) return null;
  return pathname.startsWith('/phleb') ? 'phleb' : null;
}

function resolveTarget(target?: AppTarget): AppTarget {
  if (target) return target;
  if (typeof window !== 'undefined') {
    const inferred = inferTargetFromPathname(window.location.pathname);
    if (inferred) return inferred;
  }
  return APP_TARGET;
}

/**
 * Where a freshly-launched native app should land. The route is auth-gated by
 * the existing ProtectedRoute/RoleProtectedRoute, so unauthenticated users are
 * still bounced to /login first; once signed in they arrive here.
 */
export function landingRouteForTarget(target?: AppTarget): string {
  return resolveTarget(target) === 'phleb' ? '/phleb-app' : '/dashboard';
}

/**
 * Where an UNAUTHENTICATED native launch should be sent to sign in. The phleb
 * build uses a dedicated, field-branded login (no marketing chrome) that lands
 * the user straight on the field dashboard. On the website / patient build this
 * stays the normal marketing login, so public + patient behavior is unchanged.
 */
export function loginRouteForTarget(target?: AppTarget): string {
  return resolveTarget(target) === 'phleb'
    ? '/phleb-login?redirect=/phleb-app'
    : '/login?redirect=/dashboard';
}
