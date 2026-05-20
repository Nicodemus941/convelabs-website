/**
 * useServiceCatalog
 *
 * Single source of truth for the service catalog across patient booking,
 * admin manual booking, and pricing previews. Reads from the new
 * `get_active_service_catalog()` RPC (admin-created services) and merges
 * the result with the hardcoded legacy catalog so both worlds coexist
 * during the migration period.
 *
 * Legacy services (`mobile`, `in-office`, `senior`, partner-*, etc.) come
 * from the long-standing TIER_PRICING constant in pricingService.ts —
 * they're still the canonical revenue services. New admin-created services
 * appear ALONGSIDE them in pickers without code changes.
 *
 * Returned shape is a uniform record keyed by `service_code` (the slug
 * the booking flow + server pricing recognize).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DynamicServiceEntry {
  /** Stable slug — booking flow + server pricing key on this. */
  service_code: string;
  /** Patient-facing display name. */
  name: string;
  /** Optional patient-facing description. */
  description?: string;
  /** Per-tier price in cents. 'none' is the pay-as-you-go default. */
  tier_pricing: Record<string, number>;
  /** Visit duration in minutes — feeds the slot grid + duration-aware blocking. */
  duration_minutes: number;
  /** When true, booking flow shows the lab-order upload step. */
  requires_lab_order: boolean;
  /** UUID of the underlying services_enhanced row. */
  id: string;
  /** Free-text category (e.g. 'lab_draw', 'wellness', 'membership_addon'). */
  category?: string;
  /** Whether this entry came from the DB (true) vs the hardcoded legacy table. */
  source: 'db' | 'legacy';
}

export interface UseServiceCatalogResult {
  services: DynamicServiceEntry[];
  bySlug: Record<string, DynamicServiceEntry>;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Module-level cache so a refresh doesn't hammer the RPC across mounts. */
let cached: { ts: number; rows: any[] } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute — short enough to feel live to admins

export function useServiceCatalog(): UseServiceCatalogResult {
  const [rows, setRows] = useState<any[]>(cached?.rows || []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = async (force = false) => {
    try {
      if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        setRows(cached.rows);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_active_service_catalog' as any);
      if (error) throw error;
      cached = { ts: Date.now(), rows: data || [] };
      setRows(data || []);
      setError(null);
    } catch (err: any) {
      console.warn('[useServiceCatalog] fetch failed:', err?.message);
      // Don't crash — booking flow still works off the legacy catalog.
      setError(err?.message || 'failed to load services');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const services: DynamicServiceEntry[] = rows
    .filter(r => r?.service_code) // require a slug — anything without one can't be priced server-side
    .map(r => ({
      id: r.id,
      service_code: r.service_code,
      name: r.name,
      description: r.description || undefined,
      tier_pricing: (r.tier_pricing && typeof r.tier_pricing === 'object')
        ? r.tier_pricing
        : { none: r.base_price_cents || 0 },
      duration_minutes: r.duration_minutes || 30,
      requires_lab_order: !!r.requires_lab_order,
      category: r.category,
      source: 'db',
    }));

  const bySlug: Record<string, DynamicServiceEntry> = {};
  for (const s of services) bySlug[s.service_code] = s;

  return { services, bySlug, isLoading, error, refetch: () => fetchCatalog(true) };
}

/**
 * Server-friendly fetch — no React hook, for use inside form-submit logic.
 * Returns the same DynamicServiceEntry shape. Bypasses the in-memory cache.
 */
export async function fetchServiceCatalogOnce(): Promise<DynamicServiceEntry[]> {
  const { data, error } = await supabase.rpc('get_active_service_catalog' as any);
  if (error) {
    console.warn('[fetchServiceCatalogOnce] error:', error.message);
    return [];
  }
  return (data || [])
    .filter((r: any) => r?.service_code)
    .map((r: any) => ({
      id: r.id,
      service_code: r.service_code,
      name: r.name,
      description: r.description || undefined,
      tier_pricing: (r.tier_pricing && typeof r.tier_pricing === 'object')
        ? r.tier_pricing
        : { none: r.base_price_cents || 0 },
      duration_minutes: r.duration_minutes || 30,
      requires_lab_order: !!r.requires_lab_order,
      category: r.category,
      source: 'db' as const,
    }));
}
