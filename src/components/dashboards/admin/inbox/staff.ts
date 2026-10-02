/**
 * Assignable staff — the people a task can be handed to.
 *
 * NotesTab used to call rpc('get_assignable_staff'), which does not exist in
 * the database (404 on every load), then fell back to reading
 * staff_profiles.email / first_name / last_name — columns that do not exist
 * either (names live in auth.users.raw_user_meta_data). Net effect: the
 * "Assign to" dropdown was always empty, so no task could ever be assigned.
 *
 * Resolution order here:
 *   1. get_assignable_staff()         — the intended RPC (DRAFT migration,
 *                                       not applied yet). Used when present.
 *   2. get_staff_activity_summary()   — EXISTS today, admin-gated, returns
 *                                       user_id / email / full_name / role for
 *                                       every super_admin / admin /
 *                                       office_manager / owner. This is the
 *                                       working source in production.
 *   3. user_roles → profiles          — last resort (ids + emails only).
 */
import { supabase } from '@/integrations/supabase/client';

export interface StaffMember {
  id: string;
  email: string;
  full_name: string | null;
  role?: string | null;
}

const db = supabase as any;

let cache: { at: number; list: StaffMember[] } | null = null;
const CACHE_MS = 5 * 60_000;

export function staffLabel(s: StaffMember | undefined | null): string {
  if (!s) return 'Unassigned';
  return s.full_name || s.email || 'Staff';
}

export function initialsOf(name: string | null | undefined): string {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '').concat(parts.length > 1 ? parts[parts.length - 1][0] : '').toUpperCase();
}

export async function fetchAssignableStaff(force = false): Promise<StaffMember[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.list;

  // 1. Intended RPC (draft migration). Quietly skipped while it is missing.
  try {
    const { data, error } = await db.rpc('get_assignable_staff');
    if (!error && Array.isArray(data) && data.length > 0) {
      const list = dedupe(data.map((r: any) => ({
        id: r.id || r.user_id, email: r.email || '', full_name: r.full_name || null, role: r.role || null,
      })));
      cache = { at: Date.now(), list };
      return list;
    }
  } catch { /* fall through */ }

  // 2. Existing admin-gated RPC — one row per staff user with a real name.
  try {
    const { data, error } = await db.rpc('get_staff_activity_summary');
    if (!error && Array.isArray(data) && data.length > 0) {
      const list = dedupe(data.map((r: any) => ({
        id: r.user_id, email: r.email || '', full_name: r.full_name && r.full_name !== r.email ? r.full_name : null, role: r.role || null,
      })));
      cache = { at: Date.now(), list };
      return list;
    }
  } catch { /* fall through */ }

  // 3. Roles + profiles (profiles has id + email only).
  try {
    const { data: rows } = await db
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['super_admin', 'admin', 'office_manager', 'owner']);
    const ids: string[] = Array.from(new Set((rows || []).map((r: any) => r.user_id)));
    if (ids.length === 0) return [];
    const { data: profiles } = await db.from('profiles').select('id, email').in('id', ids);
    const byId = new Map<string, string>((profiles || []).map((p: any) => [p.id, p.email || '']));
    const list = ids.map(id => ({ id, email: byId.get(id) || '', full_name: null, role: null }));
    cache = { at: Date.now(), list };
    return list;
  } catch {
    return [];
  }
}

function dedupe(list: StaffMember[]): StaffMember[] {
  const m = new Map<string, StaffMember>();
  for (const s of list) {
    if (!s.id) continue;
    const prev = m.get(s.id);
    if (!prev || (!prev.full_name && s.full_name)) m.set(s.id, s);
  }
  return Array.from(m.values()).sort((a, b) => staffLabel(a).localeCompare(staffLabel(b)));
}
