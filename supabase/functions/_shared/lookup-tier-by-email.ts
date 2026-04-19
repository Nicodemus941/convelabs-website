// lookup-tier-by-email
// Given a supabase service-role client + an email, returns the patient's
// current membership tier. Used by the anonymous /lab-request page so
// members automatically see their unlocked slots without having to sign in.
//
// Returns 'none' | 'regular_member' | 'vip' | 'concierge'.
//
// Non-throwing: on any error, returns 'none' so the caller defaults to
// locked-slot behavior (safe default).

export type MemberTier = 'none' | 'regular_member' | 'vip' | 'concierge';

export async function lookupTierByEmail(
  admin: any,
  email: string | null | undefined
): Promise<MemberTier> {
  if (!email) return 'none';
  try {
    // 1. email → user_id via tenant_patients (case-insensitive match)
    const { data: tp } = await admin
      .from('tenant_patients')
      .select('user_id')
      .ilike('email', email)
      .maybeSingle();
    if (!tp?.user_id) return 'none';

    // 2. user_id → active membership + plan name
    const { data: mem } = await admin
      .from('user_memberships')
      .select('membership_plans(name)')
      .eq('user_id', tp.user_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!mem) return 'none';

    const planName = String((mem as any)?.membership_plans?.name || '').toLowerCase();
    if (planName.includes('concierge')) return 'concierge';
    if (planName.includes('vip')) return 'vip';
    if (planName) return 'regular_member';
    return 'none';
  } catch {
    return 'none';
  }
}
