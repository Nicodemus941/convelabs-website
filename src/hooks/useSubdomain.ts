/**
 * Detects subdomain portal and returns the appropriate redirect path.
 * - patients.convelabs.com → patient dashboard
 * - staff.convelabs.com → admin dashboard
 */

export type PortalType = 'patient' | 'staff' | 'main';

export function useSubdomain(): { portal: PortalType; dashboardPath: string } {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (hostname.startsWith('patients.')) {
    return { portal: 'patient', dashboardPath: '/dashboard/patient' };
  }

  if (hostname.startsWith('staff.')) {
    return { portal: 'staff', dashboardPath: '/dashboard' };
  }

  return { portal: 'main', dashboardPath: '/dashboard' };
}

export function isPatientPortal(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.startsWith('patients.');
}

export function isStaffPortal(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.startsWith('staff.');
}
