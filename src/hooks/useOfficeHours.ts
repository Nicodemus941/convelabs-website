/**
 * Reads the office hours every calendar and picker should agree on.
 *
 * Returns DEFAULT_OFFICE_HOURS immediately and swaps in the saved row when it
 * arrives, so a calendar never renders with no shading and a picker never
 * renders with no times — even if the row is missing or the read fails.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_OFFICE_HOURS,
  OFFICE_HOURS_KEY,
  normalizeOfficeHours,
  type OfficeHours,
} from '@/lib/officeHours';

export function useOfficeHours() {
  const [hours, setHours] = useState<OfficeHours>(DEFAULT_OFFICE_HOURS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings' as any)
          .select('value')
          .eq('key', OFFICE_HOURS_KEY)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          // Not worth a toast: the fallback is the hours that were hardcoded
          // until now, so the screen is still correct, just not customised.
          console.error('[officeHours] load failed:', error);
        } else if (data?.value) {
          setHours(normalizeOfficeHours((data as any).value));
        }
      } catch (e) {
        console.error('[officeHours] load crashed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { hours, loading };
}
