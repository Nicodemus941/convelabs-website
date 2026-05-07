/**
 * setupSuperAdmin — DISABLED (2026-05-07 security audit).
 *
 * This utility used to call `supabase.auth.updateUser({ data: { role:
 * 'super_admin' } })` directly from the client, which let any
 * authenticated user (patient, office_manager, anyone) self-promote
 * to super_admin by hitting /setup-super-admin and clicking the button.
 *
 * The hole is now closed in two layers:
 *   1. SuperAdminSetupPage redirects all non-super_admin users to "/"
 *      so the form is never rendered.
 *   2. This function returns failure without touching auth.users —
 *      even if someone navigates around the page guard or rebuilds
 *      the request manually, the operation no longer mutates state.
 *
 * If a fresh tenant ever needs a super_admin bootstrap, do it
 * server-side (an edge fn that checks "zero existing super_admins"
 * before stamping metadata) or via direct SQL by the platform owner.
 * Do NOT re-enable client-side self-promotion.
 */
export const setupSuperAdminAccess = async (_email: string) => {
  console.warn('[setupSuperAdminAccess] Disabled — bootstrap window closed.');
  return {
    success: false,
    error: 'Super-admin setup is disabled. Contact the platform owner if you need access.',
  };
};
