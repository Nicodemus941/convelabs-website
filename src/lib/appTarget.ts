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

/**
 * Where a freshly-launched native app should land. The route is auth-gated by
 * the existing ProtectedRoute/RoleProtectedRoute, so unauthenticated users are
 * still bounced to /login first; once signed in they arrive here.
 */
export function landingRouteForTarget(target: AppTarget = APP_TARGET): string {
  return target === 'phleb' ? '/phleb-app' : '/dashboard';
}
