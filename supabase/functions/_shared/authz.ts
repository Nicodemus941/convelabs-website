/**
 * Authorization helpers — the ONLY place edge functions should read a caller's
 * role / organization from.
 *
 * WHY: `user_metadata` (auth.users.raw_user_meta_data) is writable by the
 * signed-in user themselves via `supabase.auth.updateUser({ data: {...} })`.
 * Authorizing on it lets any patient self-promote to super_admin or attach
 * themselves to any partner org. `app_metadata` (raw_app_meta_data) can only be
 * written with the service-role key, so it is the trustworthy source.
 *
 * Note: `supabase.auth.getUser(jwt)` returns the CURRENT row from auth.users,
 * so app_metadata read here is live even if the caller's JWT predates the
 * backfill. (getClaims() returns the JWT's snapshot instead.)
 *
 * Never fall back to user_metadata for an authorization decision.
 */

type AnyUser = {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

/** Lower-cased trusted role, or '' when none is assigned. */
export function getTrustedRole(user: AnyUser): string {
  const r = user?.app_metadata?.role;
  return typeof r === 'string' ? r.trim().toLowerCase() : '';
}

/** Trusted partner-organization id, or null. Accepts both historical key names. */
export function getTrustedOrgId(user: AnyUser): string | null {
  const am = user?.app_metadata || {};
  const v = (am as any).organization_id || (am as any).org_id || null;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export const PLATFORM_ADMIN_ROLES = ['super_admin', 'admin', 'owner'] as const;
export const ORG_STAFF_ROLES = ['office_manager', 'provider'] as const;

export function hasTrustedRole(user: AnyUser, roles: readonly string[]): boolean {
  return roles.includes(getTrustedRole(user));
}

export function isPlatformAdmin(user: AnyUser): boolean {
  return hasTrustedRole(user, PLATFORM_ADMIN_ROLES);
}

/**
 * When (re)assigning someone to an org role, never silently downgrade a
 * platform admin or a ConveLabs phlebotomist who happens to share the email.
 */
export function keepElevatedRole(existingRole: string, desiredRole: string): string {
  const r = (existingRole || '').toLowerCase();
  if ((PLATFORM_ADMIN_ROLES as readonly string[]).includes(r) || r === 'phlebotomist') return r;
  return desiredRole;
}

/**
 * Build the `app_metadata` patch for auth.admin.createUser / updateUserById.
 * GoTrue MERGES app_metadata keys on update, so passing only role/org is safe.
 * The canonical key is `organization_id` (what public.jwt_org_id() reads).
 */
export function roleAppMetadata(role: string, organizationId?: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = { role };
  if (organizationId !== undefined) out.organization_id = organizationId;
  return out;
}
