/**
 * Single source for reading a signed-in user's role / partner org on the client.
 *
 * Authorization data lives in `app_metadata` (auth.users.raw_app_meta_data),
 * which only the service role can write. `user_metadata` is writable by the
 * user themselves via `supabase.auth.updateUser({ data })`, so it must never
 * decide what someone may see or do. The database (RLS via public.jwt_role()
 * / public.jwt_org_id()) and edge functions enforce the real boundary; the
 * client only uses this for routing / UI.
 *
 * Transition note: sessions issued before the app_metadata backfill have no
 * `app_metadata.role` until the token refreshes (<= 1h). For those stale
 * sessions only, we fall back to the legacy user_metadata value so routing
 * doesn't bounce staff to the wrong dashboard. This fallback is UI-only:
 * the server rejects anything the trusted role doesn't allow. Once every
 * session has refreshed, `allowLegacyFallback` can be removed.
 */

type MetaUser = {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** Trusted role from app_metadata (lower-cased), or null if not assigned. */
export function getTrustedRole(user: MetaUser): string | null {
  const r = str(user?.app_metadata?.role);
  return r ? r.toLowerCase() : null;
}

/** Trusted partner-org id from app_metadata, or null. */
export function getTrustedOrgId(user: MetaUser): string | null {
  const am = user?.app_metadata || {};
  return str((am as any).organization_id) || str((am as any).org_id);
}

/**
 * Role for routing/UI. Trusted app_metadata first; legacy user_metadata only
 * when app_metadata has no role at all (stale pre-backfill session).
 */
export function getRoutingRole(user: MetaUser, allowLegacyFallback = true): string | null {
  const trusted = getTrustedRole(user);
  if (trusted) return trusted;
  if (!allowLegacyFallback) return null;
  const legacy = str(user?.user_metadata?.role);
  return legacy ? legacy.toLowerCase() : null;
}

/** Partner org for routing/UI, same fallback rule as getRoutingRole. */
export function getRoutingOrgId(user: MetaUser, allowLegacyFallback = true): string | null {
  const trusted = getTrustedOrgId(user);
  if (trusted || getTrustedRole(user) || !allowLegacyFallback) return trusted;
  const um = user?.user_metadata || {};
  return str((um as any).organization_id) || str((um as any).org_id);
}
